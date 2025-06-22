#!/usr/bin/env node
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
        reject(new Error(`Command failed with exit code ${code}`));
      }
    });

    proc.on('error', reject);
  });
}

if (require.main === module) {
  setupUvEnvironment().catch(console.error);
}

module.exports = { setupUvEnvironment };
