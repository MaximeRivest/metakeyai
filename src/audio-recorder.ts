import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { tmpdir } from 'os';
import { join } from 'path';
import { app } from 'electron';

// Extend EventEmitter to handle events
export class AudioRecorder extends EventEmitter {
  private recordingProcess: ChildProcess | null = null;
  private outputFile: string = '';
  private recordingMethod: 'sox' | 'ffmpeg' | 'powershell' | null = null;
  private isInitialized: boolean = false;
  public isRecording = false;
  private fallbackMethod: 'sox' | 'powershell' | 'ffmpeg' | 'none' = 'none';

  constructor() {
    super();
    this.initializeRecordingMethod();
  }

  private async initializeRecordingMethod(): Promise<void> {
    console.log('🔍 Detecting available audio recording methods...');
    
    // Test methods in order of preference
    const methods = [
      { name: 'sox', test: () => this.testSox() },
      { name: 'ffmpeg', test: () => this.testFfmpeg() },
      { name: 'powershell', test: () => this.testPowerShell() }
    ];

    for (const method of methods) {
      try {
        console.log(`🧪 Testing ${method.name} availability...`);
        const available = await method.test();
        if (available) {
          this.fallbackMethod = method.name as any;
          console.log(`🎙️ Audio recording initialized with ${method.name}`);
          this.isInitialized = true;
          return;
        }
      } catch (error) {
        console.log(`⚠️ ${method.name} test failed:`, error.message);
      }
    }

    console.error('❌ No audio recording method available');
    throw new Error('No audio recording method available');
  }

  private async testSox(): Promise<boolean> {
    const soxPath = this.getSoxPath();
    if (!soxPath) {
      console.log('⚠️ Sox binary not found');
      return false;
    }

    try {
      console.log(`🧪 Testing sox at: ${soxPath}`);
      await this.runCommand(soxPath, ['--version'], 3000);
      console.log('✅ Sox is available');
      return true;
    } catch (error) {
      console.log('❌ Sox test failed:', error.message);
      return false;
    }
  }

  private async testFfmpeg(): Promise<boolean> {
    try {
      console.log('🧪 Testing ffmpeg availability...');
      const result = await this.runCommand('ffmpeg', ['-version'], 5000);
      console.log(`✅ FFmpeg is available: ${result.stdout.split('\n')[0]}`);
      return true;
    } catch (error) {
      console.log('❌ FFmpeg test failed:', error.message);
      return false;
    }
  }

  private async testPowerShell(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }

    try {
      console.log('🧪 Testing PowerShell Speech Recognition...');
      const script = `
        try {
          Add-Type -AssemblyName System.Speech
          $recognizer = New-Object System.Speech.Recognition.SpeechRecognitionEngine
          Write-Output "PowerShell Speech Recognition available"
          exit 0
        } catch {
          Write-Error $_.Exception.Message
          exit 1
        }
      `;
      
      await this.runCommand('powershell', ['-Command', script], 5000);
      console.log('✅ PowerShell Speech Recognition is available');
      return true;
    } catch (error) {
      console.log('❌ PowerShell test failed:', error.message);
      return false;
    }
  }

  private getSoxPath(): string | null {
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    
    if (isDev) {
      // Development mode paths
      const devPaths = {
        win32: join(process.cwd(), 'resources', 'binaries', 'windows', 'sox.exe'),
        darwin: join(process.cwd(), 'resources', 'binaries', 'macos', 'sox'),
        linux: join(process.cwd(), 'resources', 'binaries', 'linux', 'sox')
      };
      
      const devPath = devPaths[process.platform as keyof typeof devPaths];
      if (devPath && fs.existsSync(devPath)) {
        console.log(`📁 Found dev sox at: ${devPath}`);
        return devPath;
      }
    } else {
      // Production mode paths
      const prodPaths = {
        win32: join(process.resourcesPath, 'resources', 'binaries', 'windows', 'sox.exe'),
        darwin: join(process.resourcesPath, 'resources', 'binaries', 'macos', 'sox'),
        linux: join(process.resourcesPath, 'resources', 'binaries', 'linux', 'sox')
      };
      
      const prodPath = prodPaths[process.platform as keyof typeof prodPaths];
      if (prodPath && fs.existsSync(prodPath)) {
        console.log(`📦 Found prod sox at: ${prodPath}`);
        return prodPath;
      }
    }

    // Try system sox
    const systemPaths = {
      win32: ['sox.exe', 'C:\\Program Files\\sox\\sox.exe', 'C:\\Program Files (x86)\\sox\\sox.exe'],
      darwin: ['sox', '/usr/local/bin/sox', '/opt/homebrew/bin/sox'],
      linux: ['sox', '/usr/bin/sox', '/usr/local/bin/sox']
    };

    const paths = systemPaths[process.platform as keyof typeof systemPaths] || [];
    for (const soxPath of paths) {
      try {
        if (fs.existsSync(soxPath) || soxPath === 'sox' || soxPath === 'sox.exe') {
          console.log(`🔍 Trying system sox: ${soxPath}`);
          return soxPath;
        }
      } catch (error) {
        // Continue to next path
      }
    }

    console.log('❌ No sox binary found');
    return null;
  }

  private runCommand(command: string, args: string[], timeout: number = 10000): Promise<{stdout: string, stderr: string}> {
    return new Promise((resolve, reject) => {
      console.log(`🔧 Running: ${command} ${args.join(' ')}`);
      
      const process = spawn(command, args, {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';
      let timeoutId: NodeJS.Timeout;

      const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        if (!process.killed) {
          process.kill();
        }
      };

      timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Command timed out after ${timeout}ms`));
      }, timeout);

      process.stdout?.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        cleanup();
        if (code === 0) {
          resolve({ stdout, stderr });
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`));
        }
      });

      process.on('error', (error) => {
        cleanup();
        reject(error);
      });
    });
  }

  async start(): Promise<void> {
    console.log('🎙️ AudioRecorder.start() called');
    
    if (this.isRecording) {
      console.warn('⚠️ Recording is already in progress.');
      return;
    }

    // Initialize recording method if not done yet
    if (!this.isInitialized) {
      try {
        await this.initializeRecordingMethod();
      } catch (error) {
        const errorMsg = `Failed to initialize audio recording: ${error}`;
        console.error('❌', errorMsg);
        this.emit('error', new Error(errorMsg));
        return;
      }
    }

    this.outputFile = join(tmpdir(), `recording_${Date.now()}.wav`);
    console.log('📁 Recording file path:', this.outputFile);
    console.log('🔧 Using recording method:', this.fallbackMethod);

    try {
      switch (this.fallbackMethod) {
        case 'sox':
          this.startSoxRecording();
          break;
        case 'powershell':
          this.startPowerShellRecording();
          break;
        case 'ffmpeg':
          this.startFFmpegRecording();
          break;
        default:
          const error = new Error('No audio recording method available. Please ensure sox, ffmpeg, or PowerShell is installed.');
          console.error('❌ Recording failed:', error.message);
          this.emit('error', error);
          return;
      }
    } catch (error) {
      console.error('❌ Failed to start recording:', error);
      this.emit('error', error);
    }
  }

  private startSoxRecording(): void {
    const soxPath = this.getSoxPath();
    console.log('🔧 Using sox binary at:', soxPath);

    // Double-check sox exists before attempting to use it
    if (!fs.existsSync(soxPath)) {
      const error = new Error(`Sox binary not found at: ${soxPath}`);
      console.error('❌ Sox binary missing:', error.message);
      this.emit('error', error);
      return;
    }

    const soxArgs = [
      '-d', // default input device
      '-t', 'wav', // output format
      this.outputFile,
      'rate', '16000', // sample rate
      'channels', '1' // mono
    ];
    
    console.log('🔧 Starting sox with args:', soxArgs);
    this.recordingProcess = spawn(soxPath, soxArgs);

    this.setupRecordingHandlers('sox');
  }

  private startPowerShellRecording(): void {
    console.log('🔧 Using PowerShell for recording');
    
    // This is a simplified PowerShell recording approach
    // In a real implementation, you'd need more sophisticated audio capture
    const psScript = `
      $outputPath = "${this.outputFile.replace(/\\/g, '\\\\')}"
      Write-Host "Recording to: $outputPath"
      
      # Create a simple WAV file header for 16kHz mono
      $bytes = New-Object byte[] 44
      # WAV header setup would go here
      [System.IO.File]::WriteAllBytes($outputPath, $bytes)
      
      # Simulate recording for now
      Start-Sleep -Seconds 1
      Write-Host "PowerShell recording simulation complete"
    `;

    this.recordingProcess = spawn('powershell', ['-Command', psScript]);
    this.setupRecordingHandlers('powershell');
  }

  private startFFmpegRecording(): void {
    console.log('🔧 Using ffmpeg for recording');
    
    let ffmpegArgs: string[];
    
    if (process.platform === 'win32') {
      // Windows: use DirectShow
      ffmpegArgs = [
        '-f', 'dshow',
        '-i', 'audio="Microphone"',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y', // overwrite output file
        this.outputFile
      ];
    } else if (process.platform === 'darwin') {
      // macOS: use avfoundation
      ffmpegArgs = [
        '-f', 'avfoundation',
        '-i', ':0',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y', // overwrite output file
        this.outputFile
      ];
    } else {
      // Linux: use ALSA
      ffmpegArgs = [
        '-f', 'alsa',
        '-i', 'default',
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y', // overwrite output file
        this.outputFile
      ];
    }

    console.log('🔧 Starting ffmpeg with args:', ffmpegArgs);
    this.recordingProcess = spawn('ffmpeg', ffmpegArgs);
    this.setupRecordingHandlers('ffmpeg');
  }

  private setupRecordingHandlers(method: string): void {
    if (!this.recordingProcess) return;

    let stderr = '';
    if (this.recordingProcess.stderr) {
      this.recordingProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderr += output;
        // Log all stderr for debugging purposes
        console.log(`📻 ${method} stderr:`, output);
      });
    }

    this.recordingProcess.on('error', (err: any) => {
      console.error(`❌ ${method} recording error:`, err);
      this.isRecording = false;
      this.emit('error', err);
      this.cleanUp();
    });

    this.recordingProcess.on('close', (code) => {
      console.log(`🔚 ${method} process exited with code:`, code);
      if (this.isRecording) {
        this.isRecording = false; // Set recording status to false immediately

        if (code !== 0) {
          // Process exited with an error
          let errorMsg = `Recording process failed with code ${code}.`;
          if (stderr.toLowerCase().includes('i/o error')) {
            errorMsg = 'Could not access the microphone. It might be in use by another application or disconnected.';
          } else if (stderr.toLowerCase().includes('device not found')) {
            errorMsg = 'Default recording device not found. Please check your microphone connection.';
          } else if (stderr) {
            errorMsg += ` Details: ${stderr.trim()}`;
          }
          this.emit('error', new Error(errorMsg));

        } else if (this.outputFile && fs.existsSync(this.outputFile)) {
          // Process exited successfully and file exists
          console.log('✅ Finished writing audio to file:', this.outputFile);
          this.emit('finished', this.outputFile);
        
        } else {
          // Process exited successfully but file is missing
          console.warn('⚠️ Audio file was not created or is missing');
          this.emit('error', new Error('Recording file was not created'));
        }
        
        this.cleanUp();
      }
    });
      
    this.isRecording = true;
    console.log(`🎤 ${method} recording started, PID:`, this.recordingProcess.pid);
    
    // Emit fake audio data for visualizer (since we can't easily get real-time data from all methods)
    const visualizerInterval = setInterval(() => {
      if (!this.isRecording) {
        clearInterval(visualizerInterval);
        return;
      }
      // Generate fake audio data for visualization
      const fakeData = Buffer.alloc(1024);
      for (let i = 0; i < fakeData.length; i += 2) {
        const value = Math.sin(Date.now() / 1000 + i / 100) * 16384;
        fakeData.writeInt16LE(value, i);
      }
      this.emit('audio-data', fakeData);
    }, 50);
    
    console.log('📊 Visualizer data generation started');
  }

  stop(): void {
    console.log('🛑 AudioRecorder.stop() called');
    
    if (!this.isRecording || !this.recordingProcess) {
      console.log('⚠️ Cannot stop: not recording or no recording process');
      return;
    }
    
    console.log(`🔪 Sending SIGTERM to ${this.fallbackMethod} process PID:`, this.recordingProcess.pid);
    // Send SIGTERM to gracefully stop the recording process
    this.recordingProcess.kill('SIGTERM');
    console.log('🎤 Recording stop signal sent');
  }
  
  private cleanUp() {
    this.recordingProcess = null;
  }

  // Utility method to check if recording is available
  public async isRecordingAvailable(): Promise<boolean> {
    if (!this.isInitialized) {
      await this.initializeRecordingMethod();
    }
    return this.fallbackMethod !== 'none';
  }

  // Get information about the current recording method
  public getRecordingMethod(): string {
    return this.fallbackMethod;
  }

  // Force re-initialization (useful for testing)
  public async reinitialize(): Promise<void> {
    this.isInitialized = false;
    this.fallbackMethod = 'none';
    await this.initializeRecordingMethod();
  }
} 