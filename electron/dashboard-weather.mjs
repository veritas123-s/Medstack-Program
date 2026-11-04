import { getWeatherLocation } from "../src/domain/weather.mjs";
import { beijingDay } from "../src/briefing.mjs";
import { shiftDate } from "../src/calendar.mjs";
import { boundedBytes } from "./public-fetch.mjs";

const MINUTE = 60000;
const endpoint = "https://api.met.no/weatherapi/locationforecast/2.0/compact";
const cache = new Map();
const pending = new Map();

export function parseForecast(payload) {
  const slots = payload?.properties?.timeseries;
  if (!Array.isArray(slots)) return [];
  return slots.flatMap((slot) => {
    const { time, data } = slot || {};
    const timestamp = Date.parse(time);
    const temperature = data?.instant?.details?.air_temperature;
    const code =
      data?.next_1_hours?.summary?.symbol_code ||
      data?.next_6_hours?.summary?.symbol_code;
    if (
      !Number.isFinite(timestamp) ||
      !Number.isFinite(temperature) ||
      typeof code !== "string"
    )
      return [];
    return [{ timestamp, temperature: Math.round(temperature), code }];
  });
}

export function forecastForDay(slots, now = Date.now()) {
  const day = beijingDay(now);
  const tomorrow = shiftDate(day, 1);
  const nearest = (rows, at) =>
    rows.reduce(
      (best, row) =>
        !best || Math.abs(row.timestamp - at) < Math.abs(best.timestamp - at)
          ? row
          : best,
      null,
    );
  const current = nearest(slots, now);
  const next = nearest(
    slots.filter((row) => beijingDay(row.timestamp) === tomorrow),
    Date.parse(`${tomorrow}T12:00:00+08:00`),
  );
  return {
    current:
      current && Math.abs(current.timestamp - now) < 3 * 60 * MINUTE
        ? current
        : null,
    tomorrow: next,
  };
}

async function refresh(location, old, fetcher) {
  const point = getWeatherLocation(location);
  const url = new URL(endpoint);
  url.searchParams.set("lat", point.latitude.toFixed(2));
  url.searchParams.set("lon", point.longitude.toFixed(2));
  const signal = AbortSignal.timeout(8000);
  try {
    const response = await fetcher(url, {
      signal,
      redirect: "error",
      credentials: "omit",
      headers: {
        "User-Agent":
          "Medstack https://github.com/veritas123-s/Medstack-Program",
        Accept: "application/json",
        ...(old?.modified ? { "If-Modified-Since": old.modified } : {}),
      },
    });
    const fetchedAt = Date.now();
    const expires = Math.max(
      fetchedAt + 15 * MINUTE,
      Date.parse(response.headers.get("expires")) || 0,
    );
    if (response.status === 304 && old?.slots.length)
      return { ...old, fetchedAt, expires, stale: false };
    const slots = parseForecast(
      JSON.parse(
        (await boundedBytes(response, 512 * 1024, signal)).toString("utf8"),
      ),
    );
    if (!slots.length) throw Error("天气数据为空");
    return {
      slots,
      fetchedAt,
      expires,
      modified: response.headers.get("last-modified"),
      stale: false,
    };
  } catch {
    const freshEnough = old?.fetchedAt > Date.now() - 6 * 60 * MINUTE;
    return {
      slots: freshEnough ? old.slots : [],
      modified: freshEnough ? old.modified : null,
      fetchedAt: freshEnough ? old.fetchedAt : null,
      expires: Date.now() + 5 * MINUTE,
      stale: true,
    };
  }
}

export async function dashboardWeather(location, fetcher = fetch) {
  const point = getWeatherLocation(location);
  if (!point) throw Error("天气位置无效");
  location = point.id;
  let result = cache.get(location);
  if (!result || Date.now() >= result.expires) {
    if (!pending.has(location))
      pending.set(
        location,
        refresh(location, result, fetcher)
          .then((next) => {
            cache.set(location, next);
            return next;
          })
          .finally(() => pending.delete(location)),
      );
    result = await pending.get(location);
  }
  return {
    ...forecastForDay(result.slots),
    fetchedAt: result.fetchedAt,
    stale: result.stale,
  };
}
