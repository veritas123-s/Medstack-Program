import Panel from "../../shared/Panel.jsx";
import ActionMenu from "../../shared/ActionMenu.jsx";
import { courseRelevance } from "../../learning-policy.mjs";
import React, { useState } from "react";
import {
  Bell,
  RefreshCw,
  QrCode,
  ArrowUpRight,
  Check,
  Trash2,
  Undo2,
  CalendarDays,
} from "lucide-react";
import { agenda, learningEntries } from "../../agenda.mjs";
import "./calendar.css";
export default function NotificationsPage({
  state,
  call,
  setPage,
  openAssistant,
  toast,
  learningOnly = true,
}) {
  const [filter, setFilter] = useState("all"),
    [section, setSection] = useState("inbox"),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState([]),
    [error, setError] = useState("");
  const a = agenda(state, state.learning),
    read = state.workflows?.read || [],
    l = state.learning || {};
  const run = async (action, p) => {
    setBusy(true);
    setError("");
    try {
      await call(action, p);
      setSelected([]);
      if (action === "notification.delete")
        toast?.("已移至“已删除”；作业对应任务一并进入回收站，可恢复。");
      if (action === "notification.restore") toast?.("通知已恢复。");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  const catalog = l.courses || [
    ...new Map(
      (l.items || [])
        .filter((x) => x.kind === "assignment" && x.courseKey)
        .map((x) => [x.courseKey, { key: x.courseKey, title: x.course }]),
    ).values(),
  ];
  const history = learningEntries(state, l, { history: true });
  const deleted = learningEntries(state, l, { deleted: true }).sort(
    (a, b) => b.time - a.time,
  );
  const entries =
    filter === "deleted"
      ? deleted
      : filter === "history"
        ? history
        : a.entries.filter(
            (e) =>
              filter === "all" ||
              (filter === "unread" && !read.includes(e.id)) ||
              filter === e.kind,
          );
  const visibleEntries = learningOnly
    ? entries.filter((e) => ["notice", "assignment"].includes(e.kind))
    : entries;
  const notices = visibleEntries.filter((e) =>
    ["notice", "assignment"].includes(e.kind),
  );
  const selectedIds = notices
    .filter((e) => selected.includes(e.sourceId))
    .map((e) => e.sourceId);
  const readNotices = a.entries.filter(
    (e) => e.kind === "notice" && read.includes(e.id),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{learningOnly ? "超星学习通" : "日程与通知"}</h1>
        </div>
        <button className="button" onClick={() => setPage("calendar")}>
          <CalendarDays size={17} />
          打开日历
        </button>
        <span className="pill neutral">
          <Bell size={16} />
          {
            a.entries.filter(
              (e) =>
                !read.includes(e.id) &&
                (!learningOnly || ["notice", "assignment"].includes(e.kind)),
            ).length
          }{" "}
          条未读
        </span>
      </div>
      <div className="tabs" aria-label="通知分类">
        {(learningOnly
          ? [
              ["inbox", "消息"],
              ["learning", "连接与课程"],
            ]
          : [
              ["inbox", "通知"],
              ["workflow", "自动工作流"],
            ]
        ).map(([id, title]) => (
          <button
            key={id}
            className={section === id ? "active" : ""}
            aria-pressed={section === id}
            onClick={() => setSection(id)}
          >
            {title}
          </button>
        ))}
      </div>

      {section === "learning" && (
        <Panel className="panel learning-connect">
          <div>
            <h3>超星学习通</h3>
            <p>{l.message}</p>
            <small>
              上次成功：
              {l.lastSuccess
                ? new Date(l.lastSuccess).toLocaleString("zh-CN")
                : "尚未同步"}{" "}
              · 应用运行时每 30 分钟更新
            </small>
          </div>
          <div className="agenda-actions">
            {!l.connected && (
              <button
                className="button"
                disabled={busy || l.busy}
                onClick={() => run("learning.open")}
              >
                <QrCode size={16} />
                学习通扫码登录
              </button>
            )}
            <button
              className="button primary"
              disabled={busy || l.busy || !l.connected}
              onClick={() => run("learning.sync")}
            >
              <RefreshCw size={16} />
              {l.busy ? "读取中…" : "立即同步"}
            </button>
            <ActionMenu label="学习通更多操作">
              <button
                className="text-button"
                onClick={() => run("learning.open", { kind: "notices" })}
              >
                官方通知 <ArrowUpRight size={14} />
              </button>
              {(l.connected || l.needsLogin) && (
                <button
                  className="text-button"
                  disabled={busy || l.busy}
                  onClick={() => run("learning.logout")}
                >
                  断开连接
                </button>
              )}
            </ActionMenu>
          </div>
          <details className="help-disclosure">
            <summary>同步范围与日期说明</summary>
            <p>
              默认只显示近30天通知与近期未完成作业；往年、已截止、已完成内容收进“历史与待确认”。会话加密保存。仅倒计时的截止时间标为估算，不自动设定任务
              DDL。仅有月日时标为年份待核对，不自动写入任务截止日。通知最多读取最近
              5 页；覆盖范围见同步状态。
            </p>
          </details>
          <label className="archive-course-option">
            <input
              type="checkbox"
              checked={state.workflows?.includeArchived ?? false}
              disabled={busy || l.busy}
              onChange={(e) =>
                run("workflow.configure", { includeArchived: e.target.checked })
              }
            />{" "}
            读取平台已归档课程供手动选择（默认不进入提醒，每轮最多30门）
          </label>
          <details className="learning-course-manager">
            <summary>管理关注课程（{catalog.length}）</summary>
            <p className="hint">
              自动模式参考近期课表和明确截止日期。未确认学期的旧课不会凭“未归档”进入提醒；可手动关注或不关注。修改立即影响显示，自动入库在下次同步时应用。
            </p>
            {catalog.map((c) => {
              const r = courseRelevance(c, state);
              return (
                <div className="learning-course-row" key={c.key}>
                  <span>
                    <b>{c.title}</b>
                    <small>{r.reason}</small>
                  </span>
                  <select
                    aria-label={"关注课程 " + c.title}
                    disabled={busy || l.busy}
                    value={state.workflows?.courseChoices?.[c.key] || "auto"}
                    onChange={(e) =>
                      run("workflow.configure", {
                        courseChoice: { key: c.key, value: e.target.value },
                      })
                    }
                  >
                    <option value="auto">自动筛选</option>
                    <option value="follow">关注此课</option>
                    <option value="hide">不再关注</option>
                  </select>
                </div>
              );
            })}
            {!catalog.length && <p className="hint">同步后可选择课程。</p>}
          </details>
        </Panel>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {section === "inbox" && (
        <Panel className="panel">
          <div className="notification-filters">
            {[
              ["all", "全部"],
              ["unread", "未读"],
              ["course", "课程"],
              ["task", "任务"],
              ["assignment", "作业"],
              ["notice", "超星通知"],
              ["history", `历史与待确认 ${history.length}`],
              ["deleted", `已删除 ${deleted.length}`],
            ]
              .filter(
                ([id]) => !learningOnly || !["course", "task"].includes(id),
              )
              .map(([id, title]) => (
                <button
                  className={"button small " + (filter === id ? "primary" : "")}
                  onClick={() => {
                    setFilter(id);
                    setSelected([]);
                  }}
                  key={id}
                >
                  {title}
                </button>
              ))}
            <button
              className="text-button"
              disabled={busy || filter === "deleted" || !visibleEntries.length}
              onClick={() =>
                run("notification.read", {
                  ids: visibleEntries.map((e) => e.id),
                })
              }
            >
              本页标为已读
            </button>
          </div>
          <div className="notice-management">
            <label>
              <input
                type="checkbox"
                aria-label="选择本页超星通知"
                disabled={!notices.length || busy}
                checked={
                  notices.length > 0 && selectedIds.length === notices.length
                }
                onChange={(e) =>
                  setSelected(
                    e.target.checked ? notices.map((n) => n.sourceId) : [],
                  )
                }
              />
              选择本页学习通事项
            </label>
            <button
              className="button small"
              disabled={busy || !selectedIds.length}
              onClick={() =>
                run(
                  filter === "deleted"
                    ? "notification.restore"
                    : "notification.delete",
                  { ids: selectedIds },
                )
              }
            >
              {filter === "deleted" ? (
                <Undo2 size={15} />
              ) : (
                <Trash2 size={15} />
              )}
              {filter === "deleted" ? "恢复所选" : "删除所选"}
              {selectedIds.length ? `（${selectedIds.length}）` : ""}
            </button>
            {filter !== "deleted" && (
              <button
                className="text-button"
                disabled={busy || !readNotices.length}
                onClick={() =>
                  run("notification.delete", {
                    ids: readNotices.map((e) => e.sourceId),
                  })
                }
              >
                清理已读超星通知（{readNotices.length}）
              </button>
            )}
            <small>删除仅影响本机，可恢复。</small>
          </div>
          <div className="notification-list">
            {visibleEntries.map((e) => (
              <article
                className={
                  "notification-row " + (read.includes(e.id) ? "read" : "")
                }
                key={e.id}
              >
                {["notice", "assignment"].includes(e.kind) && (
                  <input
                    className="notice-select"
                    type="checkbox"
                    aria-label={"选择通知 " + e.title}
                    disabled={busy}
                    checked={selected.includes(e.sourceId)}
                    onChange={(event) =>
                      setSelected((values) =>
                        event.target.checked
                          ? [...values, e.sourceId]
                          : values.filter((id) => id !== e.sourceId),
                      )
                    }
                  />
                )}
                <span className={"agenda-kind " + e.kind}>
                  <Bell size={18} />
                </span>
                <div>
                  <small>
                    {e.label}
                    {e.estimated
                      ? " · 估算时间"
                      : e.yearInferred
                        ? " · 年份推定，请核对"
                        : ""}
                  </small>
                  <h3>{e.title}</h3>
                  {e.reason && filter === "history" && (
                    <p className="hint">{e.reason}</p>
                  )}
                  {e.summary && (
                    <details>
                      <summary>查看通知摘要</summary>
                      <p>{e.summary}</p>
                    </details>
                  )}
                  <p>
                    {e.subtitle}
                    {e.time
                      ? " · " + new Date(e.time).toLocaleString("zh-CN")
                      : ""}
                  </p>
                  {filter !== "deleted" &&
                    e.kind === "assignment" &&
                    e.canOpenAssignment && (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          run("learning.open", {
                            kind: "assignment",
                            id: e.sourceId,
                          })
                        }
                      >
                        <ArrowUpRight size={15} />
                        {e.done || e.closed ? "查看官方作业" : "前往作答与提交"}
                      </button>
                    )}
                </div>
                {filter !== "deleted" && (
                  <button
                    className="icon-button"
                    aria-label={"标为已读 " + e.title}
                    disabled={busy || read.includes(e.id)}
                    onClick={() => run("notification.read", { ids: [e.id] })}
                  >
                    <Check size={18} />
                  </button>
                )}
                {["notice", "assignment"].includes(e.kind) && (
                  <button
                    className="icon-button"
                    disabled={busy}
                    aria-label={
                      (filter === "deleted" ? "恢复" : "删除") +
                      (e.kind === "notice" ? "通知 " : "作业 ") +
                      e.title
                    }
                    onClick={() =>
                      run(
                        filter === "deleted"
                          ? "notification.restore"
                          : "notification.delete",
                        { ids: [e.sourceId] },
                      )
                    }
                  >
                    {filter === "deleted" ? (
                      <Undo2 size={18} />
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </button>
                )}
              </article>
            ))}
            {!visibleEntries.length && (
              <p className="empty-inbox">
                此筛选下暂无已同步事项。同步状态和课表覆盖情况见上方。
              </p>
            )}
          </div>
        </Panel>
      )}
    </>
  );
}
