"""A1-INT-01 runner. Explicit pinned consumer; only disposable databases.

Run from tools/data-pipeline: python -m scripts.integration --help
"""
import argparse
import copy
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

from lua_pipeline.backend import backend_payload
from lua_pipeline.capture import parse_capture
from lua_pipeline.runner import parse_fixture
from lua_pipeline.sources import load_config
from lua_pipeline.storage import Store, export_bundle, verify_bundle

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'datasets/retail-pilot-2026-11-14'


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend-root', type=Path, required=True)
    parser.add_argument('--consumer-sha', required=True, help='Full Git SHA containing exact backend tree')
    parser.add_argument('--report-dir', type=Path, required=True, help='New directory for report and command logs')
    args = parser.parse_args()
    backend = args.backend_root.resolve()
    report_dir = args.report_dir.resolve()
    report_dir.mkdir(parents=True, exist_ok=False)
    report = {'task': 'A1-INT-01', 'status': 'failed', 'consumerSha': args.consumer_sha,
              'backendRoot': str(backend), 'commands': [], 'productionWrites': 0,
              'startedAt': datetime.now(timezone.utc).isoformat(),
              'harnessHashes': {name: hashlib.sha256((ROOT / 'scripts' / name).read_bytes()).hexdigest()
                                for name in ('integration.py', 'integration_backend.mjs')},
              'coverage': 'real captured retailer projections + labelled synthetic fixture; no live HTTP/AI'}
    npm = shutil.which('npm.cmd' if os.name == 'nt' else 'npm')

    def run(argv, cwd=ROOT, expected=0):
        proc = subprocess.run([str(a) for a in argv], cwd=cwd, capture_output=True,
                              text=True, encoding='utf-8', errors='replace')
        index = len(report['commands']) + 1
        log = f'{index:02d}.log'
        (report_dir / log).write_text(proc.stdout + '\nSTDERR:\n' + proc.stderr, encoding='utf-8')
        report['commands'].append({'argv': [str(a) for a in argv], 'cwd': str(cwd),
                                   'exitCode': proc.returncode, 'expectedExit': expected, 'log': log})
        require(proc.returncode == expected if expected is not None else proc.returncode != 0,
                f'Unexpected exit {proc.returncode}: {argv}; see {log}')
        print(f'{index:02d}: exit {proc.returncode}: {argv[0]} {argv[1]}', flush=True)
        return proc.stdout

    try:
        require(len(args.consumer_sha) == 40 and all(c in '0123456789abcdef' for c in args.consumer_sha),
                'consumer-sha must be a full lowercase SHA')
        require(npm is not None, 'npm executable is required by backend manifest')
        repo = Path(run(['git', 'rev-parse', '--show-toplevel'], backend).strip())
        relative = backend.relative_to(repo).as_posix()
        report['consumerTree'] = run(['git', 'rev-parse', f'{args.consumer_sha}:{relative}'], repo).strip()
        run(['git', 'diff', '--exit-code', args.consumer_sha, '--', relative], repo)
        require(not run(['git', 'ls-files', '--others', '--exclude-standard', '--', relative], repo).strip(),
                'Untracked backend source would invalidate consumer pin')
        report['integrationHeadBeforeRun'] = run(['git', 'rev-parse', 'HEAD'], repo).strip()
        report['runtime'] = {'python': sys.version, 'node': run(['node', '--version']).strip(),
                             'npm': run([npm, '--version']).strip()}
        run([sys.executable, '-m', 'unittest', 'discover', '-s', 'tests', '-v'])
        run([npm, 'ci'], backend)
        for script in ('typecheck', 'build', 'test'):
            run([npm, 'run', script], backend)
        with tempfile.TemporaryDirectory(prefix='lua-a1-integration-') as folder:
            scratch = Path(folder)
            dataset = scratch / 'dataset'
            shutil.copytree(DATA, dataset)
            # Execute the real dataset builder twice, writing only to the temporary copy.
            build_code = ('from pathlib import Path; from scripts import build_retail_pilot as b; '
                          'import sys; b.DATA=Path(sys.argv[1]); b.ROOT=Path(sys.argv[2]); b.main()')
            run([sys.executable, '-c', build_code, dataset, scratch])
            original = {p.relative_to(DATA): p.read_bytes() for p in DATA.rglob('*.json')}
            for relative_path, content in original.items():
                require((dataset / relative_path).read_bytes() == content, f'Rebuild differs: {relative_path}')
            run([sys.executable, '-c', build_code, dataset, scratch])
            for relative_path, content in original.items():
                require((dataset / relative_path).read_bytes() == content, f'Second rebuild differs: {relative_path}')
            bundle = json.loads((dataset / 'staging-bundle.json').read_text(encoding='utf-8'))
            verify_bundle(bundle)
            rows = []
            for capture in sorted((dataset / 'captures').glob('*.json')):
                rows.extend(parse_capture(capture, load_config(dataset / 'configs' / capture.name)))
            require(len(rows) == 10 and len({r['sourceId'] for r in rows}) == 8, 'Unexpected data counts')
            require(sorted(rows, key=lambda r: r['observationId']) == bundle['records'], 'Capture IDs/content changed')
            store = Store(scratch / 'pipeline.sqlite')
            try:
                require(store.ingest(rows) == 10, 'Initial ingest count')
                require(store.ingest(rows) == 0, 'Replay inserted duplicates')
            finally:
                store.close()
            store = Store(scratch / 'pipeline.sqlite')
            try:
                require(store.ingest(rows) == 0, 'Restart replay inserted duplicates')
                require(store.rows(True) == bundle['records'], 'Restart lost history/quarantine')
                require(len(store.rows()) == 6, 'Ready-only export leaked quarantine')
            finally:
                store.close()
            payload, conversion = backend_payload(bundle, {'schemaVersion': 'lua.pipeline-review.v1', 'approvals': {}})
            require(payload['offers'] == [] and len(conversion['excluded']) == 10, 'Unreviewed rows leaked offers')
            run([sys.executable, '-m', 'lua_pipeline', 'verify-export', '--input', dataset / 'staging-bundle.json'])
            tampered = copy.deepcopy(bundle)
            tampered['manifest']['sha256'] = '0' * 64
            (scratch / 'tampered.json').write_text(json.dumps(tampered), encoding='utf-8')
            run([sys.executable, '-m', 'lua_pipeline', 'verify-export', '--input', scratch / 'tampered.json'], expected=2)
            # Explicitly synthetic known charges, separate from all retailer observations.
            synthetic_rows = parse_fixture(ROOT / 'fixtures/synthetic-product.html',
                'https://fptshop.com.vn/lua-synthetic', '2026-11-14T00:00:00+00:00',
                load_config(ROOT / 'examples/synthetic.json'))
            store = Store(scratch / 'synthetic.sqlite')
            try:
                store.ingest(synthetic_rows)
                export_bundle(store, scratch / 'synthetic-bundle.json')
            finally:
                store.close()
            synthetic_bundle = json.loads((scratch / 'synthetic-bundle.json').read_text(encoding='utf-8'))
            review = {'schemaVersion': 'lua.pipeline-review.v1', 'approvals': {
                synthetic_rows[0]['observationId']: {'matchedVariantId': synthetic_rows[0]['matchedVariantId'],
                    'mandatoryFeesVnd': 0, 'shippingVnd': 0, 'conditionalDiscountVnd': 0,
                    'reviewedAt': '2026-11-14T01:00:00+00:00', 'evidenceUrl': synthetic_rows[0]['sourceUrl']}}}
            positive, _ = backend_payload(synthetic_bundle, review)
            positive['fixtureMode'] = 'synthetic_reviewed_positive'
            positive_path = scratch / 'synthetic-positive.json'
            positive_path.write_text(json.dumps(positive), encoding='utf-8')
            node_command = ['node', '--experimental-strip-types', ROOT / 'scripts/integration_backend.mjs',
                            backend, dataset, positive_path]
            result = run(node_command)
            report['backend'] = json.loads(result)
            # Real assertion failure probe: incorrect catalog count must propagate a nonzero exit.
            snapshot_path = dataset / 'catalog-snapshot.json'
            snapshot = json.loads(snapshot_path.read_text(encoding='utf-8'))
            snapshot['variants'].pop()
            snapshot_path.write_text(json.dumps(snapshot), encoding='utf-8')
            run(node_command, expected=None)
            report['dataset'] = {'sources': 8, 'captures': 8, 'observations': 10, 'variants': 4,
                                 'readyForReview': 6, 'quarantine': 4, 'rebuilds': 2,
                                 'replayInserted': 0, 'manifest': bundle['manifest'],
                                 'quarantinePreserved': True, 'unreviewedOffersExported': 0}
            report['negativeProbes'] = ['tampered manifest exit 2', 'incorrect catalog count assertion exit nonzero']
        report['status'] = 'passed'
    except Exception as exc:
        report['error'] = str(exc)
        raise
    finally:
        report['finishedAt'] = datetime.now(timezone.utc).isoformat()
        (report_dir / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
