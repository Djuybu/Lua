"""Parse a minimal browser product projection with its original provenance."""
import hashlib
import json
from datetime import datetime
from html import escape
from pathlib import Path
from .extract import extract, money
from .sources import PipelineError, check_url
from .storage import encoded


def parse_capture(path, config):
    capture = json.loads(Path(path).read_text(encoding="utf-8"))
    if capture.get("schemaVersion") != "lua.browser-capture.v1" or capture.get("sourceId") != config["sourceId"]:
        raise PipelineError("INVALID_BROWSER_CAPTURE")
    check_url(capture.get("url", ""), config["sourceId"])
    heading = capture.get("h1", "")
    if not isinstance(heading, str) or not heading:
        raise PipelineError("PRODUCT_NOT_READY")
    body = "<h1>" + escape(heading) + "</h1>"
    for product in capture.get("products", []):
        body += '<script type="application/ld+json">' + json.dumps(product, ensure_ascii=False).replace("</", "<\\/") + '</script>'
    body += "<table>" + "".join("<tr><td>" + escape(key) + "</td><td>" + escape(value) + "</td></tr>"
                                for key, value in capture.get("tableRows", []) if key) + "</table>"
    source = config["sourceId"]
    dom_prices = []
    for node in capture.get("priceNodes", []):
        classes = node.get("classes", "").split()
        selected = ((source == "laptopaz" and "pd-price" in classes)
                    or (source == "shopdunk" and "product-price" in classes and node.get("parentClass", "").strip() == "price-flex")
                    or (source == "oneway" and "current-price" in classes and node.get("parentClass") == "product-price"))
        if selected:
            try:
                dom_prices.append(money(node["text"], display=True))
            except PipelineError:
                pass
    if source in {"shopdunk", "oneway"}:
        # Reconstruct only the observed product container, never the whole page.
        container, price_class = (("product-essential", "product-price") if source == "shopdunk" else ("product-buy-box", "current-price"))
        identity = ' data-productid="' + escape(capture["selectedProductId"], quote=True) + '"' if capture.get("selectedProductId") else ""
        body += '<div class="' + container + '"' + identity + '>'
        body += "".join('<span class="' + price_class + '">' + str(p) + '</span>' for p in sorted(set(dom_prices))) + '</div>'
    digest = hashlib.sha256(encoded(capture).encode()).hexdigest()
    effective = dict(config, regionContext=capture.get("regionContext"))
    rows = extract(body, {"url": capture["url"], "observedAt": capture["observedAt"],
                         "contentHash": digest, "captureMode": "rendered_projection"}, effective)
    for row in rows:
        row["sourceCapture"] = Path(path).name
        row["captureWarnings"] = list(capture.get("errors", []))
        row["policySnippets"] = capture.get("policySnippets", [])
        if capture.get("errors"):
            row["reasons"].append("SOURCE_JSONLD_PARSE_ERROR")
        if source == "fptshop":
            for node in capture.get("priceNodes", []):
                if "bg-special-price" in node.get("classes", "").split():
                    try:
                        price = money(node["text"], display=True)
                        if price != row["basePriceVnd"]:
                            row["reasons"].append("PRICE_CONTEXT_REVIEW_REQUIRED")
                            row["conflicts"].append({"field": "priceContext", "structuredPrice": row["basePriceVnd"], "specialPrice": price})
                    except PipelineError:
                        pass
        # A stale validity declaration is preserved even if the current DOM shows a price.
        def expired(node):
            if isinstance(node, list):
                return any(expired(n) for n in node)
            if isinstance(node, dict):
                end = node.get("priceValidUntil")
                if isinstance(end, str) and end[:10] < capture["observedAt"][:10]:
                    return True
                return any(expired(v) for v in node.values())
            return False
        if expired(capture.get("products", [])):
            row["reasons"].append("PRICE_VALIDITY_EXPIRED")
        row["reasons"] = sorted(set(row["reasons"]))
        row["status"] = "quarantine" if row["reasons"] else "ready_for_review"
    return rows
