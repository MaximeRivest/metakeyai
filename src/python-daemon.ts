import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import readline from 'readline';
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

// Singleton wrapper around the background Python daemon
export class PythonDaemon extends EventEmitter {
  private static instance: PythonDaemon | null = null;
  private proc: ChildProcessWithoutNullStreams | null = null;
  private reqSeq = 0;
  private pending: Map<number, { resolve: (data: any) => void; reject: (err: Error) => void }> = new Map();
  private ready = false;

  static async getInstance(): Promise<PythonDaemon> {
    if (!this.instance) {
      this.instance = new PythonDaemon();
      await this.instance.start();
    }
    return this.instance;
  }

  private async start(): Promise<void> {
    if (this.proc) return; // already started

    // Ensure Python env is ready – reuse the global env manager so this only runs once
    const envManager = new PythonEnvironmentManager();
    const envInfo = await envManager.initialize();
    const pythonPath = envInfo.pythonPath;

    // Resolve daemon script path for both dev and packaged
    let daemonPath = path.join(__dirname, 'python_scripts', 'metakeyai_daemon.py');
    if (!require('fs').existsSync(daemonPath)) {
      // Dev path
      daemonPath = path.join(__dirname, '..', 'src', 'python_scripts', 'metakeyai_daemon.py');
    }

    console.log('🚀 Spawning Python daemon:', pythonPath, daemonPath);

    this.proc = spawn(pythonPath, ['-u', daemonPath], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.proc.stderr.on('data', (data) => {
      console.error('🐍 daemon stderr:', data.toString());
    });

    this.proc.on('exit', (code, signal) => {
      console.error(`🐍 Python daemon exited (code ${code}, signal ${signal})`);
      this.ready = false;
      // Reject all pending promises
      for (const { reject } of this.pending.values()) {
        reject(new Error('Python daemon exited'));
      }
      this.pending.clear();
    });

    const rl = readline.createInterface({
      input: this.proc.stdout
    });

    rl.on('line', (line) => {
      try {
        const msg: DaemonResponse = JSON.parse(line);
        const handler = this.pending.get(msg.id);
        if (handler) {
          this.pending.delete(msg.id);
          if (msg.error) {
            handler.reject(new Error(msg.error));
          } else {
            handler.resolve(msg.result);
          }
        }
      } catch (err) {
        console.error('🐍 Failed to parse daemon line:', line);
      }
    });

    // Wait for a ping-pong to confirm readiness
    const pong = await this.send('ping', {});
    if (pong !== 'pong') {
      throw new Error('Python daemon did not respond to ping');
    }
    this.ready = true;
    console.log('✅ Python daemon is ready');
  }

  private send(cmd: string, payload: Record<string, any>): Promise<any> {
    if (!this.proc) throw new Error('Python daemon not running');
    const id = this.reqSeq++;
    const msg: DaemonRequest = { id, cmd, ...payload };
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
    return new Promise<any>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      // 30-second default timeout
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`Python daemon request timeout for cmd ${cmd}`));
        }
      }, 30000);
    });
  }

  async castSpell(spellId: string, scriptFile: string, input?: string): Promise<any> {
    return this.send('cast', { spellId, scriptFile, input });
  }

  // expose simple utility
  async listSpells(): Promise<any> {
    return this.send('list_spells', {});
  }

  async updateProviders(providers: any): Promise<void> {
    await this.send('update_providers', { providers });
  }

  async updateEnv(envVars: Record<string, string>): Promise<any> {
    return this.send('update_env', { env: envVars });
  }

  // Quick Edit text processing via daemon
  async quickEdit(text: string): Promise<string> {
    return this.send('quick_edit', { text });
  }
} 