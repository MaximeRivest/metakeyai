# 🔍 Code Usage Analyzer

An automated tool to analyze TypeScript/JavaScript files and identify unused methods, functions, and classes. Perfect for cleaning up dead code and maintaining a healthy codebase!

## ✨ Features

- **Class Analysis**: Analyze all methods within a specific class
- **Function Analysis**: Analyze standalone functions and exports
- **Smart Categorization**: 
  - ✅ **Used**: Methods/functions used across the codebase
  - 🟡 **Internal Only**: Used only within the same file
  - ❌ **Unused**: Not used anywhere (safe to remove)
  - 🔒 **Private**: Private methods (not externally accessible)
- **Detailed Reports**: Generate comprehensive reports with usage locations
- **False Positive Prevention**: Filters out keywords and invalid identifiers

## 🚀 Quick Start

### Option 1: Simple Wrapper (Recommended)

```bash
# Analyze a class
./scripts/analyze.sh src/user-data-manager.ts UserDataManager

# Analyze all functions in a file
./scripts/analyze.sh src/utils.ts

# Save results to a file
./scripts/analyze.sh src/my-class.ts MyClass analysis.txt
```

### Option 2: Direct Node.js Usage

```bash
# Analyze a specific class
node scripts/analyze-unused-code.js -f src/user-data-manager.ts -c UserDataManager

# Analyze all code elements in a file
node scripts/analyze-unused-code.js -f src/utils.ts

# With verbose output and save to file
node scripts/analyze-unused-code.js -f src/my-class.ts -c MyClass -o report.txt --verbose
```

## 📋 Command Line Options

| Option | Short | Description | Example |
|--------|-------|-------------|---------|
| `--file` | `-f` | Target file to analyze (required) | `-f src/manager.ts` |
| `--class` | `-c` | Specific class name to analyze | `-c UserDataManager` |
| `--output` | `-o` | Output file for the report | `-o analysis.txt` |
| `--verbose` | `-v` | Show detailed progress | `--verbose` |
| `--include-private` | | Include private methods in analysis | `--include-private` |
| `--help` | `-h` | Show help message | `--help` |

## 📊 Sample Output

```
🔍 Analyzing: src/user-data-manager.ts
📋 Class: UserDataManager
==================================================
Found 29 code elements to analyze...

UserDataManager Code Usage Analysis
====================================
Generated: 2025-06-24, 8:33:32 a.m.
Target: src/user-data-manager.ts
Class: UserDataManager

SUMMARY:
========
Total Elements: 29
✅ Used: 22
🟡 Internal Only: 5
❌ Unused: 1

ACTIVELY USED:
=============
✅ getInstance (method)
   Used in: python-setup-manager.ts, python-daemon-api.ts, index.ts...

✅ saveSpellBook (method)
   Used in: python-spells.ts

INTERNAL ONLY:
=============
🟡 getSpellBookPath (method)
   Only used within the same file

🟡 getAudioSettingsPath (method)
   Only used within the same file

UNUSED - CANDIDATES FOR REMOVAL:
================================
❌ getPythonProjectDir (method)
   Not used anywhere in the codebase
   ⚠️  SAFE TO REMOVE

⚠️  Found 1 unused elements that can be removed.
```

## 🎯 Use Cases

### 1. **Class Cleanup**
Find unused methods in large classes:
```bash
./scripts/analyze.sh src/user-data-manager.ts UserDataManager
```

### 2. **Utility Function Audit**
Check which utility functions are actually used:
```bash
./scripts/analyze.sh src/utils.ts
```

### 3. **Pre-Refactor Analysis**
Before major refactoring, identify safe-to-remove code:
```bash
./scripts/analyze.sh src/legacy-module.ts LegacyClass cleanup-report.txt
```

### 4. **Code Review Preparation**
Generate reports for code review discussions:
```bash
# Analyze multiple files
./scripts/analyze.sh src/api-client.ts ApiClient api-analysis.txt
./scripts/analyze.sh src/data-manager.ts DataManager data-analysis.txt
```

## 🔧 How It Works

1. **Code Extraction**: Parses TypeScript/JavaScript files to extract method and function definitions
2. **Usage Search**: Uses `grep` to search for usage patterns across the entire `src/` directory
3. **Smart Categorization**: Analyzes usage patterns to categorize code elements:
   - External usage = **Used**
   - Internal-only usage = **Internal Only**
   - No usage = **Unused**
4. **Report Generation**: Creates formatted reports with actionable insights

## 📁 File Structure

```
scripts/
├── analyze-unused-code.js    # Main analyzer script
├── analyze.sh               # Simple wrapper script
└── CODE_ANALYZER_README.md  # This documentation
```

## ⚠️ Important Notes

- **Backup First**: Always backup your code before removing unused methods
- **Manual Verification**: The tool is very accurate but manual verification is recommended
- **Dynamic Usage**: May miss dynamically called methods (string-based calls)
- **Type-Only Imports**: TypeScript type-only imports might not be detected

## 🔮 Advanced Usage

### Include Private Methods
```bash
node scripts/analyze-unused-code.js -f src/class.ts -c MyClass --include-private
```

### Custom Search Patterns
The tool can be extended to support different programming languages or patterns by modifying the `methodPatterns` array in `analyze-unused-code.js`.

## 🐛 Troubleshooting

**Q: The tool says "Class not found"**
A: Make sure the class name matches exactly (case-sensitive) and the class exists in the file.

**Q: False positives in results**
A: The tool filters common keywords, but edge cases may occur. Manual verification is recommended.

**Q: Missing some usage**
A: The tool searches in `src/` directory. If code is used outside this directory, it won't be detected.

## 🚀 Future Enhancements

- Support for more programming languages
- Integration with popular bundlers
- VS Code extension
- CI/CD integration for automated dead code detection

---

**Created for maintaining clean, efficient codebases! 🧹✨** 