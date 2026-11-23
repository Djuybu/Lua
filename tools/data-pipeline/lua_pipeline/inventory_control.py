"""Persistent crawl controls. Constructing or inspecting these never fetches data."""
from contextlib import AbstractContextManager
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import threading
import time
import uuid


class CrawlPaused(Exception):
    pass


def atomic_json(path, value):
    path = Path(path)
    temporary = path.with_name(path.name + '.' + uuid.uuid4().hex + '.tmp')
    try:
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def saved_progress(run_dir):
    path = Path(run_dir) / 'progress.json'
    if not path.exists():
        return {'state': 'idle', 'totals': [], 'publications': []}
    return json.loads(path.read_text(encoding='utf-8'))


class RunLock(AbstractContextManager):
    def __init__(self, path):
        self.path, self.handle = Path(path), None

    def __enter__(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        handle = self.path.open('a+b')
        try:
            if not self.path.stat().st_size:
                handle.write(b'0')
                handle.flush()
            handle.seek(0)
            if os.name == 'nt':
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError:
            handle.close()
            raise RuntimeError('INVENTORY_ALREADY_RUNNING') from None
        self.handle = handle
        return self

    def __exit__(self, *args):
        self.handle.close()


class CrawlSession:
    def __init__(self, run_dir, max_pages=50, max_seconds=300, clock=time.monotonic):
        self.run_dir, self.max_pages, self.max_seconds = Path(run_dir), max_pages, max_seconds
        self.clock, self.started = clock, clock()
        self.claimed, self.reason = 0, None
        self.event, self.lock = threading.Event(), threading.Lock()

    def set(self, reason='user_pause'):
        with self.lock:
            # A user pause takes priority over a batch limit, including at publication time.
            if self.reason is None or reason == 'user_pause':
                self.reason = reason
            self.event.set()

    def is_set(self):
        if (self.run_dir / 'stop').exists():
            self.set('user_pause')
        elif self.clock() - self.started >= self.max_seconds:
            self.set('time_limit')
        return self.event.is_set()

    def claim(self):
        if self.is_set():
            return False
        with self.lock:
            if self.event.is_set():
                return False
            if self.claimed >= self.max_pages:
                self.reason = 'page_limit'
                self.event.set()
                return False
            self.claimed += 1
            return True

    def sleep(self, seconds):
        deadline = self.clock() + seconds
        while self.clock() < deadline:
            if self.is_set():
                raise CrawlPaused()
            self.event.wait(min(0.25, max(0, deadline - self.clock())))
        if self.is_set():
            raise CrawlPaused()


def claim_daily_run(run_dir, now=None):
    """Called under the inventory lock: at most one scheduled batch per VN day."""
    now = (now or datetime.now(timezone.utc)).astimezone(timezone(timedelta(hours=7)))
    if now.hour != 2:
        return False, 'outside_02h_window'
    marker = Path(run_dir) / ('daily-' + now.date().isoformat() + '.json')
    try:
        with marker.open('x', encoding='utf-8') as output:
            json.dump({'startedAt': now.isoformat(), 'maxPages': 50}, output)
    except FileExistsError:
        return False, 'already_ran_today'
    return True, str(marker)
