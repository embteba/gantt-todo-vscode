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
}

export interface TaskData {
  tasks: TaskItem[];
}
