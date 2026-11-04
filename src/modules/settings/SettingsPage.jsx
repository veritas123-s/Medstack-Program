import WorkflowSettings from "./WorkflowSettings.jsx";
import UpdateCenter from "./UpdateCenter.jsx";
import associationLogo from "../../../assets/association-logo.jpg";
import React, { useState } from "react";
import {
  ArrowUpRight,
  Bell,
  CircleHelp,
  Database,
  Download,
  FolderOpen,
  Info,
  Palette,
  RefreshCw,
  Upload,
  UserRound,
} from "lucide-react";
import { APP_LABEL } from "../../version.mjs";
import Panel from "../../shared/Panel.jsx";
import TeamBrand from "../../shared/TeamBrand.jsx";
import LinkedText from "../../shared/LinkedText.jsx";
import "./settings-page.css";

const tabs = [
  ["focus", "专注与提醒", Bell],
  ["appearance", "界面", Palette],
  ["account", "账号", UserRound],
  ["data", "数据", Database],
  ["help", "帮助", CircleHelp],
  ["updates", "版本更新", RefreshCw],
  ["about", "关于", Info],
];

function SettingAction({ icon: Icon, children, onClick }) {
  return (
    <button type="button" className="setting-action" onClick={onClick}>
      {Icon && <Icon size={16} aria-hidden />}
      <span>{children}</span>
      <ArrowUpRight size={14} aria-hidden />
    </button>
  );
}
export default function SettingsPage({
  state,
  call,
  toast,
  setPage,
  openManual,
  startTour,
  openSidebarManager,
}) {
  const [settings, setSettings] = useState(state.settings),
    [saving, setSaving] = useState(false),
    [tab, setTab] = useState("focus");
  return (
    <section className="settings-page">
      <div className="page-heading settings-page-heading">
        <h1>设置</h1>
        <span className="version">{APP_LABEL}</span>
      </div>
      <div className="settings-layout">
        <nav className="settings-tabs" role="tablist" aria-label="设置分类">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id}
              id={`settings-tab-${id}`}
              type="button"
              role="tab"
              aria-selected={tab === id}
              aria-controls={`settings-content-${id}`}
              onClick={() => setTab(id)}
            >
              <Icon size={16} aria-hidden />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div
          className="settings-content"
          role="tabpanel"
          id={`settings-content-${tab}`}
          aria-labelledby={`settings-tab-${tab}`}
        >
          <div hidden={tab !== "focus"}>
            <Panel className="panel" title="专注与提醒">
              <h2>专注与提醒</h2>
              <form
                className="settings-focus-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  setSaving(true);
                  try {
                    await call("settings", settings);
                    toast("设置已保存");
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                <div className="settings-group-label">专注时长</div>
                <div className="form-grid">
                  {[
                    ["focusMinutes", "番茄专注", 180],
                    ["shortMinutes", "短休息", 60],
                    ["longMinutes", "长休息", 120],
                    ["dailyGoal", "每日专注目标", 1440],
                  ].map(([id, label, max]) => (
                    <label key={id}>
                      {label}（分钟）
                      <input
                        type="number"
                        min="1"
                        max={max}
                        required
                        value={settings[id]}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, [id]: e.target.value }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <div className="settings-group-label">通知与窗口</div>
                {[
                  ["notifications", "系统通知"],
                  ["sound", "通知声音"],
                  ["closeToTray", "关闭窗口时收起到托盘"],
                ].map(([id, label]) => (
                  <label className="toggle-row" key={id}>
                    <b>{label}</b>
                    <input
                      type="checkbox"
                      checked={settings[id]}
                      onChange={(e) =>
                        setSettings((s) => ({ ...s, [id]: e.target.checked }))
                      }
                    />
                  </label>
                ))}
                <div className="settings-save">
                  <button className="button primary" disabled={saving}>
                    保存设置
                  </button>
                </div>
              </form>
            </Panel>
            <WorkflowSettings state={state} call={call} />
            <div className="settings-actions">
              <SettingAction onClick={() => setPage("briefing")}>
                早晚报与推送
              </SettingAction>
            </div>
          </div>
          <div hidden={tab !== "appearance"}>
            <Panel className="panel">
              <h2>界面</h2>
              <div className="settings-actions">
                <SettingAction onClick={() => setPage("workbench")}>
                  主题、背景与小组件
                </SettingAction>
                <SettingAction onClick={openSidebarManager}>
                  整理侧栏
                </SettingAction>
              </div>
            </Panel>
          </div>
          <div hidden={tab !== "account"}>
            <Panel className="panel">
              <h2>账号与跨设备同步</h2>
              <p>{state.account?.user?.email}</p>
              <div className="settings-actions">
                <SettingAction onClick={() => setPage("account")}>
                  管理账号与同步
                </SettingAction>
                <SettingAction
                  onClick={async () => {
                    await call("school.logout");
                    toast("学校登录已退出");
                  }}
                >
                  退出学校登录
                </SettingAction>
              </div>
            </Panel>
          </div>
          <div hidden={tab !== "data"}>
            <Panel className="panel">
              <h2>备份与恢复</h2>
              <div className="settings-actions">
                <SettingAction
                  icon={Download}
                  onClick={() => call("export.backup")}
                >
                  导出完整备份
                </SettingAction>
                <SettingAction
                  icon={Upload}
                  onClick={() => call("import.backup")}
                >
                  从备份恢复
                </SettingAction>
                <SettingAction
                  icon={FolderOpen}
                  onClick={() => call("data.folder")}
                >
                  打开数据文件夹
                </SettingAction>
              </div>
              <details>
                <summary>备份范围</summary>
                <p>备份本机工作空间，不包含校园登录凭据。恢复前自动备份。</p>
              </details>
            </Panel>
          </div>
          <div hidden={tab !== "help"}>
            <Panel className="panel">
              <h2>帮助与手册</h2>
              <div className="settings-actions">
                <SettingAction onClick={() => openManual("user")}>
                  使用说明
                </SettingAction>
                <SettingAction onClick={() => openManual("developer")}>
                  开发者手册 · Zeus
                </SettingAction>
                <SettingAction onClick={startTour}>
                  重新播放新手教程
                </SettingAction>
              </div>
            </Panel>
          </div>
          <div hidden={tab !== "updates"}>
            <Panel className="panel">
              <UpdateCenter
                updates={state.updates}
                call={call}
                toast={toast}
                userId={state.account?.user?.id}
              />
            </Panel>
          </div>
          <div hidden={tab !== "about"}>
            <Panel className="panel">
              <div className="about-brand-lockup">
                <img src={associationLogo} alt="交叉学科创协" />
                <TeamBrand />
              </div>
              <h2>医栈通</h2>
              <p>{APP_LABEL}</p>
              <p>开发者 · 交叉学科创协Medtrix工作室</p>
            </Panel>
            <Panel className="panel" title="联系我们">
              <h2>联系我们</h2>
              <p>
                微信：<span className="contact-wechat">Veritas_Enterprise</span>
              </p>
              <button
                className="button"
                onClick={async () => {
                  try {
                    await call("contact.copy");
                    toast("微信号已复制");
                  } catch {
                    toast("请选中微信号复制");
                  }
                }}
              >
                复制微信号
              </button>
            </Panel>
            <Panel className="panel" title="鸣谢 SJTU Agent">
              <h2>鸣谢 SJTU Agent</h2>
              <LinkedText
                text="感谢 [kuan-er](https://github.com/kuan-er) 开发的 [SJTU Agent](https://github.com/kuan-er/sjtu-agent)。校园新闻关键词排序、主题订阅和屏蔽规则参考并改写自该项目。"
                call={call}
              />
              <p>Copyright (c) 2026 kuan-er · MIT License</p>
              <p>完整许可随应用安装在 licenses/SJTU-AGENT-MIT.txt。</p>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}
