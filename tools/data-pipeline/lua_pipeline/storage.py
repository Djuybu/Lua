"""SQLite observations are immutable; exports are atomic, independently verifiable."""
import hashlib
import json
import os
import sqlite3
import tempfile
from datetime import datetime
from pathlib import Path
from . import SCHEMA
from .sources import PipelineError, check_url, MAX_SAFE


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False)


def validate_row(row):
    if not isinstance(row, dict) or row.get("schemaVersion") != SCHEMA:
        raise PipelineError("INVALID_RECORD_SCHEMA")
    for key in ("observationId", "externalProductId", "externalOfferId", "observedAt", "contentHash", "name"):
        if not isinstance(row.get(key), str) or not row[key].strip():
            raise PipelineError("INVALID_RECORD:" + key)
    check_url(row.get("sourceUrl", ""), row.get("sourceId"))
    check_url(row.get("offerUrl", ""), row.get("sourceId"))
    try:
        stamp = datetime.fromisoformat(row["observedAt"].replace("Z", "+00:00"))
        if stamp.tzinfo is None:
            raise ValueError()
    except ValueError as exc:
        raise PipelineError("INVALID_OBSERVED_AT") from exc
    for key in ("basePriceVnd", "mandatoryFeesVnd", "shippingVnd", "totalVnd"):
        value = row.get(key)
        if value is not None and (type(value) is not int or not 0 <= value <= MAX_SAFE):
            raise PipelineError("INVALID_MONEY:" + key)
    if row.get("isVerifiedAffordable") is not False or row.get("totalVnd") is not None:
        raise PipelineError("STAGING_CANNOT_ASSERT_AFFORDABILITY")
    if row.get("status") not in {"quarantine", "ready_for_review"}:
        raise PipelineError("INVALID_REVIEW_STATUS")
    if not isinstance(row.get("reasons"), list):
        raise PipelineError("INVALID_REASONS")
    if row["status"] == "ready_for_review" and (not row.get("matchedVariantId") or row["reasons"] or row.get("basePriceVnd") is None):
        raise PipelineError("INVALID_READY_RECORD")


class Store:
    def __init__(self, path):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA foreign_keys=ON")
        self.db.executescript("""
        CREATE TABLE IF NOT EXISTS observations (
          id TEXT PRIMARY KEY, source TEXT NOT NULL, status TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS jobs (
          source TEXT NOT NULL, url TEXT NOT NULL, state TEXT NOT NULL, detail TEXT NOT NULL,
          PRIMARY KEY(source,url));
        """)

    def close(self):
        self.db.close()

    def ingest(self, rows, job=None):
        # One invalid record rolls back the whole batch, including checkpoint.
        inserted = 0
        with self.db:
            for row in rows:
                validate_row(row)
                payload = encoded(row)
                old = self.db.execute("SELECT payload FROM observations WHERE id=?", (row["observationId"],)).fetchone()
                if old and old[0] != payload:
                    raise PipelineError("IMMUTABLE_OBSERVATION_CONFLICT")
                if not old:
                    self.db.execute("INSERT INTO observations VALUES (?,?,?,?)", (row["observationId"], row["sourceId"], row["status"], payload))
                    inserted += 1
            if job:
                self._job(*job)
        return inserted

    def _job(self, source, url, state, detail):
        self.db.execute("INSERT INTO jobs VALUES (?,?,?,?) ON CONFLICT(source,url) DO UPDATE SET state=excluded.state,detail=excluded.detail", (source, url, state, encoded(detail)))

    def job(self, source, url, state, detail):
        with self.db:
            self._job(source, url, state, detail)

    def completed(self, source, url):
        row = self.db.execute("SELECT state FROM jobs WHERE source=? AND url=?", (source, url)).fetchone()
        return row and row[0] == "done"

    def rows(self, include_quarantine=False):
        query = "SELECT payload FROM observations" + ("" if include_quarantine else " WHERE status='ready_for_review'") + " ORDER BY id"
        return [json.loads(row[0]) for row in self.db.execute(query)]

    def report(self):
        return {"observations": [{"sourceId": s, "status": state, "count": n} for s, state, n in self.db.execute("SELECT source,status,count(*) FROM observations GROUP BY source,status ORDER BY source,status")],
                "jobs": [{"sourceId": s, "url": u, "state": st, "detail": json.loads(d)} for s, u, st, d in self.db.execute("SELECT * FROM jobs ORDER BY source,url")]}


def atomic_json(path, value, *, overwrite=False):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and not overwrite:
        raise PipelineError("OUTPUT_EXISTS")
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=path.parent, delete=False) as stream:
            tmp = stream.name
            stream.write(encoded(value) + "\n")
            stream.flush()
            os.fsync(stream.fileno())
        if overwrite:
            os.replace(tmp, path)
        else:
            # Hard-link creation fails atomically if another writer claimed the path.
            os.link(tmp, path)
            os.unlink(tmp)
        tmp = None
    finally:
        if tmp and os.path.exists(tmp):
            os.unlink(tmp)


def export_bundle(store, path, *, include_quarantine=False, overwrite=False):
    rows = store.rows(include_quarantine)
    manifest = {"count": len(rows), "sha256": hashlib.sha256(encoded(rows).encode("utf-8")).hexdigest(),
                "purpose": "staging_review_only", "includesQuarantine": include_quarantine}
    bundle = {"schemaVersion": SCHEMA, "manifest": manifest, "records": rows}
    verify_bundle(bundle)
    atomic_json(path, bundle, overwrite=overwrite)
    return manifest


def verify_bundle(bundle):
    if not isinstance(bundle, dict) or bundle.get("schemaVersion") != SCHEMA or not isinstance(bundle.get("records"), list):
        raise PipelineError("INVALID_BUNDLE")
    rows, manifest = bundle["records"], bundle.get("manifest", {})
    if not isinstance(manifest, dict) or manifest.get("purpose") != "staging_review_only":
        raise PipelineError("INVALID_MANIFEST")
    for row in rows:
        validate_row(row)
        if row["status"] == "quarantine" and manifest.get("includesQuarantine") is not True:
            raise PipelineError("UNDECLARED_QUARANTINE")
    if len({r["observationId"] for r in rows}) != len(rows):
        raise PipelineError("DUPLICATE_OBSERVATION")
    digest = hashlib.sha256(encoded(rows).encode("utf-8")).hexdigest()
    if type(manifest.get("count")) is not int or manifest["count"] != len(rows) or manifest.get("sha256") != digest:
        raise PipelineError("MANIFEST_MISMATCH")
    return manifest
