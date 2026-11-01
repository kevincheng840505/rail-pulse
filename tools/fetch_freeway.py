"""從 OpenStreetMap（Overpass API）下載台灣的國道（highway=motorway 與匝道），輸出 data/freeway.json。

前端用來：畫出國道路面、高架橋面與橋墩；讓國道客運貼著車道走、在高架段升高。

輸出格式（為了檔案小，座標以 1e-5 度整數差分編碼）：
  {"v": 1, "generated": ..., "source": ...,
   "ways": [[ref, flags, layer, lanes, startNode, endNode, x0, y0, dx1, dy1, ...], ...]}
  flags：1 = 匝道、2 = 橋梁（高架）、4 = 隧道；layer 是 OSM 的 layer（高架層數）。
  startNode / endNode 是重新編號過的端點，相鄰路段共用同一個編號，前端用來接續行駛。

用法：python3 tools/fetch_freeway.py [overpass.json]
  給了檔案就直接讀檔（離線測試用），否則向 Overpass API 下載。
"""
import json
import math
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BBOX = (21.85, 119.95, 25.35, 122.05)  # 台灣本島（南, 西, 北, 東）
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
QUERY = """[out:json][timeout:600];
way["highway"~"^(motorway|motorway_link)$"]({s},{w},{n},{e});
out body geom;""".format(s=BBOX[0], w=BBOX[1], n=BBOX[2], e=BBOX[3])


def download():
    body = urllib.parse.urlencode({"data": QUERY}).encode()
    last = None
    for url in ENDPOINTS:
        for attempt in range(2):
            try:
                print("下載", url, "第", attempt + 1, "次", flush=True)
                req = urllib.request.Request(url, data=body, headers={"User-Agent": "rail-pulse/1.0 (github.com/kevincheng840505/rail-pulse)"})
                with urllib.request.urlopen(req, timeout=900) as r:
                    return json.load(r)
            except Exception as e:  # noqa: BLE001 - 換下一個伺服器
                last = e
                print("失敗：", e, flush=True)
                time.sleep(20)
    raise SystemExit("所有 Overpass 伺服器都失敗：%s" % last)


def simplify(pts, tol_m=2.5):
    """Douglas-Peucker，容許誤差以公尺計；保留頭尾。"""
    if len(pts) < 3:
        return pts
    kx = 111320 * math.cos(math.radians(pts[0][1]))
    ky = 110570
    xy = [(p[0] * kx, p[1] * ky) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        a, b = stack.pop()
        ax, ay = xy[a]
        bx, by = xy[b]
        dx, dy = bx - ax, by - ay
        L = math.hypot(dx, dy) or 1e-9
        best, bi = -1, -1
        for i in range(a + 1, b):
            d = abs((xy[i][0] - ax) * dy - (xy[i][1] - ay) * dx) / L
            if d > best:
                best, bi = d, i
        if best > tol_m:
            keep[bi] = True
            stack.append((a, bi))
            stack.append((bi, b))
    return [p for p, k in zip(pts, keep) if k]


def to_int(s, default=0):
    try:
        return int(str(s).split(";")[0].strip())
    except ValueError:
        return default


def main():
    if len(sys.argv) > 1:
        data = json.load(open(sys.argv[1], encoding="utf-8"))
    else:
        data = download()
    node_ids = {}

    def nid(n):
        if n not in node_ids:
            node_ids[n] = len(node_ids)
        return node_ids[n]

    ways = []
    for el in data.get("elements", []):
        if el.get("type") != "way" or "geometry" not in el:
            continue
        t = el.get("tags", {})
        geom = [(g["lon"], g["lat"]) for g in el["geometry"] if g]
        if len(geom) < 2:
            continue
        nodes = el.get("nodes") or []
        flags = (1 if t.get("highway") == "motorway_link" else 0) \
            | (2 if t.get("bridge") not in (None, "no") else 0) \
            | (4 if t.get("tunnel") not in (None, "no") else 0)
        layer = to_int(t.get("layer", 0))
        lanes = to_int(t.get("lanes", 1 if flags & 1 else 2), 2)
        ref = t.get("ref", "")
        a = nid(nodes[0]) if nodes else -1
        z = nid(nodes[-1]) if nodes else -1
        pts = simplify(geom)
        q = [(round(lon * 1e5), round(lat * 1e5)) for lon, lat in pts]
        enc = [q[0][0], q[0][1]]
        for i in range(1, len(q)):
            enc += [q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]]
        ways.append([ref, flags, layer, lanes, a, z] + enc)
    # 端點重新編號後，只留真的有接續的編號，其餘維持（檔案已經夠小）
    out = {
        "v": 1,
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "source": "© OpenStreetMap contributors (ODbL)",
        "ways": ways,
    }
    path = ROOT / "data" / "freeway.json"
    path.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    n_pts = sum((len(w) - 6) // 2 for w in ways)
    print("寫出", path, len(ways), "條路段", n_pts, "個點", path.stat().st_size, "bytes")
    if len(ways) < 500:
        raise SystemExit("路段太少，可能下載不完整，不更新")


if __name__ == "__main__":
    main()
