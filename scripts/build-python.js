#!/usr/bin/env node

/*
 * DEPRECATED: This script is no longer used.
 * 
 * MetaKeyAI now handles Python environment setup automatically
 * during runtime using UV. The Python environment is created
 * on-demand during first-run setup.
 * 
 * For manual Python setup, use: npm run setup:python
 * For fresh builds, use: npm run clean
 */

console.log('⚠️  DEPRECATED: Build-time Python setup is no longer needed');
console.log('🚀 MetaKeyAI now sets up Python automatically during first-run');
console.log('🔧 Run "npm run setup:python" if you need to setup Python manually');
console.log('🧹 Run "npm run clean" for a fresh build');

process.exit(0); 