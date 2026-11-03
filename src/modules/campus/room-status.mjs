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
  if (at === null) return { state: "unknown", current: [] };
  let uncertain = !room.complete;
  const current = [];
  for (const row of room.rows || []) {
    const start = roomMinute(row.start);
    const end = roomMinute(row.end);
    if (start === null || end === null || end <= start) uncertain = true;
    else if (start <= at && at < end) current.push(row);
  }
  return {
    state: current.length ? "busy" : uncertain ? "unknown" : "free",
    current,
  };
}
