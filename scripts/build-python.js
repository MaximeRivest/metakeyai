#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function buildPythonServer() {
  console.log('🚀 Building Python server with UV...');

  const appPath = process.cwd();
  
  // Check if UV is available
  const uvPath = await findUV();
  if (!uvPath) {
    console.error('❌ UV not found. Please install UV first.');
    process.exit(1);
  }

  // Copy the uv binary we detected into resources so packaged app can use it
  try {
    const resourcesDir = path.join(appPath, 'resources', 'binaries');
    const platformDir = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'macos' : 'linux';
    const destDir = path.join(resourcesDir, platformDir);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    const destUvPath = path.join(destDir, process.platform === 'win32' ? 'uv.exe' : 'uv');
    fs.copyFileSync(uvPath, destUvPath);
    console.log(`✅ Bundled uv binary at: ${destUvPath}`);
  } catch (err) {
    console.warn('⚠️ Failed to bundle uv binary:', err.message);
  }

  if (process.platform === 'win32') {
    console.log('🪟 Windows build: skipping UV sync (already shipping embedded Python).');
    return;
  }

  console.log('📦 Setting up UV-based distribution...');
  await buildWithUv(uvPath, appPath);
}

async function buildWithUv(uvPath, appPath) {
  // Ensure pyproject.toml exists and is properly configured
  await ensureUvProjectSetup(uvPath, appPath);
  
  // Copy project files to resources for distribution
  const resourcesDir = path.join(appPath, 'resources');
  if (!fs.existsSync(resourcesDir)) {
    fs.mkdirSync(resourcesDir, { recursive: true });
  }

  // Copy essential files for uv distribution
  const filesToCopy = ['pyproject.toml', 'uv.lock', 'src'];
  for (const file of filesToCopy) {
    const srcPath = path.join(appPath, file);
    const destPath = path.join(resourcesDir, file);
    
    if (fs.existsSync(srcPath)) {
      if (fs.statSync(srcPath).isDirectory()) {
        await copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
      console.log(`📋 Copied ${file} to resources`);
    }
  }

  // Create a setup script for first-time installation
  await createUvSetupScript(appPath);
  
  console.log('✅ UV-based distribution ready!');
  console.log('📝 Users will need uv installed, but Python environment will be managed automatically');
}

async function ensureUvProjectSetup(uvPath, appPath) {
  console.log('🔧 Setting up UV project...');
  
  // Create/update pyproject.toml for uv distribution
  const pyprojectPath = path.join(appPath, 'pyproject.toml');
  const pyprojectContent = `[project]
name = "metakeyai-server"
version = "0.1.0"
description = "MetaKeyAI Python server"
requires-python = ">=3.11"
dependencies = [
    "fastapi>=0.100.0",
    "uvicorn[standard]>=0.20.0",
    "dspy-ai>=2.4.0",
    "pandas>=2.0.0",
    "numpy>=1.24.0",
    "requests>=2.31.0",
    "beautifulsoup4>=4.12.0",
    "nltk>=3.8.1",
    "python-dateutil>=2.8.2",
    "regex>=2023.0.0",
    "langdetect>=1.0.9"
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/python_scripts"]

[tool.uv]
dev-dependencies = []
`;
  
  fs.writeFileSync(pyprojectPath, pyprojectContent);
  console.log('📝 Updated pyproject.toml for UV distribution');

  // Sync dependencies
  console.log('📦 Syncing dependencies with UV...');
  await runCommand(uvPath, ['sync']);
}

async function createUvSetupScript(appPath) {
  const setupScriptPath = path.join(appPath, 'resources', 'setup-python-uv.js');
  const setupScript = `#!/usr/bin/env node
/**
 * UV-based Python setup script
 * This script ensures uv is installed and sets up the Python environment
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function setupUvEnvironment() {
  console.log('🐍 Setting up UV-based Python environment...');
  
  try {
    // Check if uv is available
    const uvPath = await findUv();
    if (!uvPath) {
      console.log('📦 Installing uv...');
      await installUv();
    }
    
    // Setup project environment
    const projectPath = __dirname;
    await runCommand(uvPath || 'uv', ['sync', '--project', projectPath]);
    
    console.log('✅ UV Python environment ready!');
  } catch (error) {
    console.error('❌ Failed to setup UV environment:', error.message);
    throw error;
  }
}

async function findUv() {
  try {
    await runCommand('uv', ['--version']);
    return 'uv';
  } catch {
    return null;
  }
}

async function installUv() {
  const platform = process.platform;
  
  if (platform === 'win32') {
    await runCommand('powershell', ['-ExecutionPolicy', 'ByPass', '-c', 'irm https://astral.sh/uv/install.ps1 | iex']);
  } else {
    await runCommand('curl', ['-LsSf', 'https://astral.sh/uv/install.sh'], { shell: true });
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['pipe', 'inherit', 'inherit'],
      ...options
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(\`Command failed with exit code \${code}\`));
      }
    });

    proc.on('error', reject);
  });
}

if (require.main === module) {
  setupUvEnvironment().catch(console.error);
}

module.exports = { setupUvEnvironment };
`;

  fs.writeFileSync(setupScriptPath, setupScript);
  console.log('📝 Created UV setup script');
}

async function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function findUV() {
  // Check if UV is in PATH
  try {
    await runCommand('uv', ['--version']);
    return 'uv';
  } catch (error) {
    // Try common installation paths
    const commonPaths = [
      path.join(process.env.HOME || '', '.cargo', 'bin', 'uv'),
      path.join(process.env.USERPROFILE || '', '.cargo', 'bin', 'uv.exe'),
      '/usr/local/bin/uv',
      'C:\\Users\\Public\\uv\\uv.exe'
    ];
    
    for (const uvPath of commonPaths) {
      if (fs.existsSync(uvPath)) {
        try {
          await runCommand(uvPath, ['--version']);
          return uvPath;
        } catch (e) {
          continue;
        }
      }
    }
    
    return null;
  }
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      stdio: ['pipe', 'inherit', 'inherit'],
      ...options
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

// Run if called directly
if (require.main === module) {
  buildPythonServer().catch(console.error);
}

module.exports = { buildPythonServer }; 