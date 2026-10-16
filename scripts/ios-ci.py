#!/usr/bin/env python3
"""Build metadata, unsigned packaging and publication for release-ios.yml."""
import datetime
import hashlib
import json
import os
import plistlib
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

REPO = 'kuretoshi/BetterCrewlink-mobile_fix'
BUNDLE = 'io.bettercrewlink.tanuki'
MARKER_START = '<!-- ios-ci:start -->'
MARKER_END = '<!-- ios-ci:end -->'


def command(*args, **kwargs):
    return subprocess.check_output(args, text=True, **kwargs).strip()


def version_tuple(value):
    if not re.fullmatch(r'\d+\.\d+(?:\.\d+)?', value):
        raise ValueError('Expected a numeric mobile release version')
    parts = [int(p) for p in value.split('.')]
    return tuple(parts + [0] * (3 - len(parts)))


def prepare(tag):
    if not re.fullmatch(r'v\d+\.\d+(?:\.\d+)?', tag):
        raise ValueError('Expected a stable release tag such as v3.20')
    version = json.loads(Path('package.json').read_text())['version']
    if version_tuple(tag[1:]) != version_tuple(version):
        raise ValueError('Release tag and package.json version differ')
    env = Path('src/environments/environment.prod.ts').read_text()
    web_version = re.search(r"appVersion:\s*'([^']+)'", env)[1]
    if version_tuple(web_version) != version_tuple(version):
        raise ValueError('Web and native versions would differ')
    if os.environ.get('SOURCE_OVERRIDE') and os.environ.get('PUBLISH') == 'true':
        raise ValueError('source_ref overrides are allowed only for build-only tests')
    android = Path('android/app/build.gradle').read_text()
    code = int(re.search(r'versionCode\s*=\s*(\d+)', android)[1])
    build = str(code * 1000 + 1)
    project = Path('ios/App/App.xcodeproj/project.pbxproj')
    text = project.read_text()
    text, count = re.subn(r'MARKETING_VERSION = [^;]+;', f'MARKETING_VERSION = {version};', text)
    if count != 2:
        raise ValueError('Expected Debug and Release native version settings')
    text = re.sub(r'CURRENT_PROJECT_VERSION = [^;]+;', f'CURRENT_PROJECT_VERSION = {build};', text)
    project.write_text(text)
    Path('work').mkdir(exist_ok=True)
    Path('work/ios-release-meta.json').write_text(json.dumps({
        'tag': tag, 'version': version, 'build': build,
        'label': tag[1:], 'sourceCommit': command('git', 'rev-parse', 'HEAD'),
    }))
    print(f'Preparing {tag}, native {version} ({build})')


def inspect_app(app, meta):
    info = plistlib.loads((app / 'Info.plist').read_bytes())
    expected = {'CFBundleIdentifier': BUNDLE, 'CFBundleShortVersionString': meta['version'],
                'CFBundleVersion': meta['build']}
    for key, value in expected.items():
        if info.get(key) != value:
            raise ValueError(f'Unexpected built application {key}')
    if any(p.name == 'embedded.mobileprovision' or p.name == '_CodeSignature' for p in app.rglob('*')):
        raise ValueError('Distribution application contains signing material')
    return info


def package(app, output):
    meta = json.loads(Path('work/ios-release-meta.json').read_text())
    inspect_app(app, meta)
    output.mkdir(parents=True, exist_ok=True)
    stem = f"TanukiBCL-Mobile-iOS-{meta['label']}"
    ipa = output / (stem + '.ipa')
    with zipfile.ZipFile(ipa, 'w', zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(app.rglob('*')):
            if path.is_file():
                archive.write(path, 'Payload/App.app/' + path.relative_to(app).as_posix())
    source = output / (stem + '-source.zip')
    # Read stamped working files, not git archive's pre-stamp versions.
    paths = command('git', 'ls-files', '-z').split('\0')
    with zipfile.ZipFile(source, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(paths):
            path = Path(name)
            if path.is_file():
                archive.write(path, stem + '/' + name)
    for path in (ipa, source):
        with zipfile.ZipFile(path) as archive:
            if archive.testzip():
                raise ValueError('Invalid ZIP: ' + str(path))
    (output / (stem + '-SHA256SUMS.txt')).write_text(''.join(
        hashlib.sha256(p.read_bytes()).hexdigest() + '  ' + p.name + '\n' for p in (ipa, source)))
    readme = f"""# iOS {meta['version']}（試験版）

AltStore ClassicとSideStore用の署名無しIPAです。自身のApple Accountで再署名してください。

AltStore ClassicのSourcesへ登録:
https://raw.githubusercontent.com/{REPO}/voice_effect/distribution/altstore.json

SideStoreのSourcesへ登録:
https://raw.githubusercontent.com/{REPO}/voice_effect/distribution/sidestore.json

AltStore ClassicにはAltServerへの接続が必要です。SideStoreにはWi-FiとLocalDevVPNを使います。

Webのテスト、lint、Xcodeビルドを実行しています。実機インストール・更新、NoS連携、
同じiPhoneでAmong Usを前面に開いた間の通話継続は自動テストでは検証していません。

対応ソースは同梱の-source.zipです。ソースコミット: {meta['sourceCommit']}
ネイティブバージョン: {meta['version']} / ビルド {meta['build']}
再ビルドと詳細はソースのdocs/ios-development.md、docs/ios-releases.mdを参照してください。
"""
    (output / (stem + '-README.md')).write_text(readme)
    (output / 'manifest.json').write_text(json.dumps(meta))
    print(f'Packaged {ipa} ({ipa.stat().st_size} bytes)')


def managed_notes(body, note):
    block = f'{MARKER_START}\n{note}\n{MARKER_END}'
    pattern = re.escape(MARKER_START) + r'.*?' + re.escape(MARKER_END)
    if MARKER_START in body:
        return re.sub(pattern, lambda _: block, body, flags=re.S)
    return body.rstrip() + '\n\n' + block + '\n'


def publish(output, tag):
    meta = json.loads((output / 'manifest.json').read_text())
    if meta['tag'] != tag:
        raise ValueError('Artifact belongs to another release')
    release = json.loads(command('gh', 'release', 'view', tag, '--repo', REPO,
                                 '--json', 'isDraft,isPrerelease,body'))
    if release['isDraft'] or release['isPrerelease']:
        raise ValueError('Only published stable releases update public sources')
    stem = f"TanukiBCL-Mobile-iOS-{meta['label']}"
    ipa = output / (stem + '.ipa')
    # Use the current default branch's feeds to preserve concurrent newer releases.
    subprocess.run(['python3', 'scripts/update-sidestore-source.py', str(ipa.resolve()), tag,
                    datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=9))).date().isoformat()], check=True)
    for name, asset in [('sidestore', 'TanukiBCL-SideStore.json'),
                        ('altstore', 'TanukiBCL-AltStore-Classic.json')]:
        shutil.copyfile(f'distribution/{name}.json', output / asset)
    assets = sorted(p for p in output.iterdir() if p.name != 'manifest.json')
    # URLs must exist before the public feed commit becomes visible.
    subprocess.run(['gh', 'release', 'upload', tag, '--repo', REPO, '--clobber',
                    *map(str, assets)], check=True)
    note = f"""## iOS {meta['version']}（試験版・自動ビルド）

`{stem}.ipa` と対応ソース・導入手順・SHA-256を添付しました。
AltStore Classic / SideStoreで自身のApple Accountにより再署名してインストールできます。

- [AltStore Classic用ソース](https://raw.githubusercontent.com/{REPO}/voice_effect/distribution/altstore.json)
- [SideStore用ソース](https://raw.githubusercontent.com/{REPO}/voice_effect/distribution/sidestore.json)

テスト・lint・Web本番ビルド・署名無しiOSビルドが成功しています。
実機でのインストール・更新、NoS連携、ゲーム中の背景通話は未検証です。
"""
    with tempfile.NamedTemporaryFile('w', suffix='.md') as file:
        file.write(managed_notes(release['body'], note))
        file.flush()
        subprocess.run(['gh', 'release', 'edit', tag, '--repo', REPO,
                        '--notes-file', file.name], check=True)
    subprocess.run(['git', 'add', 'distribution/altstore.json', 'distribution/sidestore.json'], check=True)
    if subprocess.run(['git', 'diff', '--cached', '--quiet']).returncode != 0:
        subprocess.run(['git', 'config', 'user.name', 'github-actions[bot]'], check=True)
        subprocess.run(['git', 'config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com'], check=True)
        subprocess.run(['git', 'commit', '-m', f'Update iOS app sources for {tag}'], check=True)
        # Never force-push. A conflicting concurrent edit fails visibly for retry.
        subprocess.run(['git', 'pull', '--rebase', 'origin', 'voice_effect'], check=True)
        subprocess.run(['git', 'push', 'origin', 'HEAD:voice_effect'], check=True)
    print('Release assets and both app sources published')


if __name__ == '__main__':
    operation, *args = sys.argv[1:]
    if operation == 'prepare':
        prepare(*args)
    elif operation == 'package':
        package(*map(Path, args))
    elif operation == 'publish':
        publish(Path(args[0]), args[1])
    else:
        raise SystemExit('Unknown operation')
