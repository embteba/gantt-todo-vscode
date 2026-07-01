import { ItemView, Notice, WorkspaceLeaf } from "obsidian";
import GanttTodoPlugin from "../main";
import {
  computeGanttMetrics,
  DAY_IN_MS,
  formatRangeDate,
  getDayNumberLabel,
  getMonthLabel,
  getValidPriority,
  getValidStatus,
  getWeekdayLabel,
  isWeekend,
  normalizeTask,
  startOfDay,
  validateDateRange
} from "./logic";
import { TaskItem } from "./types";

interface BoardState {
  tasks: TaskItem[];
  editingId: string | null;
  categoryFilter: string;
  storagePath: string;
}

interface BoardElements {
  categoryInput: HTMLInputElement;
  titleInput: HTMLInputElement;
  startDateInput: HTMLInputElement;
  endDateInput: HTMLInputElement;
  statusSelect: HTMLSelectElement;
  prioritySelect: HTMLSelectElement;
  addTaskButton: HTMLButtonElement;
  formError: HTMLParagraphElement;
  categoryFilter: HTMLSelectElement;
  storagePath: HTMLParagraphElement;
  taskRows: HTMLTableSectionElement;
  gantt: HTMLDivElement;
}

export const VIEW_TYPE_GANTT_BOARD = "gantt-todo-board-view";

export class GanttTodoBoardView extends ItemView {
  private readonly plugin: GanttTodoPlugin;
  private readonly state: BoardState = {
    tasks: [],
    editingId: null,
    categoryFilter: "",
    storagePath: ""
  };

  private elements?: BoardElements;

  constructor(leaf: WorkspaceLeaf, plugin: GanttTodoPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_GANTT_BOARD;
  }

  getDisplayText(): string {
    return "Gantt TODO Board";
  }

  getIcon(): string {
    return "list-checks";
  }

  async onOpen(): Promise<void> {
    this.buildLayout();
    this.refreshFromPluginData();
  }

  async onClose(): Promise<void> {}

  refreshFromPluginData(): void {
    this.state.tasks = this.plugin.getTasks();
    this.state.storagePath = this.plugin.getStoragePathLabel();
    this.render();
  }

  private buildLayout(): void {
    this.contentEl.empty();
    this.contentEl.addClass("gantt-todo-board-root");

    const main = this.contentEl.createDiv({ cls: "gantt-layout" });
    const left = main.createDiv({ cls: "gantt-panel gantt-left" });
    const right = main.createDiv({ cls: "gantt-panel gantt-right" });

    const header = left.createDiv({ cls: "gantt-header" });
    header.createEl("h2", { text: "Gantt TODO Board" });
    const storagePath = header.createEl("p", { cls: "gantt-storage-path" });

    const form = left.createDiv({ cls: "gantt-form" });
    const categoryInput = form.createEl("input", { attr: { type: "text", placeholder: "Category (e.g. Backend)" } });
    const titleInput = form.createEl("input", { attr: { type: "text", placeholder: "Task title" } });
    const dateRow = form.createDiv({ cls: "gantt-date-row" });
    const startDateInput = this.createLabeledDateInput(dateRow, "Start Date", "startDate");
    const endDateInput = this.createLabeledDateInput(dateRow, "End Date", "endDate");
    const statusSelect = this.createStatusSelect(form);
    const prioritySelect = this.createPrioritySelect(form);
    const addTaskButton = form.createEl("button", { text: "Add Task" });
    addTaskButton.addClass("gantt-primary-button");
    const formError = form.createEl("p", { cls: "gantt-form-error is-hidden" });

    const filterSection = left.createDiv({ cls: "gantt-filter" });
    const categoryFilter = filterSection.createEl("select");
    categoryFilter.createEl("option", { value: "", text: "All categories" });

    const tableSection = left.createDiv({ cls: "gantt-table-section" });
    tableSection.createEl("h3", { text: "TODO List" });
    const tableWrap = tableSection.createDiv({ cls: "gantt-table-wrap" });
    const table = tableWrap.createEl("table");
    const thead = table.createEl("thead");
    const headerRow = thead.createEl("tr");
    const headers = ["Title", "Category", "Start", "End", "Status", "Priority", "Actions"];
    for (const headerLabel of headers) {
      headerRow.createEl("th", { text: headerLabel });
    }
    const taskRows = table.createEl("tbody");

    right.createEl("h3", { text: "Gantt View" });
    const gantt = right.createDiv({ cls: "gantt-canvas" });

    this.elements = {
      categoryInput,
      titleInput,
      startDateInput,
      endDateInput,
      statusSelect,
      prioritySelect,
      addTaskButton,
      formError,
      categoryFilter,
      storagePath,
      taskRows,
      gantt
    };

    this.registerDomEvent(addTaskButton, "click", () => {
      void this.onAddOrUpdateTask();
    });
    this.registerDomEvent(categoryFilter, "change", () => {
      this.state.categoryFilter = categoryFilter.value;
      this.render();
    });
  }

  private createLabeledDateInput(parent: HTMLElement, label: string, idPrefix: string): HTMLInputElement {
    const wrap = parent.createDiv({ cls: "gantt-date-field" });
    wrap.createEl("label", { text: label, attr: { for: `${idPrefix}-input` } });
    return wrap.createEl("input", {
      attr: {
        id: `${idPrefix}-input`,
        type: "date"
      }
    });
  }

  private createStatusSelect(parent: HTMLElement): HTMLSelectElement {
    const statusSelect = parent.createEl("select");
    statusSelect.createEl("option", { value: "todo", text: "TODO" });
    statusSelect.createEl("option", { value: "doing", text: "Doing" });
    statusSelect.createEl("option", { value: "done", text: "Done" });
    return statusSelect;
  }

  private createPrioritySelect(parent: HTMLElement): HTMLSelectElement {
    const prioritySelect = parent.createEl("select");
    prioritySelect.createEl("option", { value: "high", text: "High" });
    prioritySelect.createEl("option", { value: "medium", text: "Medium" });
    prioritySelect.createEl("option", { value: "low", text: "Low" });
    prioritySelect.value = "medium";
    return prioritySelect;
  }

  private async onAddOrUpdateTask(): Promise<void> {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    const title = elements.titleInput.value.trim();
    const category = elements.categoryInput.value.trim() || "General";
    const startDate = elements.startDateInput.value;
    const endDate = elements.endDateInput.value;
    const status = getValidStatus(elements.statusSelect.value);
    const priority = getValidPriority(elements.prioritySelect.value);

    if (!title) {
      this.showFormError("タイトルを入力してください。");
      return;
    }

    const dateValidation = validateDateRange(startDate, endDate);
    if (!dateValidation.ok) {
      this.showFormError(dateValidation.message);
      return;
    }

    this.clearFormError();

    if (this.state.editingId) {
      this.state.tasks = this.state.tasks.map((task) => {
        if (task.id !== this.state.editingId) {
          return task;
        }
        return { ...task, title, category, startDate, endDate, status, priority };
      });
    } else {
      this.state.tasks.push({
        id: String(Date.now()),
        title,
        category,
        startDate,
        endDate,
        status,
        priority
      });
    }

    this.clearForm();
    await this.persistAndRender();
  }

  private async persistAndRender(): Promise<void> {
    try {
      await this.plugin.saveTasks(this.state.tasks);
      this.state.tasks = this.plugin.getTasks();
      this.render();
    } catch (error) {
      new Notice(`Failed to save task data: ${String(error)}`);
    }
  }

  private showFormError(message: string): void {
    const formError = this.elements?.formError;
    if (!formError) {
      return;
    }
    formError.setText(message);
    formError.removeClass("is-hidden");
  }

  private clearFormError(): void {
    const formError = this.elements?.formError;
    if (!formError) {
      return;
    }
    formError.setText("");
    formError.addClass("is-hidden");
  }

  private clearForm(): void {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    this.state.editingId = null;
    elements.titleInput.value = "";
    elements.categoryInput.value = "";
    elements.startDateInput.value = "";
    elements.endDateInput.value = "";
    elements.statusSelect.value = "todo";
    elements.prioritySelect.value = "medium";
    elements.addTaskButton.setText("Add Task");
    this.clearFormError();
  }

  private render(): void {
    const elements = this.elements;
    if (!elements) {
      return;
    }

    elements.storagePath.setText(this.state.storagePath ? `Storage: ${this.state.storagePath}` : "");
    this.renderCategoryFilter(elements.categoryFilter);
    this.renderTable(elements.taskRows);
    this.renderGantt(elements.gantt);
  }

  private renderCategoryFilter(categoryFilter: HTMLSelectElement): void {
    const categories = Array.from(new Set(this.state.tasks.map((task) => task.category))).sort();
    categoryFilter.empty();
    categoryFilter.createEl("option", { value: "", text: "All categories" });

    for (const category of categories) {
      const option = categoryFilter.createEl("option", { value: category, text: category });
      option.selected = category === this.state.categoryFilter;
    }

    if (this.state.categoryFilter && !categories.includes(this.state.categoryFilter)) {
      this.state.categoryFilter = "";
    }
    categoryFilter.value = this.state.categoryFilter;
  }

  private renderTable(taskRows: HTMLTableSectionElement): void {
    taskRows.empty();
    const tasks = this.getVisibleTasks().sort((a, b) => a.startDate.localeCompare(b.startDate));

    for (const task of tasks) {
      const row = taskRows.createEl("tr", {
        cls: this.state.editingId === task.id ? "is-editing" : ""
      });

      this.createTextCell(row, task.title, "is-title");
      this.createTextCell(row, task.category);
      this.createTextCell(row, task.startDate);
      this.createTextCell(row, task.endDate);
      this.createBadgeCell(row, task.status, `status-badge status-${task.status}`);
      this.createBadgeCell(row, task.priority, `priority-badge priority-${task.priority}`);

      const actions = row.createEl("td");
      const deleteButton = actions.createEl("button", { text: "Delete", cls: "gantt-delete-button" });
      this.registerDomEvent(deleteButton, "click", (event) => {
        event.stopPropagation();
        this.state.tasks = this.state.tasks.filter((candidate) => candidate.id !== task.id);
        if (this.state.editingId === task.id) {
          this.clearForm();
        }
        void this.persistAndRender();
      });

      this.registerDomEvent(row, "click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement) || target.closest("button")) {
          return;
        }

        if (this.state.editingId === task.id) {
          this.clearForm();
          this.render();
          return;
        }

        this.state.editingId = task.id;
        const elements = this.elements;
        if (!elements) {
          return;
        }
        elements.titleInput.value = task.title;
        elements.categoryInput.value = task.category;
        elements.startDateInput.value = task.startDate;
        elements.endDateInput.value = task.endDate;
        elements.statusSelect.value = getValidStatus(task.status);
        elements.prioritySelect.value = getValidPriority(task.priority);
        elements.addTaskButton.setText("Update Task");
        this.clearFormError();
        this.render();
      });
    }
  }

  private renderGantt(gantt: HTMLDivElement): void {
    gantt.empty();
    const tasks = this.getVisibleTasks();
    if (tasks.length === 0) {
      gantt.createEl("p", { text: "No tasks", cls: "gantt-empty" });
      return;
    }

    const metrics = computeGanttMetrics(tasks);
    const content = gantt.createDiv({ cls: "gantt-content" });
    content.style.width = `${metrics.labelWidth + metrics.trackWidth}px`;

    this.renderGanttAxis(content, metrics.min, metrics.totalDays, metrics.trackWidth, metrics.labelWidth, metrics.dayWidth);

    const sortedTasks = [...tasks].sort((a, b) => a.startDate.localeCompare(b.startDate));
    for (const task of sortedTasks) {
      const row = content.createDiv({ cls: "gantt-row" });
      row.style.gridTemplateColumns = `${metrics.labelWidth}px ${metrics.trackWidth}px`;

      const label = row.createDiv({ cls: "gantt-label" });
      label.createEl("span", { text: task.title });
      label.createEl("small", { cls: "gantt-dates", text: `${formatRangeDate(task.startDate)} - ${formatRangeDate(task.endDate)}` });

      const track = row.createDiv({ cls: "gantt-track" });
      track.style.setProperty("--day-width", `${metrics.dayWidth}px`);
      this.appendDayBackground(track, metrics.min, metrics.totalDays);

      const bar = track.createDiv({ cls: `gantt-bar status-${task.status}` });
      const start = startOfDay(task.startDate);
      const end = startOfDay(task.endDate);
      const startOffsetDays = Math.round((start - metrics.min) / DAY_IN_MS);
      const durationDays = Math.max(1, Math.round((end - start) / DAY_IN_MS) + 1);
      bar.style.left = `${(startOffsetDays / metrics.totalDays) * 100}%`;
      bar.style.width = `${(durationDays / metrics.totalDays) * 100}%`;
      bar.title = `${task.category} (${task.startDate} - ${task.endDate})`;
    }

    this.appendGlobalTodayLine(content, metrics.todayPercent, metrics.labelWidth, metrics.trackWidth);
  }

  private renderGanttAxis(
    container: HTMLElement,
    min: number,
    totalDays: number,
    trackWidth: number,
    labelWidth: number,
    dayWidth: number
  ): void {
    const axis = container.createDiv({ cls: "gantt-axis" });
    axis.style.gridTemplateColumns = `${labelWidth}px ${trackWidth}px`;

    axis.createEl("span", { cls: "gantt-axis-label", text: "Date" });
    const axisLayers = axis.createDiv({ cls: "gantt-axis-layers" });

    const monthTrack = axisLayers.createDiv({ cls: "gantt-axis-month-track" });
    const dayTrack = axisLayers.createDiv({ cls: "gantt-axis-day-track" });
    dayTrack.style.setProperty("--day-width", `${dayWidth}px`);

    this.appendMonthSegments(monthTrack, min, totalDays);
    this.appendDayBackground(dayTrack, min, totalDays);
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
      const dayTime = min + dayIndex * DAY_IN_MS;
      this.appendAxisTick(dayTrack, dayTime, dayIndex, totalDays);
    }
  }

  private appendAxisTick(axisTrack: HTMLElement, tickTime: number, dayIndex: number, totalDays: number): void {
    const left = (dayIndex / totalDays) * 100;
    const width = 100 / totalDays;
    const weekend = isWeekend(tickTime);

    const tick = axisTrack.createDiv({ cls: "gantt-axis-tick" });
    tick.style.left = `${left}%`;

    const tickLabel = axisTrack.createDiv({ cls: `gantt-axis-day-label ${weekend ? "weekend" : "weekday"}` });
    tickLabel.style.left = `${left}%`;
    tickLabel.style.width = `${width}%`;
    tickLabel.createEl("span", { cls: "gantt-axis-day-number", text: getDayNumberLabel(tickTime) });
    tickLabel.createEl("span", { cls: "gantt-axis-weekday", text: getWeekdayLabel(tickTime) });
  }

  private appendMonthSegments(container: HTMLElement, min: number, totalDays: number): void {
    let dayIndex = 0;
    while (dayIndex < totalDays) {
      const current = new Date(min + dayIndex * DAY_IN_MS);
      const year = current.getFullYear();
      const month = current.getMonth();
      const startIndex = dayIndex;

      while (dayIndex < totalDays) {
        const target = new Date(min + dayIndex * DAY_IN_MS);
        if (target.getFullYear() !== year || target.getMonth() !== month) {
          break;
        }
        dayIndex += 1;
      }

      const segment = container.createDiv({ cls: "gantt-axis-month-segment" });
      segment.style.left = `${(startIndex / totalDays) * 100}%`;
      segment.style.width = `${((dayIndex - startIndex) / totalDays) * 100}%`;
      segment.createEl("span", { cls: "gantt-axis-month-label", text: getMonthLabel(year, month) });
    }
  }

  private appendDayBackground(container: HTMLElement, min: number, totalDays: number): void {
    for (let dayIndex = 0; dayIndex < totalDays; dayIndex += 1) {
      const dayTime = min + dayIndex * DAY_IN_MS;
      const dayCell = container.createDiv({ cls: `gantt-day-cell ${isWeekend(dayTime) ? "weekend" : "weekday"}` });
      dayCell.style.left = `${(dayIndex / totalDays) * 100}%`;
      dayCell.style.width = `${100 / totalDays}%`;
    }
  }

  private appendGlobalTodayLine(container: HTMLElement, percent: number, labelWidth: number, trackWidth: number): void {
    const line = container.createDiv({ cls: "gantt-today-line" });
    line.style.left = `${labelWidth + (trackWidth * percent) / 100}px`;
  }

  private createTextCell(row: HTMLTableRowElement, value: string, cls = ""): void {
    const cell = row.createEl("td");
    if (cls) {
      cell.addClass(cls);
    }
    cell.setText(value);
  }

  private createBadgeCell(row: HTMLTableRowElement, value: string, cls: string): void {
    const cell = row.createEl("td");
    const badge = cell.createEl("span", { cls });
    badge.setText(value);
  }

  private getVisibleTasks(): TaskItem[] {
    const tasks = this.state.tasks.map((task, index) => normalizeTask(task, index));
    if (!this.state.categoryFilter) {
      return tasks;
    }
    return tasks.filter((task) => task.category === this.state.categoryFilter);
  }
}
