"""Small robots matcher: longest rule, wildcard/$, most-specific UA group."""
import re
from urllib.parse import urlsplit
from .sources import PipelineError


class Robots:
    def __init__(self, text, agent):
        if not text.strip() or "<html" in text.lower() or "<!doctype" in text.lower():
            raise PipelineError("ROBOTS_UNRESOLVED")
        groups, names, rules = [], [], []
        def finish():
            if names:
                groups.append((list(names), list(rules)))
        for raw in text.splitlines():
            line = raw.split("#", 1)[0].strip()
            if not line or ":" not in line:
                continue
            key, val = (x.strip() for x in line.split(":", 1))
            key = key.lower()
            if key == "user-agent":
                if rules:
                    finish()
                    names, rules = [], []
                names.append(val.lower())
            elif key in {"allow", "disallow", "crawl-delay"} and names:
                rules.append((key, val))
        finish()
        scored = [(max((len(n) if n != "*" else 0 for n in ns
                        if n == "*" or n in agent.lower()), default=-1), rs) for ns, rs in groups]
        best = max((score for score, _ in scored), default=-1)
        if best < 0:
            raise PipelineError("ROBOTS_NO_MATCHING_GROUP")
        self.rules = [rule for score, rs in scored if score == best for rule in rs]
        self.delay = 5.0
        for key, val in self.rules:
            if key == "crawl-delay":
                try:
                    delay = float(val)
                    if not 0 <= delay <= 3600:
                        raise ValueError()
                    self.delay = max(self.delay, delay)
                except ValueError as exc:
                    raise PipelineError("INVALID_CRAWL_DELAY") from exc

    def allows(self, url):
        p = urlsplit(url)
        target = p.path + ("?" + p.query if p.query else "")
        matches = []
        for key, val in self.rules:
            if key not in {"allow", "disallow"} or not val:
                continue
            end = val.endswith("$")
            body = val[:-1] if end else val
            pattern = "^" + ".*".join(re.escape(x) for x in body.split("*")) + ("$" if end else "")
            if re.search(pattern, target):
                matches.append((len(body.replace("*", "")), key == "allow"))
        return max(matches, default=(0, True))[1]
