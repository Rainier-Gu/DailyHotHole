import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("generate_snapshot", ROOT / "scripts" / "generate_snapshot.py")
MODULE = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(MODULE)


class SnapshotTests(unittest.TestCase):
    def test_sanitizes_private_fields_and_hidden_content(self):
        source = {
            "settings": {"password": "secret", "token": "secret"},
            "last_error": "private stack detail",
            "last_scan_at": "2026-07-21T01:02:03Z",
            "days": [
                {
                    "date": "2026-07-21",
                    "posts": [
                        {
                            "heat": 9,
                            "favorite_count": 4,
                            "comment_count": 5,
                            "post": {
                                "pid": 123,
                                "text": "公开帖子",
                                "timestamp": 1784592000,
                                "reply": 5,
                                "likenum": 4,
                                "identity_info": "private identity",
                                "exclusive_id_info": "private exclusive id",
                                "media": [{"url": "private media"}],
                            },
                            "comments": [
                                {
                                    "cid": 1,
                                    "text": "公开评论",
                                    "timestamp": 1784592100,
                                    "identity_info": "private commenter",
                                    "exclusive_id_info": "private exclusive id",
                                    "media_ids": "private media id",
                                    "is_lz": True,
                                },
                                {"cid": 2, "text": "隐藏评论", "hidden": True},
                            ],
                        },
                        {"deleted": True, "post": {"pid": 124, "text": "已删除"}},
                        {"post": {"pid": 125, "text": "受保护", "protected": 1}},
                    ],
                }
            ],
        }

        result = MODULE.sanitize_snapshot(source, max_days=30, top_n=10, max_comments=500)
        serialized = json.dumps(result, ensure_ascii=False)

        self.assertEqual(result["stats"], {"day_count": 1, "post_count": 1, "comment_count": 1})
        self.assertEqual(result["days"][0]["posts"][0]["post"]["text"], "公开帖子")
        self.assertNotIn("settings", serialized)
        self.assertNotIn("password", serialized)
        self.assertNotIn("token", serialized)
        self.assertNotIn("identity_info", serialized)
        self.assertNotIn("exclusive_id_info", serialized)
        self.assertNotIn('"media":', serialized)
        self.assertNotIn("private media", serialized)
        self.assertNotIn("隐藏评论", serialized)
        self.assertNotIn("已删除", serialized)
        self.assertNotIn("受保护", serialized)

    def test_comment_limit_keeps_newest_entries(self):
        source = {
            "days": [{
                "date": "2026-07-21",
                "posts": [{
                    "post": {"pid": 1, "text": "post", "timestamp": 1},
                    "comments": [
                        {"cid": 1, "text": "first", "timestamp": 1},
                        {"cid": 2, "text": "second", "timestamp": 2},
                        {"cid": 3, "text": "third", "timestamp": 3},
                    ],
                }],
            }],
        }
        result = MODULE.sanitize_snapshot(source, max_comments=2)
        item = result["days"][0]["posts"][0]
        self.assertEqual([comment["cid"] for comment in item["comments"]], [2, 3])
        self.assertEqual(item["comments_omitted"], 1)

    def test_full_top_n_rejects_incomplete_day(self):
        source = {
            "days": [{
                "date": "2026-07-21",
                "posts": [{"post": {"pid": 1, "text": "only post", "timestamp": 1}}],
            }],
        }
        with self.assertRaisesRegex(ValueError, "expected 10"):
            MODULE.sanitize_snapshot(source, top_n=10, require_full_top_n=True)

    def test_zero_scan_time_falls_back_to_source_time(self):
        source = {
            "last_scan_at": "0001-01-01T00:00:00Z",
            "now": "2026-07-21T05:45:43Z",
            "days": [],
        }
        result = MODULE.sanitize_snapshot(source)
        self.assertEqual(result["source_updated_at"], source["now"])

    def test_atomic_writer_enforces_size_limit(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "snapshot.json"
            with self.assertRaises(ValueError):
                MODULE.write_atomic(output, {"large": "x" * 1000}, 100)
            self.assertFalse(output.exists())


if __name__ == "__main__":
    unittest.main()
