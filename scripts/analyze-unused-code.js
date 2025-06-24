#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Automated Code Usage Analyzer
 * 
 * Analyzes any TypeScript/JavaScript file to find unused methods, functions, or classes
 * Usage: node scripts/analyze-unused-code.js [options]
 */

class CodeUsageAnalyzer {
  constructor(options = {}) {
    this.options = {
      targetFile: null,
      className: null,
      searchDirs: ['src/**/*.ts', 'src/**/*.js'],
      excludeDirs: ['node_modules', 'dist', 'build'],
      outputFile: null,
      verbose: false,
      includePrivate: false,
      includeInternal: true,
      contextLines: 3,
      showUsageContext: true,
      shortReport: false,
      ...options
    };
    
    this.results = {
      used: [],
      internal: [],
      unused: [],
      private: [],
      total: 0
    };
  }

  /**
   * Extract all methods, functions, or exports from a file
   */
  extractCodeElements(filePath, className = null) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const elements = [];

    if (className) {
      // Find class boundaries
      let inClass = false;
      let braceCount = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check if we're entering the target class
        if (line.includes(`class ${className}`) && !inClass) {
          inClass = true;
          braceCount = 0;
        }
        
        if (inClass) {
          // Count braces to track when we exit the class
          braceCount += (line.match(/\{/g) || []).length;
          braceCount -= (line.match(/\}/g) || []).length;
          
          // Extract methods from this line
          const methodPatterns = [
            /(?:public|private|protected)\s+static\s+(\w+)\s*\(/,
            /(?:public|private|protected)\s+(\w+)\s*\(/,
            /public\s+(\w+)\s*\([^)]*\)\s*:/,
            /private\s+(\w+)\s*\([^)]*\)\s*:/
          ];

          methodPatterns.forEach(pattern => {
            const match = line.match(pattern);
            if (match) {
              const methodName = match[1];
              // Filter out common keywords and ensure it looks like a method name
              const invalidNames = ['if', 'catch', 'try', 'for', 'while', 'switch', 'return', 'throw', 'const', 'let', 'var'];
              if (methodName && 
                  methodName !== 'constructor' && 
                  !invalidNames.includes(methodName) &&
                  /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(methodName) &&
                  !elements.find(e => e.name === methodName)) {
                const isPrivate = line.includes('private');
                const isStatic = line.includes('static');
                elements.push({
                  name: methodName,
                  type: 'method',
                  isPrivate,
                  isStatic,
                  className,
                  signature: line.trim()
                });
              }
            }
          });
          
          // Exit class when braces balance out
          if (braceCount === 0 && line.includes('}')) {
            break;
          }
        }
      }
    } else {
      // Extract standalone functions and exports
      const patterns = [
        /export\s+(?:async\s+)?function\s+(\w+)/g,
        /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
        /export\s+const\s+(\w+)\s*=/g,
        /const\s+(\w+)\s*=\s*(?:async\s+)?\(/g,
        /(?:export\s+)?class\s+(\w+)/g
      ];

      patterns.forEach(pattern => {
        let match;
        while ((match = pattern.exec(content)) !== null) {
          const name = match[1];
          if (name && !elements.find(e => e.name === name)) {
            elements.push({
              name,
              type: match[0].includes('class') ? 'class' : 'function',
              isExported: match[0].includes('export'),
              signature: match[0]
            });
          }
        }
      });
    }

    return elements;
  }

  /**
   * Search for usage of a code element across the codebase
   */
  searchUsage(elementName, elementType, className = null) {
    const searchPatterns = [];
    
    if (elementType === 'method' && className) {
      // Class method patterns
      searchPatterns.push(
        `\\.${elementName}\\(`,  // .methodName(
        `${className}\\.${elementName}\\(`, // ClassName.methodName(
        `this\\.${elementName}\\(` // this.methodName(
      );
    } else if (elementType === 'function' || elementType === 'class') {
      // Function/class patterns
      searchPatterns.push(
        `\\b${elementName}\\(`,  // functionName(
        `\\b${elementName}\\b`,  // functionName as identifier
        `from.*${elementName}`,  // import statements
        `import.*${elementName}` // import statements
      );
    }

    const usageResults = [];
    
    for (const pattern of searchPatterns) {
      try {
        // Search with context lines for detailed usage information
        const contextFlag = this.options.showUsageContext ? `-A ${this.options.contextLines} -B ${this.options.contextLines}` : '';
        const allFilesCommand = `grep -rn ${contextFlag} --include="*.ts" --include="*.js" -E "${pattern}" src/ | head -50`;
        const allOutput = execSync(allFilesCommand, { encoding: 'utf8', stdio: 'pipe' }).trim();
        
        // Process all matches (including internal)
        if (allOutput) {
          if (this.options.showUsageContext) {
            // Parse grep output with context
            const chunks = allOutput.split(/^--$/m);
            
            chunks.forEach(chunk => {
              const lines = chunk.trim().split('\n');
              if (lines.length === 0) return;
              
              let mainMatch = null;
              let contextLines = [];
              
              lines.forEach(line => {
                if (!line.trim()) return;
                
                // Parse grep output: file:line:content or file-line-content
                let match;
                let file, lineNum, content, isMainMatch;
                
                if (match = line.match(/^([^:]+):(\d+):(.*)$/)) {
                  // Main match line (with :)
                  [, file, lineNum, content] = match;
                  isMainMatch = content.trim().match(new RegExp(pattern));
                } else if (match = line.match(/^(.+)-(\d+)-(.*)$/)) {
                  // Context line (with -)
                  [, file, lineNum, content] = match;
                  isMainMatch = false;
                } else {
                  return; // Skip malformed lines
                }
                
                if (isMainMatch) {
                  mainMatch = {
                    file: file.replace('src/', ''),
                    line: parseInt(lineNum),
                    content: content.trim(),
                    pattern,
                    isInternal: file.includes(path.basename(this.options.targetFile)),
                    contextLines: []
                  };
                } else {
                  // Context line
                  contextLines.push({
                    file: file.replace('src/', ''),
                    line: parseInt(lineNum),
                    content: content,
                    isContext: true
                  });
                }
              });
              
              if (mainMatch) {
                mainMatch.contextLines = contextLines;
                usageResults.push(mainMatch);
              }
            });
          } else {
            // Simple parsing without context
            const allLines = allOutput.split('\n');
            allLines.forEach(line => {
              const [file, lineNum, ...contentParts] = line.split(':');
              if (file && lineNum && contentParts.length > 0) {
                const content = contentParts.join(':');
                if (content.trim().match(new RegExp(pattern))) {
                  usageResults.push({
                    file: file.replace('src/', ''),
                    line: parseInt(lineNum),
                    content: content.trim(),
                    pattern,
                    isInternal: file.includes(path.basename(this.options.targetFile)),
                    contextLines: []
                  });
                }
              }
            });
          }
        }
      } catch (error) {
        // No matches found (grep returns non-zero exit code)
      }
    }

    return usageResults;
  }

  /**
   * Categorize usage results
   */
  categorizeUsage(element, usageResults) {
    const targetFileName = path.basename(this.options.targetFile);
    
    // Check if only used internally (same file) or externally
    const externalUsage = usageResults.filter(result => 
      !result.isInternal && !result.file.includes(targetFileName)
    );
    
    const internalUsage = usageResults.filter(result => 
      result.isInternal || result.file.includes(targetFileName)
    );

    if (element.isPrivate) {
      return 'private';
    } else if (externalUsage.length > 0) {
      return 'used';
    } else if (internalUsage.length > 1) { // More than 1 because the method definition itself is one match
      return 'internal';
    } else {
      return 'unused';
    }
  }

  /**
   * Analyze a file for unused code
   */
  analyze() {
    console.log(`\n🔍 Analyzing: ${this.options.targetFile}`);
    if (this.options.className) {
      console.log(`📋 Class: ${this.options.className}`);
    }
    console.log(''.padEnd(50, '='));

    // Extract code elements
    const elements = this.extractCodeElements(this.options.targetFile, this.options.className);
    this.results.total = elements.length;

    console.log(`Found ${elements.length} code elements to analyze...\n`);

    // Analyze each element
    elements.forEach((element, index) => {
      if (this.options.verbose) {
        process.stdout.write(`\r[${index + 1}/${elements.length}] Analyzing: ${element.name}`);
      }

      const usageResults = this.searchUsage(element.name, element.type, element.className);
      const category = this.categorizeUsage(element, usageResults);
      
      const result = {
        ...element,
        usage: usageResults,
        category
      };

      this.results[category].push(result);
    });

    if (this.options.verbose) {
      console.log('\n');
    }

    return this.results;
  }

  /**
   * Generate a formatted report
   */
  generateReport() {
    const report = [];
    const targetName = this.options.className || path.basename(this.options.targetFile);
    
    report.push(`${targetName} Code Usage Analysis`);
    report.push('='.repeat(targetName.length + 21));
    report.push(`Generated: ${new Date().toLocaleString()}`);
    report.push(`Target: ${this.options.targetFile}`);
    if (this.options.className) {
      report.push(`Class: ${this.options.className}`);
    }
    report.push('');

    // Summary
    report.push('SUMMARY:');
    report.push('========');
    report.push(`Total Elements: ${this.results.total}`);
    report.push(`✅ Used: ${this.results.used.length}`);
    report.push(`🟡 Internal Only: ${this.results.internal.length}`);
    report.push(`❌ Unused: ${this.results.unused.length}`);
    if (this.options.includePrivate) {
      report.push(`🔒 Private: ${this.results.private.length}`);
    }
    report.push('');

    // Used elements
    if (this.results.used.length > 0) {
      report.push('ACTIVELY USED:');
      report.push('=============');
      this.results.used.forEach(element => {
        report.push(`✅ ${element.name} (${element.type})`);
        if (element.usage.length > 0) {
          const uniqueFiles = [...new Set(element.usage.map(u => u.file))];
          report.push(`   Used in: ${uniqueFiles.slice(0, 3).join(', ')}${uniqueFiles.length > 3 ? '...' : ''}`);
          
          if (this.options.showUsageContext && !this.options.shortReport) {
            report.push('   Usage examples:');
            element.usage.slice(0, 3).forEach((usage, index) => {
              report.push(`   📍 ${usage.file}:${usage.line}`);
              if (usage.contextLines && usage.contextLines.length > 0) {
                const beforeContext = usage.contextLines.filter(c => c.line < usage.line);
                const afterContext = usage.contextLines.filter(c => c.line > usage.line);
                
                beforeContext.sort((a, b) => a.line - b.line).forEach(ctx => {
                  report.push(`      ${ctx.line}│ ${ctx.content}`);
                });
                report.push(`   ➤  ${usage.line}│ ${usage.content}`);
                afterContext.sort((a, b) => a.line - b.line).forEach(ctx => {
                  report.push(`      ${ctx.line}│ ${ctx.content}`);
                });
              } else {
                report.push(`   ➤  ${usage.line}│ ${usage.content}`);
              }
              if (index < Math.min(element.usage.length, 3) - 1) {
                report.push('');
              }
            });
          }
        }
        report.push('');
      });
    }

    // Internal only elements
    if (this.results.internal.length > 0) {
      report.push('INTERNAL ONLY:');
      report.push('=============');
      this.results.internal.forEach(element => {
        report.push(`🟡 ${element.name} (${element.type})`);
        report.push(`   Only used within the same file`);
        
        if (this.options.showUsageContext && !this.options.shortReport && element.usage.length > 0) {
          report.push('   Internal usage:');
          element.usage.slice(0, 2).forEach((usage, index) => {
            report.push(`   📍 ${usage.file}:${usage.line}`);
            if (usage.contextLines && usage.contextLines.length > 0) {
              const beforeContext = usage.contextLines.filter(c => c.line < usage.line);
              const afterContext = usage.contextLines.filter(c => c.line > usage.line);
              
              beforeContext.sort((a, b) => a.line - b.line).forEach(ctx => {
                report.push(`      ${ctx.line}│ ${ctx.content}`);
              });
              report.push(`   ➤  ${usage.line}│ ${usage.content}`);
              afterContext.sort((a, b) => a.line - b.line).forEach(ctx => {
                report.push(`      ${ctx.line}│ ${ctx.content}`);
              });
            } else {
              report.push(`   ➤  ${usage.line}│ ${usage.content}`);
            }
            if (index < Math.min(element.usage.length, 2) - 1) {
              report.push('');
            }
          });
        }
        report.push('');
      });
    }

    // Unused elements
    if (this.results.unused.length > 0) {
      report.push('UNUSED - CANDIDATES FOR REMOVAL:');
      report.push('================================');
      this.results.unused.forEach(element => {
        report.push(`❌ ${element.name} (${element.type})`);
        report.push(`   Not used anywhere in the codebase`);
        report.push(`   ⚠️  SAFE TO REMOVE`);
        report.push('');
      });
    }

    // Private elements
    if (this.options.includePrivate && this.results.private.length > 0) {
      report.push('PRIVATE ELEMENTS:');
      report.push('================');
      this.results.private.forEach(element => {
        report.push(`🔒 ${element.name} (${element.type})`);
        report.push(`   Private - not externally accessible`);
        report.push('');
      });
    }

    return report.join('\n');
  }

  /**
   * Save report to file
   */
  saveReport(report) {
    if (this.options.outputFile) {
      fs.writeFileSync(this.options.outputFile, report);
      console.log(`📄 Report saved to: ${this.options.outputFile}`);
    }
  }
}

/**
 * CLI Interface
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '-f':
      case '--file':
        options.targetFile = args[++i];
        break;
      case '-c':
      case '--class':
        options.className = args[++i];
        break;
      case '-o':
      case '--output':
        options.outputFile = args[++i];
        break;
      case '-v':
      case '--verbose':
        options.verbose = true;
        break;
      case '--include-private':
        options.includePrivate = true;
        break;
      case '--short':
      case '--no-context':
        options.shortReport = true;
        options.showUsageContext = false;
        break;
      case '--context-lines':
        options.contextLines = parseInt(args[++i]) || 3;
        break;
      case '-h':
      case '--help':
        showHelp();
        process.exit(0);
        break;
    }
  }

  return options;
}

function showHelp() {
  console.log(`
🔍 Code Usage Analyzer

Automatically analyzes TypeScript/JavaScript files to find unused methods, functions, or classes.
By default, shows detailed usage context with surrounding code lines.

Usage:
  node scripts/analyze-unused-code.js [options]

Options:
  -f, --file <file>           Target file to analyze (required)
  -c, --class <className>     Specific class to analyze within the file
  -o, --output <file>         Output file for the report
  -v, --verbose               Show detailed progress
  --include-private           Include private methods in analysis
  --short, --no-context       Generate short report without usage context
  --context-lines <num>       Number of context lines to show (default: 3)
  -h, --help                  Show this help message

Examples:
  # Analyze a class with full context (default)
  node scripts/analyze-unused-code.js -f src/user-data-manager.ts -c UserDataManager

  # Generate short report without usage context
  node scripts/analyze-unused-code.js -f src/utils.ts --short

  # Custom context lines and save to file
  node scripts/analyze-unused-code.js -f src/my-class.ts -c MyClass --context-lines 5 -o report.txt

  # Verbose analysis with private methods
  node scripts/analyze-unused-code.js -f src/my-class.ts -c MyClass --include-private --verbose
`);
}

// Main execution
if (require.main === module) {
  const options = parseArgs();

  if (!options.targetFile) {
    console.error('❌ Error: Target file is required. Use -h for help.');
    process.exit(1);
  }

  if (!fs.existsSync(options.targetFile)) {
    console.error(`❌ Error: File not found: ${options.targetFile}`);
    process.exit(1);
  }

  try {
    const analyzer = new CodeUsageAnalyzer(options);
    const results = analyzer.analyze();
    const report = analyzer.generateReport();
    
    console.log('\n' + report);
    analyzer.saveReport(report);

    // Exit with appropriate code
    if (results.unused.length > 0) {
      console.log(`\n⚠️  Found ${results.unused.length} unused elements that can be removed.`);
      process.exit(0);
    } else {
      console.log('\n✅ No unused code found!');
      process.exit(0);
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = CodeUsageAnalyzer; 