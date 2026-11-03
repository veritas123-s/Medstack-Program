import Panel from "../../shared/Panel.jsx";
import React from "react";
import {
  Timer,
  Plus,
  ArrowUpRight,
  ArrowRight,
  Play,
  CalendarDays,
  Leaf,
} from "lucide-react";
import { QUADRANTS, dayKey, elapsed, dayTotals } from "../../domain.mjs";
import { TaskCard, Empty, timeText } from "../../components.jsx";
import { WeekChart } from "../../shared/StatsElements.jsx";
function useData(data, actions) {
  const state = data,
    active = data.tasks?.filter((t) => !t.deletedAt && !t.completedAt) || [],
    today = dayKey(),
    totals = data.logs ? dayTotals(data.logs) : {};
  const setPage = actions.navigate,
    addTask = actions.addTask;
  const card = (t) => (
    <TaskCard
      key={t.id}
      task={t}
      call={actions.call}
      onEdit={actions.editTask}
      onFocus={actions.focusTask}
    />
  );
  return { state, active, today, totals, setPage, addTask, card };
}
export function PriorityWidget({ data, actions }) {
  const { state, active, today, totals, setPage, addTask, card } = useData(
    data,
    actions,
  );
  return (
    <Panel className="panel priority-panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">下一项</p>
          <h2>待办任务</h2>
        </div>
        <button className="text-button" onClick={() => setPage("matrix")}>
          打开四象限 <ArrowUpRight size={15} />
        </button>
      </div>
      {active.length ? (
        active
          .toSorted(
            (a, b) =>
              QUADRANTS.findIndex((q) => q.id === a.quadrant) -
                QUADRANTS.findIndex((q) => q.id === b.quadrant) ||
              (a.due || "9999").localeCompare(b.due || "9999"),
          )
          .slice(0, 5)
          .map(card)
      ) : (
        <Empty icon={Leaf} title="今天，从一件小事开始">
          把待办放下，让头脑轻一点。
        </Empty>
      )}
      <button className="add-line" onClick={() => addTask()}>
        <Plus size={16} />
        添加一个任务
      </button>
    </Panel>
  );
}

export function FocusWidget({ data, actions }) {
  const { state, active, today, totals, setPage, addTask, card } = useData(
    data,
    actions,
  );
  return (
    <Panel className="focus-invite">
      <div className="inline">
        <span className="pill">FOCUS TIME</span>
        <Timer size={22} />
      </div>
      <h2>专注</h2>
      <div className="invite-clock">
        {state.timer.status === "idle"
          ? `${String(state.settings.focusMinutes).padStart(2, "0")}:00`
          : timeText(
              state.timer.targetMs
                ? state.timer.targetMs - elapsed(state.timer)
                : elapsed(state.timer),
            )}
      </div>
      <button className="button light" onClick={() => setPage("focus")}>
        <Play size={16} />
        {state.timer.status === "idle" ? "进入专注空间" : "回到当前专注"}
        <ArrowRight size={16} />
      </button>

    </Panel>
  );
}

export function WeekWidget({ data, actions }) {
  const { state, active, today, totals, setPage, addTask, card } = useData(
    data,
    actions,
  );
  return (
    <Panel className="panel">
      <div className="panel-heading">
        <h3>本周的投入</h3>
        <button className="text-button" onClick={() => setPage("stats")}>
          查看记录 <ArrowUpRight size={14} />
        </button>
      </div>
      <WeekChart totals={totals} />
    </Panel>
  );
}

export function CoursesWidget({ data, actions }) {
  const { state, active, today, totals, setPage, addTask, card } = useData(
    data,
    actions,
  );
  return (
    <Panel className="panel">
      <div className="panel-heading">
        <h3>今日课程</h3>
        <button className="text-button" onClick={() => setPage("calendar")}>
          日历 <ArrowUpRight size={14} />
        </button>
      </div>
      {state.courses.filter((c) => c.start.slice(0, 10) === today).length ? (
        state.courses
          .filter((c) => c.start.slice(0, 10) === today)
          .sort((a, b) => a.start.localeCompare(b.start))
          .map((c, i) => (
            <div className="today-course" key={i}>
              <span>{c.start.slice(11, 16)}</span>
              <div>
                <b>{c.title}</b>
                <small>{c.location}</small>
              </div>
            </div>
          ))
      ) : (
        <Empty
          icon={CalendarDays}
          title={
            state.courseRanges.some((r) => r.start <= today && r.end > today)
              ? "当前缓存中没有今日课程"
              : "连接校园，安排更清晰"
          }
        >
          同步学校课表后，在这里查看今日课程。
        </Empty>
      )}
    </Panel>
  );
}
