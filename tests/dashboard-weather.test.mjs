import test from "node:test";
import assert from "node:assert/strict";
import {
  dashboardWeather,
  forecastForDay,
  parseForecast,
} from "../electron/dashboard-weather.mjs";

const point = (time, air_temperature) => ({
  time,
  data: {
    instant: { details: { air_temperature } },
    next_1_hours: { summary: { symbol_code: "cloudy" } },
  },
});

test("天气预报按北京时间区分当前时刻和明日中午，忽略坏数据", () => {
  const slots = parseForecast({
    properties: {
      timeseries: [
        null,
        point("invalid", 7),
        point("2026-11-04T15:00:00Z", 12.2),
        point("2026-11-04T16:00:00Z", 11),
        point("2026-11-05T04:00:00Z", 18.6),
      ],
    },
  });
  const { current, tomorrow } = forecastForDay(
    slots,
    Date.parse("2026-11-04T15:35:00Z"),
  );
  assert.equal(slots.length, 3);
  assert.equal(current.temperature, 11);
  assert.equal(tomorrow.temperature, 19);
  assert.equal(
    forecastForDay(slots, Date.parse("2026-11-07T04:00:00Z")).current,
    null,
  );
});

test("天气请求只接受预设位置并复用同一请求，失败不显示虚构天气", async () => {
  let requests = 0;
  const fetcher = async (url, options) => {
    requests++;
    assert.equal(url.origin, "https://api.met.no");
    assert.equal(url.search, "?lat=31.03&lon=121.44");
    assert.equal(options.credentials, "omit");
    return new Response("offline", { status: 503 });
  };
  await assert.rejects(
    dashboardWeather("https://example.com", fetcher),
    /位置无效/,
  );
  const values = await Promise.all([
    dashboardWeather("minhang", fetcher),
    dashboardWeather("minhang", fetcher),
  ]);
  assert.equal(requests, 1);
  assert.deepEqual(
    values,
    Array(2).fill({
      current: null,
      tomorrow: null,
      fetchedAt: null,
      stale: true,
    }),
  );
});
