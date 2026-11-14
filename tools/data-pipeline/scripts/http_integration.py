"""Pinned real-HTTP integration runner; semantic defects return nonzero.

All SQLite paths are generated under an internally owned TemporaryDirectory.
No raw-route adapter is enabled without a handed-off consumer protocol.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile

from lua_pipeline.storage import verify_bundle

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'datasets/retail-pilot-2026-11-14'
FIXTURE = ROOT / 'tests/fixtures/http-approved-synthetic.json'


def run_bounded(argv, cwd, timeout_seconds):
    """Single direct process (no shell/descendants). Kill+reap before temp cleanup."""
    proc = subprocess.Popen([str(a) for a in argv], cwd=cwd, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, encoding='utf-8', errors='replace')
    timed_out = False
    try:
        stdout, stderr = proc.communicate(timeout=timeout_seconds)
    except subprocess.TimeoutExpired:
        timed_out = True
        proc.kill()
        stdout, stderr = proc.communicate(timeout=10)
    return {'argv': [str(a) for a in argv], 'cwd': str(cwd), 'exitCode': proc.returncode,
            'timedOut': timed_out, 'stdout': stdout, 'stderr': stderr}


def is_port_closed(port):
    try:
        # Windows can take about one second to report a refused loopback connect.
        # A timeout is inconclusive and must not count as proof of closure.
        with socket.create_connection(('127.0.0.1', port), timeout=3):
            return False
    except ConnectionRefusedError:
        return True
    except TimeoutError:
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend-root', type=Path, required=True)
    parser.add_argument('--consumer-sha', required=True)
    parser.add_argument('--report-dir', type=Path, required=True)
    parser.add_argument('--http-timeout-seconds', type=float, default=60)
    args = parser.parse_args()
    out = args.report_dir.resolve()
    out.mkdir(parents=True, exist_ok=False)
    report = {'task': 'A1-HTTP-02', 'status': 'failed', 'commands': [], 'checks': [],
              'consumerSha': args.consumer_sha, 'backendRoot': str(args.backend_root.resolve()),
              'startedAt': datetime.now(timezone.utc).isoformat(),
              'productionWrites': 0, 'paidProviderCalls': 0,
              'coverage': 'actual localhost HTTP + actual disposable SQLite; historical retailer captures; synthetic approved positive; no live retailer/provider',
              'rawAdapter': 'not_enabled: waiting for handed-off implemented consumer contract',
              'harnessHashes': {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                                for p in (Path(__file__), ROOT / 'scripts/http_backend.mjs', FIXTURE)}}

    def check(name, condition, detail=None):
        report['checks'].append({'name': name, 'passed': bool(condition), 'detail': detail})
        if not condition:
            print(f'FAILED: {name}', flush=True)

    def command(argv, cwd=ROOT, timeout=120, expected=0, expected_timeout=False):
        result = run_bounded(argv, cwd, timeout)
        log = f"{len(report['commands']) + 1:02d}.log"
        (out / log).write_text(result.pop('stdout') + '\nSTDERR:\n' + result.pop('stderr'), encoding='utf-8')
        result.update(log=log, expectedExit=expected, expectedTimeout=expected_timeout)
        report['commands'].append(result)
        check(log, result['timedOut'] == expected_timeout and
              (expected is None or result['exitCode'] == expected), result)
        print(f"{log}: exit {result['exitCode']}, timeout={result['timedOut']}", flush=True)
        return result

    try:
        if len(args.consumer_sha) != 40 or any(c not in '0123456789abcdef' for c in args.consumer_sha):
            raise ValueError('consumer-sha must be a full lowercase SHA')
        backend = args.backend_root.resolve()
        root_result = run_bounded(['git', 'rev-parse', '--show-toplevel'], backend, 10)
        if root_result['exitCode'] != 0:
            raise ValueError('backend must be an existing Git source path')
        repo = Path(root_result['stdout'].strip())
        relative = backend.relative_to(repo).as_posix()
        tree = run_bounded(['git', 'rev-parse', f'{args.consumer_sha}:{relative}'], repo, 10)
        if tree['exitCode'] != 0:
            raise ValueError('consumer subtree does not exist')
        report['consumerTree'] = tree['stdout'].strip()
        diff = command(['git', 'diff', '--exit-code', args.consumer_sha, '--', relative], repo)
        untracked = run_bounded(['git', 'ls-files', '--others', '--exclude-standard', '--', relative], repo, 10)
        if diff['exitCode'] != 0 or untracked['exitCode'] != 0 or untracked['stdout'].strip():
            raise ValueError('backend differs from consumer pin')
        report['sourceHead'] = run_bounded(['git', 'rev-parse', 'HEAD'], repo, 10)['stdout'].strip()
        report['datasetHashes'] = {p.relative_to(DATA).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
                                   for p in sorted(DATA.rglob('*.json'))}
        bundle = json.loads((DATA / 'staging-bundle.json').read_text(encoding='utf-8'))
        manifest = verify_bundle(bundle)
        rows = bundle['records']
        check('dataset invariants', len(rows) == 10 and len({r['sourceId'] for r in rows}) == 8
              and sum(r['status'] == 'quarantine' for r in rows) == 4
              and all(r['mandatoryFeesVnd'] is None and r['isVerifiedAffordable'] is False for r in rows))
        report['dataset'] = {'sources': 8, 'captures': 8, 'observations': len(rows),
                             'variants': 4, 'ready': 6, 'quarantine': 4, 'manifest': manifest}
        npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')
        if not npm:
            raise ValueError('npm is required by backend manifest')
        command([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v'])
        command([npm, 'ci'], backend)
        for script in ('typecheck', 'build', 'test'):
            command([npm, 'run', script], backend)
        for mode, timeout, expected, expected_timeout in (
            ('suite', args.http_timeout_seconds, None, False),
            ('failure', 15, 1, False), ('hang', 2, None, True)):
            result_path = out / f'http-{mode}.json'
            with tempfile.TemporaryDirectory(prefix='lua-a1-http-') as folder:
                scratch = Path(folder)
                child = command(['node', '--experimental-strip-types', ROOT / 'scripts/http_backend.mjs',
                                 backend, DATA, FIXTURE, scratch, result_path, mode],
                                timeout=timeout, expected=expected, expected_timeout=expected_timeout)
                child_report = json.loads(result_path.read_text(encoding='utf-8'))
                if mode == 'suite':
                    report['httpSummary'] = {k: child_report[k] for k in ('passed', 'failed', 'status')}
                    check('HTTP semantic acceptance', child['exitCode'] == 0 and child_report['failed'] == 0,
                          'See http-suite.json: failed cases are defects, not waived expectations')
                elif mode == 'failure':
                    check('assertion nonzero/cleanup regression', child['exitCode'] == 1
                          and child_report['failed'] == 1
                          and all(c['cleanup']['directoryRemoved'] and c['cleanup']['portsClosed'] for c in child_report['cases']))
                else:
                    active = child_report['active']
                    check('watchdog killed real listening server', child['timedOut'] and is_port_closed(active['port']), active)
            check(f'{mode} parent scratch removed', not scratch.exists())
        check('dataset bytes unchanged', all(hashlib.sha256((DATA / p).read_bytes()).hexdigest() == digest
                                           for p, digest in report['datasetHashes'].items()))
        report['status'] = 'passed' if all(c['passed'] for c in report['checks']) else 'failed'
    except Exception as exc:
        report['error'] = repr(exc)
        raise
    finally:
        report['finishedAt'] = datetime.now(timezone.utc).isoformat()
        (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return 0 if report['status'] == 'passed' else 1


if __name__ == '__main__':
    sys.exit(main())
