import {
  computeGanttMetrics,
  getValidPriority,
  getValidStatus,
  matchesQuickFilter,
  matchesSearchQuery,
  normalizeTaskData,
  sortTasks,
  summarizeTasks,
  validateDateRange
} from "../src/logic";

describe("validateDateRange", () => {
  it("returns error for empty dates", () => {
    expect(validateDateRange("", "")).toEqual({
      ok: false,
      message: "開始日と終了日を入力してください。"
    });
  });

  it("returns error when start is after end", () => {
    expect(validateDateRange("2026-07-10", "2026-07-01")).toEqual({
      ok: false,
      message: "日付が不正です。開始日は終了日以前にしてください。"
    });
  });

  it("accepts valid range", () => {
    expect(validateDateRange("2026-07-01", "2026-07-02")).toEqual({
      ok: true,
      message: ""
    });
  });
});

describe("normalization", () => {
  it("fills missing priority with medium", () => {
    const data = normalizeTaskData({
      tasks: [
        {
          id: "1",
          title: "Task",
          category: "General",
          startDate: "2026-07-01",
          endDate: "2026-07-02",
          status: "todo"
        }
      ]
    });

    expect(data.tasks[0]?.priority).toBe("medium");
  });

  it("normalizes invalid status and priority", () => {
    expect(getValidStatus("x")).toBe("todo");
    expect(getValidPriority("x")).toBe("medium");
  });

  it("preserves note path when present", () => {
    const data = normalizeTaskData({
      tasks: [
        {
          id: "1",
          title: "Task",
          category: "General",
          startDate: "2026-07-01",
          endDate: "2026-07-02",
          status: "todo",
          priority: "medium",
          notePath: "Gantt Tasks/General/Task.md"
        }
      ]
    });

    expect(data.tasks[0]?.notePath).toBe("Gantt Tasks/General/Task.md");
  });
});

describe("computeGanttMetrics", () => {
  it("uses task date range and computes positive day width", () => {
    const metrics = computeGanttMetrics(
      [
        {
          id: "1",
          title: "Task A",
          category: "Backend",
          startDate: "2026-07-01",
          endDate: "2026-07-04",
          status: "todo",
          priority: "medium"
        }
      ],
      new Date("2026-07-02T12:00:00+09:00").getTime()
    );

    expect(metrics.totalDays).toBeGreaterThanOrEqual(4);
    expect(metrics.trackWidth).toBeGreaterThanOrEqual(720);
    expect(metrics.dayWidth).toBeGreaterThan(0);
    expect(metrics.todayPercent).toBeGreaterThan(0);
  });
});

describe("task filtering and sorting", () => {
  const now = new Date("2026-07-10T12:00:00+09:00").getTime();
  const baseTask = {
    id: "1",
    title: "Design API",
    category: "Backend",
    startDate: "2026-07-10",
    endDate: "2026-07-12",
    status: "todo" as const,
    priority: "medium" as const
  };

  it("matches title/category search query", () => {
    expect(matchesSearchQuery(baseTask, "api")).toBe(true);
    expect(matchesSearchQuery(baseTask, "backend")).toBe(true);
    expect(matchesSearchQuery(baseTask, "frontend")).toBe(false);
  });

  it("supports quick filter modes", () => {
    expect(matchesQuickFilter(baseTask, "today", now)).toBe(true);
    expect(matchesQuickFilter(baseTask, "week", now)).toBe(true);
    expect(matchesQuickFilter(baseTask, "overdue", now)).toBe(false);
    expect(matchesQuickFilter({ ...baseTask, status: "done" }, "done", now)).toBe(true);
    expect(
      matchesQuickFilter({ ...baseTask, endDate: "2026-07-08", status: "todo" }, "overdue", now)
    ).toBe(true);
  });

  it("sorts tasks by priority and recent order", () => {
    const tasks = [
      { ...baseTask, id: "1", priority: "low" as const },
      { ...baseTask, id: "3", priority: "medium" as const },
      { ...baseTask, id: "2", priority: "high" as const }
    ];
    expect(sortTasks(tasks, "priority-desc").map((task) => task.priority)).toEqual([
      "high",
      "medium",
      "low"
    ]);
    expect(sortTasks(tasks, "recent-desc").map((task) => task.id)).toEqual(["3", "2", "1"]);
  });

  it("summarizes task counts including overdue", () => {
    const summary = summarizeTasks(
      [
        { ...baseTask, status: "todo", endDate: "2026-07-08" },
        { ...baseTask, status: "doing", id: "2" },
        { ...baseTask, status: "done", id: "3" }
      ],
      now
    );

    expect(summary).toEqual({
      total: 3,
      todo: 1,
      doing: 1,
      done: 1,
      overdue: 1
    });
  });
});
