#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// Setup Python environment for MetaKeyAI
async function setupPythonEnvironment() {
  console.log('🐍 Setting up Python environment for MetaKeyAI...');
  
  const appPath = process.cwd();
  const venvPath = path.join(appPath, 'python-env');
  
  // Check if virtual environment already exists
  if (fs.existsSync(venvPath)) {
    console.log('✅ Python environment already exists');
    return;
  }

  try {
    // Check if UV is available
    const uvPath = await findUV();
    if (uvPath) {
      console.log('🚀 Using UV to create Python environment...');
      await runCommand(uvPath, ['venv', venvPath]);
      console.log('✅ Python environment setup complete with UV!');
      return;
    }
  } catch (error) {
    console.log('⚠️ UV not available, falling back to traditional venv...');
  }

  // Fallback to traditional Python venv
  console.log('🔧 Creating Python virtual environment...');
  await runCommand('python', ['-m', 'venv', venvPath]);
  
  console.log('✅ Python environment setup complete!');
}

async function findUV() {
  const possiblePaths = [
    'uv',
    '/usr/local/bin/uv',
    '/usr/bin/uv',
    path.join(process.env.HOME || '', '.local/bin/uv'),
    path.join(process.env.HOME || '', '.cargo/bin/uv'),
  ];
  
  for (const uvPath of possiblePaths) {
    try {
      await runCommand(uvPath, ['--version'], { stdio: 'ignore' });
      return uvPath;
    } catch (error) {
      // Continue trying
    }
  }
  
  return null;
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

// Run setup if called directly
if (require.main === module) {
  setupPythonEnvironment().catch(console.error);
}

module.exports = { setupPythonEnvironment }; 