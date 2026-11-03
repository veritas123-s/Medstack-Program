// The teaching API omits directions for these four buildings.
// https://www.shsmu.edu.cn/iso/info/1028/1381.htm
const pudongBuildingNames = new Map([
  ["08号楼", "东8号楼"],
  ["09号楼", "东9号楼"],
  ["11号楼", "东11号楼"],
  ["12号楼", "东12号楼"],
]);

export function buildingDisplayName(campus, building) {
  if (campus !== "浦东" && campus !== "浦东校区") return building;
  return pudongBuildingNames.get(building.trim()) || building;
}

export function roomMinute(value) {
  const time = String(value || "")
    .trim()
    .match(/(?:^|[T\s])(\d{1,2}):([0-5]\d)(?::[0-5]\d)?$/);
  if (!time) return null;
  const hours = Number(time[1]);
  const minutes = Number(time[2]);
  return hours < 24 || (hours === 24 && minutes === 0)
    ? hours * 60 + minutes
    : null;
}

export function roomStatus(room, time) {
  const at = roomMinute(time);
  let uncertain = at === null || !room.complete;
  const current = [];
  const upcoming = [];
  for (const row of room.rows || []) {
    const start = roomMinute(row.start);
    const end = roomMinute(row.end);
    if (start === null || end === null || end <= start) uncertain = true;
    else if (at !== null) {
      if (start > at) upcoming.push(row);
      else if (at < end) current.push(row);
    }
  }
  upcoming.sort((a, b) => roomMinute(a.start) - roomMinute(b.start));
  return {
    state: current.length ? "busy" : uncertain ? "unknown" : "free",
    current,
    upcoming,
    uncertain,
  };
}
