import React from "react";
import Panel from "../../shared/Panel.jsx";
import ExamAnnouncement from "./ExamAnnouncement.jsx";
export default function ExamsPanel({ state, call }) {
  const sync = () => call("school.exams").catch(() => {});
  const data = state.exams || {},
    items = data.items || [];
  return (
    <>
      <Panel className="panel" title="教务考试安排">
        <div className="panel-heading">
          <h2>教务考试安排</h2>
          <div className="data-actions">
            <button
              className="button"
              onClick={() => call("school.exams.open")}
            >
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
          · 后台每 30 分钟同步
          {data.completedTerms > 0 && ` · 已查询 ${data.completedTerms} 个学期`}
          {Number.isInteger(data.currentTermCount) &&
            ` · 本学期 ${data.currentTermCount} 条`}
        </p>
        {data.error && (
          <p className="error" role="alert">
            {data.error}
          </p>
        )}
        {data.incomplete && (
          <p role="status">部分学期尚未确认，已保留旧结果。</p>
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
                    <td>
                      {x.title}
                      {x.academicYear && x.semester && (
                        <small className="hint">
                          {" "}
                          · {x.academicYear} 学年第 {x.semester} 学期
                        </small>
                      )}
                    </td>
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
            {data.syncedAt && !data.error && !data.incomplete
              ? "已查询的学期没有考试安排"
              : "考试同步后会显示在日历。"}
          </p>
        )}
      </Panel>
      <ExamAnnouncement
        announcement={data.announcement}
        importError={data.announcementError}
        call={call}
      />
    </>
  );
}
