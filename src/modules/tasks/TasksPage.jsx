import Panel from "../../shared/Panel.jsx";
import React from "react";
import { Plus, Inbox } from "lucide-react";
import { QUADRANTS } from "../../domain.mjs";
import { Empty } from "../../components.jsx";

export default function TasksPage({
  state,
  call,
  page,
  filter,
  setFilter,
  project,
  setProject,
  projects,
  visible,
  card,
  addTask,
  query,
  manageLists,
}) {
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{page === "matrix" ? "四象限" : "任务清单"}</h1>
        </div>
        <button className="button primary" onClick={() => addTask()}>
          <Plus size={16} />
          新建任务
        </button>
      </div>
      <div className="task-toolbar">
        <div className="tabs">
          {[
            ["active", "待办"],
            ["today", "今天与逾期"],
            ["done", "已完成"],
            ["trash", "回收站"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "active" : ""}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
        <select
          aria-label="筛选清单"
          value={project}
          onChange={(e) => setProject(e.target.value)}
        >
          {["全部清单", ...projects].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
        <button className="button small" onClick={manageLists}>
          管理清单
        </button>
      </div>
      {page === "matrix" && filter !== "trash" ? (
        <div className="quadrant-grid">
          {QUADRANTS.map((q) => (
            <Panel
              className={`quadrant q-${q.id}`}
              key={q.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const task = state.tasks.find(
                  (t) => t.id === e.dataTransfer.getData("text/plain"),
                );
                if (task) call("task.save", { ...task, quadrant: q.id });
              }}
            >
              <header>
                <div>
                  <span
                    className="quadrant-mark"
                    style={{ background: q.color }}
                  />
                  <h2>{q.title}</h2>
                  <span className="count">
                    {visible.filter((t) => t.quadrant === q.id).length}
                  </span>
                </div>
              </header>
              <div className="quadrant-tasks">
                {visible.filter((t) => t.quadrant === q.id).map(card)}
                {!visible.some((t) => t.quadrant === q.id) && (
                  <p className="quadrant-empty">暂无任务</p>
                )}
              </div>
              <button className="add-line" onClick={() => addTask(q.id)}>
                <Plus size={16} />
                添加任务
              </button>
            </Panel>
          ))}
        </div>
      ) : (
        <section className="panel task-list" aria-label="任务列表">
          {visible.length ? (
            visible.map((t) =>
              filter === "trash" ? (
                <div className="trash-row" key={t.id}>
                  <span>{t.title}</span>
                  <button
                    className="button small"
                    onClick={() => call("task.restore", { id: t.id })}
                  >
                    恢复任务
                  </button>
                </div>
              ) : (
                card(t)
              ),
            )
          ) : (
            <Empty
              icon={Inbox}
              title={query ? "没有匹配的任务" : "暂无任务"}
            />
          )}
        </section>
      )}
    </>
  );
}
