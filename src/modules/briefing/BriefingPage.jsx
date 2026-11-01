import Panel from "../../shared/Panel.jsx";
import React, { useEffect, useState } from "react";
import {
  BellRing,
  BookOpen,
  CalendarCheck,
  Clock3,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  Check,
  Cloud,
  FileJson,
  Link2,
} from "lucide-react";
import { beijingDay } from "../../briefing.mjs";
import CloudConnection from "./CloudConnection.jsx";
import LinkedText from "../../shared/LinkedText.jsx";

export default function Briefing({ state, call }) {
  const [data, setData] = useState(null),
    [date, setDate] = useState(beijingDay()),
    [busy, setBusy] = useState(false);
  const refresh = async (force = false) => {
    setBusy(true);
    try {
      setData(
        await call(force ? "briefing.export" : "briefing.state", { date }),
      );
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    refresh();
  }, [
    date,
    state.briefingStatus?.updatedAt,
    state.briefingStatus?.sync?.phase,
    state.briefingStatus?.sync?.lastSuccess,
  ]);
  const choose = async (kind) => {
    const result = await call("briefing.choose", { kind });
    if (!result.canceled) setData(result);
  };
  const preview = data?.preview;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>快报</h1>
        </div>
        <div className="heading-actions">
          <button
            className="button primary"
            disabled={busy}
            onClick={() => refresh(true)}
          >
            <RefreshCw size={16} className={busy ? "spin" : ""} />
            更新快报数据
          </button>
        </div>
      </div>
      <details className="dispatch-details">
        <summary>同步状态</summary>
        <div className="dispatch-route">
          <div>
            <CalendarCheck />
            <strong>校园与任务</strong>
            <small>
              {data?.counts.verifiedDates || 0} 天有效课表 ·{" "}
              {data?.counts.tasks || 0} 项待办
            </small>
          </div>
          <ArrowRight />
          <div>
            <FileJson />
            <strong>共享数据接口</strong>
            <small>{data?.local === "ready" ? "本机已连接" : "正在准备"}</small>
          </div>
          <ArrowRight />
          <div className="cloud-pending">
            <Cloud />
            <strong>早晚报自动提醒</strong>
            <small>
              {data?.sync?.configured
                ? data.sync.phase === "synced"
                  ? "已连接 · 自动同步"
                  : data.sync.phase === "error"
                    ? "同步遇到问题 · 将重试"
                    : "等待云端确认"
                : data?.cloud === "snapshot_deployed"
                  ? "云端已有快照 · 持续同步待连接"
                  : "云端连接待部署核验"}
            </small>
          </div>
        </div>
        <div className="dispatch-status">
          <span className="status-orb" />
          {data?.sync?.configured
            ? data.sync.message
            : data?.message || "正在读取快报状态…"}
          {data?.updatedAt && (
            <small>
              更新于 {new Date(data.updatedAt).toLocaleString("zh-CN")}
            </small>
          )}
        </div>
      </details>
      <div className="briefing-layout">
        <div>
          <Panel className="panel briefing-preview" title="快报预览">
            <div className="panel-heading">
              <div>
                <h2>快报内容预览</h2>
              </div>
              <input
                aria-label="快报预览日期"
                type="date"
                value={date}
                onChange={(e) => e.target.value && setDate(e.target.value)}
              />
            </div>
            <h3 className="dispatch-section">
              <BookOpen size={16} />
              课程预习与复习
            </h3>
            {preview?.study.map((item) => (
              <div className="dispatch-item" key={item.id}>
                <span
                  className={`dispatch-badge ${item.kind === "预习" ? "gold" : ""}`}
                >
                  {item.kind}
                </span>
                <div>
                  <b>{item.title.slice(5)}</b>
                  <small>
                    课程日期 {item.date} · {item.times}
                  </small>
                </div>
              </div>
            ))}
            {preview?.warnings.map((x, i) => (
              <p className="school-note" key={i}>
                {x}
              </p>
            ))}
            {preview && !preview.study.length && !preview.warnings.length && (
              <p className="hint">今日与明日无课</p>
            )}
            <h3 className="dispatch-section">
              <Clock3 size={16} />
              截止与逾期提醒
            </h3>
            {preview?.deadlines.map((t) => (
              <div className="dispatch-item" key={t.id}>
                <span
                  className={`dispatch-badge ${t.due < date ? "late" : "gold"}`}
                >
                  {t.due < date ? "逾期" : t.due === date ? "今天" : "临近"}
                </span>
                <div>
                  <LinkedText text={t.title} call={call} />
                  <small>
                    {t.project} · {t.quadrant_label} · {t.due}
                    {t.due_time ? ` ${t.due_time}` : "，未指定截止钟点"}
                  </small>
                </div>
              </div>
            ))}
            {!preview?.deadlines.length && <p className="hint">暂无截止事项</p>}
            <h3 className="dispatch-section">
              <BellRing size={16} />
              重要任务
            </h3>
            {preview?.priorities.map((t) => (
              <div className="dispatch-item" key={t.id}>
                <i className={`priority-point ${t.quadrant}`} />
                <div>
                  <b>{t.title}</b>
                  <small>
                    {t.quadrant_label} · {t.project} · 子任务 {t.subtasks_done}/
                    {t.subtasks_total}
                  </small>
                </div>
              </div>
            ))}
            {!preview?.priorities.length && (
              <p className="hint">暂无重要任务</p>
            )}
          </Panel>
        </div>
        <aside>
          <CloudConnection data={data} call={call} onUpdate={setData} />
          <Panel className="panel" title="数据连接" defaultCollapsed>
            <p className="eyebrow">连接管理</p>
            <h3>快报数据桥接</h3>
            <p className="hint">
              任务修改、完成或课表同步后自动更新数据文件。
              {data?.sync?.configured
                ? "云端同步情况见上方连接状态。"
                : data?.cloud === "snapshot_deployed"
                  ? "云端适配器已部署；后续修改仍需上传到云端。"
                  : "云函数需部署新适配器，才能读取它们。"}
            </p>
            <div className="bridge-location">
              <span>共享助理目录</span>
              <small>{data?.config.sharedRoot || "尚未选择"}</small>
              <button
                className="text-button"
                onClick={() => choose("sharedRoot")}
              >
                <Link2 size={13} />
                选择共享目录
              </button>
            </div>
            <div className="bridge-location">
              <span>快报程序目录</span>
              <small>{data?.config.cloudDirectory || "尚未选择"}</small>
              <button
                className="text-button"
                onClick={() => choose("cloudDirectory")}
              >
                <Link2 size={13} />
                选择快报目录
              </button>
            </div>
            <button className="button" onClick={() => call("briefing.folder")}>
              <FolderOpen size={15} />
              打开本机数据接口
            </button>
            <p className="hint">
              导出仅含课程与待办字段，不包含账号、密码、会话、任务长笔记。
            </p>
          </Panel>
          <Panel
            className="panel dispatch-registry"
            title="固定备忘"
            defaultCollapsed
          >
            <p className="eyebrow">备忘录</p>
            <h3>已连接的固定备忘</h3>
            {data?.registry.error && (
              <p className="error">{data.registry.error}</p>
            )}
            {data?.registry.items.map((item) => (
              <div className="registry-item" key={item.id}>
                <Check size={14} />
                <div>
                  <LinkedText text={item.title} call={call} />
                  <small>
                    {item.enabled ? "台账已启用" : "台账已停用"} ·
                    沿用原提醒规则
                  </small>
                </div>
              </div>
            ))}
            {!data?.registry.items.length && (
              <p className="hint">未连接备忘台账</p>
            )}
            <p className="hint">
              完成任务会从下次快报数据中移除；已发出的微信消息不作撤回。文件更新不等于云端已收到。
            </p>
          </Panel>
        </aside>
      </div>
    </>
  );
}
