import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { tmpdir } from 'os';
import { EventEmitter } from 'events';
import { PythonEnvironmentManager, PythonEnvInfo } from './python-env-manager';

export interface PythonRunOptions {
  script?: string;           // Python code as string
  scriptFile?: string;       // Path to Python file
  args?: string[];          // Command line arguments
  input?: string;           // Data to send to stdin
  timeout?: number;         // Timeout in milliseconds
  cwd?: string;            // Working directory
  env?: Record<string, string>; // Environment variables
}

export interface PythonResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  success: boolean;
  executionTime: number;
}

export class PythonRunner extends EventEmitter {
  private pythonPath: string;
  private scriptsDir: string;
  private envManager: PythonEnvironmentManager | null = null; // Lazy initialization
  private envInfo: PythonEnvInfo | null = null;

  constructor(pythonPath?: string) {
    super();
    // Don't initialize envManager here - use lazy initialization
    this.pythonPath = pythonPath || this.findPython();
    this.scriptsDir = path.join(__dirname, 'python_scripts');
    this.ensureScriptsDirectory();
  }

  private getEnvManager(): PythonEnvironmentManager {
    if (!this.envManager) {
      this.envManager = new PythonEnvironmentManager();
    }
    return this.envManager;
  }

  // Initialize the Python environment
  async initializeEnvironment(): Promise<PythonEnvInfo> {
    try {
      this.envInfo = await this.getEnvManager().initialize();
      this.pythonPath = this.envInfo.pythonPath;
      console.log(`🐍 Using ${this.envInfo.isEmbedded ? 'embedded' : 'system'} Python: ${this.envInfo.version}`);
      return this.envInfo;
    } catch (error) {
      console.error('❌ Failed to initialize Python environment:', error);
      // Fallback to existing findPython logic
      this.pythonPath = this.findPython();
      throw error;
    }
  }

  private findPython(): string {
    // Try common Python executable names/paths
    const candidates = [
      'python3',
      'python',
      '/usr/bin/python3',
      '/usr/bin/python',
      '/usr/local/bin/python3',
      'C:\\Python39\\python.exe',
      'C:\\Python310\\python.exe',
      'C:\\Python311\\python.exe',
    ];

    for (const candidate of candidates) {
      try {
        // Test if this Python executable works
        const { execSync } = require('child_process');
        execSync(`${candidate} --version`, { stdio: 'ignore' });
        console.log('🐍 Found Python at:', candidate);
        return candidate;
      } catch (error) {
        continue;
      }
    }

    console.warn('⚠️ Python not found, using default "python"');
    return 'python';
  }

  private ensureScriptsDirectory(): void {
    if (!fs.existsSync(this.scriptsDir)) {
      fs.mkdirSync(this.scriptsDir, { recursive: true });
      console.log('📁 Created Python scripts directory:', this.scriptsDir);
    }
  }

  private shouldUseUV(): boolean {
    try {
      // Check if UV is available
      const { execSync } = require('child_process');
      execSync('uv --version', { stdio: 'ignore' });
      
      // Check if we have a UV project directory
      const projectDir = this.getUVProjectDir();
      if (projectDir && fs.existsSync(path.join(projectDir, 'pyproject.toml'))) {
        return true;
      }
      
      return false;
    } catch (error) {
      return false;
    }
  }

  private getUVProjectDir(): string | null {
    const { app } = require('electron');
    
    try {
      // In production, use the user data directory
      const userDataPath = app.getPath('userData');
      const projectDir = path.join(userDataPath, 'python-project');
      
      if (fs.existsSync(projectDir)) {
        return projectDir;
      }
      
      // Fallback to development location
      const devProjectDir = path.join(__dirname, '..', '..', 'resources');
      if (fs.existsSync(path.join(devProjectDir, 'pyproject.toml'))) {
        return devProjectDir;
      }
      
      return null;
    } catch (error) {
      console.warn('⚠️ Could not determine UV project directory:', error);
      return null;
    }
  }

  async run(options: PythonRunOptions): Promise<PythonResult> {
    const startTime = Date.now();
    console.log('🐍 Running Python with options:', {
      hasScript: !!options.script,
      scriptFile: options.scriptFile,
      args: options.args,
      hasInput: !!options.input,
      timeout: options.timeout
    });

    return new Promise((resolve, reject) => {
      let scriptPath: string;
      let tempFile: string | null = null;

      try {
        // Determine script path
        if (options.scriptFile) {
          scriptPath = options.scriptFile;
        } else if (options.script) {
                     // No bootstrap needed - daemon handles DSPy configuration
            tempFile = path.join(tmpdir(), `metakey_script_${Date.now()}.py`);
            fs.writeFileSync(tempFile, options.script);
          scriptPath = tempFile;
        } else {
          throw new Error('Either script or scriptFile must be provided');
        }

        // Prepare command arguments
        const args = [scriptPath, ...(options.args || [])];

        console.log('🔧 Executing Python command:', this.pythonPath, args);

        // Check if we should use UV for execution (for packaged apps with UV environment)
        let command = this.pythonPath;
        let commandArgs = args;
        
        // Try to use UV if available and we have a project directory
        if (this.shouldUseUV()) {
          const projectDir = this.getUVProjectDir();
          if (projectDir) {
            command = 'uv';
            commandArgs = ['run', '--project', projectDir, 'python', ...args];
            console.log('🔧 Using UV environment:', command, commandArgs.slice(0, 4), '...');
          }
        }

        // Spawn Python process
        const pythonProcess = spawn(command, commandArgs, {
          cwd: options.cwd || process.cwd(),
          env: { ...process.env, ...options.env },
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        // Collect output
        pythonProcess.stdout?.on('data', (data) => {
          stdout += data.toString();
        });

        pythonProcess.stderr?.on('data', (data) => {
          stderr += data.toString();
        });

        // Send input if provided
        if (options.input) {
          pythonProcess.stdin?.write(options.input);
          pythonProcess.stdin?.end();
        }

        // Handle timeout
        let timeoutId: NodeJS.Timeout | null = null;
        if (options.timeout) {
          timeoutId = setTimeout(() => {
            pythonProcess.kill('SIGTERM');
            reject(new Error(`Python script timed out after ${options.timeout}ms`));
          }, options.timeout);
        }

        // Handle process completion
        pythonProcess.on('close', (exitCode) => {
          if (timeoutId) clearTimeout(timeoutId);

          // Clean up temporary file
          if (tempFile && fs.existsSync(tempFile)) {
            try {
              fs.unlinkSync(tempFile);
            } catch (err) {
              console.warn('⚠️ Failed to clean up temp file:', tempFile);
            }
          }

          const executionTime = Date.now() - startTime;
          const result: PythonResult = {
            stdout: stdout.trim(),
            stderr: stderr.trim(),
            exitCode: exitCode || 0,
            success: exitCode === 0,
            executionTime
          };

          console.log('✅ Python execution completed:', {
            success: result.success,
            exitCode: result.exitCode,
            executionTime: result.executionTime,
            stdoutLength: result.stdout.length,
            stderrLength: result.stderr.length
          });

          if (result.success) {
            resolve(result);
          } else {
            reject(new Error(`Python script failed with exit code ${exitCode}: ${stderr}`));
          }
        });

        pythonProcess.on('error', (error) => {
          if (timeoutId) clearTimeout(timeoutId);
          
          // Clean up temporary file
          if (tempFile && fs.existsSync(tempFile)) {
            try {
              fs.unlinkSync(tempFile);
            } catch (err) {
              console.warn('⚠️ Failed to clean up temp file:', tempFile);
            }
          }

          console.error('❌ Python process error:', error);
          reject(error);
        });

      } catch (error) {
        // Clean up temporary file on immediate error
        if (tempFile && fs.existsSync(tempFile)) {
          try {
            fs.unlinkSync(tempFile);
          } catch (err) {
            console.warn('⚠️ Failed to clean up temp file:', tempFile);
          }
        }
        reject(error);
      }
    });
  }

  // Convenience method for simple script execution
  async runScript(script: string, input?: string): Promise<string> {
    const result = await this.run({ 
      script, 
      input, 
      timeout: 30000 // 30 second default timeout
    });
    return result.stdout;
  }

  // Convenience method for running script files
  async runFile(scriptFile: string, args?: string[], input?: string): Promise<string> {
    const result = await this.run({ 
      scriptFile, 
      args, 
      input, 
      timeout: 30000
    });
    return result.stdout;
  }

  // Method to install Python packages
  async installPackage(packageName: string): Promise<boolean> {
    const envManager = this.getEnvManager();
    if (envManager && envManager.isReady()) {
      // Use the environment manager for package installation
      return await envManager.installPackage(packageName);
    }

    // Fallback to the old method
    try {
      console.log('📦 Installing Python package:', packageName);
      const result = await this.run({
        script: `
import subprocess
import sys

try:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "${packageName}"])
    print("SUCCESS: Package ${packageName} installed")
except subprocess.CalledProcessError as e:
    print(f"ERROR: Failed to install ${packageName}: {e}")
    sys.exit(1)
        `,
        timeout: 60000 // 1 minute timeout for package installation
      });
      
      return result.success && result.stdout.includes('SUCCESS');
    } catch (error) {
      console.error('❌ Failed to install Python package:', packageName, error);
      return false;
    }
  }

  // Method to check if a package is available
  async checkPackage(packageName: string): Promise<boolean> {
    try {
      const result = await this.run({
        script: `
try:
    import ${packageName}
    print("AVAILABLE")
except ImportError:
    print("NOT_AVAILABLE")
        `,
        timeout: 5000
      });
      
      return result.success && result.stdout.includes('AVAILABLE');
    } catch (error) {
      return false;
    }
  }

  // Get Python version and info
  async getInfo(): Promise<{ version: string; executable: string; packages: string[] }> {
    try {
      const result = await this.run({
        script: `
import sys

print("VERSION:", sys.version)
print("EXECUTABLE:", sys.executable)
print("PACKAGES:")

# Try to get package info, but don't fail if pkg_resources is not available
try:
    import pkg_resources
    for pkg in sorted(pkg_resources.working_set, key=lambda x: x.project_name):
        print(f"  {pkg.project_name}=={pkg.version}")
except ImportError:
    print("  pkg_resources not available - using pip freeze")
    try:
        import subprocess
        result = subprocess.run([sys.executable, "-m", "pip", "freeze"], 
                              capture_output=True, text=True, timeout=5)
        if result.returncode == 0:
            for line in result.stdout.strip().split('\\n'):
                if line.strip():
                    print(f"  {line.strip()}")
    except Exception:
        print("  pip freeze also failed - no package info available")
        `,
        timeout: 10000
      });

      const lines = result.stdout.split('\n');
      const version = lines.find(l => l.startsWith('VERSION:'))?.replace('VERSION:', '').trim() || 'Unknown';
      const executable = lines.find(l => l.startsWith('EXECUTABLE:'))?.replace('EXECUTABLE:', '').trim() || this.pythonPath;
      
      const packagesStart = lines.findIndex(l => l === 'PACKAGES:');
      const packages = packagesStart >= 0 
        ? lines.slice(packagesStart + 1).map(l => l.trim()).filter(l => l.length > 0)
        : [];

      return { version, executable, packages };
    } catch (error) {
      console.error('❌ Failed to get Python info:', error);
      return { version: 'Unknown', executable: this.pythonPath, packages: [] };
    }
  }

  // Create a reusable script file
  createScript(name: string, content: string): string {
    const scriptPath = path.join(this.scriptsDir, `${name}.py`);
    fs.writeFileSync(scriptPath, content);
    console.log('📄 Created Python script:', scriptPath);
    return scriptPath;
  }

  // List available script files
  listScripts(): string[] {
    if (!fs.existsSync(this.scriptsDir)) return [];
    
    return fs.readdirSync(this.scriptsDir)
      .filter(file => file.endsWith('.py'))
      .map(file => path.join(this.scriptsDir, file));
  }
} 