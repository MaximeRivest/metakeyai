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

  constructor() {
    super();
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
      // In production, use the binary from the packaged resources - Note: Electron Forge copies our 'resources' folder into the app's resources directory
      return join(process.resourcesPath, 'resources', 'binaries', platform === 'win32' ? 'windows' : platform === 'darwin' ? 'macos' : 'linux', soxFilename);
    }
  }

  start(): void {
    console.log('🎙️ AudioRecorder.start() called');
    
    if (this.isRecording) {
      console.warn('⚠️ Recording is already in progress.');
      return;
    }

    this.filePath = join(tmpdir(), `recording_${Date.now()}.wav`);
    console.log('📁 Recording file path:', this.filePath);

    const soxPath = this.getSoxPath();
    console.log('🔧 Using sox binary at:', soxPath);

    // Check if sox binary exists
    if (!fs.existsSync(soxPath)) {
      const error = new Error(`Sox binary not found at: ${soxPath}`);
      console.error('❌ Sox binary missing:', error.message);
      this.emit('error', error);
      return;
    }

    // Use sox directly with child_process
    const soxArgs = [
      '-d', // default input device
      '-t', 'wav', // output format
      this.filePath,
      'rate', '16000', // sample rate
      'channels', '1' // mono
    ];
    
    console.log('🔧 Starting sox with args:', soxArgs);
    this.recording = spawn(soxPath, soxArgs);

    if (this.recording.stderr) {
      this.recording.stderr.on('data', (data) => {
        console.log('📻 Sox stderr:', data.toString());
      });
    }

    this.recording.on('error', (err: any) => {
      console.error('❌ Recording error:', err);
      this.emit('error', err);
      this.isRecording = false;
      this.cleanUp();
    });

    this.recording.on('close', (code) => {
      console.log('🔚 Sox process exited with code:', code);
      if (this.isRecording) { // Check if it was manually stopped
        console.log('✅ Finished writing audio to file:', this.filePath);
        if (this.filePath) {
          this.emit('finished', this.filePath);
        }
        this.isRecording = false;
        this.cleanUp();
      }
    });
      
    this.isRecording = true;
    console.log('🎤 Recording started, sox PID:', this.recording.pid);
    
    // Emit fake audio data for visualizer (since sox doesn't output to stdout when recording to file)
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
    
    console.log('🔪 Sending SIGTERM to sox process PID:', this.recording.pid);
    // Send SIGTERM to gracefully stop sox
    this.recording.kill('SIGTERM');
    console.log('🎤 Recording stop signal sent');
  }
  
  private cleanUp() {
    this.recording = null;
  }
} 