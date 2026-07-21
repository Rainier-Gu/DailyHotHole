import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PublicAssetTests(unittest.TestCase):
    def test_removed_mobile_and_reference_controls_have_no_runtime_references(self) -> None:
        app = (ROOT / "public" / "assets" / "app.js").read_text(encoding="utf-8")
        page = (ROOT / "public" / "index.html").read_text(encoding="utf-8")

        for removed in (
            "renderMobileView",
            "setMobileView",
            "referencedOnly",
            "referencedOnlyCheckbox",
            "mobile-view-tabs",
            "只看引用",
        ):
            self.assertNotIn(removed, app + page)

    def test_date_panel_precedes_rank_and_detail_panels(self) -> None:
        page = (ROOT / "public" / "index.html").read_text(encoding="utf-8")
        day = page.index('class="day-panel"')
        rank = page.index('class="rank-panel"')
        detail = page.index('class="detail-panel"')
        self.assertLess(day, rank)
        self.assertLess(rank, detail)


if __name__ == "__main__":
    unittest.main()
