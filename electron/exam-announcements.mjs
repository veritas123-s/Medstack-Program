import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { eventInput } from "../src/domain/content.mjs";

export const examAnnouncementFile = "school-exam-announcement.json";
export const examAnnouncementLimit = 256 * 1024;
const text = (value, max) => {
  if (typeof value !== "string" || value.trim().length > max)
    throw Error("考试表字段格式不正确");
  return value.trim();
};
const compact = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "");
const room = (value) => compact(value).replace(/^浦东校区[·：:-]?/, "");
export function sameExamEvent(event, exam) {
  return (
    /^考试\s*·/.test(event.title) &&
    compact(event.title.replace(/^考试\s*·/, "")) === compact(exam.title) &&
    event.start === exam.start &&
    event.end === exam.end &&
    room(event.location) === room(exam.location)
  );
}
export function readExamAnnouncement(input) {
  const raw = JSON.parse(input.replace(/^\uFEFF/, ""));
  if (
    raw?.schema !== 1 ||
    !Array.isArray(raw.items) ||
    !raw.items.length ||
    raw.items.length > 500
  )
    throw Error("考试表格式不正确，最多导入 500 条考场安排");
  const title = text(raw.title, 160);
  const campus = text(raw.campus, 60);
  const notice = text(raw.notice ?? "", 240);
  if (!title || !campus) throw Error("考试表缺少标题或校区");
  const items = raw.items.map((row) => {
    const exam = {
      title: text(row?.title, 200),
      start: text(row?.start, 16),
      end: text(row?.end, 16),
      location: text(row?.location, 100),
      cohort: text(row?.cohort, 500),
      seats: text(row?.seats ?? "", 20),
      week: row?.week,
    };
    if (
      !exam.location ||
      !exam.cohort ||
      !Number.isInteger(exam.week) ||
      exam.week < 1 ||
      exam.week > 30 ||
      exam.start.slice(0, 10) !== exam.end.slice(0, 10)
    )
      throw Error("考试表缺少考场、班级或周次，或日期有误");
    eventInput(exam);
    const id = createHash("sha256")
      .update(
        JSON.stringify([
          exam.title,
          exam.start,
          exam.end,
          exam.location,
          exam.cohort,
        ]),
      )
      .digest("hex")
      .slice(0, 24);
    return { ...exam, id };
  });
  return {
    schema: 1,
    title,
    campus,
    notice,
    items: [...new Map(items.map((item) => [item.id, item])).values()],
  };
}

export function loadExamAnnouncement(directory) {
  const file = path.join(directory, examAnnouncementFile);
  if (!fs.existsSync(file)) return null;
  if (fs.statSync(file).size > examAnnouncementLimit)
    throw Error("考试表文件过大");
  return readExamAnnouncement(fs.readFileSync(file, "utf8"));
}

export function announcementEvents(announcement, ids, existing) {
  const byId = new Map(announcement.items.map((item) => [item.id, item]));
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > byId.size ||
    ids.some((id) => !byId.has(id))
  )
    throw Error("请选择要加入日历的考场");
  const added = [];
  for (const id of new Set(ids)) {
    const exam = byId.get(id);
    const calendarUid = `exam-announcement:${id}`;
    if (
      [...existing, ...added].some(
        (event) =>
          event.calendarUid === calendarUid || sameExamEvent(event, exam),
      )
    )
      continue;
    added.push(
      eventInput(
        {
          ...exam,
          title: `考试 · ${exam.title}`,
          calendarUid,
          location: `${announcement.campus} ${exam.location}`,
          notes: [
            announcement.title,
            `班级：${exam.cohort}`,
            announcement.notice,
          ]
            .filter(Boolean)
            .join("\n"),
        },
        { id: calendarUid },
      ),
    );
  }
  return added;
}
