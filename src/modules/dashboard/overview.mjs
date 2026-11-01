import { agenda, learningEntries } from "../../agenda.mjs";
import {
  calendarEvents,
  eventsOnDay,
  courseCoverage,
} from "../../calendar.mjs";
import { beijingDay } from "../../briefing.mjs";
export function overview(state, now = Date.now()) {
  const day = beijingDay(now),
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
  const deadlines = a.entries.filter(
    (e) =>
      ["task", "assignment"].includes(e.kind) &&
      e.time &&
      beijingDay(e.time) === day,
  );
  const schedule = eventsOnDay(
    calendarEvents(state, { showTasks: false, showCompleted: false }),
    day,
  );
  const notices = a.entries
    .filter((x) => x.kind === "notice")
    .sort((a, b) => (b.time || 0) - (a.time || 0));
  return {
    day,
    tasks,
    deadlines,
    schedule,
    notices,
    coverage: courseCoverage(state, day, now),
    assignments: a.entries.filter((e) => e.kind === "assignment"),
    overdue: tasks.filter((t) => t.due && t.due < day).length,
  };
}
