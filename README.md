# 鐵道脈動 rail-pulse

全台鐵道即時動態地圖：台鐵、高鐵、台北捷運、桃園機場捷運、台中捷運、高雄捷運與環狀輕軌的列車在地圖上依時刻移動。介面參考 [軌島 railisland.tw](https://railisland.tw/)。

## 功能

- 3D 地形（山脈起伏）與建築，列車沿 OpenStreetMap 的真實軌道行駛
- 列車依真實車型畫成一節節 3D 車廂：高鐵 700T、普悠瑪、太魯閣、EMU3000、莒光、區間車、各捷運與輕軌，編組、車長與塗裝各自不同；夜間車窗會亮燈
- 沉浸式畫面：只留「選一列車」與「漫遊」，選定後鏡頭貼近列車跟拍，有追車、車頭、側拍、環繞、路邊、空拍 6 種視角（V 切換）
- 漫遊模式每隔一段時間自動換一列車；拖動地圖會暫停跟拍，可一鍵回到列車
- 光線隨時間在清晨、白天、黃昏、夜晚之間漸變；天氣預設讀取列車所在地的即時天氣（[Open-Meteo](https://open-meteo.com/)），有晴、多雲、雨、雷雨、霧，時段與天氣都能在 ☀ 面板手動指定
- 音樂播放器：8 首 Lofi／咖啡廳／巴薩諾瓦曲子，可以點歌、拖進度條、上下首，播完自動換下一首。全部由瀏覽器即時合成（Web Audio），沒有任何音檔，也沒有版權問題
- 車站有月台、樓梯與站名牌；捷運轉乘站與台鐵高鐵共構站把各線月台疊在不同樓層，列車沿高架坡道平順上下
- 月台上的旅客在上一班車開走後陸續到來排隊，列車進站後先下後上，真的走進車門
- 點車站看接下來的班次；畫面永遠是現在的時間
- 快捷鍵：R 漫遊、V 視角、M 播放／暫停音樂、F 隱藏介面（連地圖文字一起收起來）、Esc 離開

## 資料

- **預設**：依各營運單位班型推估時刻（班表推估），台鐵誤點為模擬值。
- **TDX 即時**：在 ⚙ 設定填入 [TDX](https://tdx.transportdata.tw/) 的 Client ID / Secret，台鐵與高鐵改用當日官方時刻表（`v3/Rail/TRA/DailyTrainTimetable/Today`、`v2/Rail/THSR/DailyTimetable/Today`），台鐵每分鐘套用即時誤點（`v2/Rail/TRA/LiveTrainDelay`）。金鑰只存在瀏覽器的 localStorage。
- 縣市底圖來自 [taiwan-atlas](https://www.npmjs.com/package/taiwan-atlas)（內政部資料）。
- 軌道線形與車站位置來自 [OpenStreetMap](https://www.openstreetmap.org/copyright)（ODbL），由 GitHub Actions（`.github/workflows/rail-data.yml`）每月執行 `tools/fetch_rail.py` 下載並轉成 `data/rail.json`。找不到合理軌道的區間會改畫站間直線。
- 地圖：[MapLibre GL JS](https://maplibre.org/)，向量圖磚 [OpenFreeMap](https://openfreemap.org/)，地形高程 [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)（AWS Open Data）。

## 開發

整個網站是單一靜態檔 `index.html`，由 `src/` 組成：

| 檔案 | 內容 |
| --- | --- |
| `src/data.js` | 車站座標、路線、車種與停靠規則 |
| `src/engine.js` | 路網圖、班表推估、列車位置計算、TDX 介接 |
| `src/app.js` | MapLibre 3D 地圖、跟車鏡頭、漫遊、選車 |
| `src/music.js` | 音樂播放器的曲目，以及獨立的環境音（雨聲、雷聲）（Web Audio 即時合成） |
| `src/scene.js` | 3D 車廂造型、跟車視角、光線與天氣 |
| `data/rail.json` | 軌道線形（自動產生，勿手改） |
| `src/template.html` | 版面與樣式 |
| `src/geo.json` | 縣市輪廓（由 `tools/geo.py` 從 taiwan-atlas 轉出） |

修改 `src/` 後執行：

```sh
python3 build.py
```

## 部署（GitHub Pages）

Settings → Pages → Build and deployment → Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾 `/ (root)`，存檔後約一分鐘可在 `https://kevincheng840505.github.io/rail-pulse/` 看到。
