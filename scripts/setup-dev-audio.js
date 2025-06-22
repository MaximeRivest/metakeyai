#!/usr/bin/env node

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');

/**
 * Development Audio Setup Script
 * 
 * This script ensures that audio recording dependencies are available
 * for local development across different platforms.
 */

const platform = process.platform;
const appPath = process.cwd();
const resourcesDir = path.join(appPath, 'resources', 'binaries');

async function main() {
  console.log('🎙️ Setting up audio recording dependencies for development...');
  console.log(`📋 Platform: ${platform}`);

  // Ensure resources directory exists
  ensureDirectoryExists(resourcesDir);
  ensureDirectoryExists(path.join(resourcesDir, platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux'));

  try {
    if (platform === 'linux') {
      await setupLinuxAudio();
    } else if (platform === 'darwin') {
      await setupMacAudio();
    } else if (platform === 'win32') {
      await setupWindowsAudio();
    } else {
      console.warn('⚠️ Unsupported platform:', platform);
      process.exit(1);
    }

    console.log('✅ Audio recording setup completed successfully!');
    await verifySetup();
  } catch (error) {
    console.error('❌ Audio setup failed:', error.message);
    console.log('\n📝 Manual setup instructions:');
    printManualInstructions();
    process.exit(1);
  }
}

function ensureDirectoryExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
}

async function setupLinuxAudio() {
  console.log('🐧 Setting up Linux audio dependencies...');
  
  const soxDestination = path.join(resourcesDir, 'linux', 'sox');
  
  // Check if sox is already available locally
  if (fs.existsSync(soxDestination)) {
    console.log('✅ Sox binary already exists locally');
    return;
  }

  // Try to find system sox
  const systemSoxPaths = ['/usr/bin/sox', '/usr/local/bin/sox', '/bin/sox'];
  let systemSox = null;

  for (const soxPath of systemSoxPaths) {
    if (fs.existsSync(soxPath)) {
      systemSox = soxPath;
      break;
    }
  }

  if (systemSox) {
    console.log(`📋 Found system sox at: ${systemSox}`);
    fs.copyFileSync(systemSox, soxDestination);
    fs.chmodSync(soxDestination, 0o755);
    console.log('✅ Copied sox binary to resources');
  } else {
    console.log('🔧 Installing sox via package manager...');
    
    // Try different package managers
    try {
      execSync('which apt-get', { stdio: 'ignore' });
      execSync('sudo apt-get update && sudo apt-get install -y sox libsox-fmt-all', { stdio: 'inherit' });
    } catch (e) {
      try {
        execSync('which yum', { stdio: 'ignore' });
        execSync('sudo yum install -y sox', { stdio: 'inherit' });
      } catch (e) {
        try {
          execSync('which dnf', { stdio: 'ignore' });
          execSync('sudo dnf install -y sox', { stdio: 'inherit' });
        } catch (e) {
          try {
            execSync('which pacman', { stdio: 'ignore' });
            execSync('sudo pacman -S sox --noconfirm', { stdio: 'inherit' });
          } catch (e) {
            throw new Error('Could not install sox. Please install it manually.');
          }
        }
      }
    }

    // Try to copy again after installation
    for (const soxPath of systemSoxPaths) {
      if (fs.existsSync(soxPath)) {
        fs.copyFileSync(soxPath, soxDestination);
        fs.chmodSync(soxDestination, 0o755);
        console.log('✅ Installed and copied sox binary');
        return;
      }
    }
    
    throw new Error('Sox installation appeared to succeed but binary not found');
  }
}

async function setupMacAudio() {
  console.log('🍎 Setting up macOS audio dependencies...');
  
  const soxDestination = path.join(resourcesDir, 'macos', 'sox');
  
  // Check if sox is already available locally
  if (fs.existsSync(soxDestination)) {
    console.log('✅ Sox binary already exists locally');
    return;
  }

  // Try to find system sox
  const systemSoxPaths = ['/opt/homebrew/bin/sox', '/usr/local/bin/sox', '/usr/bin/sox'];
  let systemSox = null;

  for (const soxPath of systemSoxPaths) {
    if (fs.existsSync(soxPath)) {
      systemSox = soxPath;
      break;
    }
  }

  if (systemSox) {
    console.log(`📋 Found system sox at: ${systemSox}`);
    fs.copyFileSync(systemSox, soxDestination);
    fs.chmodSync(soxDestination, 0o755);
    console.log('✅ Copied sox binary to resources');
  } else {
    console.log('🔧 Installing sox via Homebrew...');
    
    try {
      // Check if Homebrew is installed
      execSync('which brew', { stdio: 'ignore' });
      execSync('brew install sox', { stdio: 'inherit' });
      
      // Try to copy after installation
      for (const soxPath of systemSoxPaths) {
        if (fs.existsSync(soxPath)) {
          fs.copyFileSync(soxPath, soxDestination);
          fs.chmodSync(soxDestination, 0o755);
          console.log('✅ Installed and copied sox binary');
          return;
        }
      }
      
      throw new Error('Sox installation appeared to succeed but binary not found');
    } catch (e) {
      throw new Error('Homebrew not found or sox installation failed. Please install Homebrew and sox manually.');
    }
  }
}

async function setupWindowsAudio() {
  console.log('🪟 Setting up Windows audio dependencies...');
  
  const soxDestination = path.join(resourcesDir, 'windows', 'sox.exe');
  
  // Check if sox is already available locally
  if (fs.existsSync(soxDestination) && await testWindowsSox(soxDestination)) {
    console.log('✅ Sox binary already exists locally and is functional');
    return;
  }

  console.log('🔧 Attempting to install sox...');
  
  // Method 1: Try winget
  try {
    console.log('📦 Trying winget...');
    execSync('winget install --id shanebutler.SoX --accept-package-agreements --accept-source-agreements', { stdio: 'inherit' });
    
    const wingetPaths = [
      path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages', 'shanebutler.SoX_Microsoft.Winget.Source_8wekyb3d8bbwe', 'sox.exe'),
      path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Links', 'sox.exe')
    ];
    
    for (const wingetPath of wingetPaths) {
      if (fs.existsSync(wingetPath)) {
        fs.copyFileSync(wingetPath, soxDestination);
        console.log('✅ Installed sox via winget');
        return;
      }
    }
  } catch (e) {
    console.log('⚠️ Winget installation failed:', e.message);
  }

  // Method 2: Try chocolatey
  try {
    console.log('📦 Trying chocolatey...');
    execSync('choco install sox.portable -y', { stdio: 'inherit' });
    
    const chocoPaths = [
      path.join(process.env.ProgramData || '', 'chocolatey', 'lib', 'sox.portable', 'tools', 'sox.exe'),
      path.join(process.env.ProgramData || '', 'chocolatey', 'bin', 'sox.exe'),
      path.join(process.env.ChocolateyInstall || '', 'lib', 'sox.portable', 'tools', 'sox.exe'),
      path.join(process.env.ChocolateyInstall || '', 'bin', 'sox.exe')
    ];
    
    for (const chocoPath of chocoPaths) {
      if (fs.existsSync(chocoPath)) {
        fs.copyFileSync(chocoPath, soxDestination);
        console.log('✅ Installed sox via chocolatey');
        return;
      }
    }
  } catch (e) {
    console.log('⚠️ Chocolatey installation failed:', e.message);
  }

  // Method 3: Direct download
  try {
    console.log('📦 Trying direct download...');
    await downloadSoxForWindows(soxDestination);
    console.log('✅ Downloaded sox directly');
    return;
  } catch (e) {
    console.log('⚠️ Direct download failed:', e.message);
  }

  throw new Error('All Windows sox installation methods failed');
}

async function downloadSoxForWindows(destination) {
  return new Promise((resolve, reject) => {
    const url = 'https://sourceforge.net/projects/sox/files/sox/14.4.2/sox-14.4.2-win32.zip/download';
    const tempZip = path.join(__dirname, '..', 'temp-sox.zip');
    const tempDir = path.join(__dirname, '..', 'temp-sox-extract');
    
    console.log('📥 Downloading sox...');
    
    const file = fs.createWriteStream(tempZip);
    https.get(url, (response) => {
      if (response.statusCode === 302 && response.headers.location) {
        // Follow redirect
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', async () => {
            file.close();
            try {
              await extractAndCopySox(tempZip, tempDir, destination);
              resolve();
            } catch (error) {
              reject(error);
            }
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', async () => {
          file.close();
          try {
            await extractAndCopySox(tempZip, tempDir, destination);
            resolve();
          } catch (error) {
            reject(error);
          }
        });
      }
    }).on('error', reject);
  });
}

async function extractAndCopySox(zipPath, extractDir, destination) {
  // This is a simplified extraction - in a real implementation you'd use a proper zip library
  console.log('📂 Extracting sox...');
  
  try {
    execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'inherit' });
    
    // Look for sox.exe in the extracted directory
    const findSox = (dir) => {
      const items = fs.readdirSync(dir);
      for (const item of items) {
        const itemPath = path.join(dir, item);
        if (fs.statSync(itemPath).isDirectory()) {
          const found = findSox(itemPath);
          if (found) return found;
        } else if (item === 'sox.exe') {
          return itemPath;
        }
      }
      return null;
    };
    
    const soxPath = findSox(extractDir);
    if (soxPath) {
      fs.copyFileSync(soxPath, destination);
      console.log('✅ Extracted and copied sox.exe');
    } else {
      throw new Error('sox.exe not found in extracted archive');
    }
  } finally {
    // Cleanup
    try {
      if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
    } catch (e) {
      console.log('⚠️ Cleanup warning:', e.message);
    }
  }
}

async function testWindowsSox(soxPath) {
  return new Promise((resolve) => {
    const testProcess = spawn(soxPath, ['--version'], { stdio: 'pipe' });
    
    let hasOutput = false;
    testProcess.stdout?.on('data', (data) => {
      if (data.toString().includes('sox') || data.toString().includes('SoX')) {
        hasOutput = true;
      }
    });

    testProcess.on('close', (code) => {
      resolve(code === 0 && hasOutput);
    });

    testProcess.on('error', () => {
      resolve(false);
    });

    setTimeout(() => {
      testProcess.kill();
      resolve(false);
    }, 3000);
  });
}

async function verifySetup() {
  console.log('\n🔍 Verifying audio setup...');
  
  const expectedPlatformDir = platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux';
  const expectedExtension = platform === 'win32' ? '.exe' : '';
  const soxPath = path.join(resourcesDir, expectedPlatformDir, `sox${expectedExtension}`);
  
  if (fs.existsSync(soxPath)) {
    console.log('✅ Sox binary found at:', soxPath);
    
    const stats = fs.statSync(soxPath);
    console.log(`📊 File size: ${stats.size} bytes`);
    console.log(`🔒 Permissions: ${stats.mode.toString(8)}`);
    
    // Test execution
    try {
      const testProcess = spawn(soxPath, ['--version'], { stdio: 'pipe', timeout: 5000 });
      
      testProcess.stdout?.on('data', (data) => {
        console.log('✅ Sox version output:', data.toString().trim().split('\n')[0]);
      });

      testProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Sox binary is executable and working');
        } else {
          console.log('⚠️ Sox binary exists but returned non-zero exit code:', code);
        }
      });

      testProcess.on('error', (error) => {
        console.log('⚠️ Sox binary exists but failed to execute:', error.message);
      });
    } catch (error) {
      console.log('⚠️ Sox binary test failed:', error.message);
    }
  } else {
    console.log('❌ Sox binary not found at expected location:', soxPath);
  }
  
  console.log('\n📋 Alternative audio methods available:');
  if (platform === 'win32') {
    console.log('  • PowerShell Speech Recognition (fallback)');
  }
  console.log('  • FFmpeg (if installed separately)');
  console.log('  • Native Electron media APIs (future enhancement)');
}

function printManualInstructions() {
  console.log('\n📝 Manual Setup Instructions:');
  console.log('=====================================');
  
  if (platform === 'linux') {
    console.log('Linux:');
    console.log('  sudo apt-get install sox libsox-fmt-all  # Ubuntu/Debian');
    console.log('  sudo yum install sox                     # RHEL/CentOS');
    console.log('  sudo dnf install sox                     # Fedora');
    console.log('  sudo pacman -S sox                       # Arch');
  } else if (platform === 'darwin') {
    console.log('macOS:');
    console.log('  brew install sox');
  } else if (platform === 'win32') {
    console.log('Windows:');
    console.log('  winget install shanebutler.SoX');
    console.log('  # OR');
    console.log('  choco install sox.portable');
    console.log('  # OR download from: https://sourceforge.net/projects/sox/');
  }
  
  console.log('\nAlternatively, install FFmpeg for cross-platform audio support:');
  console.log('  https://ffmpeg.org/download.html');
}

// Run the setup if called directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
}

module.exports = { main }; 