import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { HOME, isSchoolURL, schoolAuthRequired } from "./campus.mjs";
export const EXAM_URL = "https://jwstu.shsmu.edu.cn/Home/PJExam";
export const EXAM_VPN_URL = HOME + "/Home/PJExam";
const clean = (x) =>
  String(x || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
function interval(raw, context = {}) {
  let date = raw.match(/(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?/);
  let dateSource = "explicit";
  if (!date) {
    const md = raw.match(/(\d{1,2})月(\d{1,2})日/);
    const academic = String(context.academicYear || "").match(
      /(20\d{2})\s*[-–—]\s*(20\d{2})/,
    );
    const semester = String(context.semester || "");
    const first = /第一|^1$/.test(semester),
      second = /第二|^2$/.test(semester);
    if (
      md &&
      academic &&
      +academic[2] === +academic[1] + 1 &&
      (first || second)
    ) {
      const year = first && +md[1] >= 8 ? academic[1] : academic[2];
      date = ["", year, md[1], md[2]];
      dateSource = "academic-year";
    }
  }
  const times = [...raw.matchAll(/(?:^|[^\d])([01]?\d|2[0-3])[:：]([0-5]\d)/g)];
  if (!date || times.length !== 2) return {};
  const day = `${date[1]}-${date[2].padStart(2, "0")}-${date[3].padStart(2, "0")}`;
  if (!Number.isFinite(Date.parse(day + "T12:00:00Z"))) return {};
  if (new Date(day + "T12:00:00Z").toISOString().slice(0, 10) !== day)
    return {};
  const [start, end] = times.map(
    (t) => day + "T" + t[1].padStart(2, "0") + ":" + t[2],
  );
  return end > start ? { start, end, dateSource } : {};
}
export function parseExamTables(page) {
  if (!page || !Array.isArray(page.tables) || !/考试/.test(page.text || ""))
    throw Error("考试页面未能读取，请先完成学校登录；旧结果保留");
  const items = [];
  let recognized = false;
  for (const table of page.tables) {
    const rows = table.rows || [];
    const at = rows.findIndex(
      (row) =>
        row.some((c) => /考试课程|课程名称|考试科目|科目名称|^课程$/.test(c)) &&
        row.some((c) => /考试.*时间|考试日期/.test(c)),
    );
    if (at < 0) continue;
    recognized = true;
    const headers = rows[at];
    const titleIndex = headers.findIndex((c) =>
      /考试课程|课程名称|考试科目|科目名称|^课程$/.test(c),
    );
    const timeIndexes = headers.flatMap((c, i) =>
      /考试.*时间|考试日期|开始时间|结束时间/.test(c) ? [i] : [],
    );
    const locationIndex = headers.findIndex((c) =>
      /考场|考试地点|教室/.test(c),
    );
    for (const row of rows.slice(at + 1)) {
      if (/暂无|无记录|没有数据|没有找到|无匹配/.test(row.join(""))) continue;
      if (row.length !== headers.length || !clean(row[titleIndex]))
        throw Error("考试表格格式变化，旧结果保留");
      const title = clean(row[titleIndex]),
        rawTime = timeIndexes.map((i) => clean(row[i])).join(" ");
      const location = clean(row[locationIndex]);
      const dates = interval(rawTime, page);
      const id = crypto
        .createHash("sha256")
        .update(
          title +
            "\n" +
            rawTime +
            "\n" +
            location +
            "\n" +
            (dates.start || page.academicYear || ""),
        )
        .digest("hex")
        .slice(0, 24);
      items.push({
        id,
        title,
        rawTime,
        location,
        academicYear: clean(page.academicYear),
        ...dates,
      });
    }
  }
  if (!recognized)
    throw Error("尚未识别学校考试表格，请打开官方考试页核对；旧结果保留");
  const total = String(page.text).match(/总共\s*(\d+)\s*条记录/);
  if (total && Number(total[1]) > items.length)
    throw Error("学校页面仅返回部分考试，请在官方页核对完整安排；旧结果保留");
  return [...new Map(items.map((x) => [x.id, x])).values()];
}
export function mergeExamEvents(state, items, previousItems = []) {
  const expected = new Map(
    previousItems
      .filter((x) => x.start && x.end)
      .map((x) => ["school-exam:" + x.id, x]),
  );
  const current = new Map(
    items
      .filter((x) => x.start && x.end)
      .map((x) => ["school-exam:" + x.id, x]),
  );
  // Do not overwrite user edits or restore a deleted exam when syncing again.
  for (const event of state.events) {
    const old = expected.get(event.calendarUid);
    if (
      old &&
      !current.has(event.calendarUid) &&
      !event.deletedAt &&
      event.title === "考试 · " + old.title &&
      event.start === old.start &&
      event.end === old.end &&
      event.location === old.location
    )
      event.deletedAt = Date.now();
  }
  for (const [calendarUid, x] of current) {
    if (state.events.some((e) => e.calendarUid === calendarUid)) continue;
    state.events.push({
      id: calendarUid,
      title: "考试 · " + x.title,
      start: x.start,
      end: x.end,
      location: x.location,
      notes:
        "教务考试安排 · " +
        EXAM_URL +
        (x.dateSource === "academic-year"
          ? "\n年份依据页面学年：" + x.academicYear
          : ""),
      allDay: false,
      calendarUid,
      createdAt: Date.now(),
      deletedAt: null,
    });
  }
}
export class ExamService {
  constructor({ directory, readPage, allowed, store, changed = () => {} }) {
    Object.assign(this, { readPage, allowed, store, changed });
    this.file = path.join(directory, "school-exams.json");
    this.data = { items: [], syncedAt: null };
    this.error = "";
    this.generation = 0;
    try {
      const x = JSON.parse(fs.readFileSync(this.file));
      if (Array.isArray(x.items)) this.data = x;
    } catch {}
  }
  status() {
    return {
      ...this.data,
      error: this.error,
      busy: !!this.pending,
      source: EXAM_URL,
    };
  }
  async sync() {
    if (!this.allowed()) throw Error("请先登录");
    if (this.pending) return this.pending;
    const generation = this.generation;
    this.pending = (async () => {
      try {
        const items = parseExamTables(await this.readPage());
        if (generation !== this.generation || !this.allowed())
          throw Error("账号已切换，未写入考试信息");
        const prior = this.data.items;
        this.store.change((s) => mergeExamEvents(s, items, prior));
        const data = { items, syncedAt: Date.now() };
        fs.writeFileSync(this.file + ".pending", JSON.stringify(data));
        fs.renameSync(this.file + ".pending", this.file);
        this.data = data;
        this.error = "";
        return this.status();
      } catch (e) {
        this.error = e.message;
        throw e;
      } finally {
        this.pending = null;
        this.changed();
      }
    })();
    this.changed();
    return this.pending;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.sync().catch(() => {}), 30 * 60_000);
    this.timer.unref?.();
    this.sync().catch(() => {});
  }
  stop() {
    this.generation++;
    clearInterval(this.timer);
    this.timer = null;
  }
}
export async function readExamPage({ BrowserWindow, session, allowed }) {
  if (!allowed()) throw Error("请先登录");
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      session,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  const guard = (event, url) => {
    if (!isSchoolURL(url)) event.preventDefault();
  };
  win.webContents.on("will-navigate", guard);
  win.webContents.on("will-redirect", guard);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  const timer = setTimeout(() => {
    if (!win.isDestroyed()) win.destroy();
  }, 25_000);
  try {
    await win.loadURL(EXAM_VPN_URL);
    const url = new URL(win.webContents.getURL());
    if (/login|cas/i.test(url.pathname)) throw schoolAuthRequired();
    const loginForm = await win.webContents.executeJavaScript(
      "!!document.querySelector('input[name=\"username\"]') && !!document.querySelector('input[type=\"password\"]')",
    );
    if (loginForm) throw schoolAuthRequired();
    if (!url.pathname.endsWith("/Home/PJExam"))
      throw Error("学校未返回考试页，旧结果保留");
    // Read only DOM tables from the official page after its own scripts settle.
    return await win.webContents.executeJavaScript(
      `new Promise(resolve=>{let attempts=0;const read=()=>{const tables=[...document.querySelectorAll('table')].map(t=>({rows:[...t.rows].map(r=>[...r.cells].map(c=>c.innerText.trim()))}));const text=document.body.innerText.slice(0,30000);const selected=id=>{const s=document.querySelector(id);return s?.selectedOptions?.[0]?.textContent||s?.value||''};const ready=tables.some(t=>{const i=t.rows.findIndex(r=>r.some(c=>/考试课程|课程名称|考试科目/.test(c)));return i>=0&&t.rows.slice(i+1).some(r=>(r.length===t.rows[i].length&&!/载入|加载|Loading/i.test(r.join('')))||/暂无|无记录|没有找到|没有数据/.test(r.join('')))});if(ready||++attempts>=24)resolve({tables,text,academicYear:selected('#Grade'),semester:selected('#Semester')});else setTimeout(read,500)};read()})`,
    );
  } finally {
    clearTimeout(timer);
    if (!win.isDestroyed()) win.destroy();
  }
}
