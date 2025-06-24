#!/usr/bin/env node

/**
 * Comprehensive build cleanup script for MetaKeyAI
 * Removes all build artifacts, caches, and legacy files to ensure clean builds
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧹 Starting comprehensive build cleanup...');

const directoriesToRemove = [
  // Build outputs
  'out',
  'dist', 
  'build',
  
  // Webpack cache
  '.webpack',
  
  // Legacy Python environments (now using UV)
  'python-env',
  '.venv',
  
  // Node modules (will be reinstalled)
  'node_modules',
  
  // Electron cache
  path.join(require('os').homedir(), '.cache', 'electron'),
  path.join(require('os').homedir(), '.cache', 'electron-builder'),
  
  // Legacy binary paths (now handled in-app)
  path.join('resources', 'binaries'),
  
  // Log files
  'logs'
];

const filesToRemove = [
  // Lock files (will be regenerated)
  'package-lock.json',
  
  // Legacy temp files
  'tmp.py',
  
  // UV lock (will be regenerated)
  'uv.lock'
];

// Remove directories
for (const dir of directoriesToRemove) {
  const fullPath = path.resolve(dir);
  if (fs.existsSync(fullPath)) {
    console.log(`🗑️  Removing directory: ${dir}`);
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`✅ Removed: ${dir}`);
    } catch (error) {
      console.warn(`⚠️ Could not remove ${dir}:`, error.message);
    }
  } else {
    console.log(`ℹ️  Directory not found (already clean): ${dir}`);
  }
}

// Remove files
for (const file of filesToRemove) {
  const fullPath = path.resolve(file);
  if (fs.existsSync(fullPath)) {
    console.log(`🗑️  Removing file: ${file}`);
    try {
      fs.unlinkSync(fullPath);
      console.log(`✅ Removed: ${file}`);
    } catch (error) {
      console.warn(`⚠️ Could not remove ${file}:`, error.message);
    }
  } else {
    console.log(`ℹ️  File not found (already clean): ${file}`);
  }
}

// Clean npm cache
console.log('🧹 Cleaning npm cache...');
try {
  execSync('npm cache clean --force', { stdio: 'inherit' });
  console.log('✅ NPM cache cleaned');
} catch (error) {
  console.warn('⚠️ Could not clean npm cache:', error.message);
}

// Platform-specific cleanup
if (process.platform === 'win32') {
  console.log('🪟 Windows-specific cleanup...');
  
  // Remove Windows Electron cache
  const winElectronCache = path.join(require('os').homedir(), 'AppData', 'Local', 'electron');
  if (fs.existsSync(winElectronCache)) {
    try {
      fs.rmSync(winElectronCache, { recursive: true, force: true });
      console.log('✅ Windows Electron cache removed');
    } catch (error) {
      console.warn('⚠️ Could not remove Windows Electron cache:', error.message);
    }
  }
  
  // Remove Windows temp build files
  const winTempPath = path.join(require('os').tmpdir(), 'electron-*');
  console.log(`ℹ️  Manual cleanup needed for: ${winTempPath}`);
}

console.log('\n✨ Build cleanup complete!');
console.log('\n📝 Next steps:');
console.log('   1. npm install              - Reinstall dependencies');
console.log('   2. npm run setup:audio      - Setup audio binaries');
console.log('   3. npm start                - Test the application');
console.log('   4. npm run make             - Create distribution'); 