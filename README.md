# 鐵道脈動 rail-pulse

全台鐵道即時動態地圖：台鐵、高鐵、台北捷運、桃園機場捷運、台中捷運、高雄捷運與環狀輕軌的列車在地圖上依時刻移動。介面參考 [軌島 railisland.tw](https://railisland.tw/)。

## 功能

- 3D 地形（山脈起伏）與建築，列車沿 OpenStreetMap 的真實軌道行駛
- 列車依真實車型畫成一節節 3D 車廂：高鐵 700T、普悠瑪、太魯閣、EMU3000、莒光、區間車、各捷運與輕軌，編組、車長與塗裝各自不同；夜間車窗會亮燈
- 沉浸式畫面：只留「選一列車」與「漫遊」，選定後鏡頭貼近列車跟拍，有透視、追車、側拍、環繞、路邊、空拍 6 種視角（V 切換）
- 漫遊模式每隔一段時間自動換一列車；拖動地圖會暫停跟拍，可一鍵回到列車
- 光線隨時間在清晨、白天、黃昏、夜晚之間漸變；天氣預設讀取列車所在地的即時天氣（[Open-Meteo](https://open-meteo.com/)），有晴、多雲、雨、雷雨、霧，時段與天氣都能在 ☀ 面板手動指定
- 音樂播放器：8 首 Lofi／咖啡廳／巴薩諾瓦曲子，可以點歌、拖進度條、上下首，播完自動換下一首。全部由瀏覽器即時合成（Web Audio），沒有任何音檔，也沒有版權問題
- 車站有月台、樓梯與站名牌；捷運轉乘站與台鐵高鐵共構站把各線月台疊在不同樓層，列車沿高架坡道平順上下
- 月台上的旅客在上一班車開走後陸續到來排隊，列車進站後先下後上，真的走進車門
- 點車站看接下來的班次；畫面永遠是現在的時間
- 天上的飛機：桃園、松山、高雄、台中機場的班機在 3D 地圖上起降，起飛沿跑道爬升後轉向目的地，降落從跑道延長線以 3 度下滑角進場；國內線（往返花蓮、台東、澎湖、金門、馬祖）畫完整航程。用 TDX 當日航班的實際／預估時間（`v2/Air/FIDS/Airport/{Departure,Arrival}/{TPE,TSA,KHH,RMQ}`），讀不到時依各機場班次密度推估。跟拍的列車附近有低空飛機飛過時會打上字幕。在「選一列車」的「飛機・機場」分頁選一座機場（桃園、松山、高雄、台中）或一架正在起降的班機，就能在跑道旁觀察起降：鏡頭跟著正在起飛或降落的那架，用底部的「視角」按鈕（或 V 鍵）切換追機、側拍、迎面、翼尖、俯瞰、環繞、塔台七種視角，以及每 12 秒自動換視角的「自動」運鏡；字卡和列車一樣點一下就收成細長列，「換一架」會依序輪過機場附近正在起降的每一架，飛離機場範圍（約 25 公里或 2500 公尺）就自動換下一架；也可以直接點地圖上的飛機。飛機用 WebGL 自訂圖層繪製（模型建一次、每格只換位置，鏡頭與飛機同步不抖動），依真實機型尺寸建模（A321neo、737-800、A330-300、777-300ER、787-9、A350-900、ATR 72-600），有後掠翼、翼尖小翼、發動機、起落架與各航空公司的尾翼塗裝，機型依航空公司與航線推估。機場畫出跑道（含中心線、斑馬線、著陸區標線）、滑行道、停機坪、航廈、廊橋、塔台與棚廠，航廈與塔台位置為大略擺放。航線與跑道位置為推估
- 沿線景點字幕：跟拍的列車經過約 55 處景點（龜山島、多良車站、伯朗大道、台北 101⋯）或跨越北回歸線時，畫面上方淡入一行介紹
- 營運快訊跑馬燈：每 5 分鐘讀取台鐵、高鐵與各捷運的營運通阻，有停駛、延誤等狀況時才在畫面上方出現；網址加 `?alertdemo` 可預覽樣式。兩者都能在 ⚙ 關閉，隱藏介面時仍會顯示
- 畫質（⚙ 設定）：預設「省電」，動畫手機每秒 30 格、電腦 60 格、像素比 1、不畫地形與山影、背景車廂列數減半、不畫建築立面與月台旅客；想看完整效果可改成「高」（不限幀率）。開場畫面後面只畫平面地圖；分頁切到背景時暫停讀取 TDX，回到前景再補讀
- 快捷鍵：R 漫遊、V 視角、M 播放／暫停音樂、F 隱藏介面（連地圖文字一起收起來）、Esc 離開

## 資料

- **TDX 即時（內建）**：訪客不用自己的金鑰。網站讀 GitHub Actions 定時從 [TDX](https://tdx.transportdata.tw/) 抓下來的資料（見下方），台鐵與高鐵改用當日官方時刻表（`v3/Rail/TRA/DailyTrainTimetable/Today`、`v2/Rail/THSR/DailyTimetable/Today`），台鐵套用即時誤點（約每 10 分鐘更新，`v2/Rail/TRA/LiveTrainDelay`），捷運與輕軌改用官方站間行駛時間、班距與首末班車（`v2/Rail/Metro/{S2STravelTime,Frequency,FirstLastTimetable}/{TRTC,TYMC,TMRT,KRTC,KLRT}`，含北捷的區間車路線），並每 5 分鐘讀取營運通阻（`v3/Rail/TRA/Alert`、`v2/Rail/THSR/AlertInfo`、`v2/Rail/Metro/Alert/{TRTC,TYMC,TMRT,KRTC,KLRT}`）。
- **讀不到 TDX 時**：依各營運單位班型推估時刻（班表推估），台鐵誤點為模擬值，三分鐘後自動重試。
- 縣市底圖來自 [taiwan-atlas](https://www.npmjs.com/package/taiwan-atlas)（內政部資料）。
- 軌道線形與車站位置來自 [OpenStreetMap](https://www.openstreetmap.org/copyright)（ODbL），由 GitHub Actions（`.github/workflows/rail-data.yml`）每月執行 `tools/fetch_rail.py` 下載並轉成 `data/rail.json`。找不到合理軌道的區間會改畫站間直線。
- 地圖：[MapLibre GL JS](https://maplibre.org/)，向量圖磚 [OpenFreeMap](https://openfreemap.org/)，地形高程 [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)（AWS Open Data）。

## 內建 TDX（GitHub Actions 定時抓資料）

GitHub Pages 是公開的靜態網站，放在前端的金鑰任何人都看得到，所以網站不直接連 TDX，也不經過其他伺服器：

1. 在 repo 的 Settings → Secrets and variables → Actions 加入 `TDX_CLIENT_ID`、`TDX_CLIENT_SECRET`。
2. `.github/workflows/tdx-data.yml` 每 10 分鐘執行 `tools/fetch_tdx.py`，把網站要用的資料存成 JSON，推到 `tdx-data` 分支（每次覆蓋，只留最新一份）。即時誤點、航班、營運快訊每次都抓；當日時刻表每小時、捷運資料每天抓一次。
3. 網站從 `https://raw.githubusercontent.com/kevincheng840505/rail-pulse/tdx-data/` 讀這些檔案（`src/engine.js` 的 `TDX_DATA`）。

代價是即時誤點約 10～15 分鐘更新一次（GitHub 排程常會晚幾分鐘），而不是每分鐘。

## 開發

整個網站是單一靜態檔 `index.html`，由 `src/` 組成：

| 檔案 | 內容 |
| --- | --- |
| `src/data.js` | 車站座標、路線、車種與停靠規則 |
| `src/engine.js` | 路網圖、班表推估、列車位置計算、TDX 介接 |
| `src/app.js` | MapLibre 3D 地圖、跟車鏡頭、漫遊、選車 |
| `src/music.js` | 音樂播放器的曲目，以及獨立的環境音（雨聲、雷聲）（Web Audio 即時合成） |
| `src/air.js` | 機場、航班與 3D 飛機 |
| `src/extras.js` | 沿線景點清單與字幕、營運快訊跑馬燈 |
| `src/models.js` | 3D 模型產生器（車廂、飛機、旅客的曲面網格）與共用的 WebGL 繪製程式 |
| `src/scene.js` | 車型塗裝、車廂擺放、跟車視角、光線與天氣 |
| `tools/fetch_tdx.py` | GitHub Actions 定時抓 TDX 資料（金鑰放在 repo Secrets） |
| `data/rail.json` | 軌道線形（自動產生，勿手改） |
| `src/template.html` | 版面與樣式 |
| `src/geo.json` | 縣市輪廓（由 `tools/geo.py` 從 taiwan-atlas 轉出） |

修改 `src/` 後執行：

```sh
python3 build.py
```

## 部署（GitHub Pages）

Settings → Pages → Build and deployment → Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾 `/ (root)`，存檔後約一分鐘可在 `https://kevincheng840505.github.io/rail-pulse/` 看到。
