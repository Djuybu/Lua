"""Failure contract of the integration CLI, without a backend or network."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest


class IntegrationRunnerTests(unittest.TestCase):
    def test_invalid_consumer_pin_exits_nonzero_and_leaves_failure_report(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as folder:
            report_dir = Path(folder) / 'report'
            proc = subprocess.run([sys.executable, '-m', 'scripts.integration',
                '--backend-root', folder, '--consumer-sha', 'not-a-pin',
                '--report-dir', str(report_dir)], cwd=root, capture_output=True, text=True)
            self.assertNotEqual(proc.returncode, 0)
            report = json.loads((report_dir / 'report.json').read_text(encoding='utf-8'))
            self.assertEqual(report['status'], 'failed')
            self.assertIn('full lowercase SHA', report['error'])
            self.assertEqual(report['commands'], [])
            self.assertEqual(report['productionWrites'], 0)
