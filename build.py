"""把 src/ 內的檔案組成單一的 index.html（可直接放到 GitHub Pages 等靜態主機）。"""
from pathlib import Path

root = Path(__file__).parent
src = root / "src"
page = (src / "template.html").read_text(encoding="utf-8")
for key, name in [("GEO", "geo.json"), ("DATA", "data.js"), ("ENGINE", "engine.js"), ("MUSIC", "music.js"), ("SCENE", "scene.js"), ("APP", "app.js"), ("EXTRAS", "extras.js"), ("AIR", "air.js"), ("FOCUS", "focus.js")]:
    code = (src / name).read_text(encoding="utf-8")
    if key == "GEO":
        code = "const GEO=" + code.strip() + ";"
    page = page.replace("/*%s*/" % key, code, 1)

head = ('<!doctype html>\n<html lang="zh-Hant"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n')
page = head + page.replace('<div id="map"', '</head><body>\n<div id="map"', 1) + "\n</body></html>\n"
(root / "index.html").write_text(page, encoding="utf-8")
print("index.html", len(page), "bytes")
