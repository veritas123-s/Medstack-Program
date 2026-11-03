import React, { useEffect, useRef, useState } from "react";
import { ChevronDown, DoorOpen, RefreshCw } from "lucide-react";
import { beijingDay } from "../../briefing.mjs";
import Panel from "../../shared/Panel.jsx";
import { Empty } from "../../components.jsx";
import { roomStatus } from "./room-status.mjs";
import "./room-board.css";

const clock = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Shanghai",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const labels = { free: "空闲", busy: "占用", unknown: "待确认" };
const progressLabels = {
  queued: "等待上一轮查询结束…",
  directory: "读取楼层目录…",
  floors: "已查询楼层",
  rooms: "已查询教室",
};

function RoomCard({ room }) {
  return (
    <details className="room-card" data-status={room.state}>
      <summary>
        <span className="room-card-heading">
          <strong>{room.name}</strong>
          <span className="room-badge">{labels[room.state]}</span>
          <ChevronDown className="room-expand" size={14} aria-hidden />
        </span>
        {room.current.length ? (
          room.current.map((row, i) => (
            <span className="room-use" key={i}>
              <strong>{row.title || "用途未注明"}</strong>
              <small>
                {row.start}–{row.end}
                {row.className ? ` · ${row.className}` : ""}
              </small>
            </span>
          ))
        ) : (
          <span className="room-use">
            {room.state === "free"
              ? "该时段无教务占用记录"
              : "该时段占用未确认"}
          </span>
        )}
      </summary>
      <div className="room-day">
        <b>当天安排</b>
        {room.rows?.length ? (
          <ul>
            {room.rows.map((row, i) => (
              <li key={i}>
                <strong>{row.title || "用途未注明"}</strong>
                <small>
                  {row.start || "开始时间待确认"}–{row.end || "结束时间待确认"}
                  {row.teacher ? ` · ${row.teacher}` : ""}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <small>{room.complete ? "无教务占用记录" : "未读取到完整安排"}</small>
        )}
      </div>
    </details>
  );
}

export default function RoomBoard({ call }) {
  const request = useRef(call);
  useEffect(() => {
    request.current = call;
  }, [call]);
  const [areas, setAreas] = useState([]);
  const [buildings, setBuildings] = useState([]);
  const [area, setArea] = useState("");
  const [building, setBuilding] = useState("");
  const [date, setDate] = useState(beijingDay);
  const [time, setTime] = useState("");
  const [now, setNow] = useState(() => clock.format(new Date()));
  const [result, setResult] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState("");
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const timer = setInterval(() => setNow(clock.format(new Date())), 15000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    let unsubscribe;
    const read = async (action, params, accept, message) => {
      setLoading(message);
      try {
        const value = await request.current(action, params);
        if (active) accept(value);
      } catch (e) {
        if (active) setError(e.message);
      } finally {
        if (active) setLoading("");
      }
    };
    setError("");
    setProgress(null);
    if (!area) {
      read(
        "school.rooms.options",
        { type: "AnswerAuxiliaryCampus" },
        setAreas,
        "读取校区…",
      );
    } else if (!building) {
      read(
        "school.rooms.options",
        { type: "BuildCode", Area: area },
        setBuildings,
        "读取楼栋…",
      );
    } else if (date) {
      const requestId = crypto.randomUUID();
      unsubscribe = window.veritas?.onRoomProgress((update) => {
        if (active && update.requestId === requestId) setProgress(update);
      });
      read(
        "school.rooms.building",
        { area, building, date, requestId },
        setResult,
        "读取楼栋教室安排…",
      );
    } else {
      setLoading("");
    }
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [area, building, date, revision]);

  const stage = progressLabels[progress?.phase] || loading;
  const hasCount = progress?.total > 0;
  const progressText = hasCount
    ? `${stage} ${progress.completed} / ${progress.total}`
    : stage;
  const at = time || now;
  const floors = new Map();
  const counts = { free: 0, busy: 0, unknown: 0 };
  for (const room of result?.rooms || []) {
    const status = roomStatus(room, at);
    counts[status.state]++;
    const group = floors.get(room.floor.code) || {
      name: room.floor.name,
      rooms: [],
    };
    group.rooms.push({ ...room, ...status });
    floors.set(room.floor.code, group);
  }
  return (
    <Panel className="panel room-board">
      <div className="panel-heading">
        <h3>楼栋教室状态</h3>
        <button
          className="button small"
          disabled={!!loading}
          onClick={() => setRevision((value) => value + 1)}
        >
          <RefreshCw size={15} /> 刷新
        </button>
      </div>
      <div className="room-filters">
        <label>
          校区
          <select
            value={area}
            onChange={(e) => {
              setArea(e.target.value);
              setBuilding("");
              setBuildings([]);
              setResult(null);
            }}
          >
            <option value="">选择校区</option>
            {areas.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          楼栋
          <select
            value={building}
            disabled={!buildings.length}
            onChange={(e) => {
              setBuilding(e.target.value);
              setResult(null);
            }}
          >
            <option value="">选择楼栋</option>
            {buildings.map((item) => (
              <option key={item.code} value={item.code}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          日期
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setResult(null);
            }}
          />
        </label>
        <label>
          查看时间（北京时间）
          <input
            type="time"
            value={at}
            onChange={(e) => setTime(e.target.value)}
          />
        </label>
      </div>
      {(time || date !== beijingDay()) && (
        <button
          className="text-button room-now"
          onClick={() => {
            const today = beijingDay();
            if (date !== today) setResult(null);
            setDate(today);
            setTime("");
          }}
        >
          回到当前时间
        </button>
      )}
      {loading && (
        <div className="room-progress">
          <small role="status">{progressText}</small>
          <progress
            aria-label={stage}
            max={hasCount ? progress.total : 1}
            value={hasCount ? progress.completed : undefined}
          />
        </div>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <>
          <div className="room-counts" aria-label="楼栋状态汇总">
            {Object.entries(counts).map(([status, count]) => (
              <span className="room-badge" key={status} data-status={status}>
                {labels[status]} {count}
              </span>
            ))}
          </div>
          <p className="hint">
            {clock.format(result.fetchedAt)} 更新 ·
            按学校教学安排判断，临时占用以现场为准。
          </p>
          {result.failedFloors > 0 && (
            <p role="status">部分楼层未能读取，汇总仅包含已列出的教室。</p>
          )}
          {!floors.size && <Empty title="学校未返回该楼栋的教室清单" />}
          {[...floors].map(([id, floor]) => (
            <section className="room-floor" key={id}>
              <h4>{floor.name}</h4>
              <div className="room-grid">
                {floor.rooms.map((room) => (
                  <RoomCard key={room.code} room={room} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}
      {!result && !loading && !error && (
        <Empty icon={DoorOpen} title="选择校区和楼栋后自动查询" />
      )}
    </Panel>
  );
}
