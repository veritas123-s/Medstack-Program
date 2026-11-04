import { ImapFlow } from "imapflow";

const MAIL_HOST = "mail.sjtu.edu.cn";
const REFRESH_INTERVAL = 5 * 60_000;
const clean = (value, limit) =>
  String(value || "")
    .replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ")
    .trim()
    .slice(0, limit);

export function mailCredentials({ username, password } = {}) {
  const user =
    typeof username === "string"
      ? username.trim().replace(/@sjtu\.edu\.cn$/i, "")
      : "";
  if (
    !/^[a-z\d._-]{1,80}$/i.test(user) ||
    typeof password !== "string" ||
    !password ||
    password.length > 512
  )
    throw Error("请填写交大邮箱或 jAccount，以及邮箱密码");
  return { user, pass: password };
}

export async function readRecentMail(auth, signal, Client = ImapFlow) {
  signal.throwIfAborted();
  const client = new Client({
    host: MAIL_HOST,
    port: 993,
    secure: true,
    auth,
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 12_000,
    disableAutoIdle: true,
  });
  client.on("error", () => {});
  const close = () => client.close();
  signal.addEventListener("abort", close, { once: true });
  let lock;
  try {
    await client.connect();
    lock = await client.getMailboxLock("INBOX", {
      readOnly: true,
      acquireTimeout: 10_000,
    });
    const count = client.mailbox?.exists || 0;
    if (!count) return [];
    const rows = [];
    for await (const { uid, envelope, flags, internalDate } of client.fetch(
      `${Math.max(1, count - 5)}:${count}`,
      {
        uid: true,
        envelope: true,
        flags: true,
        internalDate: true,
      },
    )) {
      signal.throwIfAborted();
      const sender = envelope?.from?.[0];
      rows.push({
        uid,
        subject: clean(envelope?.subject, 220) || "（无主题）",
        sender: clean(sender?.name || sender?.address, 120) || "未知发件人",
        time: Number(internalDate) || 0,
        unread: !flags?.has("\\Seen"),
      });
    }
    return rows.sort((a, b) => b.time - a.time || b.uid - a.uid);
  } finally {
    signal.removeEventListener("abort", close);
    lock?.release();
    client.close();
  }
}

export class SjtuMail {
  constructor(secrets, read = readRecentMail) {
    this.secrets = secrets;
    this.read = read;
    this.items = [];
    this.error = "";
    this.authFailed = false;
    this.attemptedAt = 0;
    this.pending = null;
  }
  status() {
    return {
      configured: !!this.secrets.load().user,
      items: this.items,
      error: this.error || this.secrets.warning,
    };
  }
  refresh(force = false) {
    const saved = this.secrets.load();
    if (this.pending) return this.pending.promise;
    if (
      !saved.user ||
      !saved.pass ||
      this.authFailed ||
      (!force && Date.now() - this.attemptedAt < REFRESH_INTERVAL)
    )
      return this.status();
    return this.connect(saved);
  }
  configure(input) {
    const auth = mailCredentials(input);
    this.pending?.controller.abort();
    return this.connect(auth, true);
  }
  connect(auth, save = false) {
    const controller = new AbortController();
    const request = { controller, promise: null };
    this.pending = request;
    this.attemptedAt = Date.now();
    const signal = AbortSignal.any([
      controller.signal,
      AbortSignal.timeout(20_000),
    ]);
    request.promise = (async () => {
      try {
        const items = await this.read(auth, signal);
        signal.throwIfAborted();
        if (save) this.secrets.save(auth);
        this.items = items;
        this.error = "";
        this.authFailed = false;
      } catch (error) {
        controller.signal.throwIfAborted();
        const denied =
          error.authenticationFailed ||
          error.serverResponseCode === "AUTHENTICATIONFAILED";
        this.error = denied
          ? "邮箱登录失败，请核对账号与密码"
          : "暂时无法读取交大邮箱";
        if (!save) this.authFailed = !!denied;
        if (save) throw Error(this.error);
      } finally {
        if (this.pending === request) this.pending = null;
      }
      return this.status();
    })();
    return request.promise;
  }
  suspend() {
    this.pending?.controller.abort();
    this.pending = null;
    this.items = [];
    this.attemptedAt = 0;
  }
  disconnect() {
    this.secrets.clear();
    this.suspend();
    this.error = "";
    this.authFailed = false;
    return this.status();
  }
}
