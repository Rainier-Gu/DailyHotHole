#!/usr/bin/env python3
"""Validate that a generated snapshot is bounded and contains no private keys."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any


FORBIDDEN_KEYS = {
    "settings",
    "password",
    "token",
    "login_token",
    "last_error",
    "last_scan_stats",
    "active_scan_stats",
    "identity_info",
    "identity_type",
    "exclusive_id_id",
    "exclusive_id_info",
    "media",
    "media_ids",
    "image_size",
}
MAX_BYTES = 24 * 1024 * 1024


def walk(value: Any, path: str = "$") -> None:
    if isinstance(value, dict):
        for key, child in value.items():
            if key in FORBIDDEN_KEYS:
                raise ValueError(f"forbidden key {key!r} at {path}")
            walk(child, f"{path}.{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            walk(child, f"{path}[{index}]")


def validate(path: Path) -> dict[str, Any]:
    size = path.stat().st_size
    if size <= 0 or size > MAX_BYTES:
        raise ValueError(f"snapshot size {size} is outside the allowed range")
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict) or payload.get("schema_version") != 1:
        raise ValueError("snapshot schema_version must be 1")
    if not isinstance(payload.get("days"), list) or not isinstance(payload.get("stats"), dict):
        raise ValueError("snapshot must contain days and stats")
    walk(payload)
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", type=Path)
    args = parser.parse_args()
    payload = validate(args.path)
    stats = payload["stats"]
    print(
        f"snapshot valid: {stats.get('day_count', 0)} days, "
        f"{stats.get('post_count', 0)} posts, {stats.get('comment_count', 0)} comments"
    )


if __name__ == "__main__":
    main()
