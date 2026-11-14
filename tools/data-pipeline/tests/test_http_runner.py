import json
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest

from scripts.http_integration import run_bounded, is_port_closed


class HttpRunnerTests(unittest.TestCase):
    def test_live_listener_is_not_reported_closed(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            self.assertFalse(is_port_closed(listener.getsockname()[1]))

    def test_cli_invalid_pin_exits_nonzero_with_failure_report(self):
        root = Path(__file__).resolve().parents[1]
        with tempfile.TemporaryDirectory() as folder:
            out = Path(folder) / 'report'
            result = subprocess.run([sys.executable, '-m', 'scripts.http_integration',
                '--backend-root', folder, '--consumer-sha', 'invalid', '--report-dir', str(out)],
                cwd=root, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            report = json.loads((out / 'report.json').read_text(encoding='utf-8'))
            self.assertEqual(report['status'], 'failed')
            self.assertEqual(report['commands'], [])

    def test_subprocess_nonzero_is_preserved(self):
        result = run_bounded([sys.executable, '-c', 'import sys; sys.exit(7)'], Path.cwd(), 5)
        self.assertEqual(result['exitCode'], 7)
        self.assertFalse(result['timedOut'])

    def test_timeout_kills_listener_before_disposable_directory_cleanup(self):
        with tempfile.TemporaryDirectory(prefix='lua-http-watchdog-test-') as folder:
            scratch = Path(folder)
            state = scratch / 'state.json'
            code = ('import socket,json,sys,time; from pathlib import Path; '
                    's=socket.socket(); s.bind(("127.0.0.1",0)); s.listen(); '
                    'Path(sys.argv[1]).write_text(json.dumps({"port":s.getsockname()[1]})); '
                    'time.sleep(60)')
            result = run_bounded([sys.executable, '-c', code, state], scratch, 1)
            port = json.loads(state.read_text())['port']
            self.assertTrue(result['timedOut'])
            self.assertNotEqual(result['exitCode'], 0)
            self.assertTrue(is_port_closed(port))
        self.assertFalse(scratch.exists())
