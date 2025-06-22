#!/usr/bin/env node

/*
 * Download and unpack the official Python 3.11 Windows embeddable package so
 * the app can ship a self-contained interpreter (≈15 MB).
 *   – If the folder already exists we do nothing (CI cache).
 *   – Only runs on Windows.
 */

const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const unzipper = require('unzipper');

(async () => {
  if (process.platform !== 'win32') {
    console.log('🪟 Windows embed Python setup skipped – not running on Windows');
    return;
  }

  // Python 3.11.x embeddable zips stopped at 3.11.9; attempt latest first then fall back
  const candidateVersions = ['3.11.11', '3.11.10', '3.11.9', '3.11.8', '3.11.5', '3.11.4'];

  let version = null;
  let downloadUrl = null;
  let fileName = null;

  for (const v of candidateVersions) {
    const testUrl = `https://www.python.org/ftp/python/${v}/python-${v}-embed-amd64.zip`;
    const status = await urlExists(testUrl);
    if (status) {
      version = v;
      downloadUrl = testUrl;
      fileName = `python-${v}-embed-amd64.zip`;
      break;
    }
  }

  if (!downloadUrl) {
    throw new Error('No embeddable Python 3.11 zip found (Python site removed binaries).');
  }

  const resourcesDir = path.join(process.cwd(), 'resources', 'binaries', 'windows', 'python');

  if (fs.existsSync(path.join(resourcesDir, 'python.exe'))) {
    console.log('🐍 Embedded Python already present – skipping download');
    return;
  }

  fs.mkdirSync(resourcesDir, { recursive: true });

  const tmpZip = path.join(os.tmpdir(), fileName);
  console.log(`⬇️  Downloading embedded Python ${version}…`);

  await new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpZip);
    https.get(downloadUrl, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Download failed: ${res.statusCode}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });

  console.log('📦 Extracting…');
  await fs.createReadStream(tmpZip)
    .pipe(unzipper.Extract({ path: resourcesDir }))
    .promise();

  fs.unlinkSync(tmpZip);
  console.log(`✅ Embedded Python ready at ${resourcesDir}`);
})()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ setup-windows-python failed', err);
    process.exit(1);
  });

async function urlExists(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { method: 'HEAD' }, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
} 