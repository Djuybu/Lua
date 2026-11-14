"""Build a reproducible development dataset from committed browser captures."""
import json
import tempfile
from pathlib import Path
from lua_pipeline.capture import parse_capture
from lua_pipeline.storage import Store, atomic_json, export_bundle

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "datasets/retail-pilot-2026-11-14"


def main():
    configs, all_rows = [], []
    for path in sorted((DATA / "captures").glob("*.json")):
        cap = json.loads(path.read_text(encoding="utf-8"))
        mapping = {}
        def identify(node):
            if isinstance(node, list):
                for item in node:
                    identify(item)
            elif isinstance(node, dict):
                if node.get("@type") == "Product" and isinstance(node.get("sku"), str):
                    sku = node["sku"]
                    mapping[sku] = f'retailer:{cap["sourceId"]}:{sku}'
                for value in node.values():
                    identify(value)
        identify(cap["products"])
        if cap.get("selectedProductId"):
            sku = cap["selectedProductId"]
            mapping[sku] = f'retailer:{cap["sourceId"]}:{sku}'
        config = {"schemaVersion": "lua.pipeline-config.v1", "sourceId": cap["sourceId"],
                  "seeds": [cap["url"]], "variantMap": mapping, "regionContext": cap.get("regionContext")}
        atomic_json(DATA / "configs" / path.name, config, overwrite=True)
        all_rows.extend(parse_capture(path, config))
        configs.append(config)
    # Identity is source-bound. No cross-retailer equivalence is asserted.
    by_source = {row["sourceId"]: row for row in all_rows}
    variants, provenance = [], []
    def variant(source, family, brand, category, specs, evidence):
        row = by_source[source]
        variants.append({"variantId": row["matchedVariantId"], "familyId": family,
                         "modelName": row["name"], "brand": brand, "category": category,
                         "specifications": specs, "factIds": []})
        provenance.append({"variantId": row["matchedVariantId"], "sourceUrl": row["sourceUrl"],
                           "observedAt": row["observedAt"], "sourceCapture": row["sourceCapture"],
                           "contentHash": row["contentHash"], "fieldEvidence": evidence,
                           "verification": "retailer_claims_only", "reviewStatus": "development_seed_not_production"})
    variant("laptopaz", "acer:aspire-7-a715-59g-59rd", "Acer", "pc_laptop",
            {"ramGb": 16, "storageGb": 512, "os": "Windows 11 Home", "cpu": "Intel Core 5 210H", "gpu": "NVIDIA GeForce RTX 3050 4GB", "displayInches": 15.6},
            {"ramGb": "tableRows/RAM", "storageGb": "tableRows/Ổ cứng", "os": "tableRows/Hệ điều hành / Phần mềm", "cpu": "tableRows/CPU", "gpu": "tableRows/Card đồ họa", "displayInches": "tableRows/Màn hình"})
    variant("cellphones", "oppo:find-x8", "OPPO", "phone",
            {"ramGb": 16, "storageGb": 512, "os": "Android 15", "cpu": "MediaTek Dimensity 9400", "gpu": "Immortalis G925 MC12", "displayInches": 6.59},
            {"ramGb": "products/0/additionalProperty/Dung lượng RAM", "storageGb": "products/0/additionalProperty/Bộ nhớ trong", "os": "products/0/additionalProperty/Hệ điều hành khi ra mắt", "cpu": "products/0/additionalProperty/Chipset", "gpu": "products/0/additionalProperty/GPU", "displayInches": "products/0/additionalProperty/Kích thước màn hình"})
    variant("dienmayxanh", "hp:240r-g10-c3ru7at", "HP", "pc_laptop",
            {"ramGb": 16, "storageGb": 512, "os": "Windows 11 Home SL", "cpu": "Intel Core 5 120U"},
            {"ramGb": "products/0/additionalProperty/RAM", "storageGb": "products/0/additionalProperty/Ổ cứng", "os": "products/0/additionalProperty/Hệ điều hành", "cpu": "h1 + products/0/additionalProperty/Loại CPU"})
    variant("fptshop", "acer:aspire-go-ag15-52p-52wt", "Acer", "pc_laptop",
            {"ramGb": 16, "storageGb": 512, "os": "Windows 11", "cpu": "Intel Core Ultra 5 115U", "gpu": "Intel Graphics", "displayInches": 15.6},
            {"ramGb": "h1 + products/0/additionalProperty/RAM", "storageGb": "h1", "os": "h1/Win11", "cpu": "h1/Ultra5 115U", "gpu": "products/0/additionalProperty/Card đồ hoạ", "displayInches": "h1"})
    latest = max(row["observedAt"] for row in all_rows)
    snapshot = {"schemaVersion": "1.0.0", "catalogVersion": "retail-dev-2026-11-14", "ruleVersion": "2026.11",
                "publishedAt": latest, "variants": variants, "facts": [], "offers": []}
    atomic_json(DATA / "catalog-snapshot.json", snapshot, overwrite=True)
    atomic_json(DATA / "variant-provenance.json", {"purpose": "development_seed", "variants": provenance}, overwrite=True)
    (ROOT / ".work").mkdir(exist_ok=True)
    # A fresh staging DB makes the committed dataset reproducible across parser revisions.
    with tempfile.TemporaryDirectory(dir=ROOT / ".work") as folder:
        store = Store(Path(folder) / "retail-pilot.sqlite")
        try:
            inserted = store.ingest(all_rows)
            manifest = export_bundle(store, DATA / "staging-bundle.json", include_quarantine=True, overwrite=True)
        finally:
            store.close()
    quality = {"schemaVersion": "lua.retail-pilot-report.v1", "sources": len(configs),
               "observations": len(all_rows), "catalogVariants": len(variants),
               "readyForReview": sum(r["status"] == "ready_for_review" for r in all_rows),
               "quarantined": sum(r["status"] == "quarantine" for r in all_rows),
               "bySource": [{"sourceId": c["sourceId"], "count": sum(r["sourceId"] == c["sourceId"] for r in all_rows),
                             "reasons": sorted({reason for r in all_rows if r["sourceId"] == c["sourceId"] for reason in r["reasons"]})} for c in configs],
               "backendOfferBlockers": ["mandatoryFeesVnd remains unknown; backend currently requires a number", "No human cost approvals; no offers exported into catalog", "TGDD/ShopDunk RAM not observed; no fabricated catalog RAM", "Source-bound IDs are not cross-retailer or manufacturer-verified identity"],
               "stagingManifest": manifest}
    atomic_json(DATA / "quality-report.json", quality, overwrite=True)
    print(json.dumps({"inserted": inserted, **quality}, ensure_ascii=False))


if __name__ == "__main__":
    main()
