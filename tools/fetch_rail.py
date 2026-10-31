"""從 OpenStreetMap（Overpass API）下載台灣軌道線形，算出每兩個相鄰車站之間沿著真實軌道的路徑。

輸出 data/rail.json：
  {"segments": {"TRA:基隆|三坑": [[lon, lat], ...], ...}, "source": ..., "generated": ...}
鍵值的車站順序與 src/data.js 中路線的列車順序相同；反方向由前端自行反轉。
找不到合理路徑的區間不輸出，前端會改用兩站直線。

用法：python3 tools/fetch_rail.py [overpass.json]
  給了檔案就直接讀檔（離線測試用），否則向 Overpass API 下載。
"""
import heapq
import json
import math
import re
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
(
  way["railway"~"^(rail|subway|light_rail|narrow_gauge|monorail)$"]({s},{w},{n},{e});
  node["railway"~"^(station|halt|stop)$"]["name"]({s},{w},{n},{e});
);
out geom tags;""".format(s=BBOX[0], w=BBOX[1], n=BBOX[2], e=BBOX[3])

# 不適合用來規劃營運路線的側線
SKIP_SERVICE = {"yard", "siding", "spur"}


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


def haversine(a, b):
    lon1, lat1, lon2, lat2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def load_network():
    """從 src/data.js 讀出各系統車站座標與路線車站順序。"""
    js = (ROOT / "src" / "data.js").read_text(encoding="utf-8")
    stations = {}
    for sys_, block in re.findall(r"^(\w+): `([^`]*)`", js, re.M):
        for row in block.strip().splitlines():
            name, lat, lon = row.split(",")
            stations[(sys_, name.strip())] = (float(lon), float(lat))
    lines = []
    for sys_, st in re.findall(r"\{ sys:'(\w+)', id:'\w+',[^}]*?st:'([^']+)'", js):
        lines.append((sys_, st.split(" ")))
    return stations, lines


def norm(name):
    """把站名正規化，方便比對 OSM 與本專案的命名差異。"""
    n = name.replace("臺", "台").replace(" ", "")
    n = re.sub(r"^(高鐵|台鐵|捷運)", "", n)
    n = re.sub(r"[（(].*?[)）]", "", n)
    n = re.sub(r"(車站|站)$", "", n)
    return n


def way_class(tags):
    rw = tags.get("railway")
    if rw in ("subway", "light_rail", "monorail"):
        return "metro"
    if tags.get("highspeed") == "yes":
        return "hsr"
    return "rail"


# 各系統可走的軌道類別（依序嘗試）
SYSTEM_CLASSES = {
    "TRA": [("rail",)],
    "THSR": [("hsr",), ("hsr", "rail")],
    "TRTC": [("metro",), ("metro", "rail")],
    "TYMC": [("metro", "rail")],
    "TMRT": [("metro",), ("metro", "rail")],
    "KRTC": [("metro",), ("metro", "rail")],
}


class Graph:
    def __init__(self, ways, classes):
        self.coord = {}
        self.adj = {}
        for w in ways:
            if w["cls"] not in classes:
                continue
            ids, geom = w["nodes"], w["geometry"]
            for i, nid in enumerate(ids):
                self.coord[nid] = (geom[i]["lon"], geom[i]["lat"])
            for a, b in zip(ids, ids[1:]):
                d = haversine(self.coord[a], self.coord[b])
                self.adj.setdefault(a, []).append((b, d))
                self.adj.setdefault(b, []).append((a, d))
        # 0.01 度格網，加速找最近節點
        self.grid = {}
        for nid, (lon, lat) in self.coord.items():
            self.grid.setdefault((int(lon * 100), int(lat * 100)), []).append(nid)

    def nearest(self, p, max_m=700):
        gx, gy = int(p[0] * 100), int(p[1] * 100)
        best, bd = None, max_m
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for nid in self.grid.get((gx + dx, gy + dy), ()):
                    d = haversine(p, self.coord[nid])
                    if d < bd:
                        best, bd = nid, d
        return best

    def path(self, a, b, limit):
        dist, prev, pq = {a: 0.0}, {}, [(0.0, a)]
        while pq:
            d, u = heapq.heappop(pq)
            if u == b:
                break
            if d > dist.get(u, 1e18) or d > limit:
                continue
            for v, w in self.adj.get(u, ()):
                nd = d + w
                if nd < dist.get(v, 1e18):
                    dist[v], prev[v] = nd, u
                    heapq.heappush(pq, (nd, v))
        if b not in dist or dist[b] > limit:
            return None, None
        out = [b]
        while out[-1] != a:
            out.append(prev[out[-1]])
        out.reverse()
        return [self.coord[n] for n in out], dist[b]


def simplify(pts, tol_m=12):
    """Douglas-Peucker（以公尺為單位的近似平面）。"""
    if len(pts) < 3:
        return pts
    lat0 = math.radians(pts[0][1])
    kx, ky = 111320 * math.cos(lat0), 110570
    xy = [(p[0] * kx, p[1] * ky) for p in pts]
    keep = [False] * len(pts)
    keep[0] = keep[-1] = True
    stack = [(0, len(pts) - 1)]
    while stack:
        i, j = stack.pop()
        (x1, y1), (x2, y2) = xy[i], xy[j]
        dx, dy = x2 - x1, y2 - y1
        L = math.hypot(dx, dy) or 1e-9
        best, bi = 0, -1
        for k in range(i + 1, j):
            d = abs(dy * (xy[k][0] - x1) - dx * (xy[k][1] - y1)) / L
            if d > best:
                best, bi = d, k
        if best > tol_m:
            keep[bi] = True
            stack += [(i, bi), (bi, j)]
    return [p for p, k in zip(pts, keep) if k]


def main():
    raw = json.loads(Path(sys.argv[1]).read_text()) if len(sys.argv) > 1 else download()
    ways, osm_st = [], {}
    for el in raw.get("elements", []):
        if el.get("type") == "node":
            nm = el.get("tags", {}).get("name")
            if nm:
                osm_st.setdefault(norm(nm), []).append((el["lon"], el["lat"]))
            continue
        if el.get("type") != "way" or "geometry" not in el:
            continue
        tags = el.get("tags", {})
        if tags.get("service") in SKIP_SERVICE or tags.get("usage") in ("industrial", "military", "tourism"):
            continue
        ways.append({"nodes": el["nodes"], "geometry": el["geometry"], "cls": way_class(tags)})
    print("軌道路段", len(ways), flush=True)

    stations, lines = load_network()
    # 以 OSM 車站位置校正本專案的近似座標（同名且 3 公里內）
    moved = 0
    for key, p in list(stations.items()):
        cands = [q for q in osm_st.get(norm(key[1]), []) if haversine(p, q) < 3000]
        if cands:
            stations[key] = min(cands, key=lambda q: haversine(p, q))
            moved += 1
    print("以 OSM 校正車站位置", moved, "/", len(stations), flush=True)
    graphs = {}
    snapped = {}
    segments, missing = {}, []
    for sys_, names in lines:
        options = SYSTEM_CLASSES[sys_]
        for a, b in zip(names, names[1:]):
            key = "%s:%s|%s" % (sys_, a, b)
            rkey = "%s:%s|%s" % (sys_, b, a)
            if key in segments or rkey in segments:
                continue
            pa, pb = stations[(sys_, a)], stations[(sys_, b)]
            straight = haversine(pa, pb)
            found = None
            for classes in options:
                g = graphs.get(classes) or graphs.setdefault(classes, Graph(ways, set(classes)))
                na, nb = g.nearest(pa, 1500), g.nearest(pb, 1500)
                if na is None or nb is None:
                    continue
                pts, length = g.path(na, nb, limit=straight * 2.2 + 2500)
                if pts:
                    found = pts
                    snapped.setdefault("%s:%s" % (sys_, a), pts[0])
                    snapped.setdefault("%s:%s" % (sys_, b), pts[-1])
                    break
            if not found:
                missing.append(key)
                continue
            segments[key] = [[round(x, 5), round(y, 5)] for x, y in simplify(found)]

    out = {
        "source": "© OpenStreetMap contributors (ODbL)",
        "generated": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%MZ"),
        "segments": segments,
        # 車站在軌道上的位置；沒有軌道線形的車站用 OSM 校正後的座標
        "stations": {k: [round(v[0], 5), round(v[1], 5)] for k, v in
                     {**{"%s:%s" % k: v for k, v in stations.items()}, **snapped}.items()},
    }
    (ROOT / "data").mkdir(exist_ok=True)
    (ROOT / "data" / "rail.json").write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("完成：%d 個區間有軌道線形，%d 個改用直線" % (len(segments), len(missing)))
    for k in missing:
        print("  直線：", k)


if __name__ == "__main__":
    main()
