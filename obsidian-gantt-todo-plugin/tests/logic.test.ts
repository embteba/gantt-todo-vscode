import {
  computeGanttMetrics,
  getValidPriority,
  getValidStatus,
  normalizeTaskData,
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
