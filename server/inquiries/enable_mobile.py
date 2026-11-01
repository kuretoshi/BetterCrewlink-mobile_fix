"""Extend an existing desktop inquiry relay; no messages are posted by this script."""
import argparse
from pathlib import Path
import sqlite3
import time
import re
from contextlib import closing


def patch_sources(root, apply=True):
    changes = {}
    inquiry = root / 'inquiry.py'
    text = inquiry.read_text(encoding='utf-8')
    text = re.sub(r"PRODUCTS = \(([^\n]+)\)", lambda match: match[0] if "'mobile'" in match[1]
                  else "PRODUCTS = (" + match[1] + ", 'mobile')", text)
    text = re.sub(r"CHECK\(product IN \(([^)]+)\)\)", lambda match: match[0] if "'mobile'" in match[1]
                  else "CHECK(product IN (" + match[1] + ",'mobile'))", text)
    if "'mobile'" not in text or 'issue_bridge.create_issue' not in text:
        raise ValueError('Expected the GitHub/Discord inquiry relay implementation')
    changes[inquiry] = text
    bridge = root / 'issue_bridge.py'
    if bridge.exists():
        text = bridge.read_text(encoding='utf-8')
        marker = 'def _existing_github_token(repository):\n'
        if marker in text and 'INQUIRY_GITHUB_TOKEN_MOBILE' not in text:
            text = text.replace(marker, marker +
                                "    mobile_repository = os.environ.get('INQUIRY_GITHUB_REPO_MOBILE', '')\n"
                                "    if mobile_repository and repository == mobile_repository:\n"
                                "        token = os.environ.get('INQUIRY_GITHUB_TOKEN_MOBILE', '')\n"
                                "        if token:\n            return token\n")
            changes[bridge] = text
    auth = root / 'auth.py'
    text = auth.read_text(encoding='utf-8')
    text = text.replace("if request.path == '/v1/player-bans/check':",
                        "if request.path in ('/v1/player-bans/check', '/v1/inquiries'):")
    if "'/v1/inquiries'):" not in text:
        raise ValueError('Unexpected CORS implementation; review before deployment')
    changes[auth] = text
    for path, content in changes.items():
        compile(content, str(path), 'exec')
    if not apply:
        return
    stamp = str(time.time_ns())
    for path, content in changes.items():
        path.with_name(path.name + '.backup-' + stamp).write_bytes(path.read_bytes())
        path.write_text(content, encoding='utf-8')


def migrate(database, source):
    with closing(sqlite3.connect(database)) as db, db:
        with closing(sqlite3.connect(str(database) + '.backup-' + str(time.time_ns()))) as backup:
            db.backup(backup)
        row = db.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='inquiry_webhooks'").fetchone()
        if row is None:
            raise ValueError('Inquiry webhook table is missing')
        schema = row[0]
        db.execute('BEGIN IMMEDIATE')
        if "'mobile'" not in schema:
            updated = re.sub(r"CHECK\(product IN \(([^)]+)\)\)",
                             lambda match: "CHECK(product IN (" + match[1] + ",'mobile'))", schema)
            if updated == schema:
                raise ValueError('Unexpected webhook schema')
            db.execute('ALTER TABLE inquiry_webhooks RENAME TO inquiry_webhooks_before_mobile')
            db.execute(updated)
            db.execute('INSERT INTO inquiry_webhooks SELECT * FROM inquiry_webhooks_before_mobile')
            db.execute('DROP TABLE inquiry_webhooks_before_mobile')
        db.execute('''INSERT INTO inquiry_webhooks
            SELECT 'mobile',webhook_url,kind,question_tag,bug_tag,request_tag,updated_at
            FROM inquiry_webhooks WHERE product=? AND kind='forum'
            ON CONFLICT(product) DO NOTHING''', (source,))
        if db.execute("SELECT 1 FROM inquiry_webhooks WHERE product='mobile' AND kind='forum'").fetchone() is None:
            raise ValueError('Configure the selected source as a forum before enabling mobile')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, required=True)
    parser.add_argument('--database', type=Path, required=True)
    parser.add_argument('--forum-source', choices=['tanuki', 'net'], required=True)
    args = parser.parse_args()
    # Validate the existing deployment first, before modifying its database.
    if not all((args.root / name).is_file() for name in ['auth.py', 'inquiry.py', 'issue_bridge.py', 'discord_bridge.py']):
        raise ValueError('Existing inquiry relay files are required')
    patch_sources(args.root, apply=False)
    migrate(args.database, args.forum_source)
    patch_sources(args.root)
    print('Mobile route enabled. Add INQUIRY_GITHUB_REPO_MOBILE=kuretoshi/BetterCrewlink-mobile_fix to both services, then restart API and Discord bridge.')
