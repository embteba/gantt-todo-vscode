import {
  App,
  normalizePath,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  WorkspaceLeaf
} from "obsidian";
import { GanttTodoBoardView, VIEW_TYPE_GANTT_BOARD } from "./src/boardView";
import { normalizeTaskData } from "./src/logic";
import {
  buildTeamsSection,
  filterEventsForTask,
  filterEventsForWindow,
  parseTeamsCalendarIcs,
  upsertTeamsSection
} from "./src/teamsCalendar";
import { GanttTodoSettings, TaskItem } from "./src/types";

const DEFAULT_SETTINGS: GanttTodoSettings = {
  notesBaseFolder: "Gantt Tasks",
  teamsCalendarIcsPath: "Gantt Tasks/teams-calendar.ics",
  teamsAutoSyncEnabled: false,
  teamsSyncIntervalMinutes: 15,
  teamsSyncRangeDays: 1
};

interface PersistedPluginData {
  tasks?: unknown;
  settings?: Partial<GanttTodoSettings>;
}

export default class GanttTodoPlugin extends Plugin {
  private tasks: TaskItem[] = [];
  private pluginSettings: GanttTodoSettings = { ...DEFAULT_SETTINGS };
  private teamsAutoSyncTimer: number | null = null;
  private teamsSyncRunning = false;

  async onload(): Promise<void> {
    await this.loadStoredData();

    this.registerView(VIEW_TYPE_GANTT_BOARD, (leaf: WorkspaceLeaf) => new GanttTodoBoardView(leaf, this));
    this.addSettingTab(new GanttTodoSettingTab(this.app, this));

    this.addCommand({
      id: "open-gantt-todo-board",
      name: "Open Gantt TODO Board",
      callback: () => {
        void this.activateView();
      }
    });

    this.addCommand({
      id: "sync-teams-calendar-to-task-notes",
      name: "Sync Teams calendar to task notes",
      callback: () => {
        void this.syncTeamsCalendarToTaskNotes(true);
      }
    });

    this.addRibbonIcon("list-checks", "Open Gantt TODO Board", () => {
      void this.activateView();
    });

    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) {
          return;
        }
        const sourcePath = this.getTeamsCalendarSourcePath();
        if (!sourcePath || normalizePath(file.path) !== sourcePath) {
          return;
        }
        void this.syncTeamsCalendarToTaskNotes(false);
      })
    );

    this.configureTeamsAutoSync();
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GANTT_BOARD);
    this.clearTeamsAutoSyncTimer();
  }

  async activateView(): Promise<void> {
    const existingLeaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_GANTT_BOARD);
    let leaf = existingLeaves[0];
    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false) ?? this.app.workspace.getLeaf(true);
      await leaf.setViewState({
        type: VIEW_TYPE_GANTT_BOARD,
        active: true
      });
    }

    await this.app.workspace.revealLeaf(leaf);
    const view = leaf.view;
    if (view instanceof GanttTodoBoardView) {
      view.refreshFromPluginData();
    }
  }

  getStoragePathLabel(): string {
    return `.obsidian/plugins/${this.manifest.id}/data.json`;
  }

  getTasks(): TaskItem[] {
    return this.tasks.map((task) => ({ ...task }));
  }

  getSettings(): GanttTodoSettings {
    return { ...this.pluginSettings };
  }

  async updateSettings(next: Partial<GanttTodoSettings>): Promise<void> {
    this.pluginSettings = this.normalizeSettings({
      ...this.pluginSettings,
      ...next
    });
    await this.persistData();
    this.configureTeamsAutoSync();
  }

  async saveTasks(tasks: TaskItem[]): Promise<void> {
    const normalized = normalizeTaskData({ tasks });
    this.tasks = normalized.tasks;
    await this.persistData();
  }

  async createOrOpenTaskNote(taskId: string): Promise<void> {
    const taskIndex = this.tasks.findIndex((task) => task.id === taskId);
    if (taskIndex < 0) {
      return;
    }

    const task = this.tasks[taskIndex];
    if (!task) {
      return;
    }
    const notePath = await this.ensureTaskNotePath(task);
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) {
      return;
    }

    if (task.notePath !== notePath) {
      this.tasks[taskIndex] = {
        ...task,
        notePath
      };
      await this.persistData();
    }

    await this.app.workspace.getLeaf(true).openFile(file);
  }

  async syncTeamsCalendarToTaskNotes(showNotice: boolean): Promise<void> {
    if (this.teamsSyncRunning) {
      return;
    }

    const sourcePath = this.getTeamsCalendarSourcePath();
    if (!sourcePath) {
      if (showNotice) {
        new Notice("Teams calendar source file path is empty.");
      }
      return;
    }

    this.teamsSyncRunning = true;
    try {
      const exists = await this.app.vault.adapter.exists(sourcePath);
      if (!exists) {
        if (showNotice) {
          new Notice(`Teams calendar file not found: ${sourcePath}`);
        }
        return;
      }

      const raw = await this.app.vault.adapter.read(sourcePath);
      const events = parseTeamsCalendarIcs(raw);
      const windowEvents = filterEventsForWindow(events, Date.now(), this.pluginSettings.teamsSyncRangeDays);

      let createdNotes = 0;
      let updatedNotes = 0;
      let taskPathChanged = false;

      for (let index = 0; index < this.tasks.length; index += 1) {
        const task = this.tasks[index];
        if (!task) {
          continue;
        }

        const existingNote =
          typeof task.notePath === "string" && this.app.vault.getAbstractFileByPath(task.notePath) instanceof TFile;
        const notePath = await this.ensureTaskNotePath(task);
        const file = this.app.vault.getAbstractFileByPath(notePath);
        if (!(file instanceof TFile)) {
          continue;
        }
        if (!existingNote) {
          createdNotes += 1;
        }
        if (task.notePath !== notePath) {
          this.tasks[index] = {
            ...task,
            notePath
          };
          taskPathChanged = true;
        }

        const taskEvents = filterEventsForTask(windowEvents, task.startDate, task.endDate);
        const content = await this.app.vault.cachedRead(file);
        const updated = upsertTeamsSection(content, buildTeamsSection(taskEvents));
        if (updated !== content) {
          await this.app.vault.modify(file, updated);
          updatedNotes += 1;
        }
      }

      if (taskPathChanged) {
        await this.persistData();
      }

      if (showNotice) {
        new Notice(`Teams sync complete: ${updatedNotes} notes updated, ${createdNotes} notes created.`);
      }
    } catch (error) {
      if (showNotice) {
        new Notice(`Teams sync failed: ${String(error)}`);
      }
    } finally {
      this.teamsSyncRunning = false;
    }
  }

  private async loadStoredData(): Promise<void> {
    const loaded = (await this.loadData()) as PersistedPluginData | null;
    this.tasks = normalizeTaskData(loaded ?? {}).tasks;
    this.pluginSettings = this.normalizeSettings(loaded?.settings);
  }

  private normalizeSettings(raw: Partial<GanttTodoSettings> | undefined): GanttTodoSettings {
    const notesBaseFolder = typeof raw?.notesBaseFolder === "string" ? raw.notesBaseFolder.trim() : "";
    const teamsCalendarIcsPath = typeof raw?.teamsCalendarIcsPath === "string" ? raw.teamsCalendarIcsPath.trim() : "";
    const teamsAutoSyncEnabled = raw?.teamsAutoSyncEnabled === true;

    const intervalInput = Number(raw?.teamsSyncIntervalMinutes);
    const rangeInput = Number(raw?.teamsSyncRangeDays);
    const teamsSyncIntervalMinutes = Number.isFinite(intervalInput)
      ? Math.max(1, Math.min(720, Math.floor(intervalInput)))
      : DEFAULT_SETTINGS.teamsSyncIntervalMinutes;
    const teamsSyncRangeDays = Number.isFinite(rangeInput)
      ? Math.max(1, Math.min(14, Math.floor(rangeInput)))
      : DEFAULT_SETTINGS.teamsSyncRangeDays;

    return {
      notesBaseFolder: notesBaseFolder || DEFAULT_SETTINGS.notesBaseFolder,
      teamsCalendarIcsPath: teamsCalendarIcsPath || DEFAULT_SETTINGS.teamsCalendarIcsPath,
      teamsAutoSyncEnabled,
      teamsSyncIntervalMinutes,
      teamsSyncRangeDays
    };
  }

  private getTeamsCalendarSourcePath(): string {
    const value = this.pluginSettings.teamsCalendarIcsPath.trim();
    if (!value) {
      return "";
    }
    return normalizePath(value);
  }

  private configureTeamsAutoSync(): void {
    this.clearTeamsAutoSyncTimer();
    if (!this.pluginSettings.teamsAutoSyncEnabled) {
      return;
    }

    const sourcePath = this.getTeamsCalendarSourcePath();
    if (!sourcePath) {
      return;
    }

    const intervalMs = this.pluginSettings.teamsSyncIntervalMinutes * 60 * 1000;
    const timer = window.setInterval(() => {
      void this.syncTeamsCalendarToTaskNotes(false);
    }, intervalMs);
    this.teamsAutoSyncTimer = timer;
    this.registerInterval(timer);

    void this.syncTeamsCalendarToTaskNotes(false);
  }

  private clearTeamsAutoSyncTimer(): void {
    if (this.teamsAutoSyncTimer !== null) {
      window.clearInterval(this.teamsAutoSyncTimer);
      this.teamsAutoSyncTimer = null;
    }
  }

  private async persistData(): Promise<void> {
    await this.saveData({
      tasks: this.tasks,
      settings: this.pluginSettings
    });
  }

  private async ensureTaskNotePath(task: TaskItem): Promise<string> {
    if (task.notePath) {
      const existing = this.app.vault.getAbstractFileByPath(task.notePath);
      if (existing instanceof TFile) {
        return task.notePath;
      }
    }

    const baseFolder = this.sanitizePathSegment(
      this.pluginSettings.notesBaseFolder,
      DEFAULT_SETTINGS.notesBaseFolder
    );
    const categoryFolder = this.sanitizePathSegment(task.category, "General");
    const folderPath = normalizePath(`${baseFolder}/${categoryFolder}`);
    await this.ensureFolderPath(folderPath);

    const fileBase = this.sanitizePathSegment(task.title, "Untitled");
    let candidate = normalizePath(`${folderPath}/${fileBase}.md`);
    let suffix = 1;
    while (this.app.vault.getAbstractFileByPath(candidate) instanceof TFile) {
      candidate = normalizePath(`${folderPath}/${fileBase}-${suffix}.md`);
      suffix += 1;
    }

    await this.app.vault.create(candidate, this.buildTaskNoteContent(task));
    return candidate;
  }

  private async ensureFolderPath(targetPath: string): Promise<void> {
    const parts = targetPath.split("/").filter((part) => part.length > 0);
    let current = "";
    for (const part of parts) {
      current = current ? `${current}/${part}` : part;
      const normalized = normalizePath(current);
      if (!this.app.vault.getAbstractFileByPath(normalized)) {
        await this.app.vault.createFolder(normalized);
      }
    }
  }

  private sanitizePathSegment(value: string, fallback: string): string {
    const sanitized = value
      .trim()
      .replace(/[\\/:*?"<>|]/g, "-")
      .replace(/\s+/g, " ")
      .replace(/[. ]+$/g, "")
      .trim();
    return sanitized || fallback;
  }

  private buildTaskNoteContent(task: TaskItem): string {
    return `# ${task.title}

## Task metadata
- Category: ${task.category}
- Status: ${task.status}
- Priority: ${task.priority}
- Start: ${task.startDate}
- End: ${task.endDate}

## Notes
`;
  }
}

class GanttTodoSettingTab extends PluginSettingTab {
  private readonly plugin: GanttTodoPlugin;

  constructor(app: App, plugin: GanttTodoPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Gantt TODO Board Settings" });

    const settings = this.plugin.getSettings();
    new Setting(containerEl)
      .setName("Task note base folder")
      .setDesc("Task note files are created under this folder, then grouped by category.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.notesBaseFolder)
          .setValue(settings.notesBaseFolder)
          .onChange(async (value) => {
            await this.plugin.updateSettings({
              notesBaseFolder: value
            });
          });
      });

    containerEl.createEl("h3", { text: "Teams local sync" });
    new Setting(containerEl)
      .setName("Teams calendar ICS file (vault path)")
      .setDesc("Example: Gantt Tasks/teams-calendar.ics. Update this file locally to trigger sync.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.teamsCalendarIcsPath)
          .setValue(settings.teamsCalendarIcsPath)
          .onChange(async (value) => {
            await this.plugin.updateSettings({
              teamsCalendarIcsPath: value
            });
          });
      });

    new Setting(containerEl)
      .setName("Auto sync Teams calendar")
      .setDesc("Automatically reflects Teams calendar events into task notes.")
      .addToggle((toggle) => {
        toggle.setValue(settings.teamsAutoSyncEnabled).onChange(async (value) => {
          await this.plugin.updateSettings({
            teamsAutoSyncEnabled: value
          });
        });
      });

    new Setting(containerEl)
      .setName("Auto sync interval (minutes)")
      .setDesc("How often auto sync runs when enabled.")
      .addText((text) => {
        text.setValue(String(settings.teamsSyncIntervalMinutes)).onChange(async (value) => {
          await this.plugin.updateSettings({
            teamsSyncIntervalMinutes: Number(value)
          });
        });
      });

    new Setting(containerEl)
      .setName("Sync range (days)")
      .setDesc("How many days from today are imported from Teams calendar.")
      .addText((text) => {
        text.setValue(String(settings.teamsSyncRangeDays)).onChange(async (value) => {
          await this.plugin.updateSettings({
            teamsSyncRangeDays: Number(value)
          });
        });
      });

    new Setting(containerEl)
      .setName("Run sync now")
      .setDesc("Manually imports Teams events into task notes immediately.")
      .addButton((button) => {
        button.setButtonText("Sync").onClick(() => {
          void this.plugin.syncTeamsCalendarToTaskNotes(true);
        });
      });
  }
}
