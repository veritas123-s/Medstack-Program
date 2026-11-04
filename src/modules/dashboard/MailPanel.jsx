import React, { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Mail, Settings2, X } from "lucide-react";

const webmail = "https://mail.sjtu.edu.cn/";
const mailTime = new Intl.DateTimeFormat("zh-CN", {
  timeZone: "Asia/Shanghai",
  month: "numeric",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

export default function MailPanel({ call }) {
  const dialog = useRef(null);
  const [data, setData] = useState({ configured: false, items: [] });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    const refresh = () =>
      window.veritas
        .call("mail.state")
        .then((next) => {
          if (active) setData(next);
        })
        .catch(() => {});
    refresh();
    const timer = setInterval(refresh, 5 * 60_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  const setup = () => {
    setError("");
    dialog.current.showModal();
  };
  return (
    <section className="day-column activity-card" aria-label="最新邮件">
      <header className="activity-heading">
        <h2>
          <Mail size={16} />
          最新邮件
        </h2>
        {data.configured && (
          <>
            <button
              className="day-link"
              type="button"
              aria-label="邮箱设置"
              onClick={setup}
            >
              <Settings2 size={15} />
            </button>
            <button
              className="day-link"
              type="button"
              aria-label="打开交大邮箱"
              onClick={() => call("link.open", { url: webmail })}
            >
              <ArrowUpRight size={15} />
            </button>
          </>
        )}
      </header>
      {!data.configured ? (
        <button type="button" className="button small" onClick={setup}>
          连接交大邮箱
        </button>
      ) : (
        <>
          {data.error && (
            <p className="day-empty" role="status">
              {data.error}
            </p>
          )}
          {data.items.slice(0, 3).map((item) => (
            <button
              type="button"
              className="day-row mail-row"
              key={item.uid}
              title={item.subject}
              onClick={() => call("link.open", { url: webmail })}
            >
              <span
                className={`mail-dot ${item.unread ? "mail-unread" : ""}`}
                aria-label={item.unread ? "未读" : "已读"}
              />
              <span className="day-row-text">
                <b>{item.subject}</b>
                <small>{item.sender}</small>
              </span>
              {item.time > 0 && <time>{mailTime.format(item.time)}</time>}
            </button>
          ))}
          {!data.error && !data.items.length && (
            <p className="day-empty">收件箱暂无邮件</p>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        className="weather-location-dialog mail-dialog"
        aria-labelledby="mail-title"
      >
        <header>
          <h2 id="mail-title">交大邮箱</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭邮箱设置"
            onClick={() => dialog.current.close()}
          >
            <X size={17} />
          </button>
        </header>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            const values = new FormData(form);
            setBusy(true);
            setError("");
            try {
              setData(
                await call("mail.configure", {
                  username: values.get("username"),
                  password: values.get("password"),
                }),
              );
              form.reset();
              dialog.current.close();
            } catch (e) {
              setError(e.message);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            交大邮箱或 jAccount
            <input
              name="username"
              autoComplete="username"
              required
              maxLength={96}
            />
          </label>
          <label>
            邮箱密码
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={512}
            />
          </label>
          <p>仅在本机加密保存。首页只读邮件标题、发件人与时间。</p>
          {error && <p role="alert">{error}</p>}
          <div className="mail-actions">
            <button
              className="button primary small"
              type="submit"
              disabled={busy}
            >
              {busy ? "连接中…" : "连接"}
            </button>
            {data.configured && (
              <button
                type="button"
                className="button small"
                disabled={busy}
                onClick={async () => {
                  setData(await call("mail.disconnect"));
                  dialog.current.close();
                }}
              >
                断开邮箱
              </button>
            )}
          </div>
        </form>
      </dialog>
    </section>
  );
}
