#!/usr/bin/env node

/*
 * Setup audio binaries for different platforms
 * - Windows: Create sox stub (app will use ffmpeg/powershell fallback)
 * - macOS: Use system tools
 * - Linux: Use system tools
 */

const fs = require('fs');
const path = require('path');

async function setupWindowsAudio() {
  if (process.platform !== 'win32') {
    console.log('🔊 Windows audio setup skipped - not running on Windows');
    return;
  }

  const resourcesDir = path.join(process.cwd(), 'resources', 'binaries', 'windows');
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }

  const soxPath = path.join(resourcesDir, 'sox.exe');
  
  // Remove any existing sox stub that might cause spawn errors
  if (fs.existsSync(soxPath)) {
    fs.unlinkSync(soxPath);
    console.log('🔊 Removed problematic sox stub');
  }
  
  console.log('🔊 Windows audio will use ffmpeg/PowerShell fallback (more reliable)');
}

async function setupAudioBinaries() {
  console.log('🔊 Setting up audio binaries...');
  
  switch (process.platform) {
    case 'win32':
      await setupWindowsAudio();
      break;
    case 'darwin':
      console.log('🍎 macOS: Using system audio tools');
      break;
    case 'linux':
      console.log('🐧 Linux: Using system sox (install via package manager)');
      break;
    default:
      console.log('⚠️ Unsupported platform:', process.platform);
  }
  
  console.log('✅ Audio binaries setup complete');
}

if (require.main === module) {
  setupAudioBinaries()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('❌ setup-audio-binaries failed', err);
      process.exit(1);
    });
} 