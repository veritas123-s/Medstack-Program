import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { HOME, isSchoolURL, schoolAuthRequired } from "./campus.mjs";
export const EXAM_URL = "https://jwstu.shsmu.edu.cn/Home/PJExam";
export const EXAM_VPN_URL = HOME + "/Home/PJExam";
export function currentExamTerm(date = new Date()) {
  const [year, month] = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
  })
    .format(date)
    .split("-")
    .map(Number);
  const start = month >= 8 ? year : year - 1;
  return {
    academicYear: `${start}-${start + 1}`,
    semester: month >= 8 || month === 1 ? 1 : 2,
  };
}

async function queryExamDocument(term) {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const empty = /暂无|无记录|没有数据|没有找到|无匹配/;
  const select = (id, match) => {
    const field = document.querySelector(id);
    const option = [...(field?.options || [])].find(match);
    if (!option) return false;
    if (field.value !== option.value) {
      field.value = option.value;
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  };
  const gradeMatches = (option) =>
    option &&
    (option.textContent
      .replace(/\s/g, "")
      .replace(/[–—]/g, "-")
      .includes(term.academicYear) ||
      option.value === term.academicYear);
  const semesterMatches = (option) =>
    option &&
    (option.value === String(term.semester) ||
      option.textContent.includes(
        term.semester === 1 ? "第一学期" : "第二学期",
      ));
  const examTable = () =>
    [...document.querySelectorAll("table")].find((table) =>
      [...table.rows].some(
        (row) =>
          /考试课程|课程名称|考试科目|科目名称/.test(row.innerText) &&
          /考试时间|考试日期/.test(row.innerText),
      ),
    );
  const snapshot = () => {
    const table = examTable();
    return {
      tables: table
        ? [
            {
              rows: [...table.rows].map((row) =>
                [...row.cells].map((cell) => cell.innerText.trim()),
              ),
            },
          ]
        : [],
      text: document.body.innerText.slice(0, 30000),
      academicYear:
        document.querySelector("#Grade")?.selectedOptions[0]?.textContent ||
        term.academicYear,
      semester:
        document.querySelector("#Semester")?.selectedOptions[0]?.textContent ||
        String(term.semester),
    };
  };
  let responseReceived = false;
  let responseFailed = false;
  const table = examTable();
  const widget =
    table && typeof window.jQuery === "function" ? window.jQuery(table) : null;
  widget?.on("load-success.bs.table", () => {
    responseReceived = true;
  });
  widget?.on("load-error.bs.table", () => {
    responseFailed = true;
  });
  const before = JSON.stringify(snapshot().tables);
  const oldGrade = document.querySelector("#Grade")?.value;
  const oldSemester = document.querySelector("#Semester")?.value;
  for (let i = 0; i < 12 && !select("#Grade", gradeMatches); i++)
    await pause(150);
  if (!select("#Grade", gradeMatches))
    return { error: "学校页面没有提供当前学年，旧考试安排已保留" };
  for (let i = 0; i < 12 && !select("#Semester", semesterMatches); i++)
    await pause(150);
  if (!select("#Semester", semesterMatches))
    return { error: "学校页面没有提供当前学期，旧考试安排已保留" };
  const changed =
    oldGrade !== document.querySelector("#Grade")?.value ||
    oldSemester !== document.querySelector("#Semester")?.value;
  const query = [
    ...document.querySelectorAll(
      "button, input[type=button], input[type=submit], a[role=button], a.btn",
    ),
  ].filter(
    (node) =>
      /^(查询|搜索|检索|查询考试|考试查询)$/.test(
        (node.innerText || node.value || "").replace(/\s/g, ""),
      ) &&
      !node.disabled &&
      node.getClientRects().length,
  );
  if (query.length === 1) {
    responseReceived = false;
    responseFailed = false;
    query[0].click();
  } else if (!changed && widget?.data("bootstrap.table")) {
    widget.bootstrapTable("refresh");
  }
  let last = "";
  let stable = 0;
  for (let i = 0; i < 36; i++) {
    await pause(350);
    if (responseFailed) return { error: "学校考试查询失败，旧结果已保留" };
    const page = snapshot();
    const signature = JSON.stringify(page.tables);
    stable = signature === last ? stable + 1 : 0;
    last = signature;
    const rows = page.tables[0]?.rows || [];
    const hasRows = rows
      .slice(1)
      .some((row) => row.length > 1 && !empty.test(row.join("")));
    const showsEmpty = rows.slice(1).some((row) => empty.test(row.join("")));
    const loading = [
      ...document.querySelectorAll(
        ".fixed-table-loading,.dataTables_processing,[aria-busy=true]",
      ),
    ].some(
      (node) =>
        node.getClientRects().length &&
        getComputedStyle(node).visibility !== "hidden",
    );
    const confirmedTerm =
      gradeMatches(document.querySelector("#Grade")?.selectedOptions[0]) &&
      semesterMatches(document.querySelector("#Semester")?.selectedOptions[0]);
    const refreshed = responseReceived || signature !== before;
    if (
      confirmedTerm &&
      !loading &&
      stable >= 2 &&
      ((hasRows && (refreshed || (!changed && !query.length))) ||
        (showsEmpty &&
          (responseReceived ||
            (refreshed && /总共\s*0\s*条记录/.test(page.text)))))
    )
      return page;
  }
  return { error: "学校尚未返回可确认的本学期考试结果，旧结果已保留" };
}
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
    throw Error("考试页面未能读取，旧结果保留");
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
  if (!recognized) throw Error("尚未识别学校考试表格，旧结果保留");
  const total = String(page.text).match(/总共\s*(\d+)\s*条记录/);
  if (total && Number(total[1]) > items.length)
    throw Error("学校页面仅返回部分考试，旧结果保留");
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
        const page = await this.readPage();
        const items = parseExamTables(page);
        if (generation !== this.generation || !this.allowed())
          throw Error("账号已切换，未写入考试信息");
        const prior =
          this.data.academicYear === page.academicYear &&
          this.data.semester === page.semester
            ? this.data.items
            : [];
        this.store.change((s) => mergeExamEvents(s, items, prior));
        const data = {
          items,
          syncedAt: Date.now(),
          academicYear: page.academicYear,
          semester: page.semester,
        };
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
    const page = await win.webContents.executeJavaScript(
      `(${queryExamDocument})(${JSON.stringify(currentExamTerm())})`,
    );
    if (page.error) throw Error(page.error);
    return page;
  } finally {
    clearTimeout(timer);
    if (!win.isDestroyed()) win.destroy();
  }
}
