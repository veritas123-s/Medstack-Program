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

async function queryExamDocument(preferred) {
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const empty = /暂无|无记录|没有数据|没有找到|无匹配/;
  const yearLabel = (value) =>
    String(value)
      .replace(/\s/g, "")
      .replace(/[–—]/g, "-")
      .match(/20\d{2}-20\d{2}/)?.[0];
  const semesterNumber = (option) =>
    /第一|^1$/.test(option.textContent.trim())
      ? 1
      : /第二|^2$/.test(option.textContent.trim())
        ? 2
        : /^[12]$/.test(option.value)
          ? Number(option.value)
          : 0;
  const options = (id) =>
    [...(document.querySelector(id)?.options || [])].filter(
      (option) => !option.disabled && option.value,
    );
  const value = (id) => document.querySelector(id)?.value;
  const select = (id, next) => {
    const field = document.querySelector(id);
    if (!field || !options(id).some((option) => option.value === next))
      return false;
    if (field.value !== next) {
      field.value = next;
      field.dispatchEvent(new Event("change", { bubbles: true }));
    }
    return true;
  };
  const examTable = () =>
    [...document.querySelectorAll("table")].find((table) =>
      [...table.rows].some(
        (row) =>
          /考试课程|课程名称|考试科目|科目名称/.test(row.innerText) &&
          /考试.*时间|考试日期/.test(row.innerText),
      ),
    );
  const snapshot = (academicYear, semester) => {
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
      academicYear,
      semester: String(semester),
    };
  };
  const loading = () =>
    [
      ...document.querySelectorAll(
        ".fixed-table-loading,.dataTables_processing,[aria-busy=true]",
      ),
    ].some(
      (node) =>
        node.getClientRects().length &&
        getComputedStyle(node).visibility !== "hidden",
    );
  const deadline = Date.now() + 140_000;
  const pages = [];
  let attempted = 0;
  let failed = 0;
  for (let i = 0; i < 12 && !options("#Grade").length; i++) await pause(150);
  const years = options("#Grade")
    .map((option) => ({
      value: option.value,
      label: yearLabel(option.textContent) || yearLabel(option.value),
    }))
    .filter((option) => option.label)
    .sort(
      (a, b) =>
        Number(b.label === preferred.academicYear) -
          Number(a.label === preferred.academicYear) ||
        b.label.localeCompare(a.label),
    );
  if (!years.length) return { pages, attempted, failed: 1 };
  async function readTerm(year, semester, gradeChanged) {
    const baseline = JSON.stringify(
      snapshot(year.label, semester.number).tables,
    );
    const changed = gradeChanged || value("#Semester") !== semester.value;
    const table = examTable();
    const widget =
      table && typeof window.jQuery === "function"
        ? window.jQuery(table)
        : null;
    let success = false;
    let failure = false;
    const loaded = () => {
      success = true;
    };
    const rejected = () => {
      failure = true;
    };
    widget?.on("load-success.bs.table", loaded);
    widget?.on("load-error.bs.table", rejected);
    try {
      if (!select("#Semester", semester.value)) return null;
      const query = [
        ...document.querySelectorAll(
          "button,input[type=button],input[type=submit],a[role=button],a.btn",
        ),
      ].filter(
        (node) =>
          /^(查询|搜索|检索|查询考试|考试查询)$/.test(
            (node.innerText || node.value || "").replace(/\s/g, ""),
          ) &&
          !node.disabled &&
          node.getClientRects().length,
      );
      if (query.length === 1) query[0].click();
      else if (!changed && widget?.data("bootstrap.table"))
        widget.bootstrapTable("refresh");
      let sawChange =
        JSON.stringify(snapshot(year.label, semester.number).tables) !==
        baseline;
      let last = "";
      let stable = 0;
      for (let i = 0; i < 26 && Date.now() < deadline; i++) {
        await pause(250);
        if (failure) return null;
        const page = snapshot(year.label, semester.number);
        const signature = JSON.stringify(page.tables);
        stable = signature === last ? stable + 1 : 0;
        last = signature;
        const rows = page.tables[0]?.rows || [];
        const hasRows = rows
          .slice(1)
          .some((row) => row.length > 1 && !empty.test(row.join("")));
        const showsEmpty = rows
          .slice(1)
          .some((row) => empty.test(row.join("")));
        sawChange ||= signature !== baseline;
        const refreshed = success || sawChange;
        if (
          value("#Grade") === year.value &&
          value("#Semester") === semester.value &&
          !loading() &&
          stable >= 2 &&
          ((hasRows && (refreshed || (!changed && !query.length))) ||
            (showsEmpty &&
              (success || (refreshed && /总共\s*0\s*条记录/.test(page.text)))))
        )
          return page;
      }
      return null;
    } finally {
      widget?.off("load-success.bs.table", loaded);
      widget?.off("load-error.bs.table", rejected);
    }
  }
  for (const year of years) {
    if (Date.now() >= deadline) {
      failed++;
      break;
    }
    const gradeChanged = value("#Grade") !== year.value;
    if (!select("#Grade", year.value)) {
      failed++;
      continue;
    }
    if (gradeChanged) await pause(250);
    for (let i = 0; i < 12 && !options("#Semester").some(semesterNumber); i++)
      await pause(150);
    const semesters = options("#Semester")
      .map((option) => ({
        value: option.value,
        number: semesterNumber(option),
      }))
      .filter((option) => option.number)
      .sort(
        (a, b) =>
          Number(b.number === preferred.semester) -
          Number(a.number === preferred.semester),
      );
    if (!semesters.length) {
      failed++;
      continue;
    }
    for (const semester of semesters) {
      if (Date.now() >= deadline) {
        failed++;
        break;
      }
      attempted++;
      const page = await readTerm(year, semester, gradeChanged);
      if (page) pages.push(page);
      else failed++;
    }
  }
  return { pages, attempted, failed };
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
      const weekday = raw.match(/(?:周|星期)([日天一二三四五六])/);
      const compatibleYears = weekday
        ? academic
            .slice(1, 3)
            .filter(
              (year) =>
                new Date(Date.UTC(+year, +md[1] - 1, +md[2])).getUTCDay() ===
                "日一二三四五六".indexOf(weekday[1].replace("天", "日")),
            )
        : [];
      const year =
        compatibleYears.length === 1
          ? compatibleYears[0]
          : first && +md[1] >= 8
            ? academic[1]
            : academic[2];
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
        semester: clean(page.semester),
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
        const result = await this.readPage();
        const pages = result.pages || [result];
        let failed = result.failed || 0;
        const parsed = [];
        let completed = 0;
        const confirmed = new Set();
        for (const page of pages) {
          try {
            parsed.push(...parseExamTables(page));
            completed++;
            confirmed.add(JSON.stringify([page.academicYear, page.semester]));
          } catch (error) {
            if (!result.pages) throw error;
            failed++;
          }
        }
        if (!completed) throw Error("各学期考试结果未能确认，旧结果已保留");
        const key = (item) =>
          JSON.stringify([
            item.title,
            item.start || item.id,
            item.end,
            item.location,
          ]);
        const old = new Map(this.data.items.map((item) => [key(item), item]));
        const merged = new Map(failed ? old : []);
        for (const item of parsed) {
          const identity = key(item);
          const prior = old.get(identity);
          if (!merged.has(identity) || prior)
            merged.set(identity, prior ? { ...item, id: prior.id } : item);
        }
        const today = new Intl.DateTimeFormat("sv-SE", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date());
        const group = (item) => (!item.start ? 2 : item.start >= today ? 0 : 1);
        const items = [...merged.values()].sort(
          (a, b) =>
            group(a) - group(b) ||
            (group(a) === 1
              ? b.start.localeCompare(a.start)
              : (a.start || "").localeCompare(b.start || "")) ||
            a.title.localeCompare(b.title),
        );
        if (generation !== this.generation || !this.allowed())
          throw Error("账号已切换，未写入考试信息");
        const prior = failed
          ? []
          : this.data.items.filter(
              (item) =>
                item.academicYear &&
                item.semester &&
                confirmed.has(
                  JSON.stringify([item.academicYear, item.semester]),
                ),
            );
        this.store.change((s) => mergeExamEvents(s, items, prior));
        const data = {
          items,
          syncedAt: Date.now(),
          completedTerms: completed,
          incomplete: failed > 0,
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
  }, 155_000);
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
    if (!page.pages?.length)
      throw Error("学校未返回可确认的考试结果，旧结果已保留");
    return page;
  } finally {
    clearTimeout(timer);
    if (!win.isDestroyed()) win.destroy();
  }
}
