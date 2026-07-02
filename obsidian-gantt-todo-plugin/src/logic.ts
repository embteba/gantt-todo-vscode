import { DateValidationResult, GanttMetrics, TaskData, TaskItem, TaskPriority, TaskStatus } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;
const VALID_PRIORITIES: ReadonlySet<string> = new Set(["high", "medium", "low"]);
const VALID_STATUS: ReadonlySet<string> = new Set(["todo", "doing", "done"]);
const PRIORITY_ORDER: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2
};

export const LABEL_WIDTH = 170;
export type QuickFilterMode = "all" | "today" | "overdue" | "week" | "done";
export type SortMode = "start-asc" | "end-asc" | "priority-desc" | "recent-desc";

export function validateDateRange(startDate: string, endDate: string): DateValidationResult {
  if (!startDate || !endDate) {
    return { ok: false, message: "開始日と終了日を入力してください。" };
  }

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, message: "日付形式が正しくありません。" };
  }

  if (start > end) {
    return { ok: false, message: "日付が不正です。開始日は終了日以前にしてください。" };
  }

  return { ok: true, message: "" };
}

export function getValidPriority(value: unknown): TaskPriority {
  if (typeof value === "string" && VALID_PRIORITIES.has(value)) {
    return value as TaskPriority;
  }
  return "medium";
}

export function getValidStatus(value: unknown): TaskStatus {
  if (typeof value === "string" && VALID_STATUS.has(value)) {
    return value as TaskStatus;
  }
  return "todo";
}

export function normalizeTaskData(input: unknown): TaskData {
  if (!input || typeof input !== "object") {
    return { tasks: [] };
  }
  const maybe = input as { tasks?: unknown };
  if (!Array.isArray(maybe.tasks)) {
    return { tasks: [] };
  }
  return {
    tasks: maybe.tasks.map((task, index) => normalizeTask(task, index))
  };
}

export function normalizeTask(task: unknown, index = 0): TaskItem {
  const fallbackId = `task-${index}`;
  if (!task || typeof task !== "object") {
    return {
      id: fallbackId,
      title: "",
      category: "General",
      startDate: "",
      endDate: "",
      status: "todo",
      priority: "medium"
    };
  }

  const maybe = task as Partial<TaskItem>;
  const title = typeof maybe.title === "string" ? maybe.title : "";
  const category = typeof maybe.category === "string" && maybe.category.trim() ? maybe.category : "General";
  const startDate = typeof maybe.startDate === "string" ? maybe.startDate : "";
  const endDate = typeof maybe.endDate === "string" ? maybe.endDate : "";
  const notePath = typeof maybe.notePath === "string" && maybe.notePath.trim() ? maybe.notePath : undefined;

  return {
    id: typeof maybe.id === "string" && maybe.id ? maybe.id : fallbackId,
    title,
    category,
    startDate,
    endDate,
    status: getValidStatus(maybe.status),
    priority: getValidPriority(maybe.priority),
    notePath
  };
}

export function startOfDay(value: number | string | Date): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function isWeekend(value: number | string | Date): boolean {
  const day = new Date(value).getDay();
  return day === 0 || day === 6;
}

export function getWeekdayLabel(value: number | string | Date): string {
  const labels = ["日", "月", "火", "水", "木", "金", "土"];
  return labels[new Date(value).getDay()] ?? "";
}

export function getDayNumberLabel(value: number | string | Date): string {
  return String(new Date(value).getDate()).padStart(2, "0");
}

export function getMonthLabel(year: number, monthIndex: number): string {
  return `${year}/${String(monthIndex + 1).padStart(2, "0")}`;
}

export function computeGanttMetrics(tasks: TaskItem[], now = Date.now()): GanttMetrics {
  const today = startOfDay(now);
  const taskTimes = tasks.flatMap((task) => [new Date(task.startDate).getTime(), new Date(task.endDate).getTime()]);
  const validTimes = taskTimes.filter((ts) => Number.isFinite(ts));
  const min = startOfDay(Math.min(today, ...(validTimes.length > 0 ? validTimes : [today])));
  const max = startOfDay(Math.max(today, ...(validTimes.length > 0 ? validTimes : [today])));
  const totalDays = Math.max(1, Math.round((max - min) / DAY_MS) + 1);
  const trackWidth = Math.max(720, totalDays * 34);
  const dayWidth = trackWidth / totalDays;
  const todayOffsetDays = Math.round((today - min) / DAY_MS);
  const todayPercent = ((todayOffsetDays + 0.5) / totalDays) * 100;

  return {
    min,
    max,
    totalDays,
    trackWidth,
    labelWidth: LABEL_WIDTH,
    dayWidth,
    todayPercent
  };
}

export function formatRangeDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${month}/${day}`;
}

export function matchesSearchQuery(task: TaskItem, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return task.title.toLowerCase().includes(normalized) || task.category.toLowerCase().includes(normalized);
}

export function matchesQuickFilter(task: TaskItem, mode: QuickFilterMode, now = Date.now()): boolean {
  if (mode === "all") {
    return true;
  }

  if (mode === "done") {
    return task.status === "done";
  }

  const today = startOfDay(now);
  const end = startOfDay(task.endDate);
  if (Number.isNaN(end)) {
    return false;
  }

  if (mode === "overdue") {
    return task.status !== "done" && end < today;
  }

  const start = startOfDay(task.startDate);
  if (Number.isNaN(start)) {
    return false;
  }

  if (mode === "today") {
    return start <= today && end >= today;
  }

  const weekEnd = today + DAY_MS * 6;
  return start <= weekEnd && end >= today;
}

function dateOrMax(value: string): number {
  const parsed = startOfDay(value);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function recentIdValue(task: TaskItem): number {
  const parsed = Number(task.id);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function sortTasks(tasks: TaskItem[], mode: SortMode): TaskItem[] {
  const sorted = [...tasks];
  sorted.sort((left, right) => {
    if (mode === "recent-desc") {
      return recentIdValue(right) - recentIdValue(left);
    }

    if (mode === "priority-desc") {
      const rankDiff = PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority];
      if (rankDiff !== 0) {
        return rankDiff;
      }
      return dateOrMax(left.startDate) - dateOrMax(right.startDate);
    }

    if (mode === "end-asc") {
      return dateOrMax(left.endDate) - dateOrMax(right.endDate);
    }

    return dateOrMax(left.startDate) - dateOrMax(right.startDate);
  });
  return sorted;
}

export interface TaskSummary {
  total: number;
  todo: number;
  doing: number;
  done: number;
  overdue: number;
}

export function summarizeTasks(tasks: TaskItem[], now = Date.now()): TaskSummary {
  const today = startOfDay(now);
  let overdue = 0;
  let todo = 0;
  let doing = 0;
  let done = 0;

  for (const task of tasks) {
    if (task.status === "done") {
      done += 1;
    } else if (task.status === "doing") {
      doing += 1;
    } else {
      todo += 1;
    }

    const end = startOfDay(task.endDate);
    if (!Number.isNaN(end) && task.status !== "done" && end < today) {
      overdue += 1;
    }
  }

  return {
    total: tasks.length,
    todo,
    doing,
    done,
    overdue
  };
}

export const DAY_IN_MS = DAY_MS;
