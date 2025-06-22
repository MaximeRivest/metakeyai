#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

async function buildPythonServer() {
  console.log('🐍 Building Python server executable with PyInstaller...');

  const appPath = process.cwd();
  const pythonEnvPath = path.join(appPath, 'python-env');
  const pyinstallerPath = path.join(pythonEnvPath, 'bin', 'pyinstaller');
  const scriptPath = path.join(appPath, 'src', 'python_scripts', 'metakeyai_daemon.py');
  const outputDir = path.join(appPath, 'resources', 'python');
  const executableName = 'metakeyai-server';
  
  // Ensure PyInstaller is available
  if (!fs.existsSync(pyinstallerPath)) {
    console.error('❌ PyInstaller not found in the virtual environment.');
    console.error('Please run "npm run setup:python" first.');
    process.exit(1);
  }

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // PyInstaller arguments
  const args = [
    '--name', executableName,
    '--onefile',
    '--noconsole',
    '--distpath', outputDir,
    '--workpath', path.join(appPath, 'build-py-work'),
    '--specpath', path.join(appPath, 'build-py-spec'),
    '--add-data', `${path.join(appPath, 'src/python_scripts/spells')}:spells`,
    scriptPath
  ];

  console.log(`🔧 Running PyInstaller: ${pyinstallerPath} ${args.join(' ')}`);

  try {
    await runCommand(pyinstallerPath, args);
    console.log('✅ Python server executable built successfully!');
    console.log(`   -> ${path.join(outputDir, executableName)}`);
  } catch (error) {
    console.error('❌ Failed to build Python server:', error.message);
    process.exit(1);
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