export type TaskStatus = "todo" | "doing" | "done";
export type TaskPriority = "high" | "medium" | "low";

export interface TaskItem {
  id: string;
  title: string;
  category: string;
  startDate: string;
  endDate: string;
  status: TaskStatus;
  priority: TaskPriority;
  notePath?: string;
}

export interface TaskData {
  tasks: TaskItem[];
}

export interface DateValidationResult {
  ok: boolean;
  message: string;
}

export interface GanttMetrics {
  min: number;
  max: number;
  totalDays: number;
  trackWidth: number;
  labelWidth: number;
  dayWidth: number;
  todayPercent: number;
}

export interface GanttTodoSettings {
  notesBaseFolder: string;
  teamsCalendarIcsPath: string;
  teamsAutoSyncEnabled: boolean;
  teamsSyncIntervalMinutes: number;
  teamsSyncRangeDays: number;
}
