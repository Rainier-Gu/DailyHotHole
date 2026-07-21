#!/usr/bin/env python3
"""Create a bounded, privacy-filtered snapshot from the private monitor API."""

from __future__ import annotations

import argparse
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen


DEFAULT_SOURCE = "http://127.0.0.1:8766/api/state"
DEFAULT_MAX_DAYS = 10
DEFAULT_TOP_N = 10
DEFAULT_MAX_COMMENTS = 500
DEFAULT_MAX_BYTES = 20 * 1024 * 1024


def env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, "").strip()
    if not raw:
        return default
    value = int(raw)
    if not minimum <= value <= maximum:
        raise ValueError(f"{name} must be between {minimum} and {maximum}")
    return value


def env_bool(name: str, default: bool = False) -> bool:
    raw = os.getenv(name, "").strip().lower()
    if not raw:
        return default
    if raw in {"1", "true", "yes", "on"}:
        return True
    if raw in {"0", "false", "no", "off"}:
        return False
    raise ValueError(f"{name} must be a boolean")


def clean_text(value: Any, limit: int) -> str:
    if not isinstance(value, str):
        return ""
    value = value.replace("\x00", "").strip()
    return value[:limit]


def as_int(value: Any, default: int = 0) -> int:
    if isinstance(value, bool):
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_comment(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict) or raw.get("hidden"):
        return None
    text = clean_text(raw.get("text"), 6000)
    if not text:
        return None
    quote_id = raw.get("quote_id")
    return {
        "cid": as_int(raw.get("cid")),
        "text": text,
        "timestamp": as_int(raw.get("timestamp")),
        "name_tag": clean_text(raw.get("name_tag"), 64),
        "is_author": bool(raw.get("is_author")),
        "is_lz": bool(raw.get("is_lz")),
        "quote_id": as_int(quote_id) if quote_id is not None else None,
    }


def safe_post(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    if raw.get("hidden") or raw.get("protected") or raw.get("is_protect"):
        return None
    text = clean_text(raw.get("text"), 20000)
    if not text:
        return None
    return {
        "pid": as_int(raw.get("pid")),
        "text": text,
        "timestamp": as_int(raw.get("timestamp")),
        "reply": max(0, as_int(raw.get("reply"))),
        "likenum": max(0, as_int(raw.get("likenum"))),
    }


def sanitize_snapshot(
    source: dict[str, Any],
    *,
    max_days: int = DEFAULT_MAX_DAYS,
    top_n: int = DEFAULT_TOP_N,
    max_comments: int = DEFAULT_MAX_COMMENTS,
    require_full_top_n: bool = False,
) -> dict[str, Any]:
    if not isinstance(source, dict) or not isinstance(source.get("days"), list):
        raise ValueError("source snapshot must contain a days array")

    public_days: list[dict[str, Any]] = []
    raw_days = sorted(
        (day for day in source["days"] if isinstance(day, dict)),
        key=lambda day: str(day.get("date", "")),
        reverse=True,
    )[:max_days]

    post_count = 0
    comment_count = 0
    for raw_day in raw_days:
        date = clean_text(raw_day.get("date"), 10)
        if not date:
            continue
        posts: list[dict[str, Any]] = []
        raw_posts = raw_day.get("posts") if isinstance(raw_day.get("posts"), list) else []
        for raw_item in raw_posts:
            if len(posts) >= top_n:
                break
            if not isinstance(raw_item, dict) or raw_item.get("deleted"):
                continue
            post = safe_post(raw_item.get("post"))
            if post is None:
                continue

            safe_comments = [
                comment
                for comment in (safe_comment(raw) for raw in raw_item.get("comments", []))
                if comment is not None
            ] if isinstance(raw_item.get("comments"), list) else []
            comments_total = len(safe_comments)
            if comments_total > max_comments:
                safe_comments = safe_comments[-max_comments:]

            heat = max(0, as_int(raw_item.get("heat"), post["likenum"] + post["reply"]))
            item = {
                "rank": len(posts) + 1,
                "heat": heat,
                "favorite_count": max(0, as_int(raw_item.get("favorite_count"), post["likenum"])),
                "comment_count": max(0, as_int(raw_item.get("comment_count"), post["reply"])),
                "comments_total": max(comments_total, as_int(raw_item.get("comments_total"))),
                "comments_omitted": max(0, comments_total - len(safe_comments)),
                "post": post,
                "comments": safe_comments,
            }
            posts.append(item)
            post_count += 1
            comment_count += len(safe_comments)

        if require_full_top_n and len(posts) != top_n:
            raise ValueError(f"{date} has {len(posts)} public posts; expected {top_n}")

        public_days.append({
            "date": date,
            "leader_heat": posts[0]["heat"] if posts else 0,
            "posts": posts,
        })

    generated_at = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    source_updated_at = source.get("last_scan_at")
    if not isinstance(source_updated_at, str) or source_updated_at.startswith("0001-"):
        source_updated_at = source.get("now") or generated_at
    dates = [day["date"] for day in public_days]
    return {
        "schema_version": 1,
        "generated_at": generated_at,
        "source_updated_at": source_updated_at,
        "date_from": min(dates) if dates else None,
        "date_to": max(dates) if dates else None,
        "stats": {
            "day_count": len(public_days),
            "post_count": post_count,
            "comment_count": comment_count,
        },
        "public_policy": {
            "max_days": max_days,
            "top_n": top_n,
            "max_comments_per_post": max_comments,
            "media_included": False,
            "identities_included": False,
            "anonymous_name_tags_included": True,
        },
        "days": public_days,
    }


def load_source(source: str) -> dict[str, Any]:
    parsed = urlparse(source)
    if parsed.scheme in {"http", "https"}:
        request = Request(source, headers={"Accept": "application/json", "User-Agent": "DailyHotHole-Snapshot/1"})
        with urlopen(request, timeout=90) as response:  # nosec B310 - source is operator-controlled
            if response.status != 200:
                raise RuntimeError(f"source returned HTTP {response.status}")
            return json.load(response)
    with Path(source).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_atomic(output: Path, payload: dict[str, Any], max_bytes: int) -> int:
    encoded = (json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n").encode("utf-8")
    if len(encoded) > max_bytes:
        raise ValueError(f"public snapshot is {len(encoded)} bytes; limit is {max_bytes}")
    output.parent.mkdir(parents=True, exist_ok=True)
    temp_name = ""
    try:
        with tempfile.NamedTemporaryFile("wb", dir=output.parent, delete=False) as handle:
            temp_name = handle.name
            handle.write(encoded)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, output)
    finally:
        if temp_name and os.path.exists(temp_name):
            os.unlink(temp_name)
    return len(encoded)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", default=os.getenv("DAILYHOTHOLE_SOURCE_URL", DEFAULT_SOURCE))
    parser.add_argument("--output", default="public/data/snapshot.json")
    parser.add_argument("--max-days", type=int, default=env_int("DAILYHOTHOLE_MAX_DAYS", DEFAULT_MAX_DAYS, 1, 365))
    parser.add_argument("--top-n", type=int, default=env_int("DAILYHOTHOLE_TOP_N", DEFAULT_TOP_N, 1, 20))
    parser.add_argument("--max-comments", type=int, default=env_int("DAILYHOTHOLE_MAX_COMMENTS", DEFAULT_MAX_COMMENTS, 0, 2000))
    parser.add_argument("--max-bytes", type=int, default=env_int("DAILYHOTHOLE_MAX_BYTES", DEFAULT_MAX_BYTES, 1024, 24 * 1024 * 1024))
    parser.add_argument(
        "--require-full-top-n",
        action="store_true",
        default=env_bool("DAILYHOTHOLE_REQUIRE_FULL_TOP_N"),
        help="fail instead of publishing a day with fewer than top_n public posts",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    payload = sanitize_snapshot(
        load_source(args.source),
        max_days=args.max_days,
        top_n=args.top_n,
        max_comments=args.max_comments,
        require_full_top_n=args.require_full_top_n,
    )
    byte_count = write_atomic(Path(args.output), payload, args.max_bytes)
    print(
        f"snapshot ready: {payload['stats']['day_count']} days, "
        f"{payload['stats']['post_count']} posts, {payload['stats']['comment_count']} comments, "
        f"{byte_count} bytes"
    )


if __name__ == "__main__":
    main()
