import { readFileSync } from 'node:fs';
const plist = readFileSync('ios/App/App/Info.plist', 'utf8');
for (const key of ['NSMicrophoneUsageDescription', 'NSLocalNetworkUsageDescription', 'UIBackgroundModes']) {
  if (!plist.includes('<key>' + key + '</key>')) throw new Error('Missing iOS setting: ' + key);
}
console.log('iOS voice permissions and background audio declaration are present. Device testing is still required.');
