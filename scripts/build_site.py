#!/usr/bin/env python3
"""Build the static Cloudflare Pages output, optionally adding Web Analytics."""

from __future__ import annotations

import html
import json
import os
import re
import shutil
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public"
OUTPUT = ROOT / "dist"
MARKER = "<!-- cloudflare-web-analytics -->"


def analytics_tag(token: str) -> str:
    token = token.strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,128}", token):
        raise ValueError("CF_WEB_ANALYTICS_TOKEN has an invalid format")
    config = html.escape(json.dumps({"token": token}, separators=(",", ":")), quote=True)
    return (
        '<script defer src="https://static.cloudflareinsights.com/beacon.min.js" '
        f'data-cf-beacon="{config}"></script>'
    )


def main() -> None:
    if OUTPUT.exists():
        shutil.rmtree(OUTPUT)
    shutil.copytree(SOURCE, OUTPUT)
    index = OUTPUT / "index.html"
    content = index.read_text(encoding="utf-8")
    if MARKER not in content:
        raise RuntimeError("analytics marker is missing from public/index.html")
    token = os.getenv("CF_WEB_ANALYTICS_TOKEN", "").strip()
    replacement = analytics_tag(token) if token else "<!-- Cloudflare Pages can inject Web Analytics here. -->"
    index.write_text(content.replace(MARKER, replacement, 1), encoding="utf-8")
    print(f"site built at {OUTPUT} (manual analytics beacon: {'enabled' if token else 'disabled'})")


if __name__ == "__main__":
    main()
