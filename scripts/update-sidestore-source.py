#!/usr/bin/env python3
"""Update SideStore and AltStore Classic feeds after building an unsigned IPA.

Usage: python3 scripts/update-sidestore-source.py IPA RELEASE_TAG YYYY-MM-DD
Upload the IPA to the named release before publishing distribution/sidestore.json and distribution/altstore.json.
"""
import datetime
import json
import plistlib
import re
import sys
import zipfile
from pathlib import Path

ipa, tag, date = sys.argv[1:]
datetime.date.fromisoformat(date)

def numeric_version(value):
    if not re.fullmatch(r'\d+\.\d+(?:\.\d+)?', value):
        raise ValueError('Expected a numeric release version')
    parts = tuple(map(int, value.split('.')))
    return parts + (0,) * (3 - len(parts))

repo = 'kuretoshi/BetterCrewlink-mobile_fix'
source_url = f'https://raw.githubusercontent.com/{repo}/voice_effect/distribution/sidestore.json'
path = Path('distribution/sidestore.json')
with zipfile.ZipFile(ipa) as archive:
    names = [n for n in archive.namelist() if n.startswith('Payload/') and n.count('/') == 2 and n.endswith('.app/Info.plist')]
    if len(names) != 1:
        raise ValueError('Expected one main application Info.plist')
    info = plistlib.loads(archive.read(names[0]))
if numeric_version(tag.removeprefix('v')) != numeric_version(info['CFBundleShortVersionString']):
    raise ValueError('Release tag and IPA version differ')
with zipfile.ZipFile(ipa) as archive:
    if any(n.endswith('embedded.mobileprovision') or '/_CodeSignature/' in n for n in archive.namelist()):
        raise ValueError('Use a fresh unsigned IPA without personal signing material')
if info['CFBundleIdentifier'] != 'io.bettercrewlink.tanuki':
    raise ValueError('Unexpected bundle identifier; use the unsigned distribution IPA')
version = {
    'version': info['CFBundleShortVersionString'], 'date': date,
    'downloadURL': f'https://github.com/{repo}/releases/download/{tag}/{Path(ipa).name}',
    'size': Path(ipa).stat().st_size, 'minOSVersion': info['MinimumOSVersion'],
    'localizedDescription': f'{tag}の修正を反映。iOS版は試験版で、ゲーム中の通話継続は未検証です。\nhttps://github.com/{repo}/releases/tag/{tag}',
}
feed = json.loads(path.read_text()) if path.exists() else {
    'name': 'Tanuki BCL Mobile', 'identifier': 'io.bettercrewlink.tanuki.source',
    'sourceURL': source_url, 'apps': [{
        'name': 'Tanuki BCL Mobile', 'bundleIdentifier': info['CFBundleIdentifier'],
        'developerName': 'kuretoshi / BetterCrewLink contributors',
        'subtitle': 'Among Usの近接ボイスチャット（iOS試験版）',
        'localizedDescription': 'Tanuki BCL MobileのiOS試験版。同じiPhoneでAmong Usを開いている間の通話継続は未検証です。SideStoreで利用者自身のApple Accountによる署名が必要です。',
        'iconURL': f'https://raw.githubusercontent.com/{repo}/voice_effect/resources/icon.png',
        'tintColor': '8C38FF',
        'permissions': [
            {'type': 'microphone', 'usageDescription': info['NSMicrophoneUsageDescription']},
            {'type': 'network', 'usageDescription': info['NSLocalNetworkUsageDescription']},
            {'type': 'background-audio', 'usageDescription': '通話用の背景音声を宣言しています。ゲーム中の通話継続は未検証です。'},
        ], 'versions': [],
    }], 'news': [],
}
app = feed['apps'][0]
app['versions'] = sorted([version] + [v for v in app['versions'] if v['version'] != version['version']], key=lambda v: numeric_version(v['version']), reverse=True)
latest = app['versions'][0]
# Legacy fields keep older SideStore source readers compatible.
app.update(version=latest['version'], versionDate=latest['date'],
           versionDescription=latest['localizedDescription'],
           downloadURL=latest['downloadURL'], size=latest['size'])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + '\n')
print(source_url)

# AltStore Classic uses explicit appPermissions and buildVersion metadata.
# Keep its format separate so the existing SideStore schema stays compatible.
import copy
alt_path = Path('distribution/altstore.json')
old_alt = json.loads(alt_path.read_text()) if alt_path.exists() else None
alt_version = {**version, 'buildVersion': info['CFBundleVersion']}
alt_app = copy.deepcopy(app)
for key in ['permissions', 'version', 'versionDate', 'versionDescription', 'downloadURL', 'size']:
    alt_app.pop(key, None)
alt_app['localizedDescription'] = alt_app['localizedDescription'].replace('SideStoreで', 'SideStoreまたはAltStore Classicで')
alt_app['category'] = 'social'
alt_app['appPermissions'] = {
    'entitlements': [],
    'privacy': {k: v for k, v in info.items() if k.startswith('NS') and k.endswith('UsageDescription')},
}
# These public IPAs are unsigned and do not carry additional entitlements.
with zipfile.ZipFile(ipa) as archive:
    if any(n.endswith('embedded.mobileprovision') or '/_CodeSignature/' in n for n in archive.namelist()):
        raise ValueError('Use a fresh unsigned IPA without personal signing material')
previous = old_alt['apps'][0]['versions'] if old_alt else []
if previous and numeric_version(previous[0]['version']) > numeric_version(alt_version['version']):
    alt_app = copy.deepcopy(old_alt['apps'][0])
alt_app['versions'] = sorted([alt_version] + [v for v in previous if v['version'] != alt_version['version']], key=lambda v: numeric_version(v['version']), reverse=True)
alt_feed = {
    'name': 'Tanuki BCL Mobile',
    'subtitle': 'AltStore Classic向けiOS試験版',
    'description': 'Tanuki BCL MobileのAltStore Classic用配布ソース。ゲーム中の通話継続は未検証です。',
    'website': f'https://github.com/{repo}',
    'iconURL': app['iconURL'], 'tintColor': app['tintColor'],
    'apps': [alt_app], 'news': [],
}
alt_path.write_text(json.dumps(alt_feed, ensure_ascii=False, indent=2) + '\n')
print(f'https://raw.githubusercontent.com/{repo}/voice_effect/distribution/altstore.json')
