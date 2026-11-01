import { UpdateBanner } from "./modules/settings/UpdateCenter.jsx";
import BrandMark from "./shared/BrandMark.jsx";
import { commandKey } from "./platform/shortcuts.mjs";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PanelProvider } from "./shared/Panel.jsx";
import ResponsiveViewport from "./shared/ResponsiveViewport.jsx";
import {
  Timer,
  Settings,
  Plus,
  Search,
  ArrowUpRight,
  ChevronRight,
  X,
  Palette,
  Sparkles,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  GraduationCap,
  Newspaper,
  BookOpen,
} from "lucide-react";
import { QUADRANTS, dayKey, elapsed, dayTotals } from "./domain.mjs";
import { TaskEditor, TaskCard, timeText } from "./components.jsx";
import { NAV, ModuleOutlet } from "./platform/modules.jsx";
import { NAV_GROUPS, routeGroup } from "./platform/navigation.mjs";
import { useTheme } from "./themes/useTheme.jsx";
import AssistantPanel from "./modules/assistant/AssistantPanel.jsx";
import ListManager from "./shared/ListManager.jsx";
import AccountPage from "./modules/accounts/AccountPage.jsx";
import ManualModal from "./shared/ManualModal.jsx";
import OnboardingTour from "./shared/OnboardingTour.jsx";
import SidebarManager from "./shared/SidebarManager.jsx";
import { APP_LABEL, APP_VERSION } from "./version.mjs";

export default function App() {
  const [state, setState] = useState(null),
    [page, setPageState] = useState("today"),
    [editor, setEditor] = useState(null),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [project, setProject] = useState("全部清单"),
    [filter, setFilter] = useState("active"),
    [focusTask, setFocusTask] = useState(""),
    [busy, setBusy] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [researchSelection, setResearchSelection] = useState(null);
  const setPage = (next) =>
    next === "assistant"
      ? setAssistantOpen(true)
      : setPageState(next === "notifications" ? "learning" : next);
  const [listsOpen, setListsOpen] = useState(false);
  const [sidebarManagerOpen, setSidebarManagerOpen] = useState(false);
  const [groupMenu, setGroupMenu] = useState(null);
  const [foldedGroups, setFoldedGroups] = useState([]);
  const [manualKind, setManualKind] = useState(null);
  const [tourOpen, setTourOpen] = useState(false);
  useEffect(() => {
    setQuery("");
    setResearchSelection(null);
    setEditor(null);
    setAssistantOpen(false);
    setPageState("today");
  }, [state?.account?.user?.id, state?.locked]);
  const [, setClock] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setClock((x) => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  useTheme(
    state?.locked
      ? {
          theme: "paper",
          appearance: {
            image: "none",
            opacity: 0,
            blur: 0,
            position: "center",
            fit: "cover",
          },
        }
      : state?.workspace,
  );
  const accept = (next) => {
    if (next?.schemaVersion)
      setState((old) =>
        !old || !next.revision || next.revision >= old.revision ? next : old,
      );
  };
  const call = async (action, payload) => {
    try {
      const result = await window.veritas.call(action, payload);
      accept(result);
      return result;
    } catch (error) {
      const msg = error.message.replace(
        /^Error invoking remote method '[^']+': Error: /,
        "",
      );
      setToast(msg);
      throw new Error(msg);
    }
  };
  useEffect(() => {
    const handler = (e) => e.preventDefault();
    window.addEventListener("unhandledrejection", handler);
    if (window.veritas) {
      window.veritas
        .call("state")
        .then(accept)
        .catch((e) => setToast(e.message));
      const stop = window.veritas.subscribe(accept);
      return () => {
        stop();
        window.removeEventListener("unhandledrejection", handler);
      };
    }
  }, []);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 6000);
      return () => clearTimeout(id);
    }
  }, [toast]);
  useEffect(() => {
    const handler = (e) => {
      if (!state?.account?.authenticated || state?.locked) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "n") {
        e.preventDefault();
        setEditor({});
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        document.getElementById("global-search")?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state?.account?.authenticated, state?.locked]);
  useEffect(() => {
    if (
      state &&
      project !== "全部清单" &&
      !state.lists?.some((l) => l.name === project && !l.deletedAt)
    )
      setProject("全部清单");
  }, [state?.lists, project]);
  useEffect(() => {
    if (
      state?.account?.authenticated &&
      !state?.locked &&
      (state.workspace?.onboardingVersion || 0) < 1
    )
      setTourOpen(true);
  }, [
    state?.account?.authenticated,
    state?.locked,
    state?.workspace?.onboardingVersion,
  ]);
  if (!state)
    return (
      <div className="loading">
        <BrandMark />
        <h1>{APP_LABEL}</h1>
        <p>
          {window.veritas ? "医栈事，一站通" : "请通过桌面程序打开此应用。"}
        </p>
        {toast && <p className="error">{toast}</p>}
      </div>
    );
  if (state.locked || !state.account?.authenticated)
    return (
      <main className="auth-shell">
        <div className="auth-brand">
          <BrandMark />
          <div>
            <h1>
              医栈通 <small>Medstack</small>
            </h1>
            <p>医栈事，一站通</p>
          </div>
        </div>
        <UpdateBanner updates={state.updates} call={call} />
        <AccountPage state={state} call={call} toast={setToast} locked />
        <div className="data-actions">
          <button
            className="button"
            onClick={() => call("help.open", { kind: "user" })}
          >
            使用说明
          </button>
          <button
            className="button"
            onClick={() => call("help.open", { kind: "developer" })}
          >
            开发者手册 · Zeus
          </button>
        </div>
        {toast && (
          <div className="toast" role="status">
            {toast}
          </div>
        )}
      </main>
    );
  const active = state.tasks.filter((t) => !t.deletedAt && !t.completedAt),
    projects = state.lists.filter((l) => !l.deletedAt).map((l) => l.name),
    totals = dayTotals(state.logs),
    today = dayKey(),
    todayMs = totals[today] || 0;
  const navigation = state.workspace?.navigation || {
    collapsed: false,
    hidden: [],
  };
  const visibleNav = NAV.filter(
    ([id]) => id === "today" || !navigation.hidden.includes(id),
  );
  const visible = state.tasks
    .filter(
      (t) =>
        (filter === "trash"
          ? t.deletedAt
          : !t.deletedAt &&
            (filter === "done"
              ? t.completedAt
              : filter === "today"
                ? !t.completedAt && t.due && t.due <= today
                : !t.completedAt)) &&
        (project === "全部清单" || t.project === project) &&
        `${t.title} ${t.notes} ${t.project}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort(
      (a, b) =>
        (a.due || "9999").localeCompare(b.due || "9999") ||
        b.createdAt - a.createdAt,
    );
  const addTask = (quadrant = "plan") =>
    setEditor({
      quadrant,
      project: project === "全部清单" ? "收集箱" : project,
    });
  const focus = (t) => {
    setFocusTask(t.id);
    setPage("focus");
    if (state.timer.status !== "idle")
      setToast("当前已有计时，请先保存结束，再切换任务。");
  };
  const card = (t) => (
    <TaskCard
      key={t.id}
      task={t}
      call={call}
      onEdit={setEditor}
      onFocus={focus}
    />
  );
  return (
    <div
      className={`app-shell ${navigation.collapsed ? "sidebar-collapsed" : ""}`}
    >
      <aside className={`sidebar ${navigation.collapsed ? "collapsed" : ""}`}>
        <button
          className="sidebar-toggle"
          aria-label={navigation.collapsed ? "展开侧栏" : "收起侧栏"}
          title={navigation.collapsed ? "展开侧栏" : "收起侧栏"}
          onClick={() => {
            setGroupMenu(null);
            call("workspace.configure", {
              navigation: { ...navigation, collapsed: !navigation.collapsed },
            });
          }}
        >
          {navigation.collapsed ? (
            <PanelLeftOpen size={18} />
          ) : (
            <PanelLeftClose size={18} />
          )}
        </button>
        <div className="brand">
          <BrandMark />
          <div>
            <b>
              医栈通<span>{APP_VERSION}</span>
            </b>
            <small>任务 · 课程 · 专注</small>
          </div>
        </div>
        <button className="new-task" onClick={() => addTask()}>
          <Plus size={18} />
          <span>新建任务</span>
          <kbd>{commandKey()} N</kbd>
        </button>
        <div className="sidebar-scroll">
          <nav aria-label="主导航">
            {visibleNav
              .filter(([id]) => id === "today")
              .map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={`nav-item overview-nav ${page === id ? "active" : ""}`}
                  aria-label={label}
                  aria-current={page === id ? "page" : undefined}
                  onClick={() => setPage(id)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                </button>
              ))}
            {NAV_GROUPS.map((group) => (
              <React.Fragment key={group.id}>
                {group.id !== "news" &&
                  visibleNav.some(([id]) => routeGroup(id) === group.id) && (
                    <button
                      className={`nav-group-button ${(navigation.collapsed || foldedGroups.includes(group.id)) && routeGroup(page) === group.id ? "active" : ""}`}
                      aria-label={`${group.title}板块`}
                      aria-expanded={
                        navigation.collapsed
                          ? groupMenu === group.id
                          : !foldedGroups.includes(group.id)
                      }
                      onClick={() =>
                        navigation.collapsed
                          ? setGroupMenu(
                              groupMenu === group.id ? null : group.id,
                            )
                          : setFoldedGroups((old) =>
                              old.includes(group.id)
                                ? old.filter((x) => x !== group.id)
                                : [...old, group.id],
                            )
                      }
                    >
                      {group.id === "research" ? (
                        <BookOpen size={18} />
                      ) : group.id === "efficiency" ? (
                        <Timer size={18} />
                      ) : group.id === "academic" ? (
                        <GraduationCap size={18} />
                      ) : (
                        <Newspaper size={18} />
                      )}
                      <span>{group.title}</span>
                      <ChevronDown size={14} />
                    </button>
                  )}
                {group.id !== "news" &&
                  !navigation.collapsed &&
                  !foldedGroups.includes(group.id) &&
                  visibleNav
                    .filter(([id]) => routeGroup(id) === group.id)
                    .map(([id, label, Icon]) => (
                      <button
                        key={id}
                        title={navigation.collapsed ? label : undefined}
                        className={`nav-item ${page === id ? "active" : ""}`}
                        aria-current={page === id ? "page" : undefined}
                        onClick={() => setPage(id)}
                      >
                        <Icon size={18} />
                        <span>{label}</span>
                        {id === "tasks" && <small>{active.length}</small>}
                      </button>
                    ))}
              </React.Fragment>
            ))}
          </nav>
          {navigation.collapsed &&
            groupMenu &&
            createPortal(
              <>
                <button
                  className="sidebar-popup-backdrop"
                  aria-label="关闭板块菜单"
                  onClick={() => setGroupMenu(null)}
                />
                <section
                  className="sidebar-group-popup"
                  aria-label={`${NAV_GROUPS.find((x) => x.id === groupMenu)?.title}菜单`}
                >
                  <h3>{NAV_GROUPS.find((x) => x.id === groupMenu)?.title}</h3>
                  {visibleNav
                    .filter(([id]) => routeGroup(id) === groupMenu)
                    .map(([id, label, Icon]) => (
                      <button
                        className={page === id ? "active" : ""}
                        key={id}
                        onClick={() => {
                          setPage(id);
                          setGroupMenu(null);
                        }}
                      >
                        <Icon size={18} />
                        {label}
                      </button>
                    ))}
                </section>
              </>,
              document.body,
            )}
          <div className="sidebar-projects">
            <p className="nav-label">
              我的清单{" "}
              <button
                aria-label="新建清单"
                onClick={() => {
                  setListsOpen(true);
                }}
              >
                <Plus size={14} />
              </button>
            </p>
            {projects.map((p, i) => (
              <button
                key={p}
                className={page === "tasks" && project === p ? "selected" : ""}
                onClick={() => {
                  setProject(p);
                  setPage("tasks");
                  setFilter("active");
                }}
              >
                <i style={{ background: QUADRANTS[i % 4].color }} />
                {p}
                <small>{active.filter((t) => t.project === p).length}</small>
              </button>
            ))}
          </div>
        </div>
        <div className="sidebar-bottom">
          <div className="local-status">
            <i />
            {state.account?.sync?.phase === "synced"
              ? "已同步到云端"
              : state.account?.sync?.enabled
                ? "云同步已开启"
                : "保存在这台电脑"}
          </div>
          <button
            onClick={() => setPage("settings")}
            className={page === "settings" ? "active" : ""}
            title={navigation.collapsed ? "设置与数据" : undefined}
            aria-label="设置与数据"
            aria-current={page === "settings" ? "page" : undefined}
          >
            <Settings size={18} />
            <b>设置与数据</b>
            <span>V{APP_VERSION}</span>
          </button>
          <button
            className="sidebar-manage"
            title={navigation.collapsed ? "整理侧栏" : undefined}
            aria-label="整理侧栏"
            onClick={() => setSidebarManagerOpen(true)}
          >
            <SlidersHorizontal size={18} />
            <b>整理侧栏</b>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            个人空间 <ChevronRight size={13} />
            <span>
              {page === "account"
                ? "账号与同步"
                : NAV.find((n) => n[0] === page)?.[1] || "设置与数据"}
            </span>
          </div>
          <div className="search">
            <Search size={16} />
            <input
              id="global-search"
              aria-label="搜索工作台"
              placeholder="搜索项目、知识与任务"
              maxLength={200}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage("research-hub");
                setFilter("active");
                setProject("全部清单");
              }}
            />
            {query && (
              <button
                className="search-clear"
                aria-label="清空搜索"
                onClick={() => setQuery("")}
              >
                <X size={15} />
              </button>
            )}
            <kbd>{commandKey()} K</kbd>
          </div>
          <button
            className="theme-shortcut"
            aria-label="更换主题"
            onClick={() => setPage("workbench")}
          >
            <Palette size={16} />
            <span>主题</span>
          </button>
          <button
            className="assistant-launch"
            aria-label="打开 AI 助手"
            onClick={() => setAssistantOpen(true)}
          >
            <Sparkles size={16} />
            <span>Poseidon 助手</span>
          </button>
          <button
            className="avatar"
            aria-label="账号与同步"
            onClick={() => setPage("account")}
          >
            {state.account?.user?.nickname?.slice(0, 1) || "H"}
          </button>
        </header>
        <PanelProvider page={page} key={state.account?.user?.id || "personal"}>
          <ResponsiveViewport className={`page-viewport page-${page}`}>
            <UpdateBanner updates={state.updates} call={call} />
            {state.lastNotice && (
              <div className="notice">
                <span>{state.lastNotice}</span>
                <button
                  className="icon-button"
                  aria-label="关闭通知"
                  onClick={() => call("notice.dismiss")}
                >
                  <X size={15} />
                </button>
              </div>
            )}
            <ModuleOutlet
              page={page}
              context={{
                state,
                call,
                page,
                setPage,
                filter,
                setFilter,
                project,
                setProject,
                projects,
                visible,
                card,
                addTask,
                openAssistant: () => setAssistantOpen(true),
                manageLists: () => setListsOpen(true),
                openManual: (kind = "user") => setManualKind(kind),
                startTour: () => setTourOpen(true),
                openSidebarManager: () => setSidebarManagerOpen(true),
                query,
                setQuery,
                researchSelection,
                setResearchSelection,
                active,
                today,
                todayMs,
                selected: focusTask,
                setSelected: setFocusTask,
                toast: setToast,
                widgetActions: {
                  navigate: setPage,
                  addTask,
                  editTask: setEditor,
                  focusTask: focus,
                  call,
                },
              }}
            />
          </ResponsiveViewport>
        </PanelProvider>
        {state.timer.status !== "idle" && page !== "focus" && (
          <button className="floating-timer" onClick={() => setPage("focus")}>
            <span className={state.timer.status === "running" ? "pulse" : ""} />
            <Timer size={17} />
            {state.timer.taskTitle || "自由专注"}
            <b>
              {timeText(
                state.timer.targetMs
                  ? state.timer.targetMs - elapsed(state.timer)
                  : elapsed(state.timer),
              )}
            </b>
            <ArrowUpRight size={16} />
          </button>
        )}
      </div>
      <AssistantPanel
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        call={call}
        state={state}
        onBriefing={() => {
          setAssistantOpen(false);
          setPage("briefing");
        }}
        onManual={() => {
          setAssistantOpen(false);
          addTask();
        }}
      />
      {editor && (
        <TaskEditor
          task={editor}
          projects={projects}
          onClose={() => setEditor(null)}
          onSave={(form) => call("task.save", form)}
          onDelete={async () => {
            await call("task.delete", { id: editor.id });
            setEditor(null);
          }}
        />
      )}
      {listsOpen && (
        <ListManager
          state={state}
          call={call}
          onClose={() => setListsOpen(false)}
        />
      )}
      {sidebarManagerOpen && (
        <SidebarManager
          nav={NAV}
          workspace={state.workspace}
          call={call}
          onClose={() => setSidebarManagerOpen(false)}
        />
      )}
      {manualKind && (
        <ManualModal
          kind={manualKind}
          call={call}
          onClose={() => setManualKind(null)}
        />
      )}
      {tourOpen && (
        <OnboardingTour
          onFinish={async () => {
            setTourOpen(false);
            await call("workspace.configure", { onboardingVersion: 1 });
          }}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button aria-label="关闭提示" onClick={() => setToast("")}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
