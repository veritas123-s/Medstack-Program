import React, { useEffect, useState } from "react";
import Panel from "../../shared/Panel.jsx";
export default function ExamsPanel({ state, call }) {
  const [error, setError] = useState("");
  const sync = () =>
    call("school.exams")
      .then(() => setError(""))
      .catch((e) => setError(e.message));
  useEffect(() => {
    sync();
  }, []);
  const data = state.exams || {},
    items = data.items || [];
  return (
    <Panel className="panel" title="考试安排">
      <div className="panel-heading">
        <h2>考试安排</h2>
        <div className="data-actions">
          <button className="button" onClick={() => call("school.exams.open")}>
            官方考试页
          </button>
          <button
            className="button primary"
            disabled={data.busy}
            onClick={sync}
          >
            {data.busy ? "同步中…" : "同步考试"}
          </button>
        </div>
      </div>
      <p className="hint">
        {data.syncedAt
          ? "上次同步 " + new Date(data.syncedAt).toLocaleString("zh-CN")
          : "尚未同步"}{" "}
        · 登录期间每30分钟同步
      </p>
      {(error || data.error) && (
        <p className="error" role="alert">
          {error || data.error}
        </p>
      )}
      {items.length > 0 ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>课程</th>
                <th>考试时间</th>
                <th>考场</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x.id}>
                  <td>{x.title}</td>
                  <td>
                    {x.rawTime || "学校未公布"}
                    {!x.start && " · 待核对"}
                  </td>
                  <td>{x.location || "学校未公布"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          {data.syncedAt && !data.error
            ? "学校当前页面未列出考试"
            : "登录学校后同步考试安排"}
        </p>
      )}
    </Panel>
  );
}
