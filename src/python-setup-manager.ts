import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import { dialog, shell, app } from 'electron';
import { UserDataManager } from './user-data-manager';

export interface PythonSetupStatus {
  isConfigured: boolean;
  uvAvailable: boolean;
  uvPath: string | null;
  pythonPath: string | null;
  projectPath: string | null;
  customPythonPath: string | null;
  setupMethod: 'auto' | 'custom' | 'none';
  dependencies: {
    fastapi: boolean;
    uvicorn: boolean;
    dspy: boolean;
    [key: string]: boolean;
  };
  errors: string[];
}

export class PythonSetupManager extends EventEmitter {
  private static instance: PythonSetupManager | null = null;
  private setupStatus: PythonSetupStatus;
  private isSetupInProgress = false;
  private userDataManager: UserDataManager;

  static getInstance(): PythonSetupManager {
    if (!PythonSetupManager.instance) {
      PythonSetupManager.instance = new PythonSetupManager();
    }
    return PythonSetupManager.instance;
  }

  constructor() {
    super();
    this.userDataManager = UserDataManager.getInstance();
    
    this.setupStatus = {
      isConfigured: false,
      uvAvailable: false,
      uvPath: null,
      pythonPath: null,
      projectPath: null,
      customPythonPath: null,
      setupMethod: 'none',
      dependencies: {
        fastapi: false,
        uvicorn: false,
        dspy: false,
      },
      errors: []
    };

    // Load configuration on startup
    this.loadConfiguration();
  }

  private loadConfiguration(): void {
    try {
      // Try to migrate legacy configuration first
      this.userDataManager.migrateLegacyPythonConfig();
      
      const config = this.userDataManager.loadPythonConfig();
      if (config) {
        console.log('🐍 Loading Python configuration from user settings...');
        
        // Apply configuration to setup status
        this.setupStatus.setupMethod = config.setupMethod;
        this.setupStatus.customPythonPath = config.customPythonPath || null;
        this.setupStatus.uvPath = config.uvPath || null;
        this.setupStatus.projectPath = config.projectPath || null;
        this.setupStatus.pythonPath = config.pythonPath || null;
        
        console.log(`✅ Python configuration loaded: ${config.setupMethod} setup`);
        
        // If we have a valid configuration, set as configured
        if (config.setupMethod !== 'none' && (config.customPythonPath || config.projectPath)) {
          this.setupStatus.isConfigured = true;
        }
      } else {
        console.log('ℹ️ No Python configuration found, using defaults');
      }
    } catch (error) {
      console.error('❌ Error loading Python configuration:', error);
    }
  }

  private saveConfiguration(): void {
    try {
      const config = {
        setupMethod: this.setupStatus.setupMethod,
        customPythonPath: this.setupStatus.customPythonPath || undefined,
        uvPath: this.setupStatus.uvPath || undefined,
        projectPath: this.setupStatus.projectPath || undefined,
        pythonPath: this.setupStatus.pythonPath || undefined,
        uvInstallLocation: this.setupStatus.uvPath && this.setupStatus.uvPath.includes(app.getPath('userData')) 
          ? 'user-config' as const 
          : 'system' as const,
        configuredAt: new Date().toISOString(),
        preferences: {
          useSystemPython: this.setupStatus.setupMethod === 'custom'
        }
      };
      
      this.userDataManager.savePythonConfig(config);
      console.log('💾 Python configuration saved to user settings');
    } catch (error) {
      console.error('❌ Error saving Python configuration:', error);
    }
  }

  async checkSetupStatus(): Promise<PythonSetupStatus> {
    console.log('🔍 Checking Python setup status...');
    
    this.setupStatus.errors = [];
    
    // Check for custom Python path first (from loaded configuration)
    if (this.setupStatus.customPythonPath && fs.existsSync(this.setupStatus.customPythonPath)) {
      this.setupStatus.setupMethod = 'custom';
      await this.verifyCustomPython(this.setupStatus.customPythonPath);
    } else {
      // Check for UV-based setup
      const uvPath = await this.findUv();
      this.setupStatus.uvAvailable = !!uvPath;
      
      if (uvPath) {
        this.setupStatus.setupMethod = 'auto';
        // Check if we have an existing project directory
        const userDataPath = app.getPath('userData');
        const projectPath = path.join(userDataPath, 'python-project');
        
        if (fs.existsSync(projectPath)) {
          this.setupStatus.projectPath = projectPath;
        }
        
        await this.verifyUvSetup();
      } else {
        this.setupStatus.setupMethod = 'none';
      }
    }

    this.setupStatus.isConfigured = 
      (this.setupStatus.setupMethod === 'auto' && this.setupStatus.uvAvailable && !!this.setupStatus.projectPath) ||
      (this.setupStatus.setupMethod === 'custom' && !!this.setupStatus.customPythonPath);

    console.log('📊 Python setup status:', this.setupStatus);
    return this.setupStatus;
  }

  async promptUserForSetup(): Promise<boolean> {
    const response = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Set Up Python Environment', 'Use Custom Python', 'Skip for Now'],
      defaultId: 0,
      title: 'Python Setup Required',
      message: 'MetaKeyAI needs Python for AI spells and quick edit features.',
      detail: 'Choose how you\'d like to set up Python:\n\n' +
              '• Set Up Python Environment: We\'ll install UV and manage Python automatically\n' +
              '• Use Custom Python: Point us to your existing Python installation\n' +
              '• Skip for Now: Continue without Python features (you can set this up later in Settings)',
    });

    switch (response.response) {
      case 0: // Auto setup
        return await this.performAutoSetup();
      case 1: // Custom setup
        return await this.promptForCustomPython();
      case 2: // Skip
        return false;
      default:
        return false;
    }
  }

  async discoverPythonInstallations(): Promise<{name: string, path: string, version?: string}[]> {
    const pythons: {name: string, path: string, version?: string}[] = [];
    const checkedPaths = new Set<string>();

    console.log('🔍 Starting Python discovery...');

    // First, try UV's built-in Python discovery if UV is available
    try {
      const uvPath = await this.findUv();
      if (uvPath) {
        console.log('🚀 Using UV for Python discovery...');
        const uvPythons = await this.discoverPythonsWithUv(uvPath);
        for (const python of uvPythons) {
          if (!checkedPaths.has(python.path)) {
            checkedPaths.add(python.path);
            pythons.push(python);
          }
        }
      }
    } catch (error) {
      console.log('ℹ️ UV Python discovery failed, using fallback methods:', (error as Error).message);
    }

    try {
      // 1. Check common system Python commands
      const commonCommands = ['python3', 'python', 'python3.12', 'python3.11', 'python3.10', 'python3.9'];
      
      for (const cmd of commonCommands) {
        try {
          const result = await this.runCommand(process.platform === 'win32' ? 'where' : 'which', [cmd]);
          if (result.stdout.trim()) {
            const paths = result.stdout.trim().split('\n').map(p => p.trim()).filter(p => p);
            for (const pythonPath of paths) {
              if (!checkedPaths.has(pythonPath) && fs.existsSync(pythonPath)) {
                checkedPaths.add(pythonPath);
                const version = await this.getPythonVersion(pythonPath);
                pythons.push({
                  name: `System Python (${cmd})`,
                  path: pythonPath,
                  version
                });
              }
            }
          }
        } catch (error) {
          // Command not found, continue
        }
      }

      // 2. Check common installation directories
      const commonDirs = this.getCommonPythonDirectories();
      for (const dir of commonDirs) {
        if (fs.existsSync(dir)) {
          try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
              const itemPath = path.join(dir, item);
              if (fs.statSync(itemPath).isDirectory()) {
                // Look for python executable in this directory
                const possibleExes = process.platform === 'win32' 
                  ? ['python.exe', 'python3.exe']
                  : ['python', 'python3', 'bin/python', 'bin/python3'];
                
                for (const exe of possibleExes) {
                  const pythonPath = path.join(itemPath, exe);
                  if (!checkedPaths.has(pythonPath) && fs.existsSync(pythonPath)) {
                    checkedPaths.add(pythonPath);
                    const version = await this.getPythonVersion(pythonPath);
                    if (version) {
                      pythons.push({
                        name: `Python ${version} (${path.basename(itemPath)})`,
                        path: pythonPath,
                        version
                      });
                    }
                  }
                }
              }
            }
          } catch (error) {
            // Skip directories we can't read
          }
        }
      }

      // 3. Check pyenv installations
      try {
        const pyenvRoot = process.env.PYENV_ROOT || path.join(require('os').homedir(), '.pyenv');
        const versionsDir = path.join(pyenvRoot, 'versions');
        if (fs.existsSync(versionsDir)) {
          console.log('🐍 Checking pyenv installations...');
          const versions = fs.readdirSync(versionsDir);
          for (const version of versions) {
            const versionDir = path.join(versionsDir, version);
            if (fs.statSync(versionDir).isDirectory()) {
              const pythonPath = path.join(versionDir, 'bin', 'python');
              if (!checkedPaths.has(pythonPath) && fs.existsSync(pythonPath)) {
                checkedPaths.add(pythonPath);
                pythons.push({
                  name: `pyenv Python ${version}`,
                  path: pythonPath,
                  version
                });
              }
            }
          }
        }
      } catch (error) {
        // pyenv not available or not accessible
      }

      // 4. Check conda installations
      try {
        const condaResult = await this.runCommand('conda', ['info', '--envs']);
        if (condaResult.stdout) {
          console.log('🐍 Checking conda environments...');
          const lines = condaResult.stdout.split('\n');
          for (const line of lines) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2 && !line.startsWith('#')) {
              const envPath = parts[parts.length - 1];
              if (envPath && envPath !== '*' && fs.existsSync(envPath)) {
                const pythonPath = path.join(envPath, process.platform === 'win32' ? 'python.exe' : 'bin/python');
                if (!checkedPaths.has(pythonPath) && fs.existsSync(pythonPath)) {
                  checkedPaths.add(pythonPath);
                  const version = await this.getPythonVersion(pythonPath);
                  pythons.push({
                    name: `Conda (${parts[0]})`,
                    path: pythonPath,
                    version
                  });
                }
              }
            }
          }
        }
      } catch (error) {
        // conda not available
      }

      console.log(`🔍 Discovered ${pythons.length} Python installations`);
      return pythons;

    } catch (error) {
      console.error('❌ Python discovery failed:', error);
      return pythons; // Return what we found so far
    }
  }

  private async discoverPythonsWithUv(uvPath: string): Promise<{name: string, path: string, version?: string}[]> {
    const pythons: {name: string, path: string, version?: string}[] = [];
    
    try {
      // Use UV's python list command to find managed Python installations
      const result = await this.runCommand(uvPath, ['python', 'list', '--only-installed']);
      
      if (result.stdout) {
        const lines = result.stdout.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('cpython') && !trimmed.startsWith('python')) {
            continue; // Skip headers and non-Python lines
          }
          
          // Parse UV output format: usually "cpython-3.11.6-linux-x86_64-gnu /path/to/python"
          // or "3.11.6 /path/to/python"
          const match = trimmed.match(/(\d+\.\d+\.\d+)\s+(.+)$/) || 
                       trimmed.match(/cpython-(\d+\.\d+\.\d+)-.+\s+(.+)$/);
          
          if (match) {
            const [, version, pythonPath] = match;
            if (fs.existsSync(pythonPath)) {
              pythons.push({
                name: `UV Python ${version}`,
                path: pythonPath,
                version
              });
            }
          }
        }
      }
      
      // Also check for available downloads
      try {
        const availableResult = await this.runCommand(uvPath, ['python', 'list']);
        console.log(`📋 UV has ${availableResult.stdout.split('\n').length - 1} Python versions available`);
      } catch (error) {
        // Not critical if this fails
      }
      
    } catch (error) {
      console.log('⚠️ UV python list failed:', (error as Error).message);
    }
    
    return pythons;
  }

  private getCommonPythonDirectories(): string[] {
    const platform = process.platform;
    const homeDir = require('os').homedir();
    
    if (platform === 'win32') {
      return [
        'C:\\Python39',
        'C:\\Python310',
        'C:\\Python311',
        'C:\\Python312',
        path.join(homeDir, 'AppData', 'Local', 'Programs', 'Python'),
        'C:\\Program Files\\Python39',
        'C:\\Program Files\\Python310',
        'C:\\Program Files\\Python311',
        'C:\\Program Files\\Python312',
        'C:\\Program Files (x86)\\Python39',
        'C:\\Program Files (x86)\\Python310',
        'C:\\Program Files (x86)\\Python311',
        'C:\\Program Files (x86)\\Python312'
      ];
    } else if (platform === 'darwin') {
      return [
        '/usr/local/bin',
        '/opt/homebrew/bin',
        '/Library/Frameworks/Python.framework/Versions',
        path.join(homeDir, '.pyenv', 'versions'),
        '/opt/local/bin'
      ];
    } else {
      return [
        '/usr/bin',
        '/usr/local/bin',
        '/opt/python',
        path.join(homeDir, '.pyenv', 'versions'),
        path.join(homeDir, '.local', 'bin')
      ];
    }
  }

  private async getPythonVersion(pythonPath: string): Promise<string | undefined> {
    try {
      const result = await this.runCommand(pythonPath, ['--version']);
      const match = result.stdout.match(/Python (\d+\.\d+\.\d+)/);
      return match ? match[1] : undefined;
    } catch (error) {
      return undefined;
    }
  }

  async performAutoSetup(): Promise<boolean> {
    if (this.isSetupInProgress) {
      console.log('⏳ Setup already in progress...');
      return false;
    }

    this.isSetupInProgress = true;

    try {
      console.log('🚀 Starting automatic Python setup with UV...');

      // Step 1: Install UV if needed
      let uvPath = await this.findUv();
      if (!uvPath) {
        console.log('📦 Installing UV...');
        const installed = await this.installUv();
        if (!installed) {
          throw new Error('Failed to install UV. Please check your internet connection and try again.');
        }
        uvPath = await this.findUv();
        if (!uvPath) {
          throw new Error('UV installation succeeded but UV not found in PATH. You may need to restart the application.');
        }
      } else {
        console.log('✅ UV found at:', uvPath);
      }

      // Step 2: Ensure Python is available (let UV manage Python)
      console.log('🐍 Ensuring Python availability...');
      try {
        // Try to find a compatible Python version
        const pythonFindResult = await this.runCommand(uvPath, ['python', 'find', '>=3.9']);
        console.log('✅ Compatible Python found:', pythonFindResult.stdout.trim());
      } catch (error) {
        console.log('📥 No compatible Python found, installing Python 3.11 with UV...');
        try {
          await this.runCommand(uvPath, ['python', 'install', '3.11']);
          console.log('✅ Python 3.11 installed successfully');
        } catch (installError) {
          throw new Error(`Failed to install Python with UV: ${(installError as Error).message}`);
        }
      }

      // Step 3: Create project environment
      console.log('🏗️ Setting up Python project...');
      const projectPath = await this.createProjectEnvironment(uvPath);
      console.log('✅ Project environment created at:', projectPath);
      
      // Step 4: Install dependencies without building the project
      console.log('📦 Installing project dependencies...');
      await this.installDependencies(uvPath, projectPath);

      // Step 5: Verify setup
      console.log('🔍 Verifying setup...');
      await this.verifyUvSetup();
      
      // Force recheck setup status to ensure everything is detected properly
      await this.checkSetupStatus();

      if (this.setupStatus.isConfigured) {
        // Save configuration to user settings
        this.setupStatus.setupMethod = 'auto';
        this.saveConfiguration();
        
        console.log('✅ Auto setup completed successfully!');
        await dialog.showMessageBox({
          type: 'info',
          title: 'Python Setup Complete',
          message: 'Python environment has been set up successfully!',
          detail: 'MetaKeyAI can now run AI spells and quick edit features.',
          buttons: ['OK']
        });
        return true;
      } else {
        console.error('❌ Setup verification failed - status:', this.setupStatus);
        throw new Error('Setup verification failed. The environment was created but may not be properly configured.');
      }

    } catch (error) {
      console.error('❌ Python setup failed:', error);
      
      // Provide more detailed error information
      let errorDetail = `Error: ${(error as Error).message}\n\n`;
      
      if ((error as Error).message.includes('UV installation')) {
        errorDetail += 'UV installation failed. Please:\n';
        errorDetail += '• Check your internet connection\n';
        errorDetail += '• Install UV manually from https://docs.astral.sh/uv/\n';
        errorDetail += '• Or use a custom Python installation instead\n';
      } else if ((error as Error).message.includes('dependencies')) {
        errorDetail += 'Dependencies installation failed. Please:\n';
        errorDetail += '• Check your internet connection\n';
        errorDetail += '• Try again in a few minutes\n';
        errorDetail += '• Or use a custom Python installation\n';
      } else {
        errorDetail += 'You can:\n';
        errorDetail += '• Try the auto setup again\n';
        errorDetail += '• Use a custom Python installation\n';
        errorDetail += '• Install UV manually from https://docs.astral.sh/uv/\n';
      }
      
      await dialog.showMessageBox({
        type: 'error',
        title: 'Python Setup Failed',
        message: 'Failed to set up Python environment automatically.',
        detail: errorDetail,
        buttons: ['OK']
      });
      
      return false;
    } finally {
      this.isSetupInProgress = false;
    }
  }

  async promptForCustomPython(): Promise<boolean> {
    // First, discover available Python installations
    console.log('🔍 Discovering Python installations...');
    const discoveredPythons = await this.discoverPythonInstallations();
    
    if (discoveredPythons.length > 0) {
      // Show custom selection dialog with discovered installations
      return await this.showPythonSelectionDialog(discoveredPythons);
    } else {
      // No auto-discovered Pythons, show fallback options
      const response = await dialog.showMessageBox({
        type: 'question',
        title: 'Configure Custom Python',
        message: 'No Python installations were automatically discovered.',
        detail: 'How would you like to specify your Python installation?',
        buttons: ['Browse for Python executable...', 'Enter path manually...', 'Cancel'],
        defaultId: 0,
        cancelId: 2
      });
      
      switch (response.response) {
        case 0:
          return await this.promptForPythonFileBrowser();
        case 1:
          return await this.promptForManualPythonPath();
        default:
          return false;
      }
    }
  }

  private async showPythonSelectionDialog(pythons: {name: string, path: string, version?: string}[]): Promise<boolean> {
    const dialogHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Select Python Installation</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            margin: 0; 
            padding: 20px; 
            background: linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%); 
            color: #fff; 
            min-height: calc(100vh - 40px);
          }
          .container { 
            max-width: 600px; 
            margin: 0 auto; 
            background: rgba(45, 45, 45, 0.8); 
            border-radius: 12px; 
            padding: 24px; 
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
          }
          .header { 
            text-align: center; 
            margin-bottom: 24px; 
            border-bottom: 1px solid rgba(255, 255, 255, 0.1); 
            padding-bottom: 16px; 
          }
          .header h2 { 
            margin: 0 0 8px 0; 
            color: #fff; 
            font-size: 24px; 
            font-weight: 600; 
          }
          .header p { 
            margin: 0; 
            color: #aaa; 
            font-size: 14px; 
          }
          .python-list { 
            max-height: 300px; 
            overflow-y: auto; 
            margin-bottom: 20px; 
            border: 1px solid rgba(255, 255, 255, 0.1); 
            border-radius: 8px; 
            background: rgba(0, 0, 0, 0.2);
          }
          .python-item { 
            padding: 12px 16px; 
            border-bottom: 1px solid rgba(255, 255, 255, 0.05); 
            cursor: pointer; 
            transition: all 0.2s ease; 
            display: flex; 
            align-items: center; 
            justify-content: space-between;
            position: relative;
          }
          .python-item:last-child { 
            border-bottom: none; 
          }
          .python-item:hover { 
            background: rgba(0, 123, 204, 0.1); 
            border-color: rgba(0, 123, 204, 0.3); 
          }
          .python-item.selected { 
            background: rgba(0, 123, 204, 0.2); 
            border-color: rgba(0, 123, 204, 0.5); 
          }
          .python-item.checking { 
            opacity: 0.6; 
            pointer-events: none; 
          }
          .python-info { 
            flex: 1; 
          }
          .python-name { 
            font-weight: 500; 
            font-size: 16px; 
            margin-bottom: 4px; 
            color: #fff; 
          }
          .python-path { 
            font-size: 12px; 
            color: #888; 
            font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', monospace; 
          }
          .python-version { 
            background: rgba(0, 123, 204, 0.2); 
            color: #4FC3F7; 
            padding: 2px 8px; 
            border-radius: 12px; 
            font-size: 11px; 
            font-weight: 500; 
            min-width: 60px; 
            text-align: center; 
          }
          .python-status { 
            display: flex; 
            flex-direction: column; 
            align-items: flex-end; 
            gap: 4px; 
          }
          .dependency-status { 
            font-size: 10px; 
            padding: 2px 6px; 
            border-radius: 8px; 
            font-weight: 500; 
          }
          .deps-complete { 
            background: rgba(76, 175, 80, 0.2); 
            color: #81C784; 
          }
          .deps-missing { 
            background: rgba(255, 152, 0, 0.2); 
            color: #FFB74D; 
          }
          .deps-checking { 
            background: rgba(96, 125, 139, 0.2); 
            color: #90A4AE; 
          }
          .loading-spinner { 
            width: 12px; 
            height: 12px; 
            border: 2px solid rgba(255, 255, 255, 0.1); 
            border-top: 2px solid #4FC3F7; 
            border-radius: 50%; 
            animation: spin 1s linear infinite; 
          }
          @keyframes spin { 
            0% { transform: rotate(0deg); } 
            100% { transform: rotate(360deg); } 
          }
          .selected-info { 
            margin: 16px 0; 
            padding: 16px; 
            background: rgba(0, 123, 204, 0.1); 
            border: 1px solid rgba(0, 123, 204, 0.3); 
            border-radius: 8px; 
            display: none; 
          }
          .selected-info.visible { 
            display: block; 
          }
          .dependency-list { 
            margin: 8px 0; 
            font-size: 12px; 
          }
          .dep-item { 
            display: inline-block; 
            margin: 2px 4px; 
            padding: 2px 6px; 
            border-radius: 4px; 
            font-size: 10px; 
          }
          .dep-available { 
            background: rgba(76, 175, 80, 0.2); 
            color: #81C784; 
          }
          .dep-missing { 
            background: rgba(244, 67, 54, 0.2); 
            color: #E57373; 
          }
          .install-deps-btn { 
            margin-top: 8px; 
            padding: 6px 12px; 
            background: rgba(255, 152, 0, 0.2); 
            border: 1px solid rgba(255, 152, 0, 0.3); 
            border-radius: 6px; 
            color: #FFB74D; 
            cursor: pointer; 
            font-size: 12px; 
            transition: all 0.2s ease; 
          }
          .install-deps-btn:hover { 
            background: rgba(255, 152, 0, 0.3); 
          }
          .install-deps-btn:disabled { 
            opacity: 0.5; 
            cursor: not-allowed; 
          }
          .other-options { 
            margin: 20px 0; 
            padding: 16px; 
            background: rgba(0, 0, 0, 0.1); 
            border-radius: 8px; 
            border: 1px solid rgba(255, 255, 255, 0.1); 
          }
          .other-options h4 { 
            margin: 0 0 12px 0; 
            font-size: 14px; 
            color: #ccc; 
            font-weight: 500; 
          }
          .option-buttons { 
            display: flex; 
            gap: 8px; 
            flex-wrap: wrap; 
          }
          .option-btn { 
            padding: 8px 12px; 
            background: rgba(255, 255, 255, 0.05); 
            border: 1px solid rgba(255, 255, 255, 0.1); 
            border-radius: 6px; 
            color: #ddd; 
            cursor: pointer; 
            font-size: 12px; 
            transition: all 0.2s ease; 
          }
          .option-btn:hover { 
            background: rgba(255, 255, 255, 0.1); 
            border-color: rgba(255, 255, 255, 0.2); 
          }
          .action-buttons { 
            display: flex; 
            gap: 12px; 
            justify-content: flex-end; 
            margin-top: 24px; 
            padding-top: 16px; 
            border-top: 1px solid rgba(255, 255, 255, 0.1); 
          }
          .btn { 
            padding: 10px 20px; 
            border: none; 
            border-radius: 6px; 
            cursor: pointer; 
            font-size: 14px; 
            font-weight: 500; 
            transition: all 0.2s ease; 
            display: flex; 
            align-items: center; 
            gap: 8px; 
          }
          .btn-primary { 
            background: linear-gradient(45deg, #007acc, #0099ff); 
            color: white; 
          }
          .btn-primary:hover { 
            background: linear-gradient(45deg, #0066a3, #0080cc); 
            transform: translateY(-1px); 
          }
          .btn-primary:disabled { 
            background: #555; 
            cursor: not-allowed; 
            transform: none; 
          }
          .btn-secondary { 
            background: rgba(255, 255, 255, 0.1); 
            color: white; 
            border: 1px solid rgba(255, 255, 255, 0.2); 
          }
          .btn-secondary:hover { 
            background: rgba(255, 255, 255, 0.15); 
          }
          .progress-overlay { 
            position: fixed; 
            top: 0; 
            left: 0; 
            right: 0; 
            bottom: 0; 
            background: rgba(0, 0, 0, 0.5); 
            display: none; 
            align-items: center; 
            justify-content: center; 
            z-index: 1000; 
          }
          .progress-content { 
            background: rgba(45, 45, 45, 0.95); 
            padding: 24px; 
            border-radius: 12px; 
            text-align: center; 
            min-width: 200px; 
          }
          .progress-spinner { 
            width: 32px; 
            height: 32px; 
            border: 3px solid rgba(255, 255, 255, 0.1); 
            border-top: 3px solid #4FC3F7; 
            border-radius: 50%; 
            animation: spin 1s linear infinite; 
            margin: 0 auto 16px auto; 
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h2>🐍 Select Python Installation</h2>
            <p>Choose a Python installation for MetaKeyAI</p>
          </div>
          
          <div class="python-list" id="pythonList">
            ${pythons.map((python, index) => `
              <div class="python-item" data-index="${index}" onclick="selectPython(${index})">
                <div class="python-info">
                  <div class="python-name">${python.name}</div>
                  <div class="python-path">${python.path}</div>
                </div>
                <div class="python-status">
                  ${python.version ? `<div class="python-version">v${python.version}</div>` : ''}
                  <div class="dependency-status deps-checking" id="deps-${index}">
                    <div class="loading-spinner"></div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
          
          <div class="selected-info" id="selectedInfo">
            <h4>Selected Python Details</h4>
            <div id="selectedDetails"></div>
            <div class="dependency-list" id="dependencyList"></div>
            <button class="install-deps-btn" id="installDepsBtn" onclick="installDependencies()" style="display: none;">
              📦 Install Missing Dependencies
            </button>
          </div>
          
          <div class="other-options">
            <h4>Other Options</h4>
            <div class="option-buttons">
              <div class="option-btn" onclick="browseForPython()">📁 Browse for executable...</div>
              <div class="option-btn" onclick="enterManualPath()">⌨️ Enter path manually...</div>
            </div>
          </div>
          
          <div class="action-buttons">
            <button class="btn btn-secondary" onclick="cancel()">Cancel</button>
            <button class="btn btn-primary" id="useBtn" disabled onclick="usePython()">
              <span id="useBtnText">Use Selected Python</span>
              <div class="loading-spinner" id="useBtnSpinner" style="display: none; width: 16px; height: 16px;"></div>
            </button>
          </div>
        </div>
        
        <div class="progress-overlay" id="progressOverlay">
          <div class="progress-content">
            <div class="progress-spinner"></div>
            <div id="progressText">Checking dependencies...</div>
          </div>
        </div>
        
        <script>
          const { ipcRenderer } = require('electron');
          let selectedIndex = -1;
          let pythonDependencies = {};
          const pythons = ${JSON.stringify(pythons)};
          
          // Start checking dependencies for all Python installations
          async function checkAllDependencies() {
            for (let i = 0; i < pythons.length; i++) {
              try {
                const deps = await ipcRenderer.invoke('check-python-dependencies', pythons[i].path);
                pythonDependencies[i] = deps;
                updateDependencyStatus(i, deps);
              } catch (error) {
                console.error('Failed to check dependencies for', pythons[i].path, error);
                const depsEl = document.getElementById(\`deps-\${i}\`);
                depsEl.className = 'dependency-status deps-missing';
                depsEl.textContent = 'Check failed';
              }
            }
          }
          
          function updateDependencyStatus(index, deps) {
            const depsEl = document.getElementById(\`deps-\${index}\`);
            const missing = Object.values(deps).filter(installed => !installed).length;
            
            if (missing === 0) {
              depsEl.className = 'dependency-status deps-complete';
              depsEl.textContent = '✓ Ready';
            } else {
              depsEl.className = 'dependency-status deps-missing';
              depsEl.textContent = \`\${missing} missing\`;
            }
          }
          
          function selectPython(index) {
            // Remove previous selection
            document.querySelectorAll('.python-item').forEach(item => {
              item.classList.remove('selected');
            });
            
            // Add selection to clicked item
            document.querySelector(\`[data-index="\${index}"]\`).classList.add('selected');
            selectedIndex = index;
            
            // Enable use button
            document.getElementById('useBtn').disabled = false;
            
            // Show selected info
            showSelectedInfo(index);
          }
          
          function showSelectedInfo(index) {
            const selectedInfo = document.getElementById('selectedInfo');
            const selectedDetails = document.getElementById('selectedDetails');
            const dependencyList = document.getElementById('dependencyList');
            const installBtn = document.getElementById('installDepsBtn');
            
            const python = pythons[index];
            const deps = pythonDependencies[index] || {};
            
            selectedDetails.innerHTML = \`
              <strong>\${python.name}</strong><br>
              <code>\${python.path}</code>
            \`;
            
            // Show dependencies
            const depEntries = Object.entries(deps);
            if (depEntries.length > 0) {
              dependencyList.innerHTML = \`
                <strong>Dependencies:</strong><br>
                \${depEntries.map(([dep, installed]) => 
                  \`<span class="dep-item \${installed ? 'dep-available' : 'dep-missing'}">\${dep}</span>\`
                ).join('')}
              \`;
              
              const missingCount = depEntries.filter(([_, installed]) => !installed).length;
              if (missingCount > 0) {
                installBtn.style.display = 'block';
                installBtn.textContent = \`📦 Install \${missingCount} Missing Dependencies\`;
              } else {
                installBtn.style.display = 'none';
              }
            } else {
              dependencyList.innerHTML = '<em>Checking dependencies...</em>';
              installBtn.style.display = 'none';
            }
            
            selectedInfo.classList.add('visible');
          }
          
          async function installDependencies() {
            if (selectedIndex < 0) return;
            
            const installBtn = document.getElementById('installDepsBtn');
            installBtn.disabled = true;
            installBtn.textContent = '⏳ Installing...';
            
            try {
              const result = await ipcRenderer.invoke('install-python-dependencies', pythons[selectedIndex].path);
              if (result.success) {
                // Recheck dependencies
                const deps = await ipcRenderer.invoke('check-python-dependencies', pythons[selectedIndex].path);
                pythonDependencies[selectedIndex] = deps;
                updateDependencyStatus(selectedIndex, deps);
                showSelectedInfo(selectedIndex);
              } else {
                alert('Failed to install dependencies: ' + result.error);
              }
            } catch (error) {
              alert('Error installing dependencies: ' + error.message);
            } finally {
              installBtn.disabled = false;
            }
          }
          
          function showProgress(text) {
            document.getElementById('progressText').textContent = text;
            document.getElementById('progressOverlay').style.display = 'flex';
          }
          
          function hideProgress() {
            document.getElementById('progressOverlay').style.display = 'none';
          }
          
          async function usePython() {
            if (selectedIndex >= 0) {
              const useBtn = document.getElementById('useBtn');
              const btnText = document.getElementById('useBtnText');
              const btnSpinner = document.getElementById('useBtnSpinner');
              
              // Show loading state
              useBtn.disabled = true;
              btnText.textContent = 'Configuring...';
              btnSpinner.style.display = 'block';
              
              ipcRenderer.send('python-selection-result', { type: 'selected', python: pythons[selectedIndex] });
              // Don't close window here - let the parent handle it
            }
          }
          
          function browseForPython() {
            ipcRenderer.send('python-selection-result', { type: 'browse' });
            window.close();
          }
          
          function enterManualPath() {
            ipcRenderer.send('python-selection-result', { type: 'manual' });
            window.close();
          }
          
          function cancel() {
            ipcRenderer.send('python-selection-result', { type: 'cancel' });
            window.close();
          }
          
          // Keyboard shortcuts
          document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
              cancel();
            } else if (e.key === 'Enter' && selectedIndex >= 0) {
              usePython();
            }
          });
          
          // Start dependency checking
          checkAllDependencies();
        </script>
      </body>
      </html>
    `;

    return new Promise((resolve) => {
      const selectionWindow = new (require('electron').BrowserWindow)({
        width: 700,
        height: 700,
        modal: true,
        parent: require('electron').BrowserWindow.getFocusedWindow(),
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        },
        autoHideMenuBar: true,
        resizable: true,
        show: false,
        title: 'Select Python Installation'
      });

      // Handle the result
      const { ipcMain } = require('electron');
      const resultHandler = async (event: any, result: any) => {
        ipcMain.removeListener('python-selection-result', resultHandler);
        selectionWindow.destroy();
        
        switch (result.type) {
          case 'selected':
            const success = await this.configurePythonPath(result.python.path);
            resolve(success);
            break;
          case 'browse':
            const browseSuccess = await this.promptForPythonFileBrowser();
            resolve(browseSuccess);
            break;
          case 'manual':
            const manualSuccess = await this.promptForManualPythonPath();
            resolve(manualSuccess);
            break;
          default:
            resolve(false);
        }
      };
      
      ipcMain.on('python-selection-result', resultHandler);

      // Load the HTML content
      selectionWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(dialogHtml));
      selectionWindow.once('ready-to-show', () => {
        selectionWindow.show();
      });

      // Handle window close
      selectionWindow.on('closed', () => {
        ipcMain.removeListener('python-selection-result', resultHandler);
        resolve(false);
      });
    });
  }

  private async promptForPythonFileBrowser(): Promise<boolean> {
    const response = await dialog.showOpenDialog({
      title: 'Select Python Executable',
      properties: ['openFile'],
      filters: [
        { name: 'Python Executable', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }
      ]
    });

    if (response.canceled || !response.filePaths[0]) {
      return false;
    }

    return await this.configurePythonPath(response.filePaths[0]);
  }

  private async promptForManualPythonPath(): Promise<boolean> {
    // Create a simple input dialog using HTML
    const inputHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Enter Python Path</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 20px; background: #2d2d2d; color: #fff; }
          .container { max-width: 500px; margin: 0 auto; }
          h2 { margin-bottom: 20px; }
          input[type="text"] { width: 100%; padding: 10px; margin: 10px 0; border: 1px solid #555; border-radius: 4px; background: #1a1a1a; color: #fff; font-size: 14px; }
          .buttons { margin-top: 20px; display: flex; gap: 10px; justify-content: flex-end; }
          button { padding: 8px 16px; border: none; border-radius: 4px; cursor: pointer; font-size: 14px; }
          .primary { background: #007acc; color: white; }
          .secondary { background: #555; color: white; }
          .examples { margin: 10px 0; font-size: 12px; color: #888; }
          .examples div { margin: 2px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h2>Enter Python Path</h2>
          <p>Enter the full path to your Python executable:</p>
          <input type="text" id="pythonPath" placeholder="/usr/bin/python3" autofocus>
          <div class="examples">
            <strong>Examples:</strong>
            <div>Linux: /usr/bin/python3, /home/user/.pyenv/versions/3.11.0/bin/python</div>
            <div>Windows: C:\\Python311\\python.exe, C:\\Users\\user\\AppData\\Local\\Programs\\Python\\Python311\\python.exe</div>
            <div>macOS: /usr/local/bin/python3, /opt/homebrew/bin/python3</div>
          </div>
          <div class="buttons">
            <button class="secondary" onclick="cancel()">Cancel</button>
            <button class="primary" onclick="confirm()">Use This Path</button>
          </div>
        </div>
        <script>
          const { ipcRenderer } = require('electron');
          
          function cancel() {
            ipcRenderer.send('python-path-input-result', null);
            window.close();
          }
          
          function confirm() {
            const path = document.getElementById('pythonPath').value.trim();
            if (path) {
              ipcRenderer.send('python-path-input-result', path);
              window.close();
            } else {
              alert('Please enter a Python path');
            }
          }
          
          document.getElementById('pythonPath').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              confirm();
            } else if (e.key === 'Escape') {
              cancel();
            }
          });
        </script>
      </body>
      </html>
    `;

    return new Promise((resolve) => {
      const inputWindow = new (require('electron').BrowserWindow)({
        width: 600,
        height: 400,
        modal: true,
        parent: require('electron').BrowserWindow.getFocusedWindow(),
        webPreferences: {
          nodeIntegration: true,
          contextIsolation: false
        },
        autoHideMenuBar: true,
        resizable: false,
        show: false
      });

      // Handle the result
      const { ipcMain } = require('electron');
      const resultHandler = async (event: any, pythonPath: string | null) => {
        ipcMain.removeListener('python-path-input-result', resultHandler);
        inputWindow.destroy();
        
        if (pythonPath) {
          const success = await this.configurePythonPath(pythonPath);
          resolve(success);
        } else {
          resolve(false);
        }
      };
      
      ipcMain.on('python-path-input-result', resultHandler);

      // Load the HTML content
      inputWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(inputHtml));
      inputWindow.once('ready-to-show', () => {
        inputWindow.show();
      });

      // Handle window close
      inputWindow.on('closed', () => {
        ipcMain.removeListener('python-path-input-result', resultHandler);
        resolve(false);
      });
    });
  }

  private async configurePythonPath(pythonPath: string): Promise<boolean> {
    console.log('🐍 Configuring Python path:', pythonPath);

    // Verify the Python installation
    try {
      await this.verifyCustomPython(pythonPath);
      
      if (this.setupStatus.customPythonPath) {
        // Save configuration to user settings
        this.setupStatus.setupMethod = 'custom';
        this.saveConfiguration();
        
        // Show dependency instructions
        const missingDeps = Object.entries(this.setupStatus.dependencies)
          .filter(([_, installed]) => !installed)
          .map(([dep, _]) => dep);
        
        if (missingDeps.length > 0) {
          await dialog.showMessageBox({
            type: 'warning',
            title: 'Python Dependencies Required',
            message: 'Your Python installation is missing some required packages.',
            detail: `Please install these packages:\n\n${missingDeps.join(', ')}\n\n` +
                    `You can install them with:\npip install ${missingDeps.join(' ')}`,
            buttons: ['OK']
          });
        } else {
          await dialog.showMessageBox({
            type: 'info',
            title: 'Custom Python Configured',
            message: 'Custom Python path has been set successfully!',
            detail: 'All required dependencies are available.',
            buttons: ['OK']
          });
        }
        
        return true;
      } else {
        throw new Error('Python verification failed');
      }
    } catch (error) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Invalid Python Installation',
        message: 'The selected Python installation is not valid.',
        detail: `Error: ${(error as Error).message}`,
        buttons: ['OK']
      });
      return false;
    }
  }

  private async installUv(): Promise<boolean> {
    const response = await dialog.showMessageBox({
      type: 'question',
      buttons: ['Install UV', 'Install UV to User Config', 'Cancel'],
      defaultId: 0,
      title: 'UV Installation Required',
      message: 'MetaKeyAI uses UV for Python package management.',
      detail: 'UV is a fast Python package manager that will handle all Python dependencies automatically.\n\n' +
              '• Install UV: Install globally to your system\n' +
              '• Install UV to User Config: Install to MetaKeyAI config directory (recommended)\n\n' +
              'This will download and install UV from https://astral.sh/uv/',
    });

    if (response.response === 2) {
      return false;
    }

    const installToUserConfig = response.response === 1;

    try {
      const platform = process.platform;
      console.log(`🔄 Installing UV on ${platform}...`);
      
      if (installToUserConfig) {
        return await this.installUvToUserConfig();
      }

      if (platform === 'win32') {
        // Windows: Use the official installer script
        console.log('💻 Running UV installer for Windows...');
        try {
          // Try PowerShell method first (recommended)
          await this.runCommand('powershell', [
            '-ExecutionPolicy', 'ByPass', 
            '-Command', 
            'irm https://astral.sh/uv/install.ps1 | iex'
          ]);
        } catch (error) {
          console.log('⚠️ PowerShell method failed, trying curl...');
          // Fallback to curl + bash for Windows
          await this.runCommand('bash', [
            '-c',
            'curl -LsSf https://astral.sh/uv/install.sh | sh'
          ]);
        }
      } else {
        // Linux/macOS: Use the official shell installer (recommended method)
        console.log(`💻 Running UV installer for ${platform}...`);
        try {
          // Primary method: curl (recommended in docs)
          await this.runCommand('sh', [
            '-c',
            'curl -LsSf https://astral.sh/uv/install.sh | sh'
          ]);
        } catch (error) {
          console.log('⚠️ Curl method failed, trying wget...');
          // Fallback: wget
          await this.runCommand('sh', [
            '-c',
            'wget -qO- https://astral.sh/uv/install.sh | sh'
          ]);
        }
      }
      
      // Wait for installation to complete and update PATH
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify installation was successful
      const uvPath = await this.findUv();
      if (uvPath) {
        console.log('✅ UV installation completed successfully at:', uvPath);
        
        // Show post-installation info
        await dialog.showMessageBox({
          type: 'info',
          title: 'UV Installed Successfully',
          message: 'UV has been installed successfully!',
          detail: 'UV is now available and will be used to manage Python dependencies.\n\n' +
                  'You may need to restart the application for PATH changes to take effect.',
          buttons: ['OK']
        });
        
        return true;
      } else {
        throw new Error('UV was installed but cannot be found. You may need to restart the application or add UV to your PATH.');
      }
      
    } catch (error) {
      console.error('❌ UV installation failed:', error);
      
      // Provide detailed error information with UV-specific guidance
      await dialog.showMessageBox({
        type: 'error',
        title: 'UV Installation Failed',
        message: 'Failed to install UV automatically.',
        detail: `Error: ${(error as Error).message}\n\n` +
                'Installation options:\n' +
                '• Check your internet connection and try again\n' +
                '• Install UV manually from https://docs.astral.sh/uv/getting-started/installation/\n' +
                '• Use pipx: pipx install uv\n' +
                '• Use pip: pip install uv\n' +
                '• Or use a custom Python installation instead',
        buttons: ['OK']
      });
      
      return false;
    }
  }

  private async installUvToUserConfig(): Promise<boolean> {
    try {
      console.log('📦 Installing UV to MetaKeyAI user config directory...');
      
      const userDataPath = app.getPath('userData');
      const uvBinPath = path.join(userDataPath, 'tools', 'uv');
      
      // Create tools directory
      const toolsDir = path.dirname(uvBinPath);
      if (!fs.existsSync(toolsDir)) {
        fs.mkdirSync(toolsDir, { recursive: true });
      }

      const platform = process.platform;
      const arch = process.arch;
      
      // Determine the correct binary name and download URL
      let binaryName: string;
      let downloadUrl: string;
      
      if (platform === 'win32') {
        binaryName = 'uv.exe';
        downloadUrl = `https://github.com/astral-sh/uv/releases/latest/download/uv-x86_64-pc-windows-msvc.zip`;
      } else if (platform === 'darwin') {
        binaryName = 'uv';
        const macArch = arch === 'arm64' ? 'aarch64' : 'x86_64';
        downloadUrl = `https://github.com/astral-sh/uv/releases/latest/download/uv-${macArch}-apple-darwin.tar.gz`;
      } else {
        binaryName = 'uv';
        const linuxArch = arch === 'arm64' ? 'aarch64' : 'x86_64';
        downloadUrl = `https://github.com/astral-sh/uv/releases/latest/download/uv-${linuxArch}-unknown-linux-gnu.tar.gz`;
      }

      const finalBinaryPath = path.join(toolsDir, binaryName);

      // Download and extract UV binary
      console.log('📥 Downloading UV binary...');
      const tempDir = path.join(userDataPath, 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const downloadFile = path.join(tempDir, path.basename(downloadUrl));
      
      // Download the binary
      if (platform === 'win32') {
        await this.runCommand('curl', ['-L', downloadUrl, '-o', downloadFile]);
        // Extract zip (simplified - would need proper zip extraction)
        console.log('⚠️ Please extract the downloaded UV manually to:', toolsDir);
      } else {
        await this.runCommand('curl', ['-L', downloadUrl, '-o', downloadFile]);
        // Extract tar.gz
        await this.runCommand('tar', ['-xzf', downloadFile, '-C', tempDir]);
        
        // Find and move the uv binary
        const extractedDir = fs.readdirSync(tempDir).find(name => name.startsWith('uv-'));
        if (extractedDir) {
          const extractedBinary = path.join(tempDir, extractedDir, 'uv');
          if (fs.existsSync(extractedBinary)) {
            fs.copyFileSync(extractedBinary, finalBinaryPath);
            fs.chmodSync(finalBinaryPath, '755');
          }
        }
      }

      // Clean up temp files
      try {
        if (fs.existsSync(downloadFile)) fs.unlinkSync(downloadFile);
      } catch (error) {
        console.warn('Could not clean up temp files:', error);
      }

      // Verify installation
      if (fs.existsSync(finalBinaryPath)) {
        try {
          await this.runCommand(finalBinaryPath, ['--version']);
          console.log('✅ UV installed successfully to user config:', finalBinaryPath);
          
          // Store the custom UV path
          this.setupStatus.uvPath = finalBinaryPath;
          
          return true;
        } catch (error) {
          console.error('UV binary downloaded but not working:', error);
          return false;
        }
      } else {
        throw new Error('Failed to install UV binary to user config directory');
      }

    } catch (error) {
      console.error('❌ UV user config installation failed:', error);
      
      await dialog.showMessageBox({
        type: 'error',
        title: 'UV Installation Failed',
        message: 'Failed to install UV to user config directory.',
        detail: `Error: ${(error as Error).message}\n\n` +
                'Please try the standard installation method or install UV manually.',
        buttons: ['OK']
      });
      
      return false;
    }
  }

  private async createProjectEnvironment(uvPath: string): Promise<string> {
    const userDataPath = app.getPath('userData');
    const projectPath = path.join(userDataPath, 'python-project');
    
    // Create project directory
    if (!fs.existsSync(projectPath)) {
      fs.mkdirSync(projectPath, { recursive: true });
    }

    // Create pyproject.toml for UV dependency management (not a package)
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    if (!fs.existsSync(pyprojectPath)) {
      const pyprojectContent = `[project]
name = "metakeyai-scripts"
version = "1.0.0"
description = "MetaKeyAI Python scripts and dependencies"
readme = "README.md"
requires-python = ">=3.9"
dependencies = [
    "fastapi>=0.104.1",
    "uvicorn>=0.24.0",
    "pydantic>=2.5.0",
    "dspy-ai>=2.4.0",
]

# Minimal build system - we're not building a package, just managing scripts
[build-system]
requires = ["setuptools"]
build-backend = "setuptools.build_meta"

[tool.uv]
# UV configuration for script management
dev-dependencies = []

[tool.uv.workspace]
# This is a simple script workspace, not a complex project
members = []
`;
      fs.writeFileSync(pyprojectPath, pyprojectContent);
    }

    // Create .python-version file for Python version pinning (UV best practice)
    const pythonVersionPath = path.join(projectPath, '.python-version');
    if (!fs.existsSync(pythonVersionPath)) {
      // Use the current Python version or a default
      const defaultPythonVersion = '3.11'; // Modern stable version
      fs.writeFileSync(pythonVersionPath, defaultPythonVersion);
    }

    // Create README.md
    const readmePath = path.join(projectPath, 'README.md');
    if (!fs.existsSync(readmePath)) {
      const readmeContent = `# MetaKeyAI Python Environment

This is the Python environment for MetaKeyAI, managed by UV.

## Structure

- \`src/\` - Python source code and spells
- \`pyproject.toml\` - Project configuration and dependencies
- \`.python-version\` - Python version specification
- \`uv.lock\` - Locked dependencies (auto-generated)

## Dependencies

The project uses:
- FastAPI for the web API
- Uvicorn for the ASGI server  
- Pydantic for data validation
- DSPy for AI/LLM integration

This environment is automatically managed by MetaKeyAI.
`;
      fs.writeFileSync(readmePath, readmeContent);
    }

    // Copy Python scripts from resources
    const srcPath = path.join(projectPath, 'src');
    if (!fs.existsSync(srcPath)) {
      fs.mkdirSync(srcPath, { recursive: true });
      
      // Find and copy Python scripts from app resources
      const resourcesPath = process.resourcesPath || path.join(__dirname, '..', '..', 'resources');
      const sourceScriptsPath = this.findPythonScripts(resourcesPath);
      
      if (sourceScriptsPath && fs.existsSync(sourceScriptsPath)) {
        this.copyDirectoryRecursive(sourceScriptsPath, srcPath);
        console.log('📁 Copied Python scripts to project');
      } else {
        console.warn('⚠️ Python scripts not found in resources');
        
        // Create a basic daemon script if none found
        const daemonPath = path.join(srcPath, 'metakeyai_daemon.py');
        if (!fs.existsSync(daemonPath)) {
          const basicDaemon = `#!/usr/bin/env python3
"""
MetaKeyAI background Python daemon
Basic implementation when scripts are not found in resources.
"""

from fastapi import FastAPI
import uvicorn
import os

app = FastAPI(title="MetaKeyAI Daemon", version="1.0.0")

@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}

@app.get("/ping")
def ping():
    return "pong"

if __name__ == "__main__":
    port = int(os.getenv("METAKEYAI_PORT", "5000"))
    uvicorn.run(app, host="127.0.0.1", port=port)
`;
          fs.writeFileSync(daemonPath, basicDaemon);
          console.log('📝 Created basic daemon script');
        }
      }
    }

    this.setupStatus.projectPath = projectPath;
    return projectPath;
  }

  private findPythonScripts(resourcesPath: string): string | null {
    const possiblePaths = [
      path.join(resourcesPath, 'src', 'python_scripts'),
      path.join(resourcesPath, 'python_scripts'),
      path.join(__dirname, '..', 'python_scripts'),
      path.join(__dirname, '..', '..', 'src', 'python_scripts'),
    ];

    for (const scriptPath of possiblePaths) {
      if (fs.existsSync(scriptPath)) {
        return scriptPath;
      }
    }

    return null;
  }

  private copyDirectoryRecursive(source: string, destination: string): void {
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }

    const items = fs.readdirSync(source);
    for (const item of items) {
      const sourcePath = path.join(source, item);
      const destPath = path.join(destination, item);
      
      if (fs.statSync(sourcePath).isDirectory()) {
        this.copyDirectoryRecursive(sourcePath, destPath);
      } else {
        fs.copyFileSync(sourcePath, destPath);
      }
    }
  }

  private async installDependencies(uvPath: string, projectPath: string): Promise<void> {
    console.log('📦 Installing Python dependencies with UV...');
    
    try {
      // Use UV add to install dependencies without building the project
      const dependencies = ['fastapi>=0.104.1', 'uvicorn>=0.24.0', 'pydantic>=2.5.0', 'dspy-ai>=2.4.0'];
      
      console.log('📝 Installing individual dependencies...');
      for (const dep of dependencies) {
        try {
          await this.runCommand(uvPath, ['add', '--project', projectPath, dep]);
          console.log(`✅ Installed: ${dep}`);
        } catch (error) {
          console.warn(`⚠️ Failed to install ${dep}:`, error);
        }
      }
      
      console.log('✅ Dependencies installation completed');
    } catch (error) {
      console.error('❌ Dependency installation failed:', error);
      throw new Error(`Failed to install dependencies: ${(error as Error).message}`);
    }
  }

  private async verifyUvSetup(): Promise<void> {
    if (!this.setupStatus.uvAvailable) {
      console.log('⚠️ UV not available for verification');
      return;
    }

    const projectPath = this.setupStatus.projectPath;
    if (!projectPath || !fs.existsSync(projectPath)) {
      console.log('⚠️ Project path not found for verification:', projectPath);
      return;
    }

    console.log('🔍 Verifying UV setup at:', projectPath);

    // Check if pyproject.toml exists
    const pyprojectPath = path.join(projectPath, 'pyproject.toml');
    
    if (fs.existsSync(pyprojectPath)) {
      console.log('✅ UV project files found');
      
      // Try to actually verify packages can be imported using the project's Python
      try {
        const projectPython = await this.findProjectPython(projectPath);
        if (projectPython) {
          console.log('🔍 Testing package imports with project Python...');
          
          const dependencies = await this.checkPythonDependencies(projectPython);
          
          // Update setup status with dependency information
          this.setupStatus.dependencies = {
            fastapi: dependencies.fastapi || false,
            uvicorn: dependencies.uvicorn || false,
            dspy: dependencies['dspy-ai'] || false,
          };
          this.setupStatus.pythonPath = projectPython;
          
          console.log('📊 Dependencies verified:', this.setupStatus.dependencies);
        } else {
          // Fallback: if we have the files, assume dependencies are there
          console.log('⚠️ Project Python not found, assuming dependencies from project files');
          this.setupStatus.dependencies.fastapi = true;
          this.setupStatus.dependencies.uvicorn = true;
          this.setupStatus.dependencies.dspy = true;
        }
      } catch (error) {
        console.log('⚠️ Could not verify package imports, assuming from project files:', (error as Error).message);
        // Fallback: if we have pyproject.toml, assume packages are installed
        this.setupStatus.dependencies.fastapi = true;
        this.setupStatus.dependencies.uvicorn = true;
        this.setupStatus.dependencies.dspy = true;
      }
    } else {
      console.log('❌ UV project files missing');
      this.setupStatus.dependencies.fastapi = false;
      this.setupStatus.dependencies.uvicorn = false;
      this.setupStatus.dependencies.dspy = false;
    }
    
    console.log('📊 Dependencies verification result:', this.setupStatus.dependencies);
  }

  private async verifyCustomPython(pythonPath: string): Promise<void> {
    try {
      // Test Python execution
      await this.runCommand(pythonPath, ['--version']);
      this.setupStatus.customPythonPath = pythonPath;
      
      // Check for required packages
      const packages = ['fastapi', 'uvicorn', 'dspy'];
      for (const pkg of packages) {
        try {
          await this.runCommand(pythonPath, ['-c', `import ${pkg}`]);
          this.setupStatus.dependencies[pkg] = true;
        } catch (error) {
          this.setupStatus.dependencies[pkg] = false;
        }
      }
      
    } catch (error) {
      this.setupStatus.customPythonPath = null;
      throw error;
    }
  }

  private async findUv(): Promise<string | null> {
    // First check if we have a custom UV path stored
    if (this.setupStatus.uvPath && fs.existsSync(this.setupStatus.uvPath)) {
      try {
        await this.runCommand(this.setupStatus.uvPath, ['--version']);
        return this.setupStatus.uvPath;
      } catch (error) {
        console.warn('Stored UV path not working:', this.setupStatus.uvPath);
        this.setupStatus.uvPath = null;
      }
    }

    // Check for UV in user config directory first
    const userDataPath = app.getPath('userData');
    const userConfigUv = path.join(userDataPath, 'tools', process.platform === 'win32' ? 'uv.exe' : 'uv');
    if (fs.existsSync(userConfigUv)) {
      try {
        await this.runCommand(userConfigUv, ['--version']);
        this.setupStatus.uvPath = userConfigUv;
        return userConfigUv;
      } catch (error) {
        console.warn('User config UV not working:', userConfigUv);
      }
    }

    // Try global UV command
    try {
      await this.runCommand('uv', ['--version']);
      return 'uv';
    } catch (error) {
      // Check common installation paths based on UV documentation
      const commonPaths = [
        // UV's default installation paths (from UV docs)
        path.join(process.env.HOME || '', '.local', 'bin', 'uv'),
        path.join(process.env.USERPROFILE || '', '.local', 'bin', 'uv.exe'),
        // Cargo installation paths
        path.join(process.env.HOME || '', '.cargo', 'bin', 'uv'),
        path.join(process.env.USERPROFILE || '', '.cargo', 'bin', 'uv.exe'),
        // System paths
        '/usr/local/bin/uv',
        '/opt/homebrew/bin/uv', // Homebrew on Apple Silicon
        // Windows program files
        path.join(process.env.PROGRAMFILES || '', 'uv', 'uv.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'uv', 'uv.exe'),
      ];
      
      for (const uvPath of commonPaths) {
        if (fs.existsSync(uvPath)) {
          try {
            await this.runCommand(uvPath, ['--version']);
            return uvPath;
          } catch (e) {
            continue;
          }
        }
      }
      
      return null;
    }
  }

  private runCommand(command: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      // Create a clean environment without conflicting Python variables
      const cleanEnv = { ...process.env };
      delete cleanEnv.VIRTUAL_ENV;
      delete cleanEnv.CONDA_DEFAULT_ENV;
      delete cleanEnv.PYTHONPATH;
      
      const proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: cleanEnv
      });

      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`));
        }
      });

      proc.on('error', reject);
    });
  }



  getSetupStatus(): PythonSetupStatus {
    return { ...this.setupStatus };
  }

  async resetSetup(): Promise<boolean> {
    try {
      console.log('🔄 Resetting Python setup...');
      const userDataPath = app.getPath('userData');
      
      // Clear saved Python configuration
      try {
        const config = this.userDataManager.loadPythonConfig();
        if (config) {
          // Clear the configuration by saving an empty/reset config
          this.userDataManager.savePythonConfig({
            setupMethod: 'none',
            configuredAt: new Date().toISOString()
          });
          console.log('✅ Cleared Python configuration');
        }
      } catch (error) {
        console.warn('⚠️ Could not clear Python configuration:', error);
      }

      // Remove legacy config if it exists
      const legacyConfigPath = path.join(userDataPath, 'python-config.json');
      if (fs.existsSync(legacyConfigPath)) {
        fs.unlinkSync(legacyConfigPath);
        console.log('✅ Removed legacy Python config');
      }

      // Remove UV project directory to allow fresh setup
      const projectPath = path.join(userDataPath, 'python-project');
      if (fs.existsSync(projectPath)) {
        try {
          this.removeDirectoryRecursive(projectPath);
          console.log('✅ Removed UV project directory');
        } catch (error) {
          console.warn('⚠️ Could not fully remove project directory:', error);
          // Try to remove key files at least
          try {
            const uvLockPath = path.join(projectPath, 'uv.lock');
            const pyprojectPath = path.join(projectPath, 'pyproject.toml');
            if (fs.existsSync(uvLockPath)) fs.unlinkSync(uvLockPath);
            if (fs.existsSync(pyprojectPath)) fs.unlinkSync(pyprojectPath);
          } catch (innerError) {
            console.warn('⚠️ Could not remove project files:', innerError);
          }
        }
      }

      // Reset status
      this.setupStatus = {
        isConfigured: false,
        uvAvailable: false,
        uvPath: null,
        pythonPath: null,
        projectPath: null,
        customPythonPath: null,
        setupMethod: 'none',
        dependencies: {
          fastapi: false,
          uvicorn: false,
          dspy: false,
        },
        errors: []
      };
      
      console.log('✅ Python setup has been reset successfully');
      return true;
    } catch (error) {
      console.error('❌ Error resetting Python setup:', error);
      return false;
    }
  }

  private removeDirectoryRecursive(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return;
    
    const items = fs.readdirSync(dirPath);
    for (const item of items) {
      const itemPath = path.join(dirPath, item);
      if (fs.statSync(itemPath).isDirectory()) {
        this.removeDirectoryRecursive(itemPath);
      } else {
        fs.unlinkSync(itemPath);
      }
    }
    fs.rmdirSync(dirPath);
  }

  async openUvInstallationGuide(): Promise<void> {
    await shell.openExternal('https://docs.astral.sh/uv/getting-started/installation/');
  }

  private async checkPythonDependencies(pythonPath: string): Promise<{[key: string]: boolean}> {
    const requiredDeps = ['fastapi', 'uvicorn', 'dspy-ai', 'pydantic'];
    const dependencies: {[key: string]: boolean} = {};
    
    for (const dep of requiredDeps) {
      try {
        const importName = dep === 'dspy-ai' ? 'dspy' : dep;
        // Use a simple import test that doesn't require building the project
        const result = await this.runCommand(pythonPath, [
          '-c', 
          `try:\n    import ${importName}\n    print("OK")\nexcept ImportError as e:\n    print(f"FAIL: {e}")`
        ]);
        dependencies[dep] = result.stdout.trim() === 'OK';
      } catch (error) {
        dependencies[dep] = false;
      }
    }
    
    return dependencies;
  }

  private async installPythonDependencies(pythonPath: string): Promise<{success: boolean, error?: string}> {
    try {
      const result = await this.runCommand(pythonPath, ['-m', 'pip', 'install', 'fastapi', 'uvicorn', 'pydantic', 'dspy-ai']);
      return { success: true };
    } catch (error) {
      return { success: false, error: (error as Error).message };
    }
  }

  private async findProjectPython(projectPath: string): Promise<string | null> {
    try {
      // Check for .venv directory (UV creates virtual environments here)
      const venvPath = path.join(projectPath, '.venv');
      if (fs.existsSync(venvPath)) {
        const pythonExe = process.platform === 'win32' 
          ? path.join(venvPath, 'Scripts', 'python.exe')
          : path.join(venvPath, 'bin', 'python');
          
        if (fs.existsSync(pythonExe)) {
          return pythonExe;
        }
      }
      
      // Try using UV to find the project Python
      const uvPath = await this.findUv();
      if (uvPath) {
        try {
          const result = await this.runCommand(uvPath, ['python', 'find', '--project', projectPath]);
          const pythonPath = result.stdout.trim();
          if (pythonPath && fs.existsSync(pythonPath)) {
            return pythonPath;
          }
        } catch (error) {
          console.warn('UV python find failed:', error);
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error finding project Python:', error);
      return null;
    }
  }
} 