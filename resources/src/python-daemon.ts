import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { EventEmitter } from 'events';
import axios, { AxiosInstance } from 'axios';
import { PythonEnvironmentManager } from './python-env-manager';
import { UvManager } from './uv-manager';
import * as net from 'net';

interface DaemonRequest {
  id: number;
  cmd: string;
  [key: string]: any;
}

interface DaemonResponse {
  id: number;
  result?: any;
  error?: string;
}

// Singleton wrapper around the background Python FastAPI server
export class PythonDaemon extends EventEmitter {
  private static instance: PythonDaemon | null = null;
  private process: ChildProcess | null = null;
  private isStarting = false;
  private uvPath: string | null = null;
  private ready = false;
  private client: AxiosInstance;
  private port: number = 5000; // Default port, will be dynamically assigned
  private baseUrl: string;

  static async getInstance(): Promise<PythonDaemon> {
    if (!this.instance) {
      this.instance = new PythonDaemon();
      await this.instance.start();
    }
    return this.instance;
  }

  constructor() {
    super();
    this.baseUrl = `http://127.0.0.1:${this.port}`;
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
    // UV initialization will be handled on-demand in start()
  }

  /**
   * Find an available port starting from the given port
   */
  private async findAvailablePort(startPort: number = 5000): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = net.createServer();
      
      server.listen(startPort, () => {
        const port = (server.address() as net.AddressInfo)?.port;
        server.close(() => {
          if (port) {
            console.log(`🔌 Found available port: ${port}`);
            resolve(port);
          } else {
            reject(new Error('Could not determine port'));
          }
        });
      });
      
      server.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
          console.log(`🔌 Port ${startPort} is busy, trying ${startPort + 1}`);
          this.findAvailablePort(startPort + 1).then(resolve).catch(reject);
        } else {
          reject(err);
        }
      });
    });
  }

  async start(): Promise<void> {
    if (this.process || this.isStarting) {
      console.log('🔄 Python daemon already starting/running');
      return;
    }

    this.isStarting = true;

    try {
      console.log('🐍 Starting Python daemon with UV...');
      
      // Find an available port
      this.port = await this.findAvailablePort(5000);
      this.baseUrl = `http://127.0.0.1:${this.port}`;
      
      // Update the axios client with the new port
      this.client = axios.create({
        baseURL: this.baseUrl,
        timeout: 30000,
      });
      
      // Use UvManager to ensure UV is available
      const uvManager = UvManager.getInstance();
      this.uvPath = await uvManager.initialize();
      
      if (!this.uvPath) {
        throw new Error(
          'UV is required but not available. ' +
          'Please install UV manually from https://docs.astral.sh/uv/getting-started/installation/ ' +
          'or restart the application to retry installation.'
        );
      }

      const { command, args } = await this.getUvCommand();
      
      console.log(`🚀 Spawning Python FastAPI server on port ${this.port}:`, command, args.join(' '));
      
      this.process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: {
          ...process.env,
          METAKEYAI_PORT: this.port.toString() // Pass the port to Python
        }
      });

      this.process.stdout?.on('data', (data) => {
        console.log('🐍 FastAPI server stdout:', data.toString());
      });

      this.process.stderr?.on('data', (data) => {
        console.error('🐍 FastAPI server stderr:', data.toString());
      });

      this.process.on('exit', (code, signal) => {
        console.error(`🐍 Python server exited (code ${code}, signal ${signal})`);
        this.ready = false;
        this.emit('exit');
      });

      await this.waitForServerReady();
      this.ready = true;
      console.log(`✅ Python FastAPI server is ready on ${this.baseUrl}`);
    } catch (error) {
      console.error('❌ Failed to start Python daemon:', error);
      throw error;
    } finally {
      this.isStarting = false;
    }
  }

  private async waitForServerReady(): Promise<void> {
    const maxRetries = 20; // 10 seconds total
    const retryDelay = 500; // ms

    for (let i = 0; i < maxRetries; i++) {
      try {
        await this.client.get('/health');
        return; // Success
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new Error(`Python server did not become ready in time on ${this.baseUrl}`);
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  private async getUvCommand(): Promise<{ command: string, args: string[] }> {
    const isDev = !require('electron').app.isPackaged;
    
    if (isDev) {
      // Development mode: run directly from project
      console.log('🔧 Running in development mode with UV');
      return {
        command: this.uvPath!,
        args: ['run', 'python', 'src/python_scripts/metakeyai_daemon.py']
      };
    } else {
      // Production mode: run from resources
      console.log('📦 Running in production mode with UV');
      const resourcesPath = path.join(process.resourcesPath, 'resources');
      
      // Ensure UV environment is set up
      await this.ensureProductionEnvironment(resourcesPath);
      
      return {
        command: this.uvPath!,
        args: ['run', '--project', resourcesPath, 'python', 'src/python_scripts/metakeyai_daemon.py']
      };
    }
  }

  private async ensureProductionEnvironment(resourcesPath: string): Promise<void> {
    const pyprojectPath = path.join(resourcesPath, 'pyproject.toml');
    
    if (!fs.existsSync(pyprojectPath)) {
      throw new Error(`pyproject.toml not found at ${pyprojectPath}`);
    }

    // Check if UV environment is synced
    const uvLockPath = path.join(resourcesPath, 'uv.lock');
    if (!fs.existsSync(uvLockPath)) {
      console.log('🔄 Syncing UV dependencies in production...');
      await this.runUvCommand(['sync', '--project', resourcesPath]);
    }
  }

  private runUvCommand(args: string[]): Promise<void> {
    if (!this.uvPath) {
      throw new Error('UV not available');
    }
    return this.runCommand(this.uvPath, args);
  }

  private runCommand(command: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
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
          reject(new Error(`Command failed with exit code ${code}: ${stderr}`));
        }
      });

      proc.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (this.process) {
      console.log('🛑 Stopping Python daemon...');
      this.process.kill();
      this.process = null;
      console.log('✅ Python daemon stopped');
    }
  }

  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  private async request<T>(method: 'get' | 'post', url: string, data?: any): Promise<T> {
    if (!this.ready) throw new Error('Python daemon not ready');
    try {
      const response = await this.client.request<T>({ method, url, data });
      return response.data;
    } catch (error) {
      console.error(`🐍 API request to ${url} failed:`, error.response?.data || error.message);
      if (axios.isAxiosError(error) && error.response) {
        throw new Error(error.response.data?.detail || `API Error on ${url}`);
      }
      throw error;
    }
  }

  async castSpell(payload: { spellId: string, scriptFile?: string, script?: string, input?: string }): Promise<any> {
    return this.request('post', '/cast', payload);
  }

  async listSpells(): Promise<any> {
    return this.request('get', '/spells');
  }

  async updateEnv(envVars: Record<string, string>): Promise<any> {
    return this.request('post', '/env', { env: envVars });
  }

  async quickEdit(text: string): Promise<string> {
    const response = await this.request<{ result: string }>('post', '/quick_edit', { text });
    return response.result;
  }

  isReady(): boolean {
    return this.ready;
  }

  getPort(): number {
    return this.port;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }
} 