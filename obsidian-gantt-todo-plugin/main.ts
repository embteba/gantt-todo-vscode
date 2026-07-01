import { Plugin, WorkspaceLeaf } from "obsidian";
import { GanttTodoBoardView, VIEW_TYPE_GANTT_BOARD } from "./src/boardView";
import { normalizeTaskData } from "./src/logic";
import { TaskItem } from "./src/types";

export default class GanttTodoPlugin extends Plugin {
  private tasks: TaskItem[] = [];

  async onload(): Promise<void> {
    await this.loadStoredData();

    this.registerView(VIEW_TYPE_GANTT_BOARD, (leaf: WorkspaceLeaf) => new GanttTodoBoardView(leaf, this));

    this.addCommand({
      id: "open-gantt-todo-board",
      name: "Open Gantt TODO Board",
      callback: () => {
        void this.activateView();
      }
    });

    this.addRibbonIcon("list-checks", "Open Gantt TODO Board", () => {
      void this.activateView();
    });
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_GANTT_BOARD);
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

  async saveTasks(tasks: TaskItem[]): Promise<void> {
    const normalized = normalizeTaskData({ tasks });
    this.tasks = normalized.tasks;
    await this.saveData(normalized);
  }

  private async loadStoredData(): Promise<void> {
    const loaded = await this.loadData();
    this.tasks = normalizeTaskData(loaded).tasks;
  }
}
