import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { dialog } from 'electron';

export class UvManager {
  private static instance: UvManager | null = null;
  private uvPath: string | null = null;
  private isInstalling = false;

  static getInstance(): UvManager {
    if (!this.instance) {
      this.instance = new UvManager();
    }
    return this.instance;
  }

  async initialize(): Promise<string | null> {
    if (this.uvPath) {
      return this.uvPath;
    }

    console.log('🔍 Looking for UV installation...');
    this.uvPath = await this.findUv();
    
    if (!this.uvPath) {
      console.log('📦 UV not found, attempting automatic installation...');
      const success = await this.installUvWithUserConsent();
      if (success) {
        this.uvPath = await this.findUv();
      }
    }

    if (this.uvPath) {
      console.log('✅ UV available at:', this.uvPath);
    } else {
      console.error('❌ UV is not available');
    }

    return this.uvPath;
  }

  private async installUvWithUserConsent(): Promise<boolean> {
    if (this.isInstalling) {
      console.log('⏳ UV installation already in progress...');
      return false;
    }

    try {
      // Show user dialog asking for permission to install UV
      const response = await dialog.showMessageBox({
        type: 'question',
        buttons: ['Install UV', 'Cancel'],
        defaultId: 0,
        title: 'UV Installation Required',
        message: 'MetaKeyAI requires UV (Python package manager) to run.',
        detail: 'UV is not installed on your system. Would you like to install it automatically?\n\nThis will download and install UV from https://astral.sh/uv/',
        icon: undefined
      });

      if (response.response !== 0) {
        console.log('👤 User declined UV installation');
        return false;
      }

      this.isInstalling = true;
      console.log('🚀 Installing UV with user consent...');
      
      await this.installUv();
      
      // Verify installation
      const uvPath = await this.findUv();
      if (uvPath) {
        await dialog.showMessageBox({
          type: 'info',
          title: 'UV Installation Successful',
          message: 'UV has been successfully installed!',
          detail: 'MetaKeyAI can now manage Python dependencies automatically.',
          buttons: ['OK']
        });
        return true;
      } else {
        throw new Error('UV installation verification failed');
      }

    } catch (error) {
      console.error('❌ UV installation failed:', error);
      
      await dialog.showMessageBox({
        type: 'error',
        title: 'UV Installation Failed',
        message: 'Failed to install UV automatically.',
        detail: `Error: ${error.message}\n\nPlease install UV manually from:\nhttps://docs.astral.sh/uv/getting-started/installation/`,
        buttons: ['OK']
      });
      
      return false;
    } finally {
      this.isInstalling = false;
    }
  }

  private async installUv(): Promise<void> {
    console.log('🚀 Installing UV...');
    
    const platform = process.platform;
    
    if (platform === 'win32') {
      // Windows: Use PowerShell installer
      console.log('💻 Installing UV on Windows...');
      await this.runCommand('powershell', [
        '-ExecutionPolicy', 'ByPass', 
        '-Command', 
        'irm https://astral.sh/uv/install.ps1 | iex'
      ]);
    } else {
      // Linux/macOS: Use shell installer
      console.log(`💻 Installing UV on ${platform}...`);
      await this.runCommand('sh', [
        '-c', 
        'curl -LsSf https://astral.sh/uv/install.sh | sh'
      ]);
    }
    
    console.log('⏳ UV installation completed');
  }

  private async findUv(): Promise<string | null> {
    // Check if UV is in PATH
    try {
      await this.runCommand('uv', ['--version']);
      return 'uv';
    } catch (error) {
      // Try common installation paths
      const commonPaths = [
        path.join(process.env.HOME || '', '.cargo', 'bin', 'uv'),
        path.join(process.env.USERPROFILE || '', '.cargo', 'bin', 'uv.exe'),
        '/usr/local/bin/uv',
        'C:\\Users\\Public\\uv\\uv.exe'
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

  private runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`🔧 Running: ${command} ${args.join(' ')}`);
      
      const proc = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe']
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
          resolve();
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`));
        }
      });

      proc.on('error', reject);
    });
  }

  getUvPath(): string | null {
    return this.uvPath;
  }

  isAvailable(): boolean {
    return this.uvPath !== null;
  }
} 