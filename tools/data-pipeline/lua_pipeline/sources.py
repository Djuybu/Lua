"""Source configuration deliberately keeps retailer-specific identities separate."""
import json
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit, parse_qsl, urlencode

HOSTS = {
    "cellphones": "cellphones.com.vn",
    "tgdd": "thegioididong.com",
    "fptshop": "fptshop.com.vn",
    "trungtran": "trungtran.vn",
    "laptopaz": "laptopaz.vn",
    "shopdunk": "shopdunk.com",
    "dienmayxanh": "dienmayxanh.com",
    "oneway": "onewaymobile.vn",
}
MAX_SAFE = 2**53 - 1


class PipelineError(ValueError):
    pass


def canonical_url(url):
    p = urlsplit(url)
    query = [(k, v) for k, v in parse_qsl(p.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in {"fbclid", "gclid"}]
    return urlunsplit((p.scheme.lower(), p.netloc.lower(), p.path or "/", urlencode(query), ""))


def check_url(url, source):
    if source not in HOSTS or not isinstance(url, str):
        raise PipelineError("UNKNOWN_SOURCE_OR_URL")
    p = urlsplit(url)
    host = HOSTS[source]
    if (p.scheme != "https" or p.hostname not in {host, "www." + host}
            or p.username or p.password or p.port not in (None, 443)):
        raise PipelineError("URL_OUTSIDE_SOURCE")
    return canonical_url(url)


def load_config(path):
    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if not isinstance(value, dict) or value.get("schemaVersion") != "lua.pipeline-config.v1":
        raise PipelineError("INVALID_CONFIG_VERSION")
    if value.get("sourceId") not in HOSTS:
        raise PipelineError("UNKNOWN_SOURCE")
    if not isinstance(value.get("seeds"), list) or not all(isinstance(x, str) for x in value["seeds"]):
        raise PipelineError("INVALID_SEEDS")
    if len(value["seeds"]) > 1000:
        raise PipelineError("TOO_MANY_SEEDS")
    for url in value["seeds"]:
        check_url(url, value["sourceId"])
    maps = value.get("variantMap", {})
    if not isinstance(maps, dict) or not all(isinstance(k, str) and k and isinstance(v, str) and v.strip()
                                             for k, v in maps.items()):
        raise PipelineError("INVALID_VARIANT_MAP")
    region = value.get("regionContext")
    if region is not None and (not isinstance(region, str) or not region.strip()):
        raise PipelineError("INVALID_REGION")
    return value
