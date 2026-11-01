import Panel from "../../shared/Panel.jsx";
import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  RefreshCw,
  LogIn,
  CalendarDays,
  GraduationCap,
  DoorOpen,
  MapPin,
  KeyRound,
  ShieldCheck,
} from "lucide-react";
import { dayKey, addDays, monday } from "../../domain.mjs";
import { Empty, Modal } from "../../components.jsx";
import CalendarPage from "../notifications/CalendarPage.jsx";
import ExamsPanel from "./ExamsPanel.jsx";
const dateLabel = (s) =>
  new Date(`${s}T12:00:00`).toLocaleDateString("zh-CN", {
    month: "long",
    day: "numeric",
  });
function LoginSettings({ state, call, onClose }) {
  const [username, setUsername] = useState(""),
    [password, setPassword] = useState(""),
    [remember, setRemember] = useState(state.campusAuth?.remember !== false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal title="校园登录设置" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            await call("school.login.configure", {
              username,
              password,
              remember,
            });
            setPassword("");
            onClose();
          } catch (e) {
            setError(e.message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="hint">
          先在学校窗口登录一次，医栈通
          会加密记住会话。填写以下可选账号后，会话失效时还会尝试自动认证；学校要求验证码时由你完成验证。
        </p>
        <label>
          学校账号（可选）
          <input
            autoComplete="off"
            value={username}
            maxLength={200}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          学校密码（可选）
          <input
            type="password"
            autoComplete="new-password"
            value={password}
            maxLength={1000}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="toggle-row">
          <span>加密记住账号与会话</span>
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
          />
        </label>
        <p className="hint">
          使用 Windows
          当前账户加密。已有密码不会回显，也不会进入备份或快报；两项留空则保留现有设置。
        </p>
        {error && <p className="error">{error}</p>}
        <div className="modal-actions">
          <button
            className="text-button danger"
            type="button"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await call("school.logout");
                onClose();
              } catch (e) {
                setError(e.message);
              } finally {
                setBusy(false);
              }
            }}
          >
            清除账号与登录会话
          </button>
          <button className="button primary" disabled={busy}>
            保存登录设置
          </button>
        </div>
      </form>
    </Modal>
  );
}
export default function Campus({ state, call, setPage, widgetActions }) {
  const [tab, setTab] = useState("courses"),
    [date, setDate] = useState(dayKey()),
    [busy, setBusy] = useState(false),
    [detail, setDetail] = useState(null),
    [year, setYear] = useState(() => {
      const d = new Date();
      const y = d.getFullYear() - (d.getMonth() < 8 ? 1 : 0);
      return `${y}-${y + 1}`;
    }),
    [semester, setSemester] = useState(1),
    [loginSettings, setLoginSettings] = useState(false);
  const start = monday(date),
    end = addDays(start, 7),
    days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const run = async (fn) => {
    setBusy(true);
    try {
      return await fn();
    } finally {
      setBusy(false);
    }
  };
  const coverage = days.every((d) =>
    state.courseRanges.some((r) => r.start <= d && r.end > d),
  );
  const last = state.courseRanges
    .filter((r) => r.start < end && r.end > start)
    .sort((a, b) => b.syncedAt - a.syncedAt)[0];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>校园与课表</h1>
        </div>
        <button className="button primary" onClick={() => call("school.open")}>
          <LogIn size={16} />
          打开学校登录
        </button>
      </div>
      <div className="campus-connections">
        <span className="campus-status" title={state.campusAuth?.message || ""}>
          学校 ·{" "}
          {state.campusAuth?.phase === "connected"
            ? "已连接"
            : state.campusAuth?.hasSession
              ? "已记住会话"
              : "未连接"}
        </span>
        <button className="button" onClick={() => setLoginSettings(true)}>
          <KeyRound size={15} />
          登录设置
        </button>
        <button className="button primary" onClick={() => setPage("learning")}>
          学习通{state.learning?.connected ? " · 已连接" : " · 连接"}
        </button>
        <button className="button" onClick={() => call("school.canvas.open")}>
          Canvas
        </button>
      </div>
      {state.campusAuth?.phase === "error" && state.campusAuth?.message && (
        <p className="campus-message" role="status">
          {state.campusAuth.message}
        </p>
      )}
      <div className="tabs">
        {[
          ["courses", "我的课表", CalendarDays],
          ["exams", "考试查询", CalendarDays],
          ["scores", "成绩查询", GraduationCap],
          ["rooms", "教室查询", DoorOpen],
        ].map(([id, label, Icon]) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            onClick={() => setTab(id)}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
      {loginSettings && (
        <LoginSettings
          state={state}
          call={call}
          onClose={() => setLoginSettings(false)}
        />
      )}
      {tab === "courses" && (
        <CalendarPage {...{ state, call, setPage, widgetActions }} embedded />
      )}
      {tab === "exams" && <ExamsPanel state={state} call={call} />}
      {tab === "scores" && (
        <Panel className="panel">
          <div className="panel-heading">
            <h3>学年成绩</h3>
            <div className="inline">
              <input
                aria-label="学年"
                className="year-input"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                placeholder="2026-2027"
              />
              <select
                aria-label="学期"
                value={semester}
                onChange={(e) => setSemester(Number(e.target.value))}
              >
                <option value="1">第一学期</option>
                <option value="2">第二学期</option>
              </select>
              <button
                className="button"
                disabled={busy}
                onClick={() =>
                  run(() => call("school.scores", { year, semester }))
                }
              >
                <RefreshCw size={15} />
                查询成绩
              </button>
            </div>
          </div>
          {state.scores && (
            <button
              className="text-button danger"
              onClick={() => call("scores.clear")}
            >
              清除本机成绩缓存
            </button>
          )}
          {state.scores ? (
            <>
              <p className="hint">
                当前显示 {state.scores.year} · 第 {state.scores.semester} 学期 ·{" "}
                {new Date(state.scores.syncedAt).toLocaleString("zh-CN")} 同步
              </p>
              {state.scores.gpa && (
                <p className="school-note">
                  学校返回的绩点信息：{state.scores.gpa}
                </p>
              )}
              <table>
                <thead>
                  <tr>
                    <th>课程</th>
                    <th>成绩</th>
                    <th>最终成绩</th>
                    <th>等级</th>
                    <th>学分</th>
                    <th>考试情况</th>
                  </tr>
                </thead>
                <tbody>
                  {state.scores.items.map((s, i) => (
                    <tr key={i}>
                      <td>{s.title}</td>
                      <td>{s.score}</td>
                      <td>{s.finalScore}</td>
                      <td>{s.grade}</td>
                      <td>{s.credit}</td>
                      <td>{s.situation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!state.scores.items.length && <Empty title="该学期未返回成绩" />}
            </>
          ) : (
            <Empty icon={GraduationCap} title="成绩，登录后即可查询">
              这里会保留最近一次成功查询的结果。
            </Empty>
          )}
        </Panel>
      )}
      {tab === "rooms" && <Rooms call={call} />}
      {detail && (
        <Modal title={detail.title} onClose={() => setDetail(null)}>
          <p>教师：{detail.teacher || "学校未返回"}</p>
          <p>学院：{detail.college || "学校未返回"}</p>
          <p className="pre-wrap">{detail.content}</p>
        </Modal>
      )}
    </>
  );
}
function Rooms({ call }) {
  const [opts, setOpts] = useState([[], [], [], []]),
    [values, setValues] = useState(["", "", "", ""]),
    [date, setDate] = useState(dayKey()),
    [rows, setRows] = useState(null),
    [busy, setBusy] = useState(false);
  const types = [
    "AnswerAuxiliaryCampus",
    "BuildCode",
    "ClassroomFloor",
    "Classroom",
  ];
  const load = async (index, next = values) => {
    setBusy(true);
    try {
      const result = await call("school.rooms.options", {
        type: types[index],
        Area: next[0],
        BuildCode: next[1],
        FloorNo: next[2],
      });
      setOpts((old) => old.map((o, i) => (i === index ? result : o)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="panel">
      <div className="panel-heading">
        <h3>寻找一间教室</h3>
        <button
          className="button"
          disabled={busy}
          onClick={() => {
            setValues(["", "", "", ""]);
            setOpts([[], [], [], []]);
            setRows(null);
            load(0);
          }}
        >
          读取校区
        </button>
      </div>
      <div className="room-filters">
        {["校区", "楼栋", "楼层", "教室"].map((label, i) => (
          <label key={label}>
            {label}
            <select
              disabled={busy || !opts[i].length}
              value={values[i]}
              onChange={(e) => {
                const next = values.map((v, j) =>
                  j === i ? e.target.value : j > i ? "" : v,
                );
                setValues(next);
                setOpts((old) => old.map((o, j) => (j > i ? [] : o)));
                setRows(null);
                if (i < 3 && next[i]) load(i + 1, next);
              }}
            >
              <option value="">请选择</option>
              {opts[i].map((o) => (
                <option key={o.code} value={o.code}>
                  {i === 1
                    ? `${opts[0].find((campus) => campus.code === values[0])?.name || "校区待确认"} · ${o.name}`
                    : o.name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label>
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setRows(null);
            }}
          />
        </label>
        <button
          className="button primary"
          disabled={busy || !values[3]}
          onClick={async () => {
            setBusy(true);
            try {
              setRows(
                await call("school.rooms", {
                  date,
                  area: values[0],
                  building: values[1],
                  floor: values[2],
                  room: values[3],
                }),
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          查询占用
        </button>
      </div>
      {rows === null ? (
        <Empty icon={DoorOpen} title="先选择校区与教室">
          查询学校返回的教学占用信息。
        </Empty>
      ) : rows.length ? (
        <table>
          <thead>
            <tr>
              <th>时间</th>
              <th>课程</th>
              <th>班级</th>
              <th>教师</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  {r.start}–{r.end}
                </td>
                <td>{r.title}</td>
                <td>{r.className}</td>
                <td>{r.teacher}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty title="该日期没有返回占用记录">仍以学校现场安排为准。</Empty>
      )}
    </Panel>
  );
}
