import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import axios, { AxiosInstance } from 'axios';
import { PythonEnvironmentManager } from './python-env-manager';

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
  private proc: ChildProcessWithoutNullStreams | null = null;
  private ready = false;
  private client: AxiosInstance;
  private baseUrl = 'http://127.0.0.1:5000'; // Hardcoded to match Python server

  static async getInstance(): Promise<PythonDaemon> {
    if (!this.instance) {
      this.instance = new PythonDaemon();
      await this.instance.start();
    }
    return this.instance;
  }

  private constructor() {
    super();
    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 30000,
    });
  }

  private async start(): Promise<void> {
    if (this.proc) return;

    const { command, args } = await this.getCommandAndArgs();
    console.log('🚀 Spawning Python FastAPI server:', command, args.join(' '));

    this.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout.on('data', (data) => {
      console.log('🐍 FastAPI server stdout:', data.toString());
    });

    this.proc.stderr.on('data', (data) => {
      console.error('🐍 FastAPI server stderr:', data.toString());
    });

    this.proc.on('exit', (code, signal) => {
      console.error(`🐍 Python server exited (code ${code}, signal ${signal})`);
      this.ready = false;
      this.emit('exit');
    });

    await this.waitForServerReady();
    this.ready = true;
    console.log('✅ Python FastAPI server is ready');
  }

  private async getCommandAndArgs(): Promise<{ command: string, args: string[] }> {
    const isDev = !require('electron').app.isPackaged;
    const executableName = 'metakeyai-server';

    // Path for packaged app
    const prodPath = path.join(process.resourcesPath, 'python', executableName);
    
    if (!isDev) {
      console.log('📦 Using packaged server executable:', prodPath);
      if (!require('fs').existsSync(prodPath)) {
        throw new Error(`Packaged server executable not found at ${prodPath}. Please run the build script.`);
      }
      return { command: prodPath, args: [] };
    }

    // Fallback for development: run the script directly via the virtual env
    console.log('🧑‍💻 In development mode, running Python script directly...');
    const envManager = new PythonEnvironmentManager();
    // We must initialize the manager to ensure the python path is correct
    await envManager.initialize(); 
    const pythonPath = envManager.getPythonPath();
    
    if(!pythonPath || pythonPath === "python"){
      throw new Error('Could not find the Python executable in the virtual environment.');
    }

    let daemonPath = path.join(__dirname, 'python_scripts', 'metakeyai_daemon.py');
    if (!require('fs').existsSync(daemonPath)) {
      daemonPath = path.join(__dirname, '..', 'src', 'python_scripts', 'metakeyai_daemon.py');
    }
    return { command: pythonPath, args: ['-u', daemonPath] };
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
          throw new Error('Python server did not become ready in time.');
        }
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
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
} 