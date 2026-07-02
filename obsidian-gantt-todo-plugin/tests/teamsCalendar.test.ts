import {
  buildTeamsSection,
  filterEventsForTask,
  filterEventsForWindow,
  parseTeamsCalendarIcs,
  upsertTeamsSection
} from "../src/teamsCalendar";

describe("parseTeamsCalendarIcs", () => {
  it("parses basic VEVENT records", () => {
    const ics = `BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260703T090000
DTEND:20260703T100000
SUMMARY:Daily Standup
LOCATION:Teams
END:VEVENT
BEGIN:VEVENT
DTSTART:20260703T130000
DTEND:20260703T133000
SUMMARY:Sprint Sync
END:VEVENT
END:VCALENDAR`;

    const events = parseTeamsCalendarIcs(ics);
    expect(events).toHaveLength(2);
    expect(events[0]?.summary).toBe("Daily Standup");
    expect(events[0]?.location).toBe("Teams");
  });
});

describe("Teams sync helpers", () => {
  const events = parseTeamsCalendarIcs(`BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260710T090000
DTEND:20260710T100000
SUMMARY:Planning
END:VEVENT
BEGIN:VEVENT
DTSTART:20260712T150000
DTEND:20260712T160000
SUMMARY:Review
END:VEVENT
END:VCALENDAR`);

  it("filters events by date window", () => {
    const now = new Date("2026-07-10T08:00:00+09:00").getTime();
    const filtered = filterEventsForWindow(events, now, 1);
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.summary).toBe("Planning");
  });

  it("filters events by task date range", () => {
    const filtered = filterEventsForTask(events, "2026-07-10", "2026-07-11");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.summary).toBe("Planning");
  });

  it("upserts managed teams section", () => {
    const original = `# Task\n\n## Notes\nExisting`;
    const section = buildTeamsSection(events);
    const updated = upsertTeamsSection(original, section);
    expect(updated).toContain("## Teams Calendar (Auto Sync)");
    expect(updated).toContain("Planning");

    const replaced = upsertTeamsSection(updated, buildTeamsSection([]));
    expect(replaced).toContain("No Teams events in sync range.");
  });
});
