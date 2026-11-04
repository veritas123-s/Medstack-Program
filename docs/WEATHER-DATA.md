# 天气地区数据

- 中国大陆地区名称和参考坐标来自 [AreaCity 2025.251231.260403](https://github.com/xiangyuecn/AreaCity-JsSpider-StatsGov/releases/tag/2025.251231.260403) 的三级开源数据，项目采用 [MIT 许可](https://github.com/xiangyuecn/AreaCity-JsSpider-StatsGov/blob/master/LICENSE)。应用只使用名称和代表点，未打包地图边界。
- 香港各区和澳门各堂区、路氹城的代表点来自 [GeoNames](https://www.geonames.org/export/)，CC BY 4.0。
- 台湾地区的区、乡镇市中心来自[中華郵政行政區中心點](https://data.gov.tw/dataset/25489)，按县市组织，县市参考点由所辖地点计算，适用[政府資料開放授權條款第 1 版](https://data.gov.tw/license)。
- 和康县、和安县、岑岭县使用公开驻地参考点，参考[新疆设立岑岭县公告](https://www.xinjiang.gov.cn/xinjiang/tzgg/202603/285e5d25b8ad4eae8df6b0f0efe847f6.shtml)、[红柳镇 Wikidata](https://www.wikidata.org/wiki/Q5208941)及[岑岭县公开地图点](https://www.openstreetmap.org/node/13681147819)。坐标已取整到小数点后两位，仅供查询地区天气预报。
- 预报来自 [MET Norway](https://api.met.no/weatherapi/locationforecast/2.0/documentation)，天气文本已翻译，温度四舍五入。应用只向预报服务查询所选地区，不读取 GPS。

复建时，将 AreaCity 的 `ok_data_level3.csv` 和 `ok_geo.csv`、GeoNames 的 `HK/HK.txt` 和 `MO/MO.txt` 及中華郵政下载的 `tw-centers.xml` 放进同一输入目录，从项目根目录运行 `python scripts/build-weather-locations.py <输入目录>`。
