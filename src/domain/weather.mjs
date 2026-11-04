import locations from "./weather-locations.json" with { type: "json" };

export const DEFAULT_WEATHER_LOCATION = "310101";
const legacy = {
  huangpu: "310101",
  pudong: "310115",
  minhang: "310112",
  suzhou: "3205",
  hangzhou: "3301",
  nanjing: "3201",
  beijing: "1101",
  guangzhou: "4401",
  shenzhen: "4403",
  chengdu: "5101",
  wuhan: "4201",
};
const byId = new Map(
  locations.map(([id, parent, name, alias, latitude, longitude]) => [
    id,
    { id, parent, name, alias, latitude, longitude },
  ]),
);
const simplified = {
  臺: "台",
  灣: "湾",
  縣: "县",
  區: "区",
  門: "门",
  羅: "罗",
  龍: "龙",
  東: "东",
  興: "兴",
  蘭: "兰",
  彰: "彰",
  義: "义",
  蓮: "莲",
  橋: "桥",
  園: "园",
  萬: "万",
  蘆: "芦",
  馬: "马",
  崙: "仑",
  鶯: "莺",
  龜: "龟",
};
const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[\s·-]/g, "")
    .replace(/./gu, (char) => simplified[char] || char);

export function getWeatherLocation(id) {
  if (typeof id !== "string") return undefined;
  return byId.get(Object.hasOwn(legacy, id) ? legacy[id] : id);
}

export function weatherPath(place) {
  const labels = [place.name];
  for (let item = byId.get(place.parent); item; item = byId.get(item.parent)) {
    if (!labels.includes(item.name)) labels.unshift(item.name);
  }
  return labels;
}

export function weatherChildren(parent = "0") {
  return [...byId.values()].filter((place) => place.parent === parent);
}

const shortRegion = (name) =>
  name.replace(
    /(?:维吾尔自治区|壮族自治区|回族自治区|自治区|特别行政区|省|市)$/u,
    "",
  );
const searchIndex = [...byId.values()].map((place) => {
  const names = weatherPath(place);
  const path = names.join("");
  const shortened = names.map(shortRegion).join("");
  const provinceAndPlace = shortRegion(names[0]) + place.name;
  const cityAndPlace = shortRegion(names.at(-2) || "") + place.name;
  return {
    place,
    search: [path, shortened, provinceAndPlace, cityAndPlace, place.alias]
      .map(normalize)
      .join("|"),
  };
});

export function searchWeatherLocations(query, limit = 24) {
  const words = query.trim().split(/\s+/).map(normalize).filter(Boolean);
  if (!words.length) return [];
  return searchIndex
    .filter(({ search }) => words.every((word) => search.includes(word)))
    .map(({ place }) => place)
    .toSorted(
      (a, b) =>
        Number(normalize(b.name) === words.join("")) -
          Number(normalize(a.name) === words.join("")) ||
        normalize(a.name).length - normalize(b.name).length,
    )
    .slice(0, limit);
}
