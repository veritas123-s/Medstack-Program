import { ENTRY, isSchoolURL, schoolJSON } from "./campus.mjs";

function schoolLoginForm(expectedURL, action, credentials) {
  if (location.href !== expectedURL) return "changed";
  const challenge = [
    ...document.querySelectorAll(
      'input[name="authcode" i], input[name*="captcha" i], input[name*="otp" i]',
    ),
  ].some((field) => field.getClientRects().length > 0);
  if (challenge || /滑块验证|短信验证|扫码验证/.test(document.body.innerText))
    return "challenge";
  const user = document.querySelector('input[name="username"]');
  const pass = document.querySelector('input[name="password"]');
  const form = pass?.form;
  if (!form || user?.form !== form) return "no-form";
  const target = new URL(form.action, location.href);
  if (target.origin !== location.origin) return "changed";
  if (action === "fill") {
    for (const [field, value] of [
      [user, credentials.username],
      [pass, credentials.password],
    ]) {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      ).set.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
  } else if (action === "submit") {
    const button = form.querySelector(
      'button[type="submit"],input[type="submit"],button',
    );
    if (button) button.click();
    else form.requestSubmit();
  }
  return "form";
}

export function cookieForRestore(cookie, now = Date.now() / 1000) {
  if (
    !cookie ||
    typeof cookie.domain !== "string" ||
    typeof cookie.name !== "string" ||
    typeof cookie.value !== "string"
  )
    return null;
  const host = cookie.domain.replace(/^\./, "");
  if (
    !isSchoolURL(`https://${host}/`) ||
    (cookie.expirationDate && cookie.expirationDate <= now)
  )
    return null;
  const result = {
    url: `https://${host}${cookie.path || "/"}`,
    name: cookie.name,
    value: cookie.value,
    path: cookie.path || "/",
    secure: !!cookie.secure,
    httpOnly: !!cookie.httpOnly,
    sameSite: cookie.sameSite || "unspecified",
  };
  if (!cookie.hostOnly) result.domain = cookie.domain;
  if (cookie.expirationDate) result.expirationDate = cookie.expirationDate;
  return result;
}
export class CampusAuth {
  constructor({ session, BrowserWindow, vault, changed }) {
    Object.assign(this, { session, BrowserWindow, vault, changed });
    this.window = null;
    this.backgroundWindow = null;
    this.revision = 0;
    this.pending = null;
    this.lastAttempt = 0;
    this.phase = "idle";
    this.message = vault.warning || "登录后会加密记住会话，下次自动恢复。";
    this.saving = null;
    this.generation = 0;
    this.restoring = false;
  }
  status() {
    return { ...this.vault.status(), phase: this.phase, message: this.message };
  }
  set(phase, message) {
    this.phase = phase;
    this.message = message;
    this.changed?.();
  }
  async initialize() {
    this.restoring = true;
    let restored = 0;
    for (const cookie of this.vault.data.cookies) {
      const details = cookieForRestore(cookie);
      if (details)
        try {
          await this.session.cookies.set(details);
          restored++;
        } catch {
          this.message = "部分会话已失效，同步时会尝试重新认证。";
        }
    }
    this.restoring = false;
    if (restored) this.set("restored", "已恢复加密会话，同步时验证学校连接。");
    this.session.cookies.on("changed", () => {
      if (!this.restoring && this.vault.data.remember) {
        clearTimeout(this.saving);
        this.saving = setTimeout(
          () =>
            this.persist().catch(() =>
              this.set("attention", "会话加密保存失败，当前窗口仍可使用。"),
            ),
          400,
        );
      }
    });
  }
  async persist() {
    if (!this.vault.data.remember) return;
    const generation = this.generation;
    const cookies = (await this.session.cookies.get({})).filter((c) =>
      cookieForRestore(c),
    );
    if (generation !== this.generation || !this.vault.data.remember) return;
    this.vault.save({ cookies });
  }
  configure({ username, password, remember = true }) {
    const patch = { remember: !!remember };
    if (username || password) {
      if (
        typeof username !== "string" ||
        typeof password !== "string" ||
        !username.trim() ||
        !password ||
        username.length > 200 ||
        password.length > 1000
      )
        throw new Error("请填写有效账号和密码");
      patch.credentials = { username: username.trim(), password };
    }
    if (!remember) {
      patch.credentials = null;
      patch.cookies = [];
    }
    this.vault.save(patch);
    this.generation++;
    if (this.backgroundWindow && !this.backgroundWindow.isDestroyed())
      this.backgroundWindow.destroy();
    this.lastAttempt = 0;
    this.set(
      "idle",
      patch.credentials
        ? "已加密保存，下次会话过期时尝试自动登录。"
        : "登录设置已保存。",
    );
  }
  async open(url) {
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      if (url || this.phase === "attention")
        await this.load(this.window, url || ENTRY);
      return this.window;
    }
    const window = (this.window = this.createWindow(true));
    await this.load(window, url || ENTRY);
    return window;
  }
  createWindow(visible) {
    const window = new this.BrowserWindow({
      width: 1180,
      height: 820,
      show: visible,
      title: "医栈通 · 学校认证",
      autoHideMenuBar: true,
      webPreferences: {
        session: this.session,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });
    const guard = (e, url) => {
      if (!isSchoolURL(url)) e.preventDefault();
    };
    window.webContents.on("will-navigate", guard);
    window.webContents.on("will-redirect", guard);
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (isSchoolURL(url))
        window
          .loadURL(url)
          .catch(() => this.set("attention", "学校页面未能打开"));
      return { action: "deny" };
    });
    window.webContents.on("did-finish-load", () =>
      this.persist().catch(() => this.set("attention", "学校会话未能保存")),
    );
    return window;
  }
  async load(window, url) {
    let timer;
    try {
      await Promise.race([
        window.loadURL(url),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error("学校认证超时")), 25000);
        }),
      ]);
    } catch {
      throw new Error("学校认证页面加载失败，请检查网络。");
    } finally {
      clearTimeout(timer);
    }
  }
  async renew() {
    if (this.pending) return this.pending;
    if (this.phase === "attention") throw new Error(this.message);
    if (Date.now() - this.lastAttempt < 60000)
      throw new Error(
        "自动登录未完成，请在学校窗口验证后重试；不会连续尝试密码。",
      );
    this.lastAttempt = Date.now();
    const generation = this.generation;
    this.pending = (async () => {
      this.set("renewing", "正在通过学校认证恢复会话…");
      const window = (this.backgroundWindow = this.createWindow(false));
      await this.load(window, ENTRY);
      const url = window.webContents.getURL();
      if (!isSchoolURL(url)) throw new Error("学校认证地址不在允许范围内");
      const runForm = async (action, credentials = null) => {
        if (generation !== this.generation) throw new Error("登录状态已更改");
        const args = JSON.stringify([url, action, credentials]).replace(
          /</g,
          "\\u003c",
        );
        const result = await window.webContents
          .executeJavaScript(`(${schoolLoginForm})(...${args})`)
          .catch(() => {
            throw new Error("无法操作学校登录表单，请检查学校连接。");
          });
        if (
          result === "challenge" ||
          result === "changed" ||
          (result === "no-form" && action !== "probe")
        ) {
          this.set("attention", "学校要求验证，请打开「学校连接」继续。");
          throw new Error(this.message);
        }
        return result;
      };
      if ((await runForm("probe")) === "form") {
        if (!this.vault.data.credentials) {
          this.set("attention", "请在教务服务的「学校连接」完成验证。");
          throw new Error(this.message);
        }
        await runForm("fill", this.vault.data.credentials);
        const loaded = new Promise((resolve) => {
          const timer = setTimeout(resolve, 8000);
          window.webContents.once("did-finish-load", () => {
            clearTimeout(timer);
            resolve();
          });
        });
        await runForm("submit");
        await loaded;
      }
      if (generation !== this.generation) throw new Error("登录状态已更改");
      this.revision++;
    })()
      .catch((error) => {
        if (generation === this.generation && this.phase === "renewing")
          this.set("error", error.message);
        throw error;
      })
      .finally(() => {
        if (this.backgroundWindow && !this.backgroundWindow.isDestroyed())
          this.backgroundWindow.destroy();
        this.backgroundWindow = null;
        this.pending = null;
      });
    return this.pending;
  }
  async withSession(operation) {
    const revision = this.revision;
    const generation = this.generation;
    const checkAccess = () => {
      if (generation !== this.generation) throw new Error("登录状态已更改");
    };
    let data;
    try {
      data = await operation();
    } catch (error) {
      if (error.code !== "AUTH_REQUIRED") throw error;
      checkAccess();
      if (revision === this.revision) await this.renew();
      checkAccess();
      try {
        data = await operation();
      } catch (retryError) {
        checkAccess();
        if (retryError.code !== "AUTH_REQUIRED") throw retryError;
        this.set("attention", "学校仍需要验证，请打开「学校连接」完成验证。");
        throw new Error(this.message);
      }
    }
    checkAccess();
    this.set("connected", "学校连接有效");
    await this.persist().catch(() =>
      this.set("connected", "学校连接有效，会话加密保存失败"),
    );
    checkAccess();
    return data;
  }
  request(base, route, params) {
    return this.withSession(() =>
      schoolJSON(this.session, base, route, params),
    );
  }
  cancel() {
    this.generation++;
    clearTimeout(this.saving);
    if (this.backgroundWindow && !this.backgroundWindow.isDestroyed())
      this.backgroundWindow.destroy();
    this.backgroundWindow = null;
    if (this.window && !this.window.isDestroyed()) this.window.destroy();
  }
  async logout() {
    this.cancel();
    this.vault.clear();
    await this.session.clearStorageData();
    await this.session.clearCache();
    this.lastAttempt = 0;
    this.set("idle", "已清除账号和会话；课表缓存仍保留。");
  }
}
