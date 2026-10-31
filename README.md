# 鐵道脈動 rail-pulse

全台鐵道即時動態地圖：台鐵、高鐵、台北捷運、桃園機場捷運、台中捷運、高雄捷運與環狀輕軌的列車在地圖上依時刻移動。介面參考 [軌島 railisland.tw](https://railisland.tw/)。

## 功能

- 依系統篩選（全／台鐵／高鐵／捷運），選縣市一鍵跳轉
- 搜尋車站、車次（如 `152`）或車種（如 `自強`、`EMU3000`）
- 點列車跟車：下一站、到站倒數、停靠站列表、誤點
- 點車站看出發看板；捷運站依方向列出下一班
- 時間軸：暫停、1× / 10× / 30× / 60×、拖曳回看或預看
- 亮暗主題、最愛車站、全螢幕、快捷鍵（空白鍵、1–4、←→、F、Esc、/）

## 資料

- **預設**：依各營運單位班型推估時刻（班表推估），台鐵誤點為模擬值。
- **TDX 即時**：在 ⚙ 設定填入 [TDX](https://tdx.transportdata.tw/) 的 Client ID / Secret，台鐵與高鐵改用當日官方時刻表（`v3/Rail/TRA/DailyTrainTimetable/Today`、`v2/Rail/THSR/DailyTimetable/Today`），台鐵每分鐘套用即時誤點（`v2/Rail/TRA/LiveTrainDelay`）。金鑰只存在瀏覽器的 localStorage。
- 縣市底圖來自 [taiwan-atlas](https://www.npmjs.com/package/taiwan-atlas)（內政部資料）。
- 車站座標為整理的近似值，路線畫成站與站之間的連線，不是實際軌道線形。

## 開發

整個網站是單一靜態檔 `index.html`，由 `src/` 組成：

| 檔案 | 內容 |
| --- | --- |
| `src/data.js` | 車站座標、路線、車種與停靠規則 |
| `src/engine.js` | 路網圖、班表推估、列車位置計算、TDX 介接 |
| `src/app.js` | Canvas 地圖、面板、搜尋、時間軸、操作 |
| `src/template.html` | 版面與樣式 |
| `src/geo.json` | 縣市輪廓（由 `tools/geo.py` 從 taiwan-atlas 轉出） |

修改 `src/` 後執行：

```sh
python3 build.py
```

## 部署（GitHub Pages）

Settings → Pages → Build and deployment → Source 選 **Deploy from a branch**，Branch 選 `main`、資料夾 `/ (root)`，存檔後約一分鐘可在 `https://kevincheng840505.github.io/rail-pulse/` 看到。
