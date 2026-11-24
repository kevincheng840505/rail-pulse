"""用 GitHub Secrets 裡的 TDX 金鑰抓網站需要的資料，存成靜態 JSON（給 GitHub Actions 定時執行）。

金鑰只存在 GitHub 的 Secrets，不會出現在網站或 repo 裡；網站改讀這裡產生的檔案，
訪客不需要自己的金鑰，也不會有大家共用一把金鑰而超過頻率限制的問題。

用法：TDX_CLIENT_ID=… TDX_CLIENT_SECRET=… python3 tools/fetch_tdx.py <輸出資料夾>
輸出資料夾裡已經有的檔案會沿用：每天才變一次的資料（時刻表、捷運）每小時才重抓。"""
import json, os, sys, time, urllib.parse, urllib.request

OPS = ["TRTC", "TYMC", "TMRT", "KRTC", "KLRT"]
# (路徑, 多久重抓一次（秒）)
JOBS = [("v2/Rail/TRA/LiveTrainDelay", 0)]
JOBS += [(f"v2/Air/FIDS/Airport/{k}/{ap}", 0) for ap in ["TPE", "TSA", "KHH", "RMQ"] for k in ["Departure", "Arrival"]]
JOBS += [("v3/Rail/TRA/Alert", 0), ("v2/Rail/THSR/AlertInfo", 0)] + [(f"v2/Rail/Metro/Alert/{op}", 0) for op in OPS]
JOBS += [("v3/Rail/TRA/DailyTrainTimetable/Today", 3000), ("v2/Rail/THSR/DailyTimetable/Today", 3000)]
JOBS += [(f"v2/Rail/Metro/{kind}/{op}", 20 * 3600) for kind in ["S2STravelTime", "Frequency", "FirstLastTimetable"] for op in OPS
         if not (kind == "Frequency" and op == "KLRT")]  # 輕軌沒有班距資料（TDX 回 400）


def fname(path):
    return path.replace("/", "_") + ".json"


def token():
    body = urllib.parse.urlencode({"grant_type": "client_credentials", "client_id": os.environ["TDX_CLIENT_ID"], "client_secret": os.environ["TDX_CLIENT_SECRET"]}).encode()
    req = urllib.request.Request("https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token", data=body, headers={"content-type": "application/x-www-form-urlencoded"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["access_token"]


def get(tk, path):
    for attempt in range(5):
        req = urllib.request.Request("https://tdx.transportdata.tw/api/basic/" + path + "?$format=JSON", headers={"authorization": "Bearer " + tk, "accept-encoding": "identity"})
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429 and attempt < 4:
                # 超過頻率限制：照 Retry-After 等，沒給就 5、10、20、40 秒
                try:
                    wait = float(e.headers.get("Retry-After") or 0)
                except ValueError:
                    wait = 0
                time.sleep(max(wait, 5 * 2 ** attempt))
                continue
            raise


def slim(o):
    """拿掉網站用不到的英日韓文名稱（只讀 Zh_tw），台鐵時刻表從 4.4 MB 減到 3.3 MB，手機解析也快一些"""
    if isinstance(o, dict):
        if "Zh_tw" in o:
            o = {k: v for k, v in o.items() if k not in ("En", "Ja", "Kr")}
        return {k: slim(v) for k, v in o.items()}
    if isinstance(o, list):
        return [slim(x) for x in o]
    return o


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "tdx-out"
    os.makedirs(out, exist_ok=True)
    meta_path = os.path.join(out, "meta.json")
    try:
        meta = json.load(open(meta_path, encoding="utf-8"))
    except Exception:
        meta = {}
    files = meta.setdefault("files", {})
    tk, now, ok, fail = token(), time.time(), 0, 0
    for path, every in JOBS:
        f = fname(path)
        if every and f in files and now - files[f] < every and os.path.exists(os.path.join(out, f)):
            continue
        try:
            data = get(tk, path)
        except Exception as e:  # 單一項目失敗就沿用舊檔
            print("失敗", path, e)
            fail += 1
            continue
        with open(os.path.join(out, f), "w", encoding="utf-8") as fp:
            json.dump(slim(data), fp, ensure_ascii=False, separators=(",", ":"))
        files[f] = int(now)
        ok += 1
        time.sleep(1.0)  # TDX 對每把金鑰有頻率限制，一秒最多一個請求比較保險
    meta["updated"] = int(now)
    with open(meta_path, "w", encoding="utf-8") as fp:
        json.dump(meta, fp, ensure_ascii=False, indent=1)
    print(f"更新 {ok} 項，失敗 {fail} 項")
    if ok == 0 and fail:
        sys.exit(1)


if __name__ == "__main__":
    main()
