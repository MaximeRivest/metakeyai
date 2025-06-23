#!/usr/bin/env node

/*
 * Verify that all necessary Windows binaries are bundled for distribution
 */

const fs = require('fs');
const path = require('path');

function checkFile(filePath, description) {
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    console.log(`✅ ${description}: ${filePath} (${Math.round(stats.size / 1024)}KB)`);
    return true;
  } else {
    console.log(`❌ ${description}: ${filePath} - NOT FOUND`);
    return false;
  }
}

function verifyWindowsBuild() {
  console.log('🔍 Verifying Windows build components...\n');
  
  const resourcesDir = path.join(process.cwd(), 'resources', 'binaries', 'windows');
  let allGood = true;
  
  // Check required binaries
  const requiredFiles = [
    { path: path.join(resourcesDir, 'python', 'python.exe'), desc: 'Embedded Python', required: true },
    { path: path.join(resourcesDir, 'sox.exe'), desc: 'Sox Audio Processor', required: true }
  ];
  
  // Check optional binaries
  const optionalFiles = [
    { path: path.join(resourcesDir, 'uv.exe'), desc: 'UV Package Manager', required: false }
  ];
  
  requiredFiles.forEach(file => {
    if (!checkFile(file.path, file.desc)) {
      allGood = false;
    }
  });
  
  optionalFiles.forEach(file => {
    if (!checkFile(file.path, file.desc)) {
      console.log(`⚠️ Optional: ${file.desc} not bundled - app will download at runtime`);
    }
  });
  
  // Check Python environment structure
  const pythonDir = path.join(resourcesDir, 'python');
  if (fs.existsSync(pythonDir)) {
    const pythonFiles = fs.readdirSync(pythonDir);
    console.log(`\n📁 Python directory contains ${pythonFiles.length} files`);
    
    // Check for key Python files
    const keyFiles = ['python.exe', 'python311.dll', 'python311.zip'];
    keyFiles.forEach(file => {
      const filePath = path.join(pythonDir, file);
      checkFile(filePath, `Python ${file}`);
    });
  }
  
  console.log('\n' + '='.repeat(50));
  if (allGood) {
    console.log('🎉 Windows build verification PASSED!');
    console.log('📦 All required binaries are bundled and ready for distribution.');
  } else {
    console.log('⚠️ Windows build verification FAILED!');
    console.log('🔧 Some required binaries are missing. Run the build scripts first.');
    process.exit(1);
  }
}

if (require.main === module) {
  verifyWindowsBuild();
}

module.exports = { verifyWindowsBuild }; 