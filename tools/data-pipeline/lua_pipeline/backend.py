"""Explicit reviewed conversion to Agent 3 StagedCrawlerOffer, never automatic POST."""
import hashlib
from datetime import datetime
from .sources import PipelineError, check_url, MAX_SAFE
from .storage import verify_bundle, encoded


def backend_payload(bundle, reviews):
    verify_bundle(bundle)
    if not isinstance(reviews, dict) or reviews.get("schemaVersion") != "lua.pipeline-review.v1" or not isinstance(reviews.get("approvals"), dict):
        raise PipelineError("INVALID_REVIEW_FILE")
    offers, excluded, seen = [], [], {}
    for row in bundle["records"]:
        key = row["observationId"]
        approval = reviews["approvals"].get(key)
        if row["status"] != "ready_for_review" or not approval:
            excluded.append({"observationId": key, "reason": "REVIEW_REQUIRED"})
            continue
        if not isinstance(approval, dict) or approval.get("matchedVariantId") != row["matchedVariantId"]:
            raise PipelineError("REVIEW_VARIANT_MISMATCH")
        check_url(approval.get("evidenceUrl", ""), row["sourceId"])
        try:
            stamp = datetime.fromisoformat(approval.get("reviewedAt", "").replace("Z", "+00:00"))
            if stamp.tzinfo is None:
                raise ValueError()
        except (ValueError, TypeError, AttributeError) as exc:
            raise PipelineError("INVALID_REVIEW_TIMESTAMP") from exc
        for name in ("mandatoryFeesVnd", "conditionalDiscountVnd", "shippingVnd"):
            value = approval.get(name)
            if name == "shippingVnd" and name in approval and value is None:
                continue
            if type(value) is not int or not 0 <= value <= MAX_SAFE:
                raise PipelineError("REVIEW_MONEY_REQUIRED:" + name)
        fees, shipping = approval["mandatoryFeesVnd"], approval["shippingVnd"]
        if row["basePriceVnd"] + fees + (shipping or 0) > MAX_SAFE:
            raise PipelineError("TOTAL_OVERFLOW")
        if row["condition"] not in {"NEW", "REFURBISHED", "LIKE_NEW"} or row["stockStatus"] not in {"IN_STOCK", "OUT_OF_STOCK", "PREORDER"}:
            raise PipelineError("BACKEND_ENUM_UNRESOLVED")
        # Backend keys do not include region. Encode it in the stable external key.
        external = row["externalOfferId"]
        if row.get("regionContext"):
            external += "@region:" + hashlib.sha256(row["regionContext"].encode()).hexdigest()[:12]
        offer = {"sourceId": row["sourceId"], "externalOfferId": external,
                 "matchedVariantId": row["matchedVariantId"], "condition": row["condition"],
                 "stockStatus": row["stockStatus"], "basePriceVnd": row["basePriceVnd"],
                 "mandatoryFeesVnd": fees, "shippingVnd": shipping,
                 "conditionalDiscountVnd": approval["conditionalDiscountVnd"],
                 "sourceUrl": row["offerUrl"], "observedAt": row["observedAt"],
                 "completenessStatus": "PARTIAL_UNKNOWN" if shipping is None else "COMPLETE"}
        identity = (offer["sourceId"], external, offer["observedAt"])
        if identity in seen and seen[identity] != encoded(offer):
            raise PipelineError("BACKEND_OBSERVATION_COLLISION")
        if identity not in seen:
            offers.append(offer)
            seen[identity] = encoded(offer)
    return {"offers": offers}, {"accepted": len(offers), "excluded": excluded,
                                 "note": "Reviewed payload only; no backend request has been sent."}
