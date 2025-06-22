#!/usr/bin/env node

const { spawn } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

async function setupAudioBinaries() {
  console.log('🔊 Setting up audio binaries for platform:', process.platform);
  
  const resourcesDir = path.join(process.cwd(), 'resources', 'binaries');
  
  // Ensure directories exist
  const platformDirs = {
    win32: path.join(resourcesDir, 'windows'),
    darwin: path.join(resourcesDir, 'macos'),
    linux: path.join(resourcesDir, 'linux')
  };
  
  Object.values(platformDirs).forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });

  // Download platform-specific binaries
  switch (process.platform) {
    case 'win32':
      await setupWindowsBinaries(platformDirs.win32);
      break;
    case 'darwin':
      await setupMacOSBinaries(platformDirs.darwin);
      break;
    case 'linux':
      await setupLinuxBinaries(platformDirs.linux);
      break;
    default:
      console.log('⚠️ Unsupported platform:', process.platform);
  }
  
  console.log('✅ Audio binaries setup complete');
}

async function setupWindowsBinaries(windowsDir) {
  console.log('🪟 Setting up Windows audio binaries...');
  
  // Try multiple methods to get Sox for Windows
  const methods = [
    () => installSoxWithWinget(windowsDir),
    () => installSoxWithChocolatey(windowsDir),
    () => createWindowsFallback(windowsDir)
  ];

  for (const method of methods) {
    try {
      await method();
      console.log('✅ Windows audio setup completed');
      return;
    } catch (error) {
      console.log('⚠️ Method failed:', error.message);
    }
  }

  console.log('⚠️ All methods failed, creating fallback solution...');
  await createWindowsFallback(windowsDir);
}

async function installSoxWithWinget(windowsDir) {
  console.log('📦 Trying to install Sox with winget...');
  
  await runCommand('winget', ['install', '--id', 'shanebutler.SoX', '--accept-package-agreements', '--accept-source-agreements', '--silent']);
  
  // Find installed sox and copy to our directory
  const possiblePaths = [
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Packages', 'shanebutler.SoX_Microsoft.Winget.Source_8wekyb3d8bbwe', 'sox.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Microsoft', 'WinGet', 'Links', 'sox.exe'),
    path.join(process.env.PROGRAMFILES || '', 'SoX', 'sox.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] || '', 'SoX', 'sox.exe')
  ];
  
  const soxPath = path.join(windowsDir, 'sox.exe');
  
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      fs.copyFileSync(possiblePath, soxPath);
      console.log(`✅ Copied Sox from: ${possiblePath}`);
      return;
    }
  }
  
  throw new Error('Sox installed but could not locate binary');
}

async function installSoxWithChocolatey(windowsDir) {
  console.log('🍫 Trying to install Sox with Chocolatey...');
  
  await runCommand('choco', ['install', 'sox.portable', '-y']);
  
  // Find installed sox and copy to our directory
  const possiblePaths = [
    path.join(process.env.CHOCOLATEYINSTALL || 'C:\\ProgramData\\chocolatey', 'lib', 'sox.portable', 'tools', 'sox.exe'),
    path.join(process.env.PROGRAMFILES || '', 'SoX', 'sox.exe')
  ];
  
  const soxPath = path.join(windowsDir, 'sox.exe');
  
  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      fs.copyFileSync(possiblePath, soxPath);
      console.log(`✅ Copied Sox from: ${possiblePath}`);
      return;
    }
  }
  
  throw new Error('Sox installed but could not locate binary');
}

async function createWindowsFallback(windowsDir) {
  console.log('🔧 Creating Windows audio fallback system...');
  
  // Create a PowerShell-based audio handler
  const psScript = `# MetaKeyAI Windows Audio Handler
param(
    [string]$Action = "test",
    [string]$InputFile = "",
    [string]$OutputFile = ""
)

function Test-AudioCapabilities {
    $capabilities = @{
        PowerShell = $true
        WindowsMediaPlayer = Test-Path "C:\\Program Files\\Windows Media Player\\wmplayer.exe"
        FFmpeg = (Get-Command ffmpeg -ErrorAction SilentlyContinue) -ne $null
        SystemSox = (Get-Command sox -ErrorAction SilentlyContinue) -ne $null
    }
    return $capabilities
}

function Play-Audio {
    param([string]$FilePath)
    
    if (-not (Test-Path $FilePath)) {
        Write-Error "Audio file not found: $FilePath"
        exit 1
    }
    
    try {
        Add-Type -AssemblyName PresentationCore
        $player = New-Object System.Windows.Media.MediaPlayer
        $uri = [System.Uri]::new((Resolve-Path $FilePath).Path)
        $player.Open($uri)
        $player.Play()
        
        # Wait for media to load
        $timeout = 0
        while ($player.NaturalDuration.HasTimeSpan -eq $false -and $timeout -lt 50) {
            Start-Sleep -Milliseconds 100
            $timeout++
        }
        
        if ($player.NaturalDuration.HasTimeSpan) {
            $duration = $player.NaturalDuration.TimeSpan.TotalSeconds
            Start-Sleep -Seconds $duration
        } else {
            # Fallback: wait a reasonable time
            Start-Sleep -Seconds 3
        }
        
        $player.Close()
        Write-Output "Playback completed successfully"
    } catch {
        Write-Error "Playback failed: $($_.Exception.Message)"
        exit 1
    }
}

function Record-Audio {
    param([string]$OutputPath, [int]$Duration = 10)
    
    Write-Output "Audio recording via PowerShell is not supported."
    Write-Output "Please install Sox or FFmpeg for recording capabilities."
    exit 1
}

switch ($Action.ToLower()) {
    "play" { 
        if ([string]::IsNullOrEmpty($InputFile)) {
            Write-Error "InputFile parameter required for play action"
            exit 1
        }
        Play-Audio -FilePath $InputFile 
    }
    "record" { 
        if ([string]::IsNullOrEmpty($OutputFile)) {
            Write-Error "OutputFile parameter required for record action"
            exit 1
        }
        Record-Audio -OutputPath $OutputFile 
    }
    "test" { 
        $caps = Test-AudioCapabilities
        $caps | ConvertTo-Json -Depth 2
    }
    default { 
        Write-Output "MetaKeyAI Windows Audio Handler"
        Write-Output "Usage: audio-handler.ps1 -Action [play|record|test] [-InputFile <file>] [-OutputFile <file>]"
        Write-Output ""
        Write-Output "Examples:"
        Write-Output "  audio-handler.ps1 -Action test"
        Write-Output "  audio-handler.ps1 -Action play -InputFile 'C:\\path\\to\\audio.wav'"
        Write-Output "  audio-handler.ps1 -Action record -OutputFile 'C:\\path\\to\\output.wav'"
        exit 1
    }
}`;

  const psPath = path.join(windowsDir, 'audio-handler.ps1');
  fs.writeFileSync(psPath, psScript);
  
  // Create a batch wrapper for easier execution
  const batchWrapper = `@echo off
REM MetaKeyAI Audio Handler Wrapper
powershell -ExecutionPolicy Bypass -File "%~dp0audio-handler.ps1" %*`;

  const batPath = path.join(windowsDir, 'audio-handler.bat');
  fs.writeFileSync(batPath, batchWrapper);
  
  console.log('✅ Created Windows PowerShell audio handler');
}

async function setupMacOSBinaries(macosDir) {
  console.log('🍎 Setting up macOS audio binaries...');
  
  const soxPath = path.join(macosDir, 'sox');
  
  if (fs.existsSync(soxPath)) {
    console.log('✅ Sox already exists for macOS');
    return;
  }

  // Try to use Homebrew to get sox
  try {
    // Check if Homebrew is available
    await runCommand('brew', ['--version']);
    
    // Install sox
    await runCommand('brew', ['install', 'sox']);
    
    // Find the installed sox
    const result = await getCommandOutput('brew', ['--prefix']);
    const brewPrefix = result.stdout.trim();
    const brewSoxPath = path.join(brewPrefix, 'bin', 'sox');
    
    if (fs.existsSync(brewSoxPath)) {
      fs.copyFileSync(brewSoxPath, soxPath);
      fs.chmodSync(soxPath, 0o755); // Make executable
      console.log('✅ Copied Sox from Homebrew');
    }
  } catch (error) {
    console.log('⚠️ Could not install Sox via Homebrew:', error.message);
    console.log('📝 macOS users will need to install Sox manually: brew install sox');
  }
}

async function setupLinuxBinaries(linuxDir) {
  console.log('🐧 Setting up Linux audio binaries...');
  
  const soxPath = path.join(linuxDir, 'sox');
  
  if (fs.existsSync(soxPath)) {
    console.log('✅ Sox already exists for Linux');
    return;
  }

  // Try to use system package manager
  const packageManagers = [
    { cmd: 'sudo', args: ['apt-get', 'update', '&&', 'sudo', 'apt-get', 'install', '-y', 'sox'] },
    { cmd: 'sudo', args: ['yum', 'install', '-y', 'sox'] },
    { cmd: 'sudo', args: ['dnf', 'install', '-y', 'sox'] },
    { cmd: 'sudo', args: ['pacman', '-S', '--noconfirm', 'sox'] }
  ];

  for (const pm of packageManagers) {
    try {
      await runCommand(pm.cmd, pm.args);
      
      // Find the installed sox
      const result = await getCommandOutput('which', ['sox']);
      const systemSoxPath = result.stdout.trim();
      
      if (systemSoxPath && fs.existsSync(systemSoxPath)) {
        fs.copyFileSync(systemSoxPath, soxPath);
        fs.chmodSync(soxPath, 0o755); // Make executable
        console.log(`✅ Copied Sox from system: ${systemSoxPath}`);
        return;
      }
    } catch (error) {
      // Try next package manager
      console.log(`⚠️ ${pm.cmd} failed:`, error.message);
    }
  }

  console.log('⚠️ Could not install Sox via package manager');
  console.log('📝 Linux users will need to install Sox manually: sudo apt-get install sox');
}

// Utility functions
function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    console.log(`🔧 Running: ${command} ${args.join(' ')}`);
    
    const proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true,
      ...options
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`));
      }
    });

    proc.on('error', reject);
  });
}

function getCommandOutput(command, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: 'pipe' });
    
    let stdout = '';
    let stderr = '';
    
    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });
    
    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });
    
    proc.on('close', (code) => {
      resolve({ stdout, stderr, code });
    });
    
    proc.on('error', reject);
  });
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Download failed: ${response.statusCode}`));
        return;
      }
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', reject);
  });
}

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
  if (fs.existsSync(soxPath)) {
    console.log('🔊 sox.exe already exists, skipping download');
    return;
  }

  console.log('🔊 Downloading sox.exe for Windows...');
  
  // Use a reliable sox binary from SourceForge
  const soxUrl = 'https://downloads.sourceforge.net/project/sox/sox/14.4.2/sox-14.4.2-win32.exe';
  
  try {
    await downloadFile(soxUrl, soxPath);
    console.log('✅ sox.exe downloaded successfully');
  } catch (error) {
    console.warn('⚠️ Failed to download sox.exe:', error.message);
    console.log('🔊 Audio recording may fall back to ffmpeg');
  }
}

if (require.main === module) {
  (async () => {
    await setupAudioBinaries();
    await setupWindowsAudio();
  })().catch(console.error);
}

module.exports = { setupAudioBinaries }; 