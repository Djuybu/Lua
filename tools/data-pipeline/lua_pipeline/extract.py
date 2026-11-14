"""Retailer adapters using Product JSON-LD and narrowly scoped DOM fallbacks."""
import hashlib
import json
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit, unquote
from . import SCHEMA, PARSER_VERSION
from .sources import PipelineError, MAX_SAFE, check_url


class Element:
    def __init__(self, tag="root", attrs=(), parent=None):
        self.tag, self.attrs, self.parent, self.children = tag, dict(attrs), parent, []

    def text(self):
        return " ".join(c.text() if isinstance(c, Element) else c for c in self.children).strip()

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Element):
                yield from child.walk()


class Document(HTMLParser):
    def __init__(self, html):
        super().__init__(convert_charrefs=True)
        self.root = self.current = Element()
        self.feed(html)
        self.close()

    def handle_starttag(self, tag, attrs):
        node = Element(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        self.handle_endtag(tag)

    def handle_endtag(self, tag):
        node = self.current
        while node.parent:
            if node.tag == tag:
                self.current = node.parent
                return
            node = node.parent

    def handle_data(self, data):
        self.current.children.append(data)


def money(value, *, display=False):
    """Accept machine integer VND or clearly grouped Vietnamese display amounts."""
    if isinstance(value, (bool, float)) or value is None or isinstance(value, (dict, list)):
        raise PipelineError("INVALID_MONEY")
    s = str(value).strip()
    s = re.sub(r"\s*(?:VND|VNĐ|₫|đ)\s*$", "", s, flags=re.I).strip()
    if display and re.fullmatch(r"\d{1,3}(?:[.,]\d{3})+", s):
        s = s.replace(".", "").replace(",", "")
    elif not re.fullmatch(r"\d+(?:\.0+)?", s):
        raise PipelineError("INVALID_MONEY")
    try:
        number = Decimal(s)
    except InvalidOperation as exc:
        raise PipelineError("INVALID_MONEY") from exc
    if not number.is_finite() or number != number.to_integral_value() or not 0 <= number <= MAX_SAFE:
        raise PipelineError("INVALID_MONEY")
    return int(number)


def kind(obj, name):
    t = obj.get("@type", [])
    return name in (t if isinstance(t, list) else [t])


def attribute_rows(doc):
    result = {}
    for row in doc.root.walk():
        if row.tag == "tr":
            cells = [c.text() for c in row.children if isinstance(c, Element) and c.tag in {"th", "td"}]
            if len(cells) == 2 and cells[0] and len(cells[0]) < 100:
                result[cells[0].rstrip(":")] = cells[1]
    return result


def scoped_prices(doc, source):
    # These containers are adapter boundaries, not a generic minimum-price search.
    selectors = {
        "laptopaz": ("pd-price-group", "pd-price"),
        "cellphones": ("box-product-price-wrapper", "sale-price"),
        "shopdunk": ("product-essential", "product-price"),
        "oneway": ("product-buy-box", "current-price"),
        "trungtran": ("product", "_price"),
    }
    if source not in selectors:
        return set()
    outer, inner = selectors[source]
    values = set()
    for node in doc.root.walk():
        if inner not in node.attrs.get("class", "").split():
            continue
        parent = node.parent
        while parent and outer not in parent.attrs.get("class", "").split():
            parent = parent.parent
        if parent:
            try:
                values.add(money(node.attrs.get("content") or node.text(), display=True))
            except PipelineError:
                pass
    return values


def extract(html, capture, config):
    source = config["sourceId"]
    url = check_url(capture["url"], source)
    try:
        observed = datetime.fromisoformat(capture["observedAt"].replace("Z", "+00:00"))
        if observed.tzinfo is None:
            raise ValueError()
    except (KeyError, ValueError, TypeError) as exc:
        raise PipelineError("INVALID_OBSERVED_AT") from exc
    doc = Document(html)
    elements = list(doc.root.walk())
    heading = next((n.text() for n in elements if n.tag == "h1" and n.text()), "")
    title = next((n.text() for n in elements if n.tag == "title"), "")
    if re.search(r"just a moment|access denied|verify you are human|captcha", title + " " + heading, re.I):
        raise PipelineError("ACCESS_CHALLENGE")
    if not heading:
        raise PipelineError("PRODUCT_NOT_READY")
    roots, parse_errors = [], []
    for node in elements:
        if node.tag == "script" and node.attrs.get("type", "").lower() == "application/ld+json":
            try:
                data = json.loads(node.text())
                roots.extend(data if isinstance(data, list) else [data])
            except (ValueError, RecursionError):
                parse_errors.append("INVALID_JSON_LD")
    graph = []
    for root in roots:
        if isinstance(root, dict):
            nodes = root.get("@graph", [root])
            graph.extend(nodes if isinstance(nodes, list) else [nodes])
    index = {x["@id"]: x for x in graph if isinstance(x, dict) and isinstance(x.get("@id"), str)}
    def resolve(x):
        return index.get(x.get("@id"), x) if isinstance(x, dict) else x
    products = []
    for root in graph:
        if not isinstance(root, dict):
            continue
        if kind(root, "ProductGroup"):
            variants = root.get("hasVariant", [])
            variants = variants if isinstance(variants, list) else [variants]
            products.extend((resolve(child), root, f"hasVariant/{i}") for i, child in enumerate(variants))
        elif kind(root, "Product"):
            products.append((root, {}, "Product"))
    dom_prices = scoped_prices(doc, source)
    dom_price = next(iter(dom_prices)) if len(dom_prices) == 1 else None
    if not products and source in {"shopdunk", "oneway"}:
        product_id = next((n.attrs.get("data-productid") for n in elements if n.attrs.get("data-productid")), None)
        products = [({"@type": "Product", "name": heading, "sku": product_id,
                      "offers": {"@type": "Offer", "price": dom_price, "priceCurrency": "VND", "url": url}}, {}, "DOM")]
    if not products:
        raise PipelineError("PRODUCT_SCHEMA_MISSING")
    output = []
    for product, parent, pointer in products:
        if not isinstance(product, dict) or not kind(product, "Product"):
            continue
        offers = resolve(product.get("offers", []))
        offers = offers if isinstance(offers, list) else [offers]
        if not offers:
            continue
        for offer in offers:
            offer = resolve(offer)
            if not isinstance(offer, dict):
                continue
            # Related products from a graph must not be assigned to this detail page.
            product_url = product.get("url")
            if product_url and not isinstance(product_url, str):
                continue
            if product_url and urlsplit(urljoin(url, product_url)).path != urlsplit(url).path:
                continue
            reasons = list(parse_errors)
            conflicts = []
            if len(dom_prices) > 1:
                reasons.append("DOM_PRICE_AMBIGUOUS")
                conflicts.append({"field": "basePriceVnd", "domValues": sorted(dom_prices)})
            attrs = attribute_rows(doc)
            properties = []
            for owner in (parent, product):
                props = owner.get("additionalProperty", [])
                properties.extend(props if isinstance(props, list) else [props])
            for prop in properties:
                if isinstance(prop, dict) and isinstance(prop.get("name"), str):
                    key = prop["name"]
                    val = re.sub(r"\s+", " ", str(prop.get("value", ""))).strip()
                    if key in attrs and re.sub(r"\s+", " ", attrs[key]).strip() != val:
                        reasons.append("SPEC_CONFLICT:" + key)
                        conflicts.append({"field": key, "domValue": attrs[key], "structuredValue": val})
                    attrs[key] = val
            try:
                price = money(offer.get("price"))
            except PipelineError:
                price = None
                reasons.append("PRICE_UNRESOLVED")
            if not kind(offer, "Offer"):
                reasons.append("AGGREGATE_OR_UNKNOWN_OFFER")
            if offer.get("priceCurrency") != "VND":
                reasons.append("CURRENCY_NOT_VND")
            if dom_price is not None and price is not None and dom_price != price:
                reasons.append("PRICE_CONFLICT")
                conflicts.append({"field": "basePriceVnd", "domValue": dom_price, "structuredValue": price})
            sku = product.get("sku")
            if not isinstance(sku, str) or not sku.strip():
                sku = "url:" + hashlib.sha256(url.encode()).hexdigest()[:20]
                reasons.append("SOURCE_SKU_MISSING")
            offer_path = offer.get("url") or product.get("url") or url
            if not isinstance(offer_path, str):
                reasons.append("OFFER_URL_INVALID")
                offer_path = url
            offer_url = urljoin(url, offer_path)
            try:
                offer_url = check_url(offer_url, source)
            except PipelineError:
                reasons.append("OFFER_URL_OUTSIDE_SOURCE")
                offer_url = url
            external = sku if len(offers) == 1 else sku + "@" + offer_url
            mapped = config.get("variantMap", {}).get(external)
            if not mapped:
                reasons.append("EXACT_VARIANT_UNMAPPED")
            name = str(product.get("name") or heading)
            # Do not infer origin from SEO slugs when the displayed title disagrees.
            if source == "oneway":
                slug_region = re.search(r"-(zp|vn|ll)-a(?:$|[./])", urlsplit(url).path, re.I)
                title_region = re.search(r"\b([A-Z]{1,2})/A\b", name)
                if slug_region and title_region and slug_region[1].upper() != title_region[1].upper():
                    reasons.append("REGION_IDENTITY_CONFLICT")
            condition = {"NewCondition": "NEW", "RefurbishedCondition": "REFURBISHED", "UsedCondition": "USED"}.get(str(offer.get("itemCondition", "")).rsplit("/", 1)[-1], "UNKNOWN")
            stock = {"InStock": "IN_STOCK", "OutOfStock": "OUT_OF_STOCK", "PreOrder": "PREORDER"}.get(str(offer.get("availability", "")).rsplit("/", 1)[-1], "UNKNOWN")
            if condition == "UNKNOWN":
                reasons.append("CONDITION_UNKNOWN")
            if stock == "UNKNOWN":
                reasons.append("STOCK_UNKNOWN")
            evidence = [{"kind": "DOM", "path": "h1", "value": heading},
                        {"kind": "JSON_LD" if pointer != "DOM" else "DOM", "path": pointer + "/offers", "value": {"price": offer.get("price"), "sku": product.get("sku")}}]
            row = {"schemaVersion": SCHEMA, "parserVersion": PARSER_VERSION,
                   "sourceId": source, "sourceUrl": url, "offerUrl": offer_url,
                   "observedAt": observed.isoformat(), "contentHash": capture["contentHash"],
                   "captureMode": capture.get("captureMode", "http"),
                   "regionContext": config.get("regionContext"),
                   "externalProductId": sku, "externalOfferId": external,
                   "matchedVariantId": mapped, "name": name,
                   "sourceMpn": product.get("mpn"), "color": product.get("color"),
                   "storageLabel": product.get("size"), "attributes": attrs,
                   "condition": condition, "stockStatus": stock,
                   "basePriceVnd": price, "mandatoryFeesVnd": None, "shippingVnd": None,
                   "conditionalDiscounts": [], "totalVnd": None,
                   "isVerifiedAffordable": False, "unknownFields": ["mandatoryFeesVnd", "shippingVnd", "promotionEligibility"],
                   "evidence": evidence, "conflicts": conflicts, "reasons": sorted(set(reasons)),
                   "status": "quarantine" if reasons else "ready_for_review"}
            row["mappingVersion"] = hashlib.sha256(json.dumps(config.get("variantMap", {}), sort_keys=True).encode()).hexdigest()
            row["observationId"] = hashlib.sha256(json.dumps([source, external, config.get("regionContext"), row["observedAt"], capture["contentHash"], PARSER_VERSION, row["mappingVersion"]], ensure_ascii=False).encode()).hexdigest()
            output.append(row)
    if not output:
        raise PipelineError("EXACT_OFFER_MISSING")
    unique = {}
    for row in output:
        key = row["observationId"]
        if key in unique and unique[key] != row:
            old = unique[key]
            old["conflicts"].append({"field": "duplicateOffer", "firstPrice": old["basePriceVnd"], "otherPrice": row["basePriceVnd"], "otherEvidence": row["evidence"]})
            old["basePriceVnd"] = None
            old["status"] = "quarantine"
            old["reasons"] = sorted(set(old["reasons"] + row["reasons"] + ["DUPLICATE_OFFER_CONFLICT"]))
        else:
            unique[key] = row
    return list(unique.values())
