import React, { useEffect, useState } from "react";
import "./update-center.css";

function UpdateActions({ updates, call, children }) {
  const [error, setError] = useState(""),
    [starting, setStarting] = useState(false);
  const install = updates?.installation;
  const canInstall = updates?.available && install?.supported;
  const busy =
    canInstall &&
    (starting ||
      ["downloading", "verifying", "preparing", "installing"].includes(
        install.phase,
      ));
  const downloading = install?.phase === "downloading";
  const percent =
    downloading && install.total > 0
      ? Math.min(100, Math.floor((install.received / install.total) * 100))
      : undefined;
  const label =
    {
      downloading: percent === undefined ? "下载中" : `下载中 ${percent}%`,
      verifying: "校验中…",
      preparing: "准备安装…",
      installing: "安装中…",
    }[install?.phase] || "准备中…";
  const failure = canInstall && (error || install.error);
  return (
    <div className="release-actions">
      {busy ? (
        <div className="release-progress">
          <span role="status">{label}</span>
          {downloading && (
            <progress aria-label="下载进度" max={100} value={percent} />
          )}
        </div>
      ) : (
        <>
          {canInstall && (
            <button
              className="button primary small"
              onClick={async () => {
                setStarting(true);
                setError("");
                try {
                  await call("updates.install");
                } catch (e) {
                  setError(e.message);
                } finally {
                  setStarting(false);
                }
              }}
            >
              一键更新
            </button>
          )}
          {children}
        </>
      )}
      {!busy && failure && (
        <p className="release-error" role="alert">
          {failure}
        </p>
      )}
    </div>
  );
}
export function UpdateBanner({ updates, call }) {
  if (!updates?.available || updates.dismissed) return null;
  const { title, version, urgent, notes, downloads } = updates.release;
  return (
    <section
      className={`release-banner ${urgent ? "urgent" : ""}`}
      aria-label="版本更新"
    >
      <div className="release-heading">
        <strong>
          {urgent ? "重要更新 · " : ""}
          {title}
        </strong>
        {!title.includes(version) && <span>V{version}</span>}
      </div>
      <UpdateActions updates={updates} call={call}>
        {downloads[updates.platform] && (
          <button
            className="button small"
            onClick={() => call("updates.download")}
          >
            下载安装包
          </button>
        )}
        <button
          className="button small"
          onClick={() => call("updates.dismiss")}
        >
          稍后提醒
        </button>
      </UpdateActions>
      <details>
        <summary>更新内容</summary>
        <ul>
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
export default function UpdateCenter({ updates, call, toast, userId }) {
  const [email, setEmail] = useState(null),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false);
  useEffect(() => {
    let active = true;
    setEmail(null);
    setError("");
    call("updates.email")
      .then((d) => {
        if (active) setEmail(d.emailUpdates);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [userId]);
  return (
    <section aria-label="更新通知中心">
      <h2>版本更新</h2>
      <p>当前版本 V{updates?.installed}</p>
      <button
        className="button"
        disabled={updates?.busy}
        onClick={() => call("updates.check")}
      >
        {updates?.busy ? "检查中…" : "检查更新"}
      </button>
      {updates?.error && <p role="status">{updates.error}</p>}
      {updates?.release && (
        <>
          <h3>
            {updates.available ? "新版已发布" : "最新公告"} · V
            {updates.release.version}
          </h3>
          <ul>
            {updates.release.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
          <UpdateActions updates={updates} call={call}>
            {Object.keys(updates.release.downloads).map((platform) => (
              <button
                key={platform}
                className="button small"
                onClick={() => call("updates.download", { platform })}
              >
                {
                  {
                    windows: "Windows 安装包",
                    android: "安卓安装包",
                    macos_x64: "macOS · Intel",
                    macos_arm64: "macOS · Apple 芯片",
                  }[platform]
                }
              </button>
            ))}
          </UpdateActions>
        </>
      )}
      <label className="toggle-row">
        <b>通过邮箱接收版本更新</b>
        <input
          aria-label="通过邮箱接收版本更新"
          type="checkbox"
          checked={email === true}
          disabled={email === null || saving}
          onChange={async (e) => {
            setSaving(true);
            try {
              const d = await call("updates.email", {
                emailUpdates: e.target.checked,
              });
              setEmail(d.emailUpdates);
              toast(d.emailUpdates ? "已订阅后续更新" : "已取消订阅");
            } catch (e) {
              setError(e.message);
            } finally {
              setSaving(false);
            }
          }}
        />
      </label>
      {error && <p role="status">{error}</p>}
    </section>
  );
}
