import test from "node:test";
import assert from "node:assert/strict";
import {
  getWeatherLocation,
  searchWeatherLocations,
  weatherChildren,
  weatherPath,
} from "../src/domain/weather.mjs";
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
    const place = getWeatherLocation("minhang");
    assert.equal(
      url.search,
      `?lat=${place.latitude.toFixed(2)}&lon=${place.longitude.toFixed(2)}`,
    );
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

test("全国地区索引可按市区搜索，迁移旧天气选项，覆盖港澳台", () => {
  assert.equal(weatherChildren().length, 34);
  assert.deepEqual(weatherPath(getWeatherLocation("pudong")), [
    "上海市",
    "浦东新区",
  ]);
  assert.deepEqual(weatherPath(searchWeatherLocations("长沙 岳麓")[0]), [
    "湖南省",
    "长沙市",
    "岳麓区",
  ]);
  assert.equal(searchWeatherLocations("新疆和安县")[0].name, "和安县");
  assert.equal(searchWeatherLocations("台北 大安区")[0].name, "大安區");
  assert.equal(weatherChildren("8100").length, 18);
  assert.equal(weatherChildren("8200").length, 8);
  assert.equal(getWeatherLocation("__proto__"), undefined);
});
