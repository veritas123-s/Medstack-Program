import React, { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckSquare2,
  ListTodo,
} from "lucide-react";
import { WidgetBoard } from "../../platform/WidgetHost.jsx";
import {
  DEFAULT_WEATHER_LOCATION,
  getWeatherLocation,
} from "../../domain/weather.mjs";
import WeatherPicker from "./WeatherPicker.jsx";
import MailPanel from "./MailPanel.jsx";
import { overview } from "./overview.mjs";
import orbit from "./orbit.svg";
import "./dashboard.css";

const storageKey = "medstack.weather.location";
const clock = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const date = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "long",
  day: "numeric",
  weekday: "long",
});

function weatherLabel(code) {
  if (code.includes("thunder")) return "雷雨";
  if (code.includes("sleet")) return "雨夹雪";
  if (code.includes("snow")) return "雪";
  if (code.includes("rain")) return "雨";
  if (code.includes("fog")) return "雾";
  if (code.startsWith("clearsky")) return "晴";
  if (code.startsWith("fair") || code.startsWith("partlycloudy")) return "多云";
  return code === "cloudy" ? "阴" : "";
}

function useWeather(location) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      window.veritas.call("dashboard.weather", { location }).then(
        (data) => {
          if (active) setResult({ location, ...data });
        },
        () => {
          if (active) setResult({ location, current: null });
        },
      );
    };
    refresh();
    const timer = setInterval(refresh, 15 * 60000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [location]);
  return result?.location === location ? result : null;
}

function Rows({ items, limit, render, empty }) {
  if (!items.length) return <p className="day-empty">{empty}</p>;
  return (
    <>
      {items.slice(0, limit).map(render)}
      {items.length > limit && (
        <details className="day-more">
          <summary>其余 {items.length - limit} 项</summary>
          {items.slice(limit).map(render)}
        </details>
      )}
    </>
  );
}

function DayColumn({
  title,
  day,
  schedule,
  past,
  deadlines,
  coverage,
  forecast,
  limit,
  render,
  setPage,
}) {
  return (
    <section
      className={`day-column ${past ? "day-current" : "day-next"}`}
      aria-label={title}
    >
      <header>
        <div>
          <h2>{title}</h2>
          {!past && (
            <time dateTime={day}>
              {Number(day.slice(5, 7))}月{Number(day.slice(8))}日
            </time>
          )}
        </div>
        {forecast && (
          <span className="day-forecast">
            {weatherLabel(forecast.code)} {forecast.temperature}°
          </span>
        )}
      </header>
      <div className="day-block">
        <div className="day-block-heading">
          <h3>
            <CalendarDays size={15} />
            日程
          </h3>
          {coverage.status !== "fresh" && (
            <span>
              {coverage.status === "missing" ? "课表未同步" : "课表待刷新"}
            </span>
          )}
          <button
            type="button"
            className="day-link"
            onClick={() => setPage("calendar")}
            aria-label={`${title} · 打开日历`}
          >
            <ArrowUpRight size={15} />
          </button>
        </div>
        {past?.length && !schedule.length ? null : (
          <Rows
            items={schedule}
            limit={limit}
            render={render}
            empty="暂无日程"
          />
        )}
        {!!past?.length && (
          <details className="day-more">
            <summary>已结束 {past.length} 项</summary>
            {past.map(render)}
          </details>
        )}
      </div>
      <div className="day-block">
        <div className="day-block-heading">
          <h3>
            <CheckSquare2 size={15} />
            待办
          </h3>
          <button
            type="button"
            className="day-link"
            onClick={() => setPage("tasks")}
            aria-label={`${title} · 打开任务清单`}
          >
            <ArrowUpRight size={15} />
          </button>
        </div>
        <Rows
          items={deadlines}
          limit={limit}
          render={render}
          empty="暂无待办"
        />
      </div>
    </section>
  );
}

export default function DashboardPage({
  state,
  call,
  setPage,
  setFilter,
  setProject,
  widgetActions,
}) {
  const [location, setLocation] = useState(() => {
    const saved = localStorage.getItem(storageKey);
    return getWeatherLocation(saved)?.id || DEFAULT_WEATHER_LOCATION;
  });
  const weather = useWeather(location);
  const now = Date.now();
  const model = overview(state, now);
  const { focus } = model;
  const tasks = new Map(model.tasks.map((task) => [task.id, task]));
  const later = model.tasks.filter(
    (task) => task.due !== model.day && task.due !== model.tomorrow.day,
  );
  const open = (item) => {
    const task = item.kind === "task" && tasks.get(item.taskId);
    if (task && widgetActions?.editTask) widgetActions.editTask(task);
    else if (item.kind === "task") {
      setFilter("active");
      setProject("全部清单");
      setPage("tasks");
    } else if (item.kind === "assignment" || item.kind === "notice")
      setPage("learning");
    else setPage("calendar");
  };
  const label = (item) =>
    item.clock ||
    (item.kind === "notice"
      ? ""
      : item.kind === "task" && !tasks.get(item.taskId)?.dueTime
        ? "当天"
        : clock.format(item.time));
  const render = (item) => (
    <button
      className="day-row"
      key={item.id}
      type="button"
      onClick={() => open(item)}
      title={item.title}
    >
      <span className="day-time">{label(item)}</span>
      <span className="day-row-text">
        <b>{item.title}</b>
        {(item.detail || item.subtitle) && (
          <small>{item.detail || item.subtitle}</small>
        )}
      </span>
    </button>
  );
  const focusLabel = focus?.clock
    ? !focus.allDay && focus.start <= now
      ? "进行中"
      : label(focus)
    : focus && (focus.time < now ? "已逾期" : `${label(focus)}截止`);
  const current = weather?.current;
  return (
    <div className="today-dashboard">
      <h1>今天的安排</h1>
      <section className="today-hero" aria-label="时间、天气与今日重点">
        <div className="today-hero-content">
          <div className="today-topline">
            <div className="today-clock">
              <time>{clock.format(now)}</time>
              <span>{date.format(now)}</span>
            </div>
            <div className="today-weather" aria-label="天气预报">
              <WeatherPicker
                value={location}
                call={call}
                onChange={(next) => {
                  localStorage.setItem(storageKey, next);
                  setLocation(next);
                }}
              />
              <div className="today-weather-reading">
                {current ? (
                  <>
                    <strong>{current.temperature}°</strong>
                    <span>
                      {weatherLabel(current.code)}
                      {weather.stale ? " · 缓存" : ""}
                    </span>
                  </>
                ) : (
                  <span>{weather ? "天气暂不可用" : "读取天气…"}</span>
                )}
              </div>
            </div>
          </div>
          <div className="today-spotlight">
            <h2>今日重点</h2>
            {focus ? (
              <button
                type="button"
                onClick={() => open(focus)}
                title={focus.title}
              >
                <span>{focusLabel}</span>
                <strong>{focus.title}</strong>
                <ArrowUpRight size={15} />
              </button>
            ) : (
              <p>今天没有待处理事项</p>
            )}
          </div>
        </div>
        <div className="today-art">
          <img src={orbit} alt="" />
        </div>
      </section>
      <div className="today-days">
        <DayColumn
          title="今天"
          day={model.day}
          schedule={model.schedule.filter((e) => e.allDay || e.end > now)}
          past={model.schedule.filter((e) => !e.allDay && e.end <= now)}
          deadlines={model.deadlines}
          coverage={model.coverage}
          limit={4}
          render={render}
          setPage={setPage}
        />
        <DayColumn
          title="明天"
          {...model.tomorrow}
          forecast={weather?.tomorrow}
          limit={2}
          render={render}
          setPage={setPage}
        />
      </div>
      <div className="today-activity">
        <section className="day-column activity-card" aria-label="其他待办">
          <header className="activity-heading">
            <h2>
              <ListTodo size={16} />
              其他待办
            </h2>
            <button
              type="button"
              className="day-link"
              aria-label="查看全部待办"
              onClick={() => setPage("tasks")}
            >
              <ArrowUpRight size={15} />
            </button>
          </header>
          {later
            .slice(0, 3)
            .map((task) =>
              render({
                kind: "task",
                id: task.id,
                taskId: task.id,
                title: task.title,
                detail: task.project,
                clock: task.due ? task.due.slice(5) : "未排期",
              }),
            )}
          {!later.length && <p className="day-empty">暂无其他待办</p>}
        </section>
        <section className="day-column activity-card" aria-label="超星通知">
          <header className="activity-heading">
            <h2>
              <Bell size={16} />
              超星通知
            </h2>
            <button
              type="button"
              className="day-link"
              aria-label="查看全部超星通知"
              onClick={() => setPage("learning")}
            >
              <ArrowUpRight size={15} />
            </button>
          </header>
          {model.notices.slice(0, 3).map(render)}
          {!model.notices.length && <p className="day-empty">暂无新通知</p>}
        </section>
        <MailPanel call={call} />
      </div>
      <div className="today-extras">
        {!!model.overdueEntries.length && (
          <details>
            <summary>往日逾期 {model.overdueEntries.length}</summary>
            <Rows items={model.overdueEntries} limit={5} render={render} />
          </details>
        )}
        {state.campusAuth?.phase === "attention" && (
          <button
            type="button"
            className="button small"
            onClick={() => call("school.open")}
          >
            学校需验证
          </button>
        )}
        <details>
          <summary>小组件</summary>
          <WidgetBoard state={state} call={call} actions={widgetActions} />
        </details>
        <button
          type="button"
          className="today-attribution"
          onClick={() =>
            call("link.open", { url: "https://api.met.no/doc/License" })
          }
          title="MET Norway 预报，CC BY 4.0，已转为中文并取整"
        >
          天气 · MET Norway
        </button>
      </div>
    </div>
  );
}
