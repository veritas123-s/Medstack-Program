import React from "react";
import Panel from "../../shared/Panel.jsx";
import { ChevronRight, CalendarDays, CheckSquare2, Bell } from "lucide-react";
import { duration } from "../../components.jsx";
import { WidgetBoard } from "../../platform/WidgetHost.jsx";
import { overview } from "./overview.mjs";
const Row = ({ title, detail, tag, onClick }) => (
  <button className="overview-row" onClick={onClick} title={title}>
    <span>
      <b>{title}</b>
      {detail && <small>{detail}</small>}
    </span>
    {tag && <em>{tag}</em>}
  </button>
);
export default function DashboardPage({
  state,
  call,
  todayMs,
  setPage,
  setFilter,
  setProject,
  widgetActions,
}) {
  const model = overview(state),
    now = new Date();
  const taskPage = () => {
    setPage("tasks");
    setFilter("active");
    setProject("全部清单");
  };
  const goal = state.settings.dailyGoal * 60000,
    progress = goal ? Math.min(100, Math.round((todayMs / goal) * 100)) : 0;
  const heading = (title, route, Icon) => (
    <div className="panel-heading">
      <h2>
        <Icon size={16} />
        {title}
      </h2>
      <button
        className="icon-button"
        aria-label={"查看" + title}
        onClick={() => setPage(route)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
  return (
    <>
      <div className="page-heading dashboard-heading">
        <h1>今天的安排</h1>
        <button className="button" onClick={() => setPage("workbench")}>
          卡片布局
        </button>
      </div>
      <div className="overview-summary-grid">
        <section
          className="overview-summary overview-clock"
          aria-label="当前时间"
        >
          <strong className="overview-metric">
            {now.toLocaleTimeString("zh-CN", {
              timeZone: "Asia/Shanghai",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </strong>
          <span>
            {now.toLocaleDateString("zh-CN", {
              timeZone: "Asia/Shanghai",
              month: "long",
              day: "numeric",
              weekday: "long",
            })}
          </span>
        </section>
        <section
          className="overview-summary overview-focus"
          aria-label="今日专注"
        >
          <span>今日专注</span>
          <strong className="overview-metric">{duration(todayMs)}</strong>
          <div
            className="overview-progress"
            role="progressbar"
            aria-label="今日专注目标完成度"
            aria-valuenow={progress}
          >
            <i style={{ width: progress + "%" }} />
          </div>
          <small>
            目标 {state.settings.dailyGoal} 分钟 · {progress}%
          </small>
        </section>
        <section
          className="overview-summary overview-deadlines"
          aria-label="今日截止"
        >
          <div>
            <span>今日截止</span>
            <strong className="overview-metric">
              {model.deadlines.length}
            </strong>
          </div>
          <strong className="overview-deadline-title">
            {model.deadlines[0]?.title || "今天没有截止事项"}
          </strong>
          <small>
            {model.deadlines.length > 1
              ? "另有 " + (model.deadlines.length - 1) + " 项 · "
              : ""}
            {model.overdue
              ? model.overdue + " 项已逾期"
              : model.tasks.length + " 项待办"}
          </small>
        </section>
      </div>
      <div className="overview-information-grid">
        <Panel className="panel overview-card overview-tasks" title="待办任务">
          {heading("待办任务", "tasks", CheckSquare2)}
          <div className="overview-card-list">
            {model.tasks.map((t) => (
              <Row
                key={t.id}
                title={t.title}
                detail={t.project || "收集箱"}
                tag={t.due ? t.due.slice(5) : ""}
                onClick={() =>
                  widgetActions?.editTask
                    ? widgetActions.editTask(t)
                    : taskPage()
                }
              />
            ))}
            {!model.tasks.length && <p className="overview-empty">暂无待办</p>}
          </div>
        </Panel>
        <div className="overview-side">
          <Panel
            className="panel overview-card overview-schedule"
            title="今日日程"
          >
            {heading("今日日程", "calendar", CalendarDays)}
            {model.coverage.status !== "fresh" && (
              <span className="overview-status">
                {model.coverage.status === "missing"
                  ? "课表未同步"
                  : "课表需更新"}
              </span>
            )}
            <div className="overview-card-list">
              {model.schedule.map((e) => (
                <Row
                  key={e.id}
                  title={e.title}
                  detail={e.detail}
                  tag={e.clock}
                  onClick={() => setPage("calendar")}
                />
              ))}
              {!model.schedule.length && (
                <p className="overview-empty">暂无已保存安排</p>
              )}
            </div>
          </Panel>
          <Panel
            className="panel overview-card overview-notices"
            title="超星通知"
          >
            {heading("超星通知", "learning", Bell)}
            <div className="overview-card-list">
              {model.notices.map((e) => (
                <Row
                  key={e.id}
                  title={e.title}
                  detail={e.subtitle}
                  onClick={() => setPage("learning")}
                />
              ))}
              {!model.notices.length && (
                <p className="overview-empty">暂无新消息</p>
              )}
            </div>
          </Panel>
        </div>
      </div>
      <details className="home-extras">
        <summary>小组件</summary>
        <WidgetBoard state={state} call={call} actions={widgetActions} />
      </details>
    </>
  );
}
