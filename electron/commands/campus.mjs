export default async function execute(action, p, context) {
  if (action === "school.exams") return context.exams.sync();
  if (action === "school.exams.open") {
    const { EXAM_VPN_URL } = await import("../exams.mjs");
    await context.auth.open(EXAM_VPN_URL);
    return { ok: true };
  }
  const {
    store,
    domain,
    campus,
    auth,
    bridge,
    dialog,
    shell,
    app,
    fs,
    path,
    broadcast,
  } = context;
  const win = context.getWindow();
  if (action === "school.courses") {
    if (
      !domain.validDay(p.start) ||
      !domain.validDay(p.end) ||
      p.end <= p.start ||
      (Date.parse(p.end) - Date.parse(p.start)) / 86400000 > 93
    )
      throw new Error("同步日期范围无效");
    const courses = campus.parseCourses(
      await auth.request(campus.HOME, "/Home/GetCurriculumTable", {
        Start: p.start,
        End: p.end,
      }),
    );
    store.change((s) => {
      s.courses = s.courses
        .filter(
          (c) =>
            c.start.slice(0, 10) < p.start || c.start.slice(0, 10) >= p.end,
        )
        .concat(
          courses.filter(
            (c) =>
              c.start.slice(0, 10) >= p.start && c.start.slice(0, 10) < p.end,
          ),
        );
      s.courseRanges = s.courseRanges
        .filter((r) => r.start !== p.start || r.end !== p.end)
        .concat({ start: p.start, end: p.end, syncedAt: Date.now() })
        .slice(-200);
    });
  } else if (action === "school.scores") {
    if (
      !/^20\d{2}-20\d{2}$/.test(p.year) ||
      ![1, 2].includes(Number(p.semester))
    )
      throw new Error("请输入有效学年和学期");
    const scores = campus.parseScores(
      await auth.request(campus.HOME, "/Score/GetStuYearScore", {
        Grade: p.year,
        Semester: p.semester,
      }),
      p.semester,
    );
    store.change((s) => {
      s.scores = {
        ...scores,
        year: p.year,
        semester: Number(p.semester),
        syncedAt: Date.now(),
      };
    });
  } else if (action === "school.detail") {
    const course = store.state.courses.find(
      (c) => c.start === p.start && c.title === p.title,
    );
    if (!course) throw new Error("课程不存在");
    const data = await auth.request(
      campus.HOME,
      "/Home/GetCalendarTable",
      course.ids,
    );
    if (!Array.isArray(data)) throw new Error("课程详情格式异常");
    const item = data[0] || {};
    return {
      title: String(item.CourseName || course.title),
      teacher: String(item.Teacher || ""),
      college: String(item.College || ""),
      content: String(item.TeachingContent || item.Content || ""),
    };
  } else if (action === "school.rooms.options") {
    if (
      ![
        "AnswerAuxiliaryCampus",
        "BuildCode",
        "ClassroomFloor",
        "Classroom",
      ].includes(p.type)
    )
      throw new Error("教室查询参数无效");
    const params = { type: p.type };
    for (const key of ["Area", "BuildCode", "FloorNo"])
      if (p[key]) params[key] = String(p[key]).slice(0, 100);
    const data = await auth.request(
      campus.ROOMS,
      "/api/edu/jfSelectData/getDict",
      params,
    );
    if (!Array.isArray(data?.data))
      throw new Error("未返回教室选项，请检查学校登录");
    return data.data.map((x) => ({
      code: String(x.code),
      name: String(x.name),
    }));
  } else if (action === "school.rooms") {
    if (!domain.validDay(p.date) || !p.room)
      throw new Error("请选择日期及教室");
    const data = await auth.request(
      campus.ROOMS,
      "/api/edu/jfTeachingcalendar/page3",
      {
        state: "通过",
        searchDate: p.date,
        area: String(p.area || ""),
        buliding: String(p.building || ""),
        floor: String(p.floor || ""),
        classroomId: String(p.room),
      },
    );
    if (!Array.isArray(data?.data)) throw new Error("教室返回格式异常");
    return data.data.map((x) => ({
      title: String(x.coursename || ""),
      start: String(x.periodbegintime || ""),
      end: String(x.periodendtime || ""),
      teacher: String(x.teachertitle || x.teachername || ""),
      className: String(x.classname || ""),
    }));
  }
}
