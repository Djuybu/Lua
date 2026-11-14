"""Bounded transport. Redirects are guarded before the next request."""
import hashlib
import socket
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import urljoin, urlsplit
from .sources import PipelineError, check_url
from .policy import Robots

USER_AGENT = "LuaCatalogResearch/1.0"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Fetcher:
    def __init__(self, source, *, timeout=20, max_bytes=4_000_000, retries=2,
                 interval=5, sleep=time.sleep, clock=time.monotonic, opener=None, guard=None):
        self.source, self.timeout, self.max_bytes, self.retries = source, timeout, max_bytes, retries
        self.interval, self.sleep, self.clock = max(5, interval), sleep, clock
        self.opener = opener or urllib.request.build_opener(NoRedirect())
        self.guard = guard or (lambda url: check_url(url, source))
        self.policies, self.last = {}, {}
        self.policy_evidence = []

    def _wait(self, url):
        host = urlsplit(url).netloc
        delay = self.interval
        if host in self.policies:
            delay = max(delay, self.policies[host].delay)
        if host in self.last:
            self.sleep(max(0, delay - (self.clock() - self.last[host])))
        self.last[host] = self.clock()

    def _get(self, url):
        for attempt in range(self.retries + 1):
            self._wait(url)
            try:
                request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
                with self.opener.open(request, timeout=self.timeout) as response:
                    raw = response.read(self.max_bytes + 1)
                    if len(raw) > self.max_bytes:
                        raise PipelineError("RESPONSE_TOO_LARGE")
                    charset = response.headers.get_content_charset() or "utf-8"
                    try:
                        body = raw.decode(charset)
                    except (UnicodeError, LookupError) as exc:
                        raise PipelineError("INVALID_ENCODING") from exc
                    return {"url": url, "body": body, "status": response.status,
                            "contentHash": hashlib.sha256(raw).hexdigest(),
                            "contentType": response.headers.get_content_type(),
                            "observedAt": datetime.now(timezone.utc).isoformat()}
            except urllib.error.HTTPError as exc:
                code, headers = exc.code, exc.headers
                exc.close()
                if code in {301, 302, 303, 307, 308}:
                    return {"redirect": urljoin(url, headers.get("Location", ""))}
                if code not in {429, 500, 502, 503, 504} or attempt == self.retries:
                    raise PipelineError("HTTP_" + str(code)) from None
                delay = 2 ** attempt
                retry = headers.get("Retry-After", "")
                if retry:
                    try:
                        delay = float(retry)
                    except ValueError:
                        try:
                            delay = (parsedate_to_datetime(retry) - datetime.now(timezone.utc)).total_seconds()
                        except (ValueError, TypeError):
                            delay = 2 ** attempt
                # A long Retry-After stops the bounded job rather than ignoring the server.
                if delay > 60:
                    raise PipelineError("RETRY_LATER")
                self.sleep(max(0, delay))
            except (urllib.error.URLError, OSError):
                if attempt == self.retries:
                    raise PipelineError("NETWORK_FAILURE") from None
                self.sleep(2 ** attempt)
        raise PipelineError("NETWORK_FAILURE")

    def _policy(self, url):
        p = urlsplit(url)
        if p.netloc not in self.policies:
            robots_url = f"{p.scheme}://{p.netloc}/robots.txt"
            result = self._get(robots_url)
            if "redirect" in result:
                raise PipelineError("ROBOTS_REDIRECT_UNRESOLVED")
            policy = Robots(result["body"], USER_AGENT)
            self.policies[p.netloc] = policy
            self.policy_evidence.append({k: result[k] for k in ("url", "observedAt", "contentHash", "status")})
        return self.policies[p.netloc]

    def fetch(self, url):
        seen = set()
        for _ in range(6):
            url = self.guard(url)
            if url in seen:
                raise PipelineError("REDIRECT_LOOP")
            seen.add(url)
            if not self._policy(url).allows(url):
                raise PipelineError("ROBOTS_DENIED")
            result = self._get(url)
            if "redirect" not in result:
                return result
            url = result["redirect"]
        raise PipelineError("TOO_MANY_REDIRECTS")
