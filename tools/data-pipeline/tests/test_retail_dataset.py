import json
import tempfile
import unittest
from pathlib import Path
from lua_pipeline.capture import parse_capture
from lua_pipeline.storage import verify_bundle

DATA = Path(__file__).resolve().parents[1] / "datasets/retail-pilot-2026-11-14"


class RetailDatasetTests(unittest.TestCase):
    def test_real_captures_are_reproducible_and_never_synthetic(self):
        bundle = json.loads((DATA / "staging-bundle.json").read_text(encoding="utf-8"))
        self.assertEqual(verify_bundle(bundle)["count"], 10)
        expected = {r["observationId"]: r for r in bundle["records"]}
        actual = {}
        for path in (DATA / "captures").glob("*.json"):
            config = json.loads((DATA / "configs" / path.name).read_text(encoding="utf-8"))
            for row in parse_capture(path, config):
                self.assertEqual(row["captureMode"], "rendered_projection")
                self.assertNotIn("synthetic", row["name"].lower())
                self.assertIsNone(row["mandatoryFeesVnd"])
                self.assertIs(row["isVerifiedAffordable"], False)
                actual[row["observationId"]] = row
        self.assertEqual(actual, expected)

    def test_retail_edge_cases_are_preserved(self):
        report = json.loads((DATA / "quality-report.json").read_text(encoding="utf-8"))
        self.assertEqual((report["sources"], report["observations"], report["catalogVariants"]), (8, 10, 4))
        reasons = {r["sourceId"]: r["reasons"] for r in report["bySource"]}
        self.assertIn("PRICE_VALIDITY_EXPIRED", reasons["trungtran"])
        self.assertIn("REGION_IDENTITY_CONFLICT", reasons["oneway"])
        self.assertIn("PRICE_CONTEXT_REVIEW_REQUIRED", reasons["fptshop"])
        bundle = json.loads((DATA / "staging-bundle.json").read_text(encoding="utf-8"))
        stock = {r["externalProductId"]: r["stockStatus"] for r in bundle["records"] if r["sourceId"] == "tgdd"}
        self.assertEqual(stock["0131491004733"], "OUT_OF_STOCK")
        self.assertEqual(stock["0131491004731"], "IN_STOCK")

    def test_catalog_has_no_invented_offers_or_performance_facts(self):
        catalog = json.loads((DATA / "catalog-snapshot.json").read_text(encoding="utf-8"))
        provenance = json.loads((DATA / "variant-provenance.json").read_text(encoding="utf-8"))
        self.assertEqual(catalog["offers"], [])
        self.assertEqual(catalog["facts"], [])
        self.assertEqual({v["variantId"] for v in catalog["variants"]}, {v["variantId"] for v in provenance["variants"]})
        for variant in catalog["variants"]:
            self.assertEqual(variant["specifications"]["ramGb"], 16)
            self.assertEqual(variant["specifications"]["storageGb"], 512)
            self.assertEqual(variant["factIds"], [])
            self.assertNotIn("tgdd", variant["variantId"])


if __name__ == "__main__":
    unittest.main()
