// Endpoint and field mappings adapted from upstream ShsmuService / MainViewModel.
export const HOME =
  "https://webvpn2.shsmu.edu.cn/https/77726476706e69737468656265737421fae05288327e7b586d059ce29d51367b9aac";
export const ROOMS =
  "https://webvpn2.shsmu.edu.cn/https/77726476706e69737468656265737421faf15b8469236043731dc7a99c406d362c";
export const ENTRY = `${HOME}/Home/Timetable`;
export function schoolAuthRequired() {
  return Object.assign(new Error("学校会话需要重新认证"), {
    code: "AUTH_REQUIRED",
  });
}
export function isSchoolURL(raw) {
  try {
    const u = new URL(raw);
    return (
      u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      (u.hostname === "shsmu.edu.cn" || u.hostname.endsWith(".shsmu.edu.cn"))
    );
  } catch {
    return false;
  }
}
const clean = (v) =>
  v == null
    ? ""
    : String(v)
        .replace(/>>|<</g, "")
        .replaceAll("&nbsp;", " ")
        .trim()
        .slice(0, 2000);
export function parseCourses(json) {
  if (!json || !Array.isArray(json.List))
    throw new Error(
      "学校没有返回有效课表，请完成学校登录后重试；旧课表已保留。",
    );
  return json.List.map((c) => {
    const start = clean(c.Start).replace(" ", "T"),
      end = clean(c.End).replace(" ", "T");
    if (
      !c.Curriculum ||
      !/^20\d\d-\d\d-\d\dT\d\d:\d\d/.test(start) ||
      !Number.isFinite(Date.parse(start)) ||
      !Number.isFinite(Date.parse(end)) ||
      end <= start
    )
      throw new Error("学校课表含异常时间字段，旧课表已保留。");
    return {
      title: clean(c.Curriculum),
      start,
      end,
      location: clean(c.ClassroomAcademy || c.Classroom),
      type: clean(c.CurriculumType),
      teacher: clean(c.Teacher),
      ids: {
        MCSID: clean(c.MCSID),
        CSID: clean(c.CSID),
        CurriculumID: clean(c.CurriculumID),
        XXKMID: clean(c.XXKMID),
        CurriculumType: clean(c.CurriculumType),
      },
    };
  });
}
export function parseScores(json, semester) {
  if (!Array.isArray(json?.["2"]))
    throw new Error("学校没有返回有效成绩，请检查登录状态。");
  return {
    years: Array.isArray(json["1"]) ? json["1"].map(clean) : [],
    gpa: clean(json["4"]),
    items: json["2"]
      .flat()
      .filter((x) => x && Number(x.Semester) === Number(semester))
      .map((x) => ({
        title: clean(x.CurriculumName),
        score: clean(x.Score),
        finalScore: clean(x.FScore),
        grade: clean(x.AchievementGrade),
        credit: clean(x.Credit),
        situation: clean(x.ExaminationSituationStr),
      })),
  };
}
export async function schoolJSON(ses, base, route, params = {}) {
  const url = new URL(base + route);
  for (const [key, value] of Object.entries(params))
    url.searchParams.set(key, String(value));
  if (base === HOME) url.searchParams.set("vpn-12-o2-jwstu.shsmu.edu.cn", "");
  let response;
  try {
    response = await ses.fetch(url.href, {
      credentials: "include",
      redirect: "manual",
      signal: AbortSignal.timeout(25000),
      headers: {
        Accept: "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
  } catch {
    throw new Error("暂时无法连接学校，请检查网络后重试。");
  }
  if ([301, 302, 303, 307, 308, 401, 403].includes(response.status)) {
    throw schoolAuthRequired();
  }
  if (!response.ok)
    throw new Error(`学校返回 HTTP ${response.status}，请稍后重试。`);
  const body = await response.text();
  if (body.length > 8_000_000) throw new Error("学校响应过大，已停止读取");
  try {
    return JSON.parse(body);
  } catch {
    if (
      /统一身份认证|统一认证登录|name=["'](?:username|password)["']/i.test(body)
    )
      throw schoolAuthRequired();
    throw new Error("学校返回的数据格式异常，旧结果已保留。");
  }
}
