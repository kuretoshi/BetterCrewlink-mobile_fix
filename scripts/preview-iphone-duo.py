#!/usr/bin/env python3
"""Launch a native preview on the hosted Xcode 27.1 Apple Silicon image.

This checks startup and captures the simulator's initial display. It does not
simulate physical folding, microphone capture, or an Among Us session.
"""
import json
import subprocess
import time
from pathlib import Path

out = Path('work/duo-preview')
out.mkdir(parents=True, exist_ok=True)

def command(*args, capture=False, timeout=300):
    print('+ ' + ' '.join(str(arg) for arg in args), flush=True)
    result = subprocess.run(args, text=True, stdout=subprocess.PIPE if capture else None,
                            check=True, timeout=timeout)
    return result.stdout.strip() if capture else None

def run(*args):
    return command(*args, capture=True)

report = {}
try:
    report['xcode'] = run('xcodebuild', '-version')
    available = json.loads(run('xcrun', 'simctl', 'list', 'devices', 'available', '--json'))
    matches = [(runtime, device) for runtime, devices in available['devices'].items()
               for device in devices if device['name'] == 'iPhone Duo' and 'iOS-27-1' in runtime]
    if not matches:
        raise RuntimeError('The runner does not have an available iOS 27.1 iPhone Duo simulator')
    runtime, device = matches[0]
    udid = device['udid']
    report.update(runtime=runtime, device=device)
    if device['state'] != 'Booted':
        command('xcrun', 'simctl', 'boot', udid)
    command('xcrun', 'simctl', 'bootstatus', udid, '-b')
    command('xcodebuild', '-project', 'ios/App/App.xcodeproj', '-scheme', 'App',
                    '-configuration', 'Debug', '-destination', f'platform=iOS Simulator,id={udid}',
                    '-derivedDataPath', 'work/duo-simulator', 'CODE_SIGNING_ALLOWED=NO', 'build', timeout=600)
    app = Path('work/duo-simulator/Build/Products/Debug-iphonesimulator/App.app')
    command('xcrun', 'simctl', 'install', udid, str(app))
    report['launch'] = run('xcrun', 'simctl', 'launch', udid, 'io.bettercrewlink.tanuki')
    time.sleep(5)
    # The iOS 27.1 Duo simulator exposes both displays; an unspecified capture fails.
    for display in ('1', '3'):
        command('xcrun', 'simctl', 'io', udid, 'screenshot', f'--display={display}',
                str(out / f'iphone-duo-display-{display}.png'))
    report['result'] = 'Launched; initial display captured. Folding and voice are untested.'
except Exception as error:
    report['error'] = str(error)
    raise
finally:
    (out / 'report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
