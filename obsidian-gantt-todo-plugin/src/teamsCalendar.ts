const SECTION_START = "<!-- GANTT_TEAMS_SYNC_START -->";
const SECTION_END = "<!-- GANTT_TEAMS_SYNC_END -->";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface TeamsCalendarEvent {
  start: number;
  end: number;
  summary: string;
  location: string;
  description: string;
}

function unfoldIcsLines(content: string): string[] {
  const normalized = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
      continue;
    }
    unfolded.push(line);
  }
  return unfolded;
}

function decodeIcsText(value: string): string {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseIcsDateValue(value: string): number | null {
  const dateOnly = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dateOnly) {
    const year = Number(dateOnly[1]);
    const month = Number(dateOnly[2]) - 1;
    const day = Number(dateOnly[3]);
    return new Date(year, month, day).getTime();
  }

  const dateTime = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/);
  if (!dateTime) {
    return null;
  }

  const year = Number(dateTime[1]);
  const month = Number(dateTime[2]) - 1;
  const day = Number(dateTime[3]);
  const hour = Number(dateTime[4]);
  const minute = Number(dateTime[5]);
  const second = Number(dateTime[6] ?? "0");
  const utc = dateTime[7] === "Z";
  if (utc) {
    return Date.UTC(year, month, day, hour, minute, second);
  }
  return new Date(year, month, day, hour, minute, second).getTime();
}

function parseProperty(line: string): { key: string; value: string } | null {
  const colonIndex = line.indexOf(":");
  if (colonIndex < 0) {
    return null;
  }
  const rawKey = line.slice(0, colonIndex).toUpperCase();
  const key = rawKey.split(";")[0] ?? rawKey;
  const value = line.slice(colonIndex + 1);
  return { key, value };
}

export function parseTeamsCalendarIcs(content: string): TeamsCalendarEvent[] {
  const lines = unfoldIcsLines(content);
  const events: TeamsCalendarEvent[] = [];
  let current: Partial<TeamsCalendarEvent> | null = null;

  for (const line of lines) {
    const upper = line.toUpperCase();
    if (upper === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (upper === "END:VEVENT") {
      if (
        current &&
        typeof current.start === "number" &&
        typeof current.end === "number" &&
        current.end > current.start
      ) {
        events.push({
          start: current.start,
          end: current.end,
          summary: current.summary ?? "(No title)",
          location: current.location ?? "",
          description: current.description ?? ""
        });
      }
      current = null;
      continue;
    }
    if (!current) {
      continue;
    }

    const parsed = parseProperty(line);
    if (!parsed) {
      continue;
    }

    const { key, value } = parsed;
    if (key === "DTSTART") {
      const ts = parseIcsDateValue(value);
      if (ts !== null) {
        current.start = ts;
      }
    } else if (key === "DTEND") {
      const ts = parseIcsDateValue(value);
      if (ts !== null) {
        current.end = ts;
      }
    } else if (key === "SUMMARY") {
      current.summary = decodeIcsText(value);
    } else if (key === "LOCATION") {
      current.location = decodeIcsText(value);
    } else if (key === "DESCRIPTION") {
      current.description = decodeIcsText(value);
    }
  }

  return events.sort((left, right) => left.start - right.start);
}

export function startOfDay(value: number): number {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function endOfDay(value: number): number {
  return startOfDay(value) + DAY_MS;
}

export function eventOverlapsRange(event: TeamsCalendarEvent, rangeStart: number, rangeEnd: number): boolean {
  return event.end > rangeStart && event.start < rangeEnd;
}

export function filterEventsForWindow(
  events: TeamsCalendarEvent[],
  now: number,
  rangeDays: number
): TeamsCalendarEvent[] {
  const normalizedDays = Math.max(1, Math.min(14, Math.floor(rangeDays)));
  const windowStart = startOfDay(now);
  const windowEnd = windowStart + normalizedDays * DAY_MS;
  return events.filter((event) => eventOverlapsRange(event, windowStart, windowEnd));
}

export function filterEventsForTask(
  events: TeamsCalendarEvent[],
  taskStartDate: string,
  taskEndDate: string
): TeamsCalendarEvent[] {
  const taskStart = parseIcsDateValue(taskStartDate.replace(/-/g, "")) ?? NaN;
  const taskEndDay = parseIcsDateValue(taskEndDate.replace(/-/g, "")) ?? NaN;
  if (!Number.isFinite(taskStart) || !Number.isFinite(taskEndDay)) {
    return [];
  }
  const taskEnd = endOfDay(taskEndDay);
  return events.filter((event) => eventOverlapsRange(event, taskStart, taskEnd));
}

function formatTime(value: number): string {
  const date = new Date(value);
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function formatDate(value: number): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createEventLine(event: TeamsCalendarEvent): string {
  const summary = event.summary.trim() || "(No title)";
  const base = `- ${formatTime(event.start)}-${formatTime(event.end)} ${summary}`;
  return event.location ? `${base} @ ${event.location}` : base;
}

export function buildTeamsSection(events: TeamsCalendarEvent[]): string {
  const header = `## Teams Calendar (Auto Sync)\n${SECTION_START}\n`;
  if (events.length === 0) {
    return `${header}\n- No Teams events in sync range.\n${SECTION_END}`;
  }

  const grouped = new Map<string, TeamsCalendarEvent[]>();
  for (const event of events) {
    const key = formatDate(event.start);
    const list = grouped.get(key);
    if (list) {
      list.push(event);
    } else {
      grouped.set(key, [event]);
    }
  }

  const lines: string[] = [header];
  for (const [date, list] of grouped.entries()) {
    lines.push(`\n### ${date}`);
    for (const event of list) {
      lines.push(createEventLine(event));
    }
  }
  lines.push(`\n${SECTION_END}`);
  return lines.join("\n");
}

export function upsertTeamsSection(markdown: string, section: string): string {
  const blockPattern = new RegExp(
    `## Teams Calendar \\(Auto Sync\\)[\\s\\S]*?${SECTION_START}[\\s\\S]*?${SECTION_END}`,
    "m"
  );
  if (blockPattern.test(markdown)) {
    return markdown.replace(blockPattern, section);
  }

  const notesSectionPattern = /## Notes\s*/m;
  if (notesSectionPattern.test(markdown)) {
    return markdown.replace(notesSectionPattern, (match) => `${section}\n\n${match}`);
  }

  const trimmed = markdown.trimEnd();
  return `${trimmed}\n\n${section}\n`;
}
