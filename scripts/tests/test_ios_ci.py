import importlib.util
import json
import os
import plistlib
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('ios_ci', ROOT / 'scripts/ios-ci.py')
ci = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ci)


class IOSReleaseTests(unittest.TestCase):
    def test_iphone_safe_area_is_not_applied_twice(self):
        config = json.loads((ROOT / 'capacitor.config.json').read_text(encoding='utf-8'))
        viewport = (ROOT / 'src/index.html').read_text(encoding='utf-8')
        self.assertEqual(config['ios']['contentInset'], 'never')
        self.assertEqual(config['ios']['backgroundColor'], '#1d1a23')
        self.assertIn('viewport-fit=cover', viewport)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old = Path.cwd()
        os.chdir(self.temp.name)
        Path('src/environments').mkdir(parents=True)
        Path('android/app').mkdir(parents=True)
        Path('ios/App/App.xcodeproj').mkdir(parents=True)
        Path('package.json').write_text('{"version":"3.20.0"}')
        Path('src/environments/environment.prod.ts').write_text("appVersion: '3.20'")
        Path('android/app/build.gradle').write_text('versionCode = 62')
        Path('ios/App/App.xcodeproj/project.pbxproj').write_text(
            ('MARKETING_VERSION = 3.19.0;\nCURRENT_PROJECT_VERSION = 31901;\n') * 2)

    def tearDown(self):
        os.chdir(self.old)
        self.temp.cleanup()

    def prepare(self):
        with patch.object(ci, 'command', return_value='source-sha'):
            ci.prepare('v3.20')
        return json.loads(Path('work/ios-release-meta.json').read_text())

    def app(self, meta):
        app = Path('App.app')
        app.mkdir()
        (app / 'Info.plist').write_bytes(plistlib.dumps({
            'CFBundleIdentifier': ci.BUNDLE, 'CFBundleShortVersionString': meta['version'],
            'CFBundleVersion': meta['build'], 'MinimumOSVersion': '15.0',
            'NSMicrophoneUsageDescription': 'Voice', 'NSLocalNetworkUsageDescription': 'LAN',
        }))
        return app

    def test_prepare_checks_versions_and_stamps_both_configurations(self):
        meta = self.prepare()
        self.assertEqual(meta['build'], '62001')
        self.assertEqual(Path('ios/App/App.xcodeproj/project.pbxproj').read_text().count('3.20.0'), 2)
        with self.assertRaises(ValueError):
            ci.prepare('v3.21')

    def test_override_cannot_publish(self):
        with patch.dict(os.environ, SOURCE_OVERRIDE='voice_effect', PUBLISH='true'):
            with self.assertRaises(ValueError):
                ci.prepare('v3.20')

    def test_package_includes_stamped_source_and_rejects_signing(self):
        meta = self.prepare()
        app = self.app(meta)
        with patch.object(ci, 'command', return_value='ios/App/App.xcodeproj/project.pbxproj\0package.json'):
            ci.package(app, Path('out'))
        with zipfile.ZipFile('out/TanukiBCL-Mobile-iOS-3.20-source.zip') as z:
            content = z.read('TanukiBCL-Mobile-iOS-3.20/ios/App/App.xcodeproj/project.pbxproj')
            self.assertIn(b'62001', content)
        (app / 'embedded.mobileprovision').touch()
        with self.assertRaises(ValueError):
            ci.inspect_app(app, meta)

    def test_managed_notes_preserve_mobile_notes_and_are_idempotent(self):
        first = ci.managed_notes('Mobile fixes', 'iOS first')
        second = ci.managed_notes(first, 'iOS second')
        self.assertIn('Mobile fixes', second)
        self.assertNotIn('iOS first', second)
        self.assertEqual(second.count(ci.MARKER_START), 1)

    def test_older_release_cannot_roll_back_either_feed(self):
        meta = self.prepare()
        self.app(meta)
        def ipa(version, filename):
            info = plistlib.loads(Path('App.app/Info.plist').read_bytes())
            info['CFBundleShortVersionString'] = version
            with zipfile.ZipFile(filename, 'w') as archive:
                archive.writestr('Payload/App.app/Info.plist', plistlib.dumps(info))
        for version in ['3.25.0', '3.2.34', '3.20.0']:
            filename = 'app-' + version + '.ipa'
            ipa(version, filename)
            subprocess.run([sys.executable, str(ROOT / 'scripts/update-sidestore-source.py'),
                            filename, 'v' + version, '2026-10-16'], check=True, capture_output=True)
        for name in ['sidestore', 'altstore']:
            feed = json.loads(Path('distribution/' + name + '.json').read_text())
            self.assertEqual(feed['apps'][0]['versions'][0]['version'], '3.2.34')
        before = Path('distribution/sidestore.json').read_bytes()
        result = subprocess.run([sys.executable, str(ROOT / 'scripts/update-sidestore-source.py'),
                                 filename, 'v99.0', '2026-10-16'], capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(Path('distribution/sidestore.json').read_bytes(), before)
