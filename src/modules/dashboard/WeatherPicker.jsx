import React, { useRef, useState } from "react";
import { ChevronDown, MapPin, X } from "lucide-react";
import {
  getWeatherLocation,
  searchWeatherLocations,
  weatherChildren,
  weatherPath,
} from "../../domain/weather.mjs";

export default function WeatherPicker({ value, onChange, call }) {
  const dialog = useRef(null);
  const [query, setQuery] = useState("");
  const [parent, setParent] = useState("0");
  const current = getWeatherLocation(value);
  const node = getWeatherLocation(parent);
  const results = query.trim()
    ? searchWeatherLocations(query)
    : weatherChildren(parent);
  const choose = (place) => {
    onChange(place.id);
    dialog.current.close();
  };
  return (
    <>
      <button
        className="weather-location-trigger"
        type="button"
        aria-label={`天气位置 ${weatherPath(current).join(" · ")}`}
        onClick={() => {
          setQuery("");
          setParent("0");
          dialog.current.showModal();
        }}
      >
        <MapPin size={14} />
        <span>{weatherPath(current).slice(-2).join(" · ")}</span>
        <ChevronDown size={13} />
      </button>
      <dialog
        ref={dialog}
        className="weather-location-dialog"
        aria-labelledby="weather-picker-title"
      >
        <header>
          <h2 id="weather-picker-title">天气位置</h2>
          <button
            type="button"
            className="icon-button"
            aria-label="关闭天气位置"
            onClick={() => dialog.current.close()}
          >
            <X size={17} />
          </button>
        </header>
        <input
          autoFocus
          aria-label="搜索城市或区县"
          placeholder="搜索城市或区县"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {!query.trim() && node && (
          <nav aria-label="地区层级">
            <button type="button" onClick={() => setParent(node.parent)}>
              上一级
            </button>
            <span>{weatherPath(node).join(" · ")}</span>
            <button type="button" onClick={() => choose(node)}>
              选这个地区
            </button>
          </nav>
        )}
        <div className="weather-location-results">
          {results.map((place) => (
            <button
              type="button"
              key={place.id}
              onClick={() =>
                !query.trim() && weatherChildren(place.id).length
                  ? setParent(place.id)
                  : choose(place)
              }
            >
              <b>{place.name}</b>
              {query.trim() && (
                <small>{weatherPath(place).slice(0, -1).join(" · ")}</small>
              )}
            </button>
          ))}
          {!results.length && <p>没有匹配地区</p>}
        </div>
        <button
          type="button"
          className="today-attribution"
          onClick={() =>
            call("link.open", {
              url: "https://github.com/veritas123-s/Medstack-Program/blob/main/docs/WEATHER-DATA.md",
            })
          }
        >
          地区数据来源
        </button>
      </dialog>
    </>
  );
}
