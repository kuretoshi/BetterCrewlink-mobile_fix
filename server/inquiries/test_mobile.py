import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path
from enable_mobile import migrate, patch_sources


class MobileRelayTests(unittest.TestCase):
    def test_migration_preserves_desktop_routes_and_is_idempotent(self):
        with tempfile.TemporaryDirectory() as directory:
            database = Path(directory) / 'db.sqlite'
            with closing(sqlite3.connect(database)) as db, db:
                db.execute("CREATE TABLE inquiry_webhooks(product TEXT PRIMARY KEY CHECK(product IN ('tanuki','net')),webhook_url TEXT,kind TEXT,question_tag TEXT,bug_tag TEXT,request_tag TEXT,updated_at INTEGER)")
                db.execute("INSERT INTO inquiry_webhooks VALUES('tanuki','test-webhook','forum','1','2','3',1)")
            migrate(database, 'tanuki')
            migrate(database, 'tanuki')
            with closing(sqlite3.connect(database)) as db:
                rows = db.execute('SELECT product,bug_tag FROM inquiry_webhooks ORDER BY product').fetchall()
            self.assertEqual(rows, [('mobile', '2'), ('tanuki', '2')])

    def test_patch_adds_mobile_and_browser_cors_without_replacing_other_routes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'inquiry.py').write_text("PRODUCTS = ('tanuki', 'net')\n# issue_bridge.create_issue\n", encoding='utf-8')
            (root / 'auth.py').write_text("if request.path == '/v1/player-bans/check':\n    pass\n", encoding='utf-8')
            patch_sources(root)
            patch_sources(root)
            self.assertIn("'mobile'", (root / 'inquiry.py').read_text())
            self.assertIn("'/v1/inquiries'", (root / 'auth.py').read_text())


if __name__ == '__main__':
    unittest.main()
