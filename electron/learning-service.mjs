import { mergeNotices } from "../src/learning-policy.mjs";
import fs from "node:fs";
import path from "node:path";
import { learningTaskId } from "./workflows.mjs";
import {
  isLearningURL,
  parseCourses,
  parseLearningHTML,
  parseDeadline,
  parseNotices,
} from "./learning-parser.mjs";
const LOGIN = "https://i.chaoxing.com/";
const NOTICES = "https://notice.chaoxing.com/pc/notice/myNotice";
export class LearningService {
  constructor({
    directory,
    session,
    parserSession,
    BrowserWindow,
    secrets,
    changed,
    onSynced,
    getOptions = () => ({}),
  }) {
    Object.assign(this, {
      session,
      parserSession,
      BrowserWindow,
      secrets,
      changed,
      onSynced,
      getOptions,
    });
    this.generation = 0;
    this.busy = false;
    this.lastAttempt = 0;
    this.file = path.join(directory, "learning-cache.json");
    this.data = {
      version: 1,
      items: [],
      lastSuccess: 0,
      courseCount: 0,
      coveredCourses: 0,
    };
    this.message = "扫码连接后，自动读取课程作业与通知。";
    if (fs.existsSync(this.file))
      try {
        const d = JSON.parse(fs.readFileSync(this.file, "utf8"));
        if (
          d.version !== 1 ||
          !Array.isArray(d.items) ||
          d.items.length > 10000
        )
          throw Error();
        this.data = d;
      } catch {
        this.locked = true;
        this.message = "学习通缓存无法读取，原文件已保留。";
      }
  }
  status() {
    return {
      ...this.data,
      items: this.data.items.map((x) => ({
        ...x,
        ...(x.kind === "assignment" ? { taskId: learningTaskId(x.id) } : {}),
      })),
      connected: !this.needsLogin && !!this.secrets.data.cookies?.length,
      needsLogin: !!this.needsLogin,
      busy: this.busy,
      message: this.secrets.warning || this.message,
    };
  }
  async initialize() {
    this.session.setPermissionRequestHandler((_w, _p, cb) => cb(false));
    this.session.on("will-download", (e) => e.preventDefault());
    this.session.webRequest.onBeforeRequest((d, cb) =>
      cb({
        cancel:
          !isLearningURL(d.url) &&
          !d.url.startsWith("data:") &&
          !d.url.startsWith("blob:"),
      }),
    );
    this.parserSession.webRequest.onBeforeRequest((d, cb) =>
      cb({ cancel: !d.url.startsWith("data:") }),
    );
    for (const c of this.secrets.data.cookies || []) {
      const host = String(c.domain || "").replace(/^\./, "");
      if (
        !isLearningURL(`https://${host}`) ||
        (c.expirationDate && c.expirationDate < Date.now() / 1000)
      )
        continue;
      const {
        name,
        value,
        path = "/",
        secure,
        httpOnly,
        sameSite,
        expirationDate,
      } = c;
      try {
        await this.session.cookies.set({
          url: `https://${host}${path}`,
          name,
          value,
          path,
          secure,
          httpOnly,
          sameSite,
          ...(!c.hostOnly ? { domain: c.domain } : {}),
          ...(expirationDate ? { expirationDate } : {}),
        });
      } catch {}
    }
    this.session.cookies.on("changed", () => {
      clearTimeout(this.pending);
      this.pending = setTimeout(
        () =>
          this.persist().catch(() => {
            this.message = "会话加密保存失败，请重新连接";
            this.changed();
          }),
        500,
      );
    });
  }
  async persist() {
    if (this.disconnected) return;
    const gen = this.generation;
    const cookies = (await this.session.cookies.get({})).filter((c) =>
      isLearningURL("https://" + c.domain.replace(/^\./, "")),
    );
    if (gen !== this.generation) return;
    if (Buffer.byteLength(JSON.stringify(cookies)) > 50000)
      throw Error("会话过大");
    this.secrets.save({ cookies });
  }
  async open(kind = "login") {
    this.disconnected = false;
    const url = kind === "notices" ? NOTICES : LOGIN;
    if (this.window && !this.window.isDestroyed()) {
      this.window.show();
      this.window.focus();
      if (kind === "notices" || this.needsLogin) await this.window.loadURL(url);
      return;
    }
    const w = (this.window = new this.BrowserWindow({
      width: 1150,
      height: 820,
      title: "学习通 · 官方登录",
      autoHideMenuBar: true,
      webPreferences: {
        session: this.session,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    }));
    w.webContents.setWindowOpenHandler(({ url }) => {
      if (isLearningURL(url)) w.loadURL(url).catch(() => {});
      return { action: "deny" };
    });
    for (const event of ["will-navigate", "will-redirect"])
      w.webContents.on(event, (e, u) => {
        if (!isLearningURL(u)) e.preventDefault();
      });
    w.webContents.on("did-finish-load", () => {
      this.persist().catch(() => {});
      if (!/passport|\/login/.test(w.webContents.getURL())) {
        if (this.needsLogin) this.lastAttempt = 0;
        clearTimeout(this.loginSync);
        this.loginSync = setTimeout(() => this.sync().catch(() => {}), 1800);
      }
    });
    w.on("closed", () => {
      this.window = null;
      this.persist().catch(() => {});
      this.sync().catch(() => {});
    });
    await w.loadURL(url);
  }
  async read(url, options = {}) {
    for (let i = 0; i < 6; i++) {
      if (!isLearningURL(url)) throw Error("学习通重定向超出允许域名");
      const response = await this.session.fetch(url, {
        ...options,
        credentials: "include",
        redirect: "follow",
        signal: AbortSignal.timeout(20000),
      });
      if (response.url && !isLearningURL(response.url))
        throw Error("学习通响应超出允许域名");
      if (
        response.status === 401 ||
        (response.url && /passport|\/login/.test(response.url))
      )
        throw Object.assign(Error("学习通会话已失效"), {
          code: "AUTH_REQUIRED",
        });
      if (response.status >= 300 && response.status < 400) {
        url = new URL(response.headers.get("location"), url).href;
        continue;
      }
      if (!response.ok) throw Error("学习通请求未成功，请检查登录与网络");
      const reader = response.body.getReader();
      let size = 0,
        chunks = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 3000000) {
          await reader.cancel();
          throw Error("学习通响应过大");
        }
        chunks.push(value);
      }
      return Buffer.concat(chunks).toString("utf8");
    }
    throw Error("学习通需要重新登录");
  }
  async parse(html, kind) {
    if (!this.parser || this.parser.isDestroyed()) {
      this.parser = new this.BrowserWindow({
        show: false,
        webPreferences: {
          session: this.parserSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });
      await this.parser.loadURL(
        'data:text/html,<meta http-equiv="Content-Security-Policy" content="default-src %27none%27">',
      );
    }
    return this.parser.webContents.executeJavaScript(
      `(${parseLearningHTML.toString()})(${JSON.stringify(html)},${JSON.stringify(kind)})`,
    );
  }
  async sync() {
    if (this.disconnected) return;
    if (this.busy) return;
    if (this.locked) throw Error(this.message);
    if (Date.now() - this.lastAttempt < 60000)
      throw Error("请至少间隔一分钟再同步");
    this.lastAttempt = Date.now();
    this.busy = true;
    const gen = this.generation;
    this.message = "正在读取学习通…";
    this.changed();
    const pause = () => new Promise((r) => setTimeout(r, 650));
    try {
      const courseResponse = JSON.parse(
        await this.read(
          "https://mooc1-api.chaoxing.com/mycourse/backclazzdata?view=json&rss=1",
        ),
      );
      const options = this.getOptions?.() || {};
      const catalog = parseCourses(courseResponse, { includeArchived: true });
      if (gen !== this.generation) return;
      this.needsLogin = false;
      const courses = catalog.filter(
        (c) =>
          options.courseChoices?.[c.key] !== "hide" &&
          (!c.archived ||
            options.includeArchived ||
            options.courseChoices?.[c.key] === "follow"),
      );
      let next = [...this.data.items],
        covered = 0,
        noticeOk = false,
        warnings = [];
      for (const c of courses.slice(0, 30)) {
        if (gen !== this.generation) return;
        await pause();
        try {
          const { enc, stuenc, openc } = await this.parse(
            await this.read(
              `https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid=${c.id}&clazzid=${c.classId}&cpi=${c.cpi}&ismooc2=1&v=2`,
            ),
            "course",
          );
          if (!/^[a-zA-Z0-9_-]{16,200}$/.test(enc)) throw Error();
          let collected = [],
            pages = 1;
          for (let page = 1; page <= pages; page++) {
            await pause();
            const r = await this.parse(
              await this.read(
                `https://mooc1.chaoxing.com/mooc2/work/list?courseId=${c.id}&classId=${c.classId}&cpi=${c.cpi}&enc=${encodeURIComponent(enc)}&stuenc=${encodeURIComponent(stuenc)}&openc=${encodeURIComponent(openc)}&ut=s&t=${Date.now()}&isdisplaytable=2&pageNum=${page}`,
              ),
              "work",
            );
            if (!r.recognized || r.pages > 20) throw Error();
            pages = r.pages;
            for (const x of r.rows) {
              if (!isLearningURL(x.url)) continue;
              const u = new URL(x.url),
                workId = u.searchParams.get("workId");
              if (!/^\d+$/.test(workId || "")) continue;
              let timing = parseDeadline(x.time);
              if (
                (!timing.deadline || timing.estimated) &&
                !/已完成|已提交|已批|待批|已互[评評]/.test(x.status) &&
                collected.length < 60
              ) {
                try {
                  await pause();
                  const detail = await this.parse(
                    await this.read(u.href),
                    "deadline",
                  );
                  const exact = parseDeadline(detail.text);
                  if (exact.deadline) timing = exact;
                } catch {}
              }
              collected.push({
                id: `work:${c.id}:${c.classId}:${workId}`,
                courseKey: `${c.id}:${c.classId}`,
                kind: "assignment",
                title: x.title,
                course: c.title,
                status: x.status,
                done: /已完成|已提交|已批|待批|已互[评評]/.test(x.status),
                closed:
                  /已截止|已结束|已过期/.test(x.status) &&
                  !/可补交|允许补交/.test(x.status),
                ...timing,
                updatedAt: Date.now(),
              });
            }
          }
          next = next
            .filter((x) => x.courseKey !== `${c.id}:${c.classId}`)
            .concat(collected);
          covered++;
        } catch {
          warnings.push(c.title);
        }
      }
      try {
        let cursor = "",
          notices = [];
        for (let i = 0; i < 5; i++) {
          await pause();
          const data = JSON.parse(
            await this.read(
              "https://notice.chaoxing.com/pc/notice/getNoticeList",
              {
                method: "POST",
                headers: {
                  "Content-Type": "application/x-www-form-urlencoded",
                  Referer: NOTICES,
                },
                body: new URLSearchParams({
                  type: "0",
                  notice_type: "0",
                  lastValue: cursor,
                  sort: "0",
                  folderUUID: "",
                  kw: "",
                  startTime: "",
                  endTime: "",
                  gKw: "",
                  gName: "",
                  year: "",
                  tag: "",
                  fidsCode: "",
                  filterSenderPuids: "",
                  filterTags: "",
                }).toString(),
              },
            ),
          );
          const parsed = parseNotices(data);
          notices.push(...parsed.items);
          if (
            parsed.lastPage ||
            !parsed.items.length ||
            !parsed.cursor ||
            String(parsed.cursor) === cursor
          )
            break;
          cursor = String(parsed.cursor);
        }
        // Keep older notices; list pagination is deliberately bounded.
        next = [
          ...next.filter((x) => x.kind !== "notice"),
          ...mergeNotices([
            ...next.filter((x) => x.kind === "notice"),
            ...notices,
          ]),
        ];
        noticeOk = true;
      } catch {
        warnings.push("通知中心");
      }
      if (gen !== this.generation) return;
      if (covered === 0 && courses.length && !noticeOk)
        throw Error("本次未成功读取，已保留上次缓存；请检查登录或平台页面变化");
      const nextData = {
        version: 1,
        items: next.slice(-10000),
        lastSuccess: Date.now(),
        courseCount: courses.length,
        totalCourses: courseResponse.channelList.length,
        courses: catalog.map(({ key, id, classId, title, archived }) => ({
          key,
          id,
          classId,
          title,
          archived,
        })),
        catalogComplete: true,
        coveredCourses: covered,
        noticeOk,
      };
      fs.writeFileSync(this.file + ".tmp", JSON.stringify(nextData), {
        mode: 0o600,
      });
      fs.renameSync(this.file + ".tmp", this.file);
      this.data = nextData;
      this.message = `作业覆盖 ${covered}/${courses.length} 门所选课程（账户共 ${courseResponse.channelList.length} 门）；${noticeOk ? "已读取最近通知（最多 5 页）" : "通知待重试"}${warnings.length ? "。部分数据未更新，保留历史缓存。" : ""}`;
      await this.persist();
      await this.onSynced?.(this.data.items);
    } catch (error) {
      if (gen !== this.generation) return;
      if (error.code === "AUTH_REQUIRED") this.needsLogin = true;
      this.message = this.needsLogin
        ? "学习通会话已过期，请扫码恢复。上次同步的数据仍可查看。"
        : "同步未完成，保留上次缓存。请检查网络后重试。";
      throw Error(this.message);
    } finally {
      this.busy = false;
      this.changed();
    }
  }
  async logout() {
    if (this.busy) throw Error("请等待同步结束再断开连接");
    this.disconnected = true;
    this.needsLogin = false;
    this.lastAttempt = 0;
    this.generation++;
    clearTimeout(this.pending);
    clearTimeout(this.loginSync);
    this.window?.destroy();
    await this.session.clearStorageData();
    clearTimeout(this.pending);
    this.secrets.clear();
    this.data = {
      version: 1,
      items: [],
      lastSuccess: 0,
      courseCount: 0,
      coveredCourses: 0,
    };
    fs.writeFileSync(this.file, JSON.stringify(this.data), { mode: 0o600 });
    this.message = "已断开学习通，已加入清单的任务保留。";
    this.changed();
  }
}
