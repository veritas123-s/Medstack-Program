const roomScans = new WeakMap();
const roomOptionTypes = [
  "AnswerAuxiliaryCampus",
  "BuildCode",
  "ClassroomFloor",
  "Classroom",
];

async function roomOptions(auth, base, { type, Area, BuildCode, FloorNo }) {
  if (!roomOptionTypes.includes(type)) throw Error("教室查询参数无效");
  const params = { type };
  for (const [key, value] of Object.entries({ Area, BuildCode, FloorNo }))
    if (value) params[key] = String(value).slice(0, 100);
  const result = await auth.request(
    base,
    "/api/edu/jfSelectData/getDict",
    params,
  );
  if (!Array.isArray(result?.data)) throw Error("学校未返回有效教室选项");
  const options = new Map();
  for (const item of result.data) {
    if (item?.code != null && item.name != null)
      options.set(String(item.code), String(item.name));
  }
  return [...options].map(([code, name]) => ({ code, name }));
}

async function roomSchedule(auth, base, { date, area, building, floor, room }) {
  const result = await auth.request(base, "/api/edu/jfTeachingcalendar/page3", {
    state: "通过",
    searchDate: date,
    area: String(area || ""),
    buliding: String(building || ""),
    floor: String(floor || ""),
    classroomId: String(room),
  });
  if (!Array.isArray(result?.data)) throw Error("教室返回格式异常");
  return {
    complete: !(Number(result.total) > result.data.length),
    rows: result.data.map((item) => ({
      title: String(item?.coursename || ""),
      start: String(item?.periodbegintime || ""),
      end: String(item?.periodendtime || ""),
      teacher: String(item?.teachertitle || item?.teachername || ""),
      className: String(item?.classname || ""),
    })),
  };
}

async function buildingSchedule(auth, base, params) {
  const previous = roomScans.get(auth);
  if (previous) previous.cancelled = true;
  const generation = auth.generation;
  const scan = { cancelled: false };
  const active = () => !scan.cancelled && generation === auth.generation;
  scan.done = (async () => {
    await previous?.done.catch(() => {});
    if (!active()) return null;
    const { area: Area, building: BuildCode } = params;
    const floors = await roomOptions(auth, base, {
      type: "ClassroomFloor",
      Area,
      BuildCode,
    });
    const rooms = [];
    let failedFloors = 0;
    for (const floor of floors) {
      if (!active()) return null;
      try {
        const options = await roomOptions(auth, base, {
          type: "Classroom",
          Area,
          BuildCode,
          FloorNo: floor.code,
        });
        for (const room of options) rooms.push({ ...room, floor });
      } catch {
        failedFloors++;
        if (auth.phase === "attention") break;
      }
    }
    let next = 0;
    const load = async () => {
      while (active() && next < rooms.length) {
        const room = rooms[next++];
        if (auth.phase === "attention") break;
        try {
          Object.assign(
            room,
            await roomSchedule(auth, base, {
              ...params,
              room: room.code,
              floor: room.floor.code,
            }),
          );
        } catch {
          room.complete = false;
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(3, rooms.length) }, load));
    return active() ? { rooms, failedFloors, fetchedAt: Date.now() } : null;
  })();
  roomScans.set(auth, scan);
  try {
    return await scan.done;
  } finally {
    if (roomScans.get(auth) === scan) roomScans.delete(auth);
  }
}

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
    return roomOptions(auth, campus.ROOMS, p);
  } else if (action === "school.rooms.building") {
    if (
      !domain.validDay(p.date) ||
      ![p.area, p.building].every(
        (value) =>
          typeof value === "string" && value.trim() && value.length <= 100,
      )
    )
      throw Error("请选择校区、楼栋和日期");
    return buildingSchedule(auth, campus.ROOMS, p);
  } else if (action === "school.rooms") {
    if (!domain.validDay(p.date) || !p.room)
      throw new Error("请选择日期及教室");
    return (await roomSchedule(auth, campus.ROOMS, p)).rows;
  }
}
