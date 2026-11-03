export function isLearningURL(value) {
  try {
    const u = new URL(value);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (!u.port || u.port === "443") &&
      (u.hostname === "chaoxing.com" || u.hostname.endsWith(".chaoxing.com"))
    );
  } catch {
    return false;
  }
}
export function assignmentPageURL(value, id) {
  if (!isLearningURL(value)) return "";
  const url = new URL(value);
  const match = /^work:(\d+):(\d+):(\d+)$/.exec(id);
  if (
    !match ||
    !/^mooc1(?:-\d+)?\.chaoxing\.com$/.test(url.hostname) ||
    !/^\/(?:mooc-ans\/)?mooc2\/work\/task\/?$/.test(url.pathname) ||
    url.searchParams.getAll("workId").length !== 1 ||
    url.searchParams.get("workId") !== match[3]
  )
    return "";
  for (const [key, expected] of [["courseId", match[1]], ["classId", match[2]]]) {
    const values = url.searchParams.getAll(key);
    if (values.length && (values.length !== 1 || values[0] !== expected))
      return "";
  }
  return url.href;
}
export function parseCourses(data, { includeArchived = false } = {}) {
  if (data?.result !== 1 || !Array.isArray(data.channelList))
    throw Error("学习通登录已失效或课程列表格式改变，请重新扫码");
  const courses = [];
  for (const row of data.channelList) {
    const x = row.content;
    if (
      !x ||
      (!includeArchived && Number(x.isretire) !== 0) ||
      (x.roletype !== undefined && Number(x.roletype) !== 3)
    )
      continue;
    for (const c of x.course?.data || [])
      if ([c.id, x.id, x.cpi].every((v) => /^\d+$/.test(String(v))))
        courses.push({
          key: `${c.id}:${x.id}`,
          archived: Number(x.isretire) !== 0,
          id: String(c.id),
          classId: String(x.id),
          cpi: String(x.cpi),
          title: String(c.name || "未命名课程").slice(0, 300),
        });
  }
  return [...new Map(courses.map((c) => [`${c.id}:${c.classId}`, c])).values()];
}
export function parseDeadline(text, now = Date.now()) {
  const stamp = (y, m, d, h, min) => {
    const value = Date.parse(
      `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${min}:00+08:00`,
    );
    const check = new Date(value + 8 * 3600000);
    return Number.isFinite(value) &&
      check.getUTCFullYear() === Number(y) &&
      check.getUTCMonth() + 1 === Number(m) &&
      check.getUTCDate() === Number(d) &&
      check.getUTCHours() === Number(h) &&
      check.getUTCMinutes() === Number(min)
      ? value
      : NaN;
  };
  const short = String(text)
    .trim()
    .match(/^(\d{1,2})[-/](\d{1,2})\s+(\d{1,2}):(\d{2})$/);
  if (short) {
    const [, m, d, h, min] = short,
      year = new Date(now + 8 * 3600000).getUTCFullYear();
    const candidates = [year - 1, year, year + 1]
      .map((y) => stamp(y, m, d, h, min))
      .filter(Number.isFinite)
      .sort((a, b) => Math.abs(a - now) - Math.abs(b - now));
    if (candidates.length)
      return { deadline: candidates[0], estimated: false, yearInferred: true };
  }
  const absolute = String(text).match(
    /(20\d{2})[-/年](\d{1,2})[-/月](\d{1,2})日?\s+(\d{1,2}):(\d{2})/,
  );
  if (absolute) {
    const [, y, m, d, h, min] = absolute;
    const value = stamp(y, m, d, h, min);
    if (Number.isFinite(value)) return { deadline: value, estimated: false };
  }
  if (/剩余/.test(text)) {
    const days = +(text.match(/(\d+)天/)?.[1] || 0),
      hours = +(text.match(/(\d+)小时/)?.[1] || 0),
      mins = +(text.match(/(\d+)分钟/)?.[1] || 0);
    if (days + hours + mins > 0)
      return {
        deadline:
          Math.floor(now / 60000) * 60000 +
          (days * 1440 + hours * 60 + mins) * 60000,
        estimated: true,
      };
  }
  return { deadline: null, estimated: false };
}
// Runs in an isolated, network-disabled DOM parser. No page script is executed.
export function parseLearningHTML(html, kind) {
  const d = new DOMParser().parseFromString(html, "text/html");
  if (kind === "course")
    return {
      enc: d.querySelector("#workEnc")?.value || "",
      stuenc: d.querySelector("#enc")?.value || "",
      openc: d.querySelector("#openc")?.value || "",
    };
  if (kind === "deadline") {
    const text = d.body.textContent.replace(/\s+/g, " ");
    const m = text.match(
      /(?:截止时间|结束时间|作答时间|答题时间)\s*[:：]?\s*([^\n]{0,160})/,
    );
    return {
      text: m
        ? m[1]
            .split(/至|到/)
            .at(-1)
            .match(
              /^\s*(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[-/]\d{1,2})\s+\d{1,2}:\d{2}/,
            )?.[0] || ""
        : "",
    };
  }
  const rows = [...d.querySelectorAll("li[data]")].filter((x) =>
    x.querySelector(".overHidden2"),
  );
  const pages = Math.max(
    1,
    ...[...d.querySelectorAll("#page li")].map(
      (x) => Number(x.textContent) || 0,
    ),
  );
  return {
    recognized:
      rows.length > 0 || /暂无作业|没有作业|无作业/.test(d.body.textContent),
    pages,
    rows: rows.map((x) => ({
      title: x.querySelector(".overHidden2").textContent.trim().slice(0, 300),
      status: x.querySelector(".status")?.textContent.trim() || "",
      time: x.querySelector(".time")?.textContent.trim() || "",
      url: x.getAttribute("data"),
    })),
  };
}
const noticeTimestamp = (value, now) => {
  if (value == null || value === "") return 0;
  const number = Number(value),
    stamp = Number.isFinite(number)
      ? number < 1e11
        ? number * 1000
        : number
      : Date.parse(
          String(value).replace(" ", "T") +
            (/(?:Z|[+-]\d\d:\d\d)$/.test(String(value)) ? "" : "+08:00"),
        );
  return Number.isFinite(stamp) &&
    stamp >= 946656000000 &&
    stamp <= now + 86400000
    ? stamp
    : 0;
};
export function parseNotices(data, now = Date.now()) {
  const list = data?.notices?.list;
  if (!data?.status || !Array.isArray(list))
    throw Error("通知列表暂不可读取，保留上次通知");
  return {
    cursor: data.notices.lastGetId,
    lastPage: !!data.notices.lastPage,
    items: list
      .filter((x) => (x.id != null || x.uuid || x.idCode) && x.title)
      .map((x) => ({
        id: `notice:${String(x.uuid || x.idCode || x.id).slice(0, 100)}`,
        aliases: [x.id, x.uuid, x.idCode]
          .filter((v) => v != null && String(v).trim() !== "")
          .map((v) => `notice:${String(v).slice(0, 100)}`),
        kind: "notice",
        title: String(x.title)
          .replace(/<[^>]*>/g, "")
          .slice(0, 300),
        course: String(x.createrName || "学习通").slice(0, 100),
        summary: String(x.content || "")
          .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]*>/g, " ")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 600),
        publishedAt: noticeTimestamp(x.completeTime, now),
        updatedAt: noticeTimestamp(x.completeTime, now),
        fetchedAt: now,
      })),
  };
}
