#!/usr/bin/env python3
"""Generate the CenterMint site (GitHub Pages, static).

    python3 tools/build.py

What it writes:
  - index.html and <lang>/index.html for 11 languages, from tools/templates/home.html
    plus tools/content/<lang>.json (page copy, SEO fields, JSON-LD) and tools/content/ui.json
    (interface strings added in the 2026-09 redesign).
  - guides/**/index.html, calculator pages: the article content lives in tools/src/pages/
    (edit it there); this script wraps it in the new header/footer and stylesheet.
  - sitemap.xml (lastmod = today for every generated page).
Needs: Python 3.10+, jinja2, beautifulsoup4, segno.
Assets are built separately: tools/make_assets.py, tools/import_shots.py, tools/render_og.py,
tools/p5-video/ (see its README).
"""
from __future__ import annotations

import datetime as dt
import hashlib
import json
import re
from pathlib import Path

import segno
from bs4 import BeautifulSoup
from jinja2 import Environment, FileSystemLoader
from markupsafe import Markup

ROOT = Path(__file__).resolve().parent.parent
TOOLS = ROOT / "tools"
BASE = "https://centermint.app/"
LANGS = ["en", "zh-Hans", "zh-Hant", "ja", "ko", "vi", "de", "fr", "es", "it", "pt-BR"]
NAMES = {"en": "English", "zh-Hans": "简体中文", "zh-Hant": "繁體中文", "ja": "日本語", "ko": "한국어",
         "vi": "Tiếng Việt", "de": "Deutsch", "fr": "Français", "es": "Español", "it": "Italiano", "pt-BR": "Português"}
OG_LOCALES = {"en": "en_US", "zh-Hans": "zh_CN", "zh-Hant": "zh_TW", "ja": "ja_JP", "ko": "ko_KR", "vi": "vi_VN",
              "de": "de_DE", "fr": "fr_FR", "es": "es_ES", "it": "it_IT", "pt-BR": "pt_BR"}
# The app itself is localized in these six languages; other pages show the English screenshots.
SHOT_LANGS = {"en", "ja", "zh-Hans", "zh-Hant", "ko", "vi"}
SHOTS = ["result", "guide", "value", "closeups", "ledger", "share"]
TODAY = dt.date.today().isoformat()

env = Environment(loader=FileSystemLoader(TOOLS / "templates"), autoescape=True, trim_blocks=False)


def sample_card() -> dict:
    """Geometry of the real sample card from the measured scan (tools/make_real_card.py); ratios from the app (charizard-app.json).

    Overlays use a card that is 1040 units wide, so line widths, labels and marks keep one scale in CSS.
    """
    m = json.loads((TOOLS / "src/art/real/charizard-measure.json").read_text())
    w, h = m["size"]
    b = m["border_px"]
    k = 1040 / w
    vw, vh = 1040, round(h * k, 1)
    edge = round(0.2 * w * k, 1)                 # close-up square: 20 % of the card width (make_real_card.py)
    span = round((0.2 * w + 0.16 * w) * k, 1)     # edge close-ups also reach 16 % of the width into the mat
    app = json.loads((TOOLS / "src/art/real/charizard-app.json").read_text())
    lr, tb = app["lr"], app["tb"]           # the app's own reading, so the page matches the App screenshots
    card = dict(
        tex_w=w, tex_h=h, vw=vw, vh=vh,
        l=round(b["l"] * k, 1), r=round((w - b["r"]) * k, 1), t=round(b["t"] * k, 1), b=round((h - b["b"]) * k, 1),
        lr=f"{lr[0]:.1f} / {lr[1]:.1f}", tb=f"{tb[0]:.1f} / {tb[1]:.1f}",
        lr_a=f"{lr[0]:.1f}", lr_b=f"{lr[1]:.1f}", tb_a=f"{tb[0]:.1f}", tb_b=f"{tb[1]:.1f}",
        # PSA 10 front reference gauge: 50/50 at x=10, 55/45 at x=130, 60/40 at x=250.
        gauge_x=round(10 + (max(lr[0], lr[1]) - 50) * 24, 1),
        within=max(lr[0], lr[1]) <= 55 and max(tb[0], tb[1]) <= 55,
        close=[(0, 0, edge, edge), ((vw - span) / 2, 0, span, edge), (vw - edge, 0, edge, edge),
               (0, (vh - span) / 2, edge, span), (vw - edge, (vh - span) / 2, edge, span),
               (0, vh - edge, edge, edge), ((vw - span) / 2, vh - edge, span, edge), (vw - edge, vh - edge, edge, edge)],
    )
    # For the WebGL stage: the same lines in texture pixels.
    card["json"] = json.dumps({"w": w, "h": h, "l": b["l"], "r": w - b["r"], "t": b["t"], "b": h - b["b"], "lr": lr, "tb": tb,
                               "close": [[round(x / k), round(y / k), round(cw / k), round(ch / k)] for x, y, cw, ch in card["close"]]})
    assert card["within"], "the sample card must sit inside the PSA 10 front reference the page claims"
    return card


CARD = sample_card()


def page_url(lang: str) -> str:
    return BASE if lang == "en" else f"{BASE}{lang}/"


def version(path: str) -> str:
    p = ROOT / path
    return hashlib.md5(p.read_bytes()).hexdigest()[:8] if p.exists() else "0"


def badge_width(lang: str) -> str:
    svg = (ROOT / f"assets/badges/app-store-{lang}.svg").read_text()
    width = float(re.search(r'width="([\d.]+)"', svg).group(1))
    return f"{width:.2f}".rstrip("0").rstrip(".")


def qr_svg(url: str, label: str) -> Markup:
    raw = segno.make(url, error="m").svg_inline(scale=1, border=2, dark="#14161A")
    size = re.search(r'width="(\d+)"', raw).group(1)
    raw = re.sub(r'<svg width="\d+" height="\d+" class="segno">',
                 f'<svg viewBox="0 0 {size} {size}" role="img" aria-label="{label}" shape-rendering="crispEdges">'
                 f'<rect width="{size}" height="{size}" fill="#fff"/>', raw)
    return Markup(raw)


def verification_meta(raw: str) -> Markup:
    """Search-console verification tags, re-emitted as plain void <meta> elements."""
    tag = BeautifulSoup(raw, "html.parser").meta
    return Markup('<meta name="{}" content="{}">').format(tag["name"], tag["content"])


def markup_tree(value):
    """Page copy in content/<lang>.json is already HTML (entities escaped), so mark it safe."""
    if isinstance(value, str):
        return Markup(value)
    if isinstance(value, list):
        return [markup_tree(v) for v in value]
    if isinstance(value, dict):
        return {k: markup_tree(v) for k, v in value.items()}
    return value


# Screenshots that show a card. The first App Store set (raw-v3) used a drawn sample card; the site only shows
# real cards, so for these a raw-v3 image is replaced by the English raw-site one until the language's own arrives.
CARD_SHOTS = {"result", "guide", "closeups", "share"}


def shots_for(lang: str) -> dict:
    src_lang = lang if lang in SHOT_LANGS else "en"
    manifest_path = ROOT / "assets/shots/sources.json"
    sources = json.loads(manifest_path.read_text()) if manifest_path.exists() else {}
    out = {}
    for name in SHOTS:
        for cand in (src_lang, "en"):
            p = ROOT / f"assets/shots/{cand}/{name}.webp"
            if not p.exists() or (name in CARD_SHOTS and sources.get(f"{cand}/{name}") != "raw-site"):
                continue
            out[name] = {"path": f"assets/shots/{cand}/{name}.webp", "real": True}
            break
        else:
            out[name] = {"path": "assets/shots/placeholder.webp", "real": False}
    return out


def jsonld_blocks(content: dict, shots: dict) -> list[Markup]:
    blocks = []
    for block in content["jsonld"]:
        block = json.loads(json.dumps(block))
        if block.get("@type") == "MobileApplication":
            block["image"] = f"{BASE}assets/img/og.png"
            real = [f"{BASE}{s['path']}" for s in shots.values() if s["real"]]
            if real:
                block["screenshot"] = real
        text = json.dumps(block, ensure_ascii=False, separators=(", ", ": "))
        blocks.append(Markup(text.replace("</", "<\\/")))
    return blocks


def worth_guide_url(lang: str) -> str:
    if lang in ("ja", "zh-Hans"):
        return f"{BASE}{lang}/guides/worth-grading/"
    if lang == "zh-Hant":
        return f"{BASE}zh-Hans/guides/worth-grading/"
    return f"{BASE}guides/worth-grading/"


def build_home(lang: str, ui_all: dict, v: dict) -> Path:
    content = json.loads((TOOLS / f"content/{lang}.json").read_text(encoding="utf-8"))
    ui = ui_all[lang]
    rel = "" if lang == "en" else "../"
    shots = shots_for(lang)
    for s in shots.values():
        s["src"] = rel + s["path"]
    app_url = BeautifulSoup(content["hero"]["app_url"], "html.parser").text if "&amp;" in content["hero"]["app_url"] else content["hero"]["app_url"]
    ctx = dict(
        lang=lang, langs=LANGS, names=NAMES, page_url=page_url, url=page_url(lang), base=BASE, rel=rel, v=v,
        title=content["title"], description=content["description"],
        og_title=content["og_title"], og_description=content["og_description"], og_locale=OG_LOCALES[lang],
        og_alternates=[OG_LOCALES[l] for l in LANGS if l != lang],
        extra_head=[verification_meta(m) for m in content["extra_head"]], jsonld=jsonld_blocks(content, shots),
        nav_label=content["nav_label"], ui=ui, shots=shots, app_url=app_url, badge_w=badge_width(lang),
        qr=qr_svg(app_url, ui["badge_alt"]), qr_foot=qr_svg(app_url, ui["badge_alt"]),
        worth_guide=worth_guide_url(lang), card=CARD,
        **{k: markup_tree(content[k]) for k in ("hero", "new", "measure", "pricing", "limits", "howto", "faq", "tools", "footer")},
        sources_label=Markup(content["sources_label"]),
    )
    html = env.get_template("home.html").render(**ctx)
    out = ROOT / ("index.html" if lang == "en" else f"{lang}/index.html")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return out


# ---------------------------------------------------------------- guides
GUIDE_LANG_BY_PREFIX = {"ja": "ja", "zh-Hans": "zh-Hans"}


def build_guide(src: Path, ui_all: dict, v: dict) -> Path:
    rel_path = src.relative_to(TOOLS / "src/pages")
    soup = BeautifulSoup(src.read_text(encoding="utf-8"), "html.parser")
    lang = soup.html.get("lang", "en")
    ui = ui_all[lang]
    depth = len(rel_path.parts) - 1
    rel = "../" * depth

    head = soup.head
    for tag in head.find_all(["link", "script"]):
        if tag.name == "link" and tag.get("rel") == ["stylesheet"]:
            tag.decompose()
        elif tag.name == "script" and tag.get("src"):
            tag.decompose()
    for tag in head.find_all("meta", attrs={"charset": True}) + head.find_all("meta", attrs={"name": "viewport"}):
        tag.decompose()
    card = head.find("meta", attrs={"name": "twitter:card"})
    if card:
        card["content"] = "summary_large_image"
    jsonld = "".join(str(s) for s in head.find_all("script", type="application/ld+json"))
    for s in head.find_all("script", type="application/ld+json"):
        s.decompose()
    head_meta = "".join(str(c) for c in head.contents if str(c).strip())

    nav_links, alternates = [], [{"lang": lang, "href": BASE + str(rel_path.parent) + "/"}]
    for a in soup.header.nav.find_all("a"):
        if a.get("lang"):
            alternates.append({"lang": a["lang"], "href": a["href"]})
        else:
            nav_links.append({"href": a["href"], "text": a.get_text(), "current": a.has_attr("aria-current")})
    alternates.sort(key=lambda a: LANGS.index(a["lang"]))
    home = nav_links[0]["href"]
    crumb = next((a["text"] for a in nav_links if a["current"]), soup.h1.get_text())

    main = soup.main
    eyebrow = main.find("p", class_="eyebrow")
    if eyebrow:
        eyebrow.decompose()
    cta = main.find("a", attrs={"data-app-link": True})
    app_url = cta["href"] if cta else "https://apps.apple.com/app/id6760965068"
    main_html = "".join(str(c) for c in main.contents)

    foot = soup.footer
    byline_el = foot.find("p", class_="byline")
    byline = Markup(byline_el.decode_contents()) if byline_el else None
    foot_links = [{"href": a["href"], "text": a.get_text()} for a in foot.find_all("a")]
    copy = foot.find_all("p")[-1].get_text()

    html = env.get_template("guide.html").render(
        lang=lang, names=NAMES, ui=ui, rel=rel, v=v, base=BASE, head_meta=Markup(head_meta), jsonld=Markup(jsonld),
        alternates=alternates, nav=nav_links, nav_label=soup.header.nav.get("aria-label", "Navigation"),
        home=home, crumb=crumb, main_html=Markup(main_html), app_url=app_url, badge_w=badge_width(lang),
        foot_links=foot_links, byline=byline, copy=copy,
    )
    out = ROOT / rel_path
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    return out


def build_sitemap(pages: list[str]) -> None:
    old = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    locs = re.findall(r"<loc>(.*?)</loc><lastmod>(.*?)</lastmod>", old)
    touched = set(pages)
    lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    seen = set()
    for loc, lastmod in locs:
        lines.append(f"<url><loc>{loc}</loc><lastmod>{TODAY if loc in touched else lastmod}</lastmod></url>")
        seen.add(loc)
    for loc in pages:
        if loc not in seen:
            lines.append(f"<url><loc>{loc}</loc><lastmod>{TODAY}</lastmod></url>")
    lines.append("</urlset>")
    (ROOT / "sitemap.xml").write_text("\n".join(lines) + "\n", encoding="utf-8")


def build_og_source() -> None:
    """tools/og/og.html (rendered to assets/img/og.png by tools/render_og.py) shows the measured sample card."""
    (TOOLS / "og/og.html").write_text(env.get_template("og.html").render(card=CARD), encoding="utf-8")


def main() -> None:
    ui_all = json.loads((TOOLS / "content/ui.json").read_text(encoding="utf-8"))
    v = {"css": version("site.css"), "js": version("site.js"), "home": version("assets/js/home.js"), "stage": version("assets/js/stage3d.js"), "flow": version("assets/js/flow.js")}
    pages = []
    for lang in LANGS:
        out = build_home(lang, ui_all, v)
        pages.append(page_url(lang))
        print("home ", out.relative_to(ROOT))
    for src in sorted((TOOLS / "src/pages").rglob("index.html")):
        out = build_guide(src, ui_all, v)
        pages.append(BASE + str(out.parent.relative_to(ROOT)) + "/")
        print("guide", out.relative_to(ROOT))
    build_sitemap(pages)
    print("sitemap.xml", len(pages), "pages")
    build_og_source()
    print("tools/og/og.html")


if __name__ == "__main__":
    main()
