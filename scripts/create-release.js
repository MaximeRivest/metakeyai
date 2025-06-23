#!/usr/bin/env node

/**
 * Release Creation Script
 * 
 * Creates a new release tag and pushes it to trigger the GitHub Actions workflow.
 * Usage:
 *   node scripts/create-release.js [version]
 *   
 * Examples:
 *   node scripts/create-release.js 1.0.0
 *   node scripts/create-release.js 1.2.3-beta
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function runCommand(command, description) {
  console.log(`🔄 ${description}...`);
  try {
    const result = execSync(command, { stdio: 'inherit' });
    console.log(`✅ ${description} completed`);
    return result;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    process.exit(1);
  }
}

function updatePackageVersion(version) {
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  
  packageJson.version = version;
  fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
  
  console.log(`📝 Updated package.json version to ${version}`);
}

function getCurrentVersion() {
  const packagePath = path.join(process.cwd(), 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return packageJson.version;
}

function validateVersion(version) {
  const versionRegex = /^\d+\.\d+\.\d+(-[\w\d\-.]+)?$/;
  if (!versionRegex.test(version)) {
    console.error('❌ Invalid version format. Use semantic versioning (e.g., 1.0.0, 1.2.3-beta)');
    process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  let version = args[0];
  
  if (!version) {
    const currentVersion = getCurrentVersion();
    console.log(`Current version: ${currentVersion}`);
    console.log('Usage: node scripts/create-release.js [version]');
    console.log('Examples:');
    console.log('  node scripts/create-release.js 1.0.0');
    console.log('  node scripts/create-release.js 1.2.3-beta');
    process.exit(1);
  }
  
  // Remove 'v' prefix if provided
  if (version.startsWith('v')) {
    version = version.slice(1);
  }
  
  validateVersion(version);
  
  const tagName = `v${version}`;
  
  console.log(`🚀 Creating release ${tagName}...`);
  
  // Check if we're in a git repository
  try {
    execSync('git status', { stdio: 'ignore' });
  } catch (error) {
    console.error('❌ Not in a git repository');
    process.exit(1);
  }
  
  // Check for uncommitted changes
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' });
    if (status.trim()) {
      console.warn('⚠️ You have uncommitted changes:');
      console.log(status);
      console.log('Commit your changes before creating a release.');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Failed to check git status');
    process.exit(1);
  }
  
  // Update package.json version
  updatePackageVersion(version);
  
  // Commit version change
  runCommand('git add package.json', 'Staging package.json');
  runCommand(`git commit -m "Release ${tagName}"`, `Committing version ${version}`);
  
  // Create and push tag
  runCommand(`git tag -a ${tagName} -m "Release ${tagName}"`, `Creating tag ${tagName}`);
  runCommand('git push origin master', 'Pushing commits');
  runCommand(`git push origin ${tagName}`, `Pushing tag ${tagName}`);
  
  console.log('');
  console.log('🎉 Release created successfully!');
  console.log('');
  console.log(`📋 Release ${tagName} details:`);
  console.log(`   - Version: ${version}`);
  console.log(`   - Tag: ${tagName}`);
  console.log(`   - GitHub Actions will now build and create the release`);
  console.log('');
  console.log('🔗 Links:');
  console.log(`   - Actions: https://github.com/maximerivest/metakeyai/actions`);
  console.log(`   - Releases: https://github.com/maximerivest/metakeyai/releases`);
  console.log('');
  console.log('⏱️ The build typically takes 5-10 minutes to complete.');
}

if (require.main === module) {
  main();
} 