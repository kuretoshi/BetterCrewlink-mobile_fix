#!/usr/bin/env python3
"""Update the public SideStore feed after building an unsigned IPA.

Usage: python3 scripts/update-sidestore-source.py IPA RELEASE_TAG YYYY-MM-DD
Upload the IPA to the named release before publishing distribution/sidestore.json.
"""
import datetime
import json
import plistlib
import sys
import zipfile
from pathlib import Path

ipa, tag, date = sys.argv[1:]
datetime.date.fromisoformat(date)
repo = 'kuretoshi/BetterCrewlink-mobile_fix'
source_url = f'https://raw.githubusercontent.com/{repo}/voice_effect/distribution/sidestore.json'
path = Path('distribution/sidestore.json')
with zipfile.ZipFile(ipa) as archive:
    names = [n for n in archive.namelist() if n.startswith('Payload/') and n.count('/') == 2 and n.endswith('.app/Info.plist')]
    if len(names) != 1:
        raise ValueError('Expected one main application Info.plist')
    info = plistlib.loads(archive.read(names[0]))
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
app['versions'] = [version] + [v for v in app['versions'] if v['version'] != version['version']]
# Legacy fields keep older SideStore source readers compatible.
app.update(version=version['version'], versionDate=date,
           versionDescription=version['localizedDescription'],
           downloadURL=version['downloadURL'], size=version['size'])
path.parent.mkdir(parents=True, exist_ok=True)
path.write_text(json.dumps(feed, ensure_ascii=False, indent=2) + '\n')
print(source_url)
