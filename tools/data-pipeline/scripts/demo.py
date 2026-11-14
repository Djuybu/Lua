"""Repeatable synthetic end-to-end demo; never performs a network request."""
import json
from pathlib import Path
from lua_pipeline.sources import load_config
from lua_pipeline.runner import parse_fixture
from lua_pipeline.storage import Store, export_bundle, atomic_json
from lua_pipeline.backend import backend_payload

root = Path(__file__).resolve().parents[1]
output = root / ".work" / "demo"
config = load_config(root / "examples/synthetic.json")
rows = parse_fixture(root / "fixtures/synthetic-product.html", "https://fptshop.com.vn/lua-synthetic",
                     "2026-11-14T00:00:00+00:00", config)
store = Store(output / "staging.sqlite")
try:
    inserted = store.ingest(rows)
    replayed = store.ingest(rows)
    manifest = export_bundle(store, output / "bundle.json", overwrite=True)
    review = {"schemaVersion": "lua.pipeline-review.v1", "approvals": {
        rows[0]["observationId"]: {"matchedVariantId": rows[0]["matchedVariantId"],
            "mandatoryFeesVnd": 0, "shippingVnd": None, "conditionalDiscountVnd": 0,
            "reviewedAt": "2026-11-14T01:00:00+00:00", "evidenceUrl": rows[0]["sourceUrl"]}}}
    # These zero fees are a synthetic example, not inferred retailer data.
    atomic_json(output / "reviews.json", review, overwrite=True)
    bundle = json.loads((output / "bundle.json").read_text(encoding="utf-8"))
    payload, report = backend_payload(bundle, review)
    atomic_json(output / "backend-payload.json", payload, overwrite=True)
    print(json.dumps({"inserted": inserted, "replayInserted": replayed, "manifest": manifest,
                      "conversion": report, "directory": str(output)}, ensure_ascii=False))
finally:
    store.close()
