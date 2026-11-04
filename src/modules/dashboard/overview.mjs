import { agenda, learningEntries } from "../../agenda.mjs";
import {
  calendarEvents,
  eventsOnDay,
  courseCoverage,
  shiftDate,
} from "../../calendar.mjs";
import { beijingDay } from "../../briefing.mjs";
export function overview(state, now = Date.now()) {
  const day = beijingDay(now),
    tomorrow = shiftDate(day, 1),
    a = agenda(state, state.learning, now);
  const suppressed = new Set(
    [
      ...learningEntries(state, state.learning, { history: true, now }),
      ...learningEntries(state, state.learning, { deleted: true, now }),
    ]
      .map((x) => x.taskId)
      .filter(Boolean),
  );
  const tasks = state.tasks
    .filter((t) => !t.completedAt && !t.deletedAt && !suppressed.has(t.id))
    .toSorted(
      (a, b) =>
        (a.quadrant === "do" ? 0 : 1) - (b.quadrant === "do" ? 0 : 1) ||
        (a.due || "9999").localeCompare(b.due || "9999"),
    );
  const dated = a.entries.filter(
    (e) =>
      e.kind === "task" ||
      (e.kind === "assignment" &&
        e.deadline > 0 &&
        !e.estimated &&
        !e.yearInferred),
  );
  const events = calendarEvents(state, {
    showTasks: false,
    showCompleted: false,
  });
  const deadlines = dated.filter((e) => beijingDay(e.time) === day);
  const schedule = eventsOnDay(events, day);
  const active = schedule.filter((e) => !e.allDay && e.end > now);
  const next = active[0];
  const imminent = next && next.start <= now + 45 * 60000;
  const focus = imminent
    ? next
    : deadlines[0] || next || schedule.find((e) => e.allDay);
  const notices = a.entries
    .filter((x) => x.kind === "notice")
    .sort((a, b) => (b.time || 0) - (a.time || 0));
  return {
    day,
    tasks,
    deadlines,
    schedule,
    focus,
    tomorrow: {
      day: tomorrow,
      schedule: eventsOnDay(events, tomorrow),
      deadlines: dated.filter((e) => beijingDay(e.time) === tomorrow),
      coverage: courseCoverage(state, tomorrow, now),
    },
    overdueEntries: dated.filter((e) => beijingDay(e.time) < day),
    notices,
    coverage: courseCoverage(state, day, now),
    assignments: a.entries.filter((e) => e.kind === "assignment"),
    overdue: tasks.filter((t) => t.due && t.due < day).length,
  };
}
