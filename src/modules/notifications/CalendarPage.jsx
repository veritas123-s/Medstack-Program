import Panel from "../../shared/Panel.jsx";
import ActionMenu from "../../shared/ActionMenu.jsx";
import React, { useMemo, useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Plus,
  BookOpen,
  CheckCircle2,
  Clock3,
  Trash2,
  Undo2,
  RefreshCw,
  Pencil,
} from "lucide-react";
import { beijingDay } from "../../briefing.mjs";
import {
  calendarDate,
  shiftDate,
  monthDays,
  calendarEvents,
  eventsOnDay,
  courseCoverage,
} from "../../calendar.mjs";
import "./calendar.css";
import { Modal } from "../../components.jsx";
import { courseKey } from "../../domain/content.mjs";
import EventEditor from "./EventEditor.jsx";
import CalendarExchange from "./CalendarExchange.jsx";
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
export default function CalendarPage({ state, setPage, widgetActions, call }) {
  const today = beijingDay();
  const [exchangeOpen, setExchangeOpen] = useState(false);
  const [detail, setDetail] = useState(null),
    [eventEditor, setEventEditor] = useState(null),
    [trashOpen, setTrashOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const run = async (action, p) => {
    setBusy(true);
    setError("");
    try {
      return await call(action, p);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const [date, setDate] = useState(today),
    [view, setView] = useState("month");
  const [showCompleted, setShowCompleted] = useState(false),
    [showTasks, setShowTasks] = useState(true),
    [showCourses, setShowCourses] = useState(true);
  const events = useMemo(
    () => calendarEvents(state, { showCompleted, showTasks, showCourses }),
    [
      state.tasks,
      state.courses,
      state.courseTrash,
      state.events,
      state.learning,
      state.workflows,
      showCompleted,
      showTasks,
      showCourses,
    ],
  );
  const selected = eventsOnDay(events, date),
    coverage = courseCoverage(state, date);
  const unscheduled = state.tasks.filter(
    (t) => !t.deletedAt && !t.completedAt && !t.due,
  );
  const month = date.slice(0, 7),
    year = date.slice(0, 4);
  const caption =
    view === "year"
      ? `${year} 年`
      : view === "month"
        ? `${year} 年 ${Number(date.slice(5, 7))} 月`
        : `${year} 年 ${Number(date.slice(5, 7))} 月 ${Number(date.slice(8))} 日`;
  const jump = (value, nextView) => {
    if (calendarDate(value)) {
      setDate(value);
      if (nextView) setView(nextView);
    }
  };
  const openTask = (task) => widgetActions.editTask(task);
  const renderDay = (day, small = false, activeMonth = month) => {
    const dayEvents = eventsOnDay(events, day),
      tasks = dayEvents.filter(
        (e) => e.kind === "task" || e.kind === "assignment",
      ),
      courses = dayEvents.filter((e) => e.kind === "course");
    const previewLimit = 2;
    return (
      <button
        type="button"
        key={day}
        aria-label={`${day}，${tasks.length} 项任务，${courses.length} 节课程`}
        aria-pressed={day === date}
        disabled={!calendarDate(day)}
        className={`calendar-day ${day.slice(0, 7) !== activeMonth ? "outside" : ""} ${day === today ? "today" : ""} ${day === date ? "selected" : ""}`}
        onClick={() => jump(day, small ? "day" : undefined)}
        onDoubleClick={() => jump(day, "day")}
      >
        <span className="calendar-day-number">{Number(day.slice(8))}</span>
        {small ? (
          <span className="calendar-dots">
            {courses.length > 0 && (
              <span className="calendar-mini-count">{courses.length}课</span>
            )}
            {tasks.length > 0 && <i className="task-dot" />}
            {dayEvents.some((e) => e.kind === "event") && (
              <i className="event-dot" />
            )}
          </span>
        ) : (
          <span className="calendar-chips">
            {dayEvents.slice(0, previewLimit).map((e) => (
              <span
                key={e.id}
                className={`calendar-chip is-${e.kind} ${e.completed ? "complete" : ""}`}
                title={`${e.title} · ${e.clock}`}
              >
                <span className="calendar-chip-title">{e.title}</span>
                <span className="calendar-chip-time">
                  {e.kind === "course"
                    ? e.clock
                    : e.kind === "task"
                      ? "任务"
                      : e.kind === "assignment"
                        ? `截止 ${e.clock}`
                        : "日程"}
                </span>
              </span>
            ))}
            {dayEvents.length > previewLimit && (
              <small className="calendar-more">
                +{dayEvents.length - previewLimit}
              </small>
            )}
          </span>
        )}
      </button>
    );
  };
  const dayList = (
    <Panel className="panel calendar-agenda" aria-label="所选日期明细">
      <header>
        <div>
          <p className="eyebrow">{date === today ? "今天" : date} · 日程明细</p>
          <h2>
            {Number(date.slice(5, 7))} 月 {Number(date.slice(8))} 日{" "}
            <small>{selected.length} 项安排</small>
          </h2>
        </div>
        {view !== "day" && (
          <button className="text-button" onClick={() => setView("day")}>
            展开单日 <ChevronRight size={15} />
          </button>
        )}
      </header>
      <p className={`calendar-coverage ${coverage.status}`}>
        {coverage.status === "fresh"
          ? "本日课表已同步"
          : coverage.status === "stale"
            ? "本日课表缓存已过期，以下课程仅供参考"
            : "本日课表未同步，不能据此判断无课"}
        {coverage.syncedAt > 0 && (
          <span>
            {" "}
            · 更新于 {new Date(coverage.syncedAt).toLocaleDateString("zh-CN")}
          </span>
        )}
        {state.courseTrash?.some((x) => x.deletedAt) && (
          <span> · 部分课程在回收站</span>
        )}
      </p>

      <div className="calendar-day-events" key={date}>
        {selected.map((event) => (
          <article
            className={`calendar-event is-${event.kind} ${event.completed ? "complete" : ""}`}
            key={event.id}
          >
            <div className="calendar-event-time">
              <Clock3 size={15} />
              {event.clock}
              {event.day !== event.lastDay && (
                <small>
                  跨日 · {event.day} 至 {event.lastDay}
                </small>
              )}
            </div>
            <span className="calendar-event-icon">
              {event.kind === "course" ? (
                <BookOpen size={18} />
              ) : (
                <CheckCircle2 size={18} />
              )}
            </span>
            <div className="calendar-event-content">
              <small>
                {event.kind === "course"
                  ? "课程"
                  : event.kind === "event"
                    ? "日程"
                    : event.kind === "assignment" || event.learningDeadline
                      ? "学习通截止"
                      : event.completed
                        ? "已完成任务"
                        : "任务截止"}
              </small>
              <h3>{event.title}</h3>
              <p>
                {event.detail || (event.kind === "course" ? "地点未提供" : "")}
              </p>
            </div>
            {event.kind === "task" && (
              <button
                className="button small"
                onClick={() => openTask(event.task)}
              >
                查看任务
              </button>
            )}
            {event.kind === "assignment" && (
              <button
                className="text-button"
                onClick={() => setPage("learning")}
              >
                查看学习通
              </button>
            )}
            {event.kind === "course" && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  run("school.detail", {
                    start: event.course.start,
                    title: event.title,
                  }).then((d) => d && setDetail(d))
                }
              >
                课程详情
              </button>
            )}
            {event.kind === "event" && (
              <button
                className="icon-button"
                aria-label={"编辑日程 " + event.title}
                onClick={() => setEventEditor(event.event)}
              >
                <Pencil size={15} />
              </button>
            )}
            <button
              className="icon-button"
              disabled={busy}
              aria-label={`删除${event.kind === "task" ? "任务" : event.kind === "course" ? "课程" : "日程"} ${event.title}`}
              onClick={() =>
                run(
                  event.kind === "course"
                    ? "course.delete"
                    : event.kind === "task"
                      ? "task.delete"
                      : "event.delete",
                  event.kind === "course"
                    ? { key: courseKey(event.course) }
                    : {
                        id:
                          event.kind === "task"
                            ? event.task.id
                            : event.event.id,
                      },
                )
              }
            >
              <Trash2 size={15} />
            </button>
          </article>
        ))}
      </div>
      {!selected.length && <p className="empty-inbox">暂无安排</p>}
    </Panel>
  );
  return (
    <>
      {exchangeOpen && (
        <CalendarExchange call={call} onClose={() => setExchangeOpen(false)} />
      )}
      <div className="page-heading">
        <div>
          <h1>日程日历</h1>
        </div>
        <button className="button" onClick={() => setExchangeOpen(true)}>
          导入 / 导出日历
        </button>
      </div>
      <Panel className="panel calendar-panel" data-calendar="unified">
        <header className="calendar-toolbar">
          <div className="calendar-navigation">
            <button
              className="icon-button"
              aria-label="上一期"
              disabled={shiftDate(date, -1, view) === date}
              onClick={() => setDate(shiftDate(date, -1, view))}
            >
              <ChevronLeft size={20} />
            </button>
            <h2 aria-live="polite">{caption}</h2>
            <button
              className="icon-button"
              aria-label="下一期"
              disabled={shiftDate(date, 1, view) === date}
              onClick={() => setDate(shiftDate(date, 1, view))}
            >
              <ChevronRight size={20} />
            </button>
            <button className="button small" onClick={() => setDate(today)}>
              今天
            </button>
          </div>
          <div className="calendar-controls">
            <label className="calendar-jump">
              <CalendarDays size={16} />
              <input
                type="date"
                aria-label="跳转日期"
                min="2000-01-01"
                max="2099-12-31"
                value={date}
                onChange={(e) => jump(e.target.value)}
              />
            </label>
            <div
              className="calendar-view-switch"
              role="group"
              aria-label="日历视图"
            >
              {[
                ["year", "年"],
                ["month", "月"],
                ["day", "日"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  aria-pressed={view === id}
                  className={view === id ? "active" : ""}
                  onClick={() => setView(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </header>
        <div className="calendar-tools">
          <button className="button small" onClick={() => setEventEditor({})}>
            <Plus size={14} />
            新建日程
          </button>
          <ActionMenu label="日历更多操作">
            <button
              className="button small"
              disabled={busy}
              onClick={() =>
                run("school.courses", {
                  start: date.slice(0, 7) + "-01",
                  end: shiftDate(date.slice(0, 7) + "-01", 1, "month"),
                })
              }
            >
              <RefreshCw size={14} />
              {busy ? "处理中…" : "同步本月课表"}
            </button>
            <button className="text-button" onClick={() => setTrashOpen(true)}>
              <Trash2 size={14} />
              日程回收站
            </button>
          </ActionMenu>
        </div>
        {error && (
          <p role="alert" className="error">
            {error}
            {state.campusAuth?.phase === "attention" && (
              <button className="text-button" onClick={() => setPage("campus")}>
                前往教务服务
              </button>
            )}
          </p>
        )}
        <div className="calendar-options">
          <label>
            <input
              type="checkbox"
              checked={showTasks}
              onChange={(e) => setShowTasks(e.target.checked)}
            />
            <i className="task-dot" />
            任务
          </label>
          <label>
            <input
              type="checkbox"
              checked={showCourses}
              onChange={(e) => setShowCourses(e.target.checked)}
            />
            <i className="course-dot" />
            课程
          </label>
          <label>
            <input
              type="checkbox"
              checked={showCompleted}
              onChange={(e) => setShowCompleted(e.target.checked)}
            />
            包含已完成任务
          </label>
          <small>任务按截止日期显示 · 北京时间</small>
        </div>
        <div className={`calendar-content-layout calendar-view-${view}`}>
          <div className="calendar-canvas">
            {view === "year" && (
              <div className="calendar-year" key={year}>
                {Array.from(
                  { length: 12 },
                  (_, i) => `${year}-${String(i + 1).padStart(2, "0")}-01`,
                ).map((m) => (
                  <Panel className="calendar-mini-month" key={m}>
                    <button
                      className="calendar-month-title"
                      aria-label={`查看 ${year} 年 ${Number(m.slice(5, 7))} 月`}
                      onClick={() => jump(m, "month")}
                    >
                      {Number(m.slice(5, 7))} 月 <ChevronRight size={14} />
                    </button>
                    <div className="calendar-weekdays">
                      {weekdays.map((w) => (
                        <span key={w}>{w}</span>
                      ))}
                    </div>
                    <div className="calendar-month-grid mini">
                      {monthDays(m).map((day) =>
                        renderDay(day, true, m.slice(0, 7)),
                      )}
                    </div>
                  </Panel>
                ))}
              </div>
            )}
            {view === "month" && (
              <>
                <div className="calendar-weekdays">
                  {weekdays.map((w) => (
                    <span key={w}>周{w}</span>
                  ))}
                </div>
                <div className="calendar-month-grid" key={month}>
                  {monthDays(date).map((d) => renderDay(d))}
                </div>
              </>
            )}
            {view === "day" && (
              <div className="calendar-week-strip">
                {Array.from({ length: 7 }, (_, i) => shiftDate(date, i - 3))
                  .filter((d, i, a) => a.indexOf(d) === i)
                  .map((d) => (
                    <button
                      key={d}
                      aria-pressed={d === date}
                      className={d === date ? "active" : ""}
                      onClick={() => setDate(d)}
                    >
                      <small>
                        周
                        {
                          weekdays[
                            (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7
                          ]
                        }
                      </small>
                      <b>{Number(d.slice(8))}</b>
                    </button>
                  ))}
              </div>
            )}
          </div>
          {dayList}
        </div>
      </Panel>

      {showTasks && unscheduled.length > 0 && (
        <Panel
          className="panel calendar-unscheduled"
          title="待安排"
          defaultCollapsed
        >
          <header>
            <h2>
              待安排 <small>{unscheduled.length} 项</small>
            </h2>
            <p>这些任务还没有截止日期，设定日期后就会出现在日历中。</p>
          </header>
          <div>
            {unscheduled.map((task) => (
              <button
                className="button"
                key={task.id}
                onClick={() => openTask(task)}
              >
                <Plus size={15} />
                {task.title}
              </button>
            ))}
          </div>
        </Panel>
      )}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <p>教师：{detail.teacher || "学校未返回"}</p>
          <p>学院：{detail.college || "学校未返回"}</p>
          <p className="pre-wrap">{detail.content}</p>
        </Modal>
      )}
      {eventEditor && (
        <EventEditor
          event={eventEditor.id ? eventEditor : null}
          date={date}
          call={call}
          onClose={() => setEventEditor(null)}
        />
      )}
      {trashOpen && (
        <Modal title="日程回收站" onClose={() => setTrashOpen(false)} wide>
          <p className="hint">
            删除课程只影响本机显示，同步后保持隐藏；恢复可重新显示。任务可在任务清单的回收站恢复。
          </p>
          {state.events
            .filter((e) => e.deletedAt)
            .map((e) => (
              <div className="content-manager-row" key={e.id}>
                <span>
                  {e.title}
                  <small>{e.start.replace("T", " ")}</small>
                </span>
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => run("event.restore", { id: e.id })}
                >
                  <Undo2 size={14} />
                  恢复日程
                </button>
              </div>
            ))}
          {state.courseTrash
            .filter((e) => e.deletedAt)
            .map((e) => (
              <div className="content-manager-row" key={e.key}>
                <span>
                  {e.course.title}
                  <small>{e.course.start.replace("T", " ")}</small>
                </span>
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => run("course.restore", { key: e.key })}
                >
                  <Undo2 size={14} />
                  恢复课程
                </button>
              </div>
            ))}
          {!state.events.some((e) => e.deletedAt) &&
            !state.courseTrash.length && <p className="hint">回收站为空。</p>}
          {error && <p className="error">{error}</p>}
        </Modal>
      )}
    </>
  );
}
