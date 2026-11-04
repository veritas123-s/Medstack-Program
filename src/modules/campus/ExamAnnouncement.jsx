import React, { useState } from "react";
import Panel from "../../shared/Panel.jsx";

const pageSize = 10;
const searchable = (value) => value.normalize("NFKC").toLowerCase();

export default function ExamAnnouncement({ announcement, importError, call }) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const tokens = searchable(query).split(/\s+/).filter(Boolean);
  const results = (announcement?.items || []).filter((row) => {
    const label = searchable(
      `${row.title} ${row.cohort} ${row.location} ${row.start.slice(0, 10)} 第${row.week}周`,
    );
    return tokens.every((token) => label.includes(token));
  });
  const lastPage = Math.max(0, Math.ceil(results.length / pageSize) - 1);
  const activePage = Math.min(page, lastPage);
  const run = async (action, params) => {
    setBusy(true);
    setError("");
    setFeedback("");
    try {
      const result = await call(action, params);
      if (result.canceled) return;
      setSelected([]);
      if (action.endsWith("import")) {
        setQuery("");
        setPage(0);
        setFeedback(`已导入 ${result.count} 条考场安排`);
      } else {
        setFeedback(
          result.count
            ? `已加入 ${result.count} 场考试`
            : "所选考试已在日历或回收站",
        );
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel className="panel" title="本机考试表">
      <div className="panel-heading">
        <h2>本机考试表</h2>
        <button
          className="button"
          disabled={busy}
          onClick={() => run("school.exams.announcement.import")}
        >
          导入考试表
        </button>
      </div>
      {(error || importError) && (
        <p className="error" role="alert">
          {error || importError}
        </p>
      )}
      {feedback && (
        <p className="hint" role="status">
          {feedback}
        </p>
      )}
      {announcement && (
        <>
          <p>
            <strong>{announcement.title}</strong> · {announcement.campus}
            {announcement.notice && ` · ${announcement.notice}`}
          </p>
          <div className="data-actions">
            <input
              aria-label="搜索班级、课程或考场"
              placeholder="搜索班级、课程或考场"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(0);
                setSelected([]);
              }}
            />
            <button
              className="button primary"
              disabled={busy || !selected.length}
              onClick={() =>
                run("school.exams.announcement.add", { ids: selected })
              }
            >
              加入日历{selected.length ? `（${selected.length}）` : ""}
            </button>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>选择</th>
                  <th>课程</th>
                  <th>时间</th>
                  <th>班级</th>
                  <th>考场</th>
                  <th>人数</th>
                </tr>
              </thead>
              <tbody>
                {results
                  .slice(activePage * pageSize, (activePage + 1) * pageSize)
                  .map((row) => (
                    <tr key={row.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`选择 ${row.title} ${row.location}`}
                          checked={selected.includes(row.id)}
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setSelected((ids) =>
                              checked
                                ? [...ids, row.id]
                                : ids.filter((id) => id !== row.id),
                            );
                          }}
                        />
                      </td>
                      <td>{row.title}</td>
                      <td>
                        {row.start.slice(0, 10)}
                        <br />
                        {row.start.slice(11)}–{row.end.slice(11)}
                        <br />
                        <small>第 {row.week} 周</small>
                      </td>
                      <td>{row.cohort}</td>
                      <td>{row.location}</td>
                      <td>{row.seats || "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="data-actions">
            <span className="hint">
              {results.length
                ? `${results.length} 条 · 第 ${activePage + 1}/${lastPage + 1} 页`
                : "无匹配考场"}
            </span>
            {lastPage > 0 && (
              <>
                <button
                  className="button small"
                  disabled={activePage === 0}
                  onClick={() => setPage(activePage - 1)}
                >
                  上一页
                </button>
                <button
                  className="button small"
                  disabled={activePage === lastPage}
                  onClick={() => setPage(activePage + 1)}
                >
                  下一页
                </button>
              </>
            )}
          </div>
        </>
      )}
    </Panel>
  );
}
