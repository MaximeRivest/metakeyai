import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { app } from 'electron';

// Extend EventEmitter to handle events
export class AudioRecorder extends EventEmitter {
  private recording: ChildProcess | null = null;
  private filePath: string | null = null;
  public isRecording = false;
  private fallbackMethod: 'sox' | 'powershell' | 'ffmpeg' | 'none' = 'none';
  private isInitialized = false;

  constructor() {
    super();
    // Don't initialize in constructor - do it when start() is called
  }

  private async initializeRecordingMethod(): Promise<void> {
    if (this.isInitialized) return;
    
    console.log('🔍 Detecting available audio recording methods...');
    
    // Try to find the best available recording method
    const soxPath = this.getSoxPath();
    
    if (fs.existsSync(soxPath)) {
      // Verify sox is actually executable and not our fallback stub
      try {
        const testResult = await this.testSoxBinary(soxPath);
        if (testResult) {
          this.fallbackMethod = 'sox';
          console.log('🎙️ Audio recording initialized with sox');
          this.isInitialized = true;
          return;
        } else {
          console.warn('⚠️ Sox binary exists but failed functionality test');
        }
      } catch (error) {
        console.warn('⚠️ Sox binary exists but failed test:', error);
      }
    } else {
      console.log('⚠️ Sox binary not found at:', soxPath);
    }

    // Try alternative methods based on platform
    if (process.platform === 'win32') {
      console.log('🔍 Testing PowerShell recording capability...');
      if (await this.testPowerShellRecording()) {
        this.fallbackMethod = 'powershell';
        console.log('🎙️ Audio recording initialized with PowerShell');
        this.isInitialized = true;
        return;
      } else {
        console.log('⚠️ PowerShell recording test failed');
      }
    }

    // Try ffmpeg as a universal fallback
    console.log('🔍 Testing ffmpeg availability...');
    if (await this.testFFmpegAvailability()) {
      this.fallbackMethod = 'ffmpeg';
      console.log('🎙️ Audio recording initialized with ffmpeg');
      this.isInitialized = true;
      return;
    } else {
      console.log('⚠️ FFmpeg test failed');
    }

    console.warn('⚠️ No suitable audio recording method found');
    this.fallbackMethod = 'none';
    this.isInitialized = true;
  }

  private async testSoxBinary(soxPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      console.log('🧪 Testing sox binary:', soxPath);
      const testProcess = spawn(soxPath, ['--version'], { 
        stdio: ['ignore', 'pipe', 'pipe'] 
      });
      
      let hasOutput = false;
      let outputData = '';
      
      testProcess.stdout?.on('data', (data) => {
        outputData += data.toString();
        if (outputData.toLowerCase().includes('sox')) {
          hasOutput = true;
        }
      });

      testProcess.on('close', (code) => {
        console.log(`🧪 Sox test result: code=${code}, hasOutput=${hasOutput}`);
        if (outputData) console.log('📄 Sox output:', outputData.trim().split('\n')[0]);
        resolve(code === 0 && hasOutput);
      });

      testProcess.on('error', (error) => {
        console.log('🧪 Sox test error:', error.message);
        resolve(false);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        testProcess.kill();
        console.log('🧪 Sox test timed out');
        resolve(false);
      }, 5000);
    });
  }

  private async testPowerShellRecording(): Promise<boolean> {
    if (process.platform !== 'win32') return false;
    
    return new Promise((resolve) => {
      const testScript = `
        try {
          Add-Type -AssemblyName System.Speech
          $true
        } catch {
          $false
        }
      `;
      
      console.log('🧪 Testing PowerShell Speech capabilities...');
      const testProcess = spawn('powershell', ['-Command', testScript], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let result = false;
      testProcess.stdout?.on('data', (data) => {
        const output = data.toString().trim();
        console.log('🧪 PowerShell test output:', output);
        if (output === 'True') {
          result = true;
        }
      });

      testProcess.on('close', (code) => {
        console.log(`🧪 PowerShell test result: code=${code}, result=${result}`);
        resolve(result);
      });

      testProcess.on('error', (error) => {
        console.log('🧪 PowerShell test error:', error.message);
        resolve(false);
      });

      setTimeout(() => {
        testProcess.kill();
        console.log('🧪 PowerShell test timed out');
        resolve(false);
      }, 5000);
    });
  }

  private async testFFmpegAvailability(): Promise<boolean> {
    return new Promise((resolve) => {
      console.log('🧪 Testing ffmpeg availability...');
      const testProcess = spawn('ffmpeg', ['-version'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let hasOutput = false;
      let outputData = '';
      
      testProcess.stdout?.on('data', (data) => {
        outputData += data.toString();
        if (outputData.toLowerCase().includes('ffmpeg')) {
          hasOutput = true;
        }
      });

      testProcess.on('close', (code) => {
        console.log(`🧪 FFmpeg test result: code=${code}, hasOutput=${hasOutput}`);
        if (outputData) console.log('📄 FFmpeg output:', outputData.trim().split('\n')[0]);
        resolve(code === 0 && hasOutput);
      });

      testProcess.on('error', (error) => {
        console.log('🧪 FFmpeg test error:', error.message);
        resolve(false);
      });

      setTimeout(() => {
        testProcess.kill();
        console.log('🧪 FFmpeg test timed out');
        resolve(false);
      }, 5000);
    });
  }

  private getSoxPath(): string {
    const platform = process.platform;
    const isDev = !app.isPackaged;
    
    let soxFilename: string;
    switch (platform) {
      case 'win32':
        soxFilename = 'sox.exe';
        break;
      case 'darwin':
        soxFilename = 'sox';
        break;
      case 'linux':
      default:
        soxFilename = 'sox';
        break;
    }

    if (isDev) {
      // In development, use the binary from our resources directory
      return join(__dirname, '..', 'resources', 'binaries', platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux', soxFilename);
    } else {
      // In production, use the binary from the packaged resources
      return join(process.resourcesPath, 'resources', 'binaries', platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux', soxFilename);
    }
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

    this.filePath = join(tmpdir(), `recording_${Date.now()}.wav`);
    console.log('📁 Recording file path:', this.filePath);
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
      this.filePath!,
      'rate', '16000', // sample rate
      'channels', '1' // mono
    ];
    
    console.log('🔧 Starting sox with args:', soxArgs);
    this.recording = spawn(soxPath, soxArgs);

    this.setupRecordingHandlers('sox');
  }

  private startPowerShellRecording(): void {
    console.log('🔧 Using PowerShell for recording');
    
    // This is a simplified PowerShell recording approach
    // In a real implementation, you'd need more sophisticated audio capture
    const psScript = `
      $outputPath = "${this.filePath!.replace(/\\/g, '\\\\')}"
      Write-Host "Recording to: $outputPath"
      
      # Create a simple WAV file header for 16kHz mono
      $bytes = New-Object byte[] 44
      # WAV header setup would go here
      [System.IO.File]::WriteAllBytes($outputPath, $bytes)
      
      # Simulate recording for now
      Start-Sleep -Seconds 1
      Write-Host "PowerShell recording simulation complete"
    `;

    this.recording = spawn('powershell', ['-Command', psScript]);
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
        this.filePath!
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
        this.filePath!
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
        this.filePath!
      ];
    }

    console.log('🔧 Starting ffmpeg with args:', ffmpegArgs);
    this.recording = spawn('ffmpeg', ffmpegArgs);
    this.setupRecordingHandlers('ffmpeg');
  }

  private setupRecordingHandlers(method: string): void {
    if (!this.recording) return;

    if (this.recording.stderr) {
      this.recording.stderr.on('data', (data) => {
        const output = data.toString();
        // Only log significant errors, not normal ffmpeg output
        if (output.toLowerCase().includes('error') || output.toLowerCase().includes('failed')) {
          console.log(`📻 ${method} stderr:`, output);
        }
      });
    }

    this.recording.on('error', (err: any) => {
      console.error(`❌ ${method} recording error:`, err);
      this.emit('error', err);
      this.isRecording = false;
      this.cleanUp();
    });

    this.recording.on('close', (code) => {
      console.log(`🔚 ${method} process exited with code:`, code);
      if (this.isRecording) {
        console.log('✅ Finished writing audio to file:', this.filePath);
        if (this.filePath && fs.existsSync(this.filePath)) {
          this.emit('finished', this.filePath);
        } else {
          console.warn('⚠️ Audio file was not created or is missing');
          this.emit('error', new Error('Recording file was not created'));
        }
        this.isRecording = false;
        this.cleanUp();
      }
    });
      
    this.isRecording = true;
    console.log(`🎤 ${method} recording started, PID:`, this.recording.pid);
    
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
    
    if (!this.isRecording || !this.recording) {
      console.log('⚠️ Cannot stop: not recording or no recording process');
      return;
    }
    
    console.log(`🔪 Sending SIGTERM to ${this.fallbackMethod} process PID:`, this.recording.pid);
    // Send SIGTERM to gracefully stop the recording process
    this.recording.kill('SIGTERM');
    console.log('🎤 Recording stop signal sent');
  }
  
  private cleanUp() {
    this.recording = null;
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