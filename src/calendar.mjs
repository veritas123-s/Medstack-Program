// Calendar arithmetic uses UTC date components; schedule timestamps use Beijing time.
import { beijingDay } from "./briefing.mjs";
import { visibleCourses } from "./domain/content.mjs";
import { learningSelection } from "./learning-policy.mjs";
const DAY = 86400000;
const key = (date) => date.toISOString().slice(0, 10);
const utc = (day) => Date.parse(`${day}T12:00:00Z`);
export function calendarDate(day) {
  return (
    typeof day === "string" &&
    /^20\d{2}-\d{2}-\d{2}$/.test(day) &&
    Number.isFinite(utc(day)) &&
    key(new Date(utc(day))) === day
  );
}
export function shiftDate(day, count, unit = "day") {
  const d = new Date(utc(day));
  if (unit === "day") d.setUTCDate(d.getUTCDate() + count);
  else {
    const originalDay = d.getUTCDate();
    d.setUTCDate(1);
    if (unit === "year") d.setUTCFullYear(d.getUTCFullYear() + count);
    else d.setUTCMonth(d.getUTCMonth() + count);
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(originalDay, last));
  }
  return key(d) < "2000-01-01"
    ? "2000-01-01"
    : key(d) > "2099-12-31"
      ? "2099-12-31"
      : key(d);
}
export function monthDays(day) {
  const first = new Date(utc(day.slice(0, 7) + "-01"));
  const start = +first - ((first.getUTCDay() + 6) % 7) * DAY;
  return Array.from({ length: 42 }, (_, i) => key(new Date(start + i * DAY)));
}
const time = (value) => {
  if (!value) return NaN;
  const s = value.replace(" ", "T");
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(s) ? s : s + "+08:00");
};
const clock = (ms) => new Date(ms + 8 * 3600000).toISOString().slice(11, 16);
export function calendarEvents(
  state,
  { showCompleted = true, showTasks = true, showCourses = true } = {},
) {
  const result = [];
  if (showTasks) {
    const deadlines = state.learning?.items?.length
      ? learningSelection(state, state.learning).current.filter(
          (item) =>
            item.kind === "assignment" &&
            Number.isFinite(item.deadline) &&
            item.deadline > 0 &&
            !item.estimated &&
            !item.yearInferred,
        )
      : [];
    const linked = new Set(
      deadlines.map((item) => item.taskId).filter(Boolean),
    );
    const scheduled = new Set();
    for (const task of state.tasks || []) {
      if (
        task.deletedAt ||
        (!showCompleted && task.completedAt) ||
        !calendarDate(task.due)
      )
        continue;
      const start = Date.parse(
        `${task.due}T${task.dueTime || "23:59"}:00+08:00`,
      );
      if (!Number.isFinite(start)) continue;
      scheduled.add(task.id);
      result.push({
        id: `task:${task.id}`,
        kind: "task",
        title: task.title,
        day: task.due,
        lastDay: task.due,
        start,
        end: start,
        clock: task.dueTime || "当天截止",
        allDay: !task.dueTime,
        completed: !!task.completedAt,
        detail: task.project || "收集箱",
        task,
        learningDeadline: linked.has(task.id),
      });
    }
    for (const item of deadlines) {
      if (scheduled.has(item.taskId)) continue;
      const day = beijingDay(item.deadline);
      result.push({
        id: `learning-deadline:${item.id}`,
        kind: "assignment",
        title: item.title,
        day,
        lastDay: day,
        start: item.deadline,
        end: item.deadline,
        clock: clock(item.deadline),
        allDay: false,
        completed: false,
        detail: item.course || "超星学习通",
      });
    }
  }
  if (showCourses)
    for (const [i, course] of visibleCourses(state).entries()) {
      const start = time(course.start),
        end = time(course.end);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start)
        continue;
      result.push({
        id: `course:${i}:${course.start}`,
        kind: "course",
        title: course.title,
        day: beijingDay(start),
        lastDay: beijingDay(end - 1),
        start,
        end,
        clock: `${clock(start)}–${clock(end)}`,
        allDay: false,
        completed: false,
        detail: [course.location, course.teacher].filter(Boolean).join(" · "),
        course,
      });
    }
  for (const event of state.events || []) {
    if (event.deletedAt) continue;
    const start = time(event.start),
      end = time(event.end);
    result.push({
      id: `event:${event.id}`,
      kind: "event",
      title: event.title,
      day: beijingDay(start),
      lastDay: beijingDay(end - 1),
      start,
      end,
      clock: event.allDay ? "全天" : `${clock(start)}–${clock(end)}`,
      allDay: !!event.allDay,
      completed: false,
      detail: event.location,
      event,
    });
  }
  return result.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
export function eventsOnDay(events, day) {
  return events.filter((e) => e.day <= day && e.lastDay >= day);
}
export function courseCoverage(state, day, now = Date.now()) {
  const ranges = (state.courseRanges || []).filter(
    (r) => r.start <= day && r.end > day && Number.isFinite(r.syncedAt),
  );
  const syncedAt = Math.max(0, ...ranges.map((r) => r.syncedAt));
  return {
    status: !ranges.length
      ? "missing"
      : syncedAt <= now && now - syncedAt <= 7 * DAY
        ? "fresh"
        : "stale",
    syncedAt,
  };
}
