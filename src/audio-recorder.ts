import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { tmpdir } from 'os';
import { join } from 'path';
import { app } from 'electron';
import { UserDataManager } from './user-data-manager';

// Extend EventEmitter to handle events
export class AudioRecorder extends EventEmitter {
  private recordingProcess: ChildProcess | null = null;
  private outputFile: string = '';
  private recordingMethod: 'sox' | 'ffmpeg' | 'powershell' | null = null;
  private isInitialized: boolean = false;
  public isRecording = false;
  private fallbackMethod: 'sox' | 'powershell' | 'ffmpeg' | 'none' = 'none';
  private userDataManager: UserDataManager;
  private audioSettings: any = null;

  constructor() {
    super();
    this.userDataManager = UserDataManager.getInstance();
    this.loadAudioSettings();
    this.initializeRecordingMethod();
  }

  private loadAudioSettings(): void {
    this.audioSettings = this.userDataManager.loadAudioSettings();
    if (this.audioSettings) {
      console.log('🎤 Loaded user audio settings:', this.audioSettings);
    }
  }

  private saveAudioSettings(): void {
    if (this.audioSettings) {
      this.userDataManager.saveAudioSettings(this.audioSettings);
    }
  }

  public setUserAudioDevice(deviceName: string): void {
    if (!this.audioSettings) {
      this.audioSettings = {};
    }
    this.audioSettings.preferredDevice = deviceName;
    this.audioSettings.platform = process.platform;
    this.saveAudioSettings();
    console.log(`🎤 User set preferred audio device: ${deviceName}`);
  }

  public getUserAudioDevice(): string | null {
    if (this.audioSettings && this.audioSettings.platform === process.platform) {
      return this.audioSettings.preferredDevice || null;
    }
    return null;
  }

  private async initializeRecordingMethod(): Promise<void> {
    console.log('🔍 Detecting available audio recording methods...');
    
    // Test methods in order of preference by platform
    let methods;
    
    if (process.platform === 'win32') {
      // Windows: prefer ffmpeg (more reliable) over sox
      methods = [
        { name: 'ffmpeg', test: () => this.testFfmpeg() },
        { name: 'powershell', test: () => this.testPowerShell() },
        { name: 'sox', test: () => this.testSox() }
      ];
    } else {
      // Unix: prefer sox over ffmpeg
      methods = [
        { name: 'sox', test: () => this.testSox() },
        { name: 'ffmpeg', test: () => this.testFfmpeg() }
      ];
    }

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

    // Check if the file actually exists before trying to spawn it
    if (!fs.existsSync(soxPath)) {
      console.log('⚠️ Sox binary path does not exist:', soxPath);
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
          await this.startFFmpegRecording();
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

  private async getAudioDevice(): Promise<string> {
    // First, check if user has configured a device
    const userDevice = this.getUserAudioDevice();
    if (userDevice) {
      console.log(`🎤 Using user-configured device: ${userDevice}`);
      
      // Test if the user device still works
      if (process.platform === 'win32') {
        try {
          await this.runCommand('ffmpeg', ['-f', 'dshow', '-i', `audio="${userDevice}"`, '-t', '0.1', '-f', 'null', '-'], 3000);
          return userDevice;
        } catch (error) {
          console.log(`⚠️ User-configured device "${userDevice}" no longer works, falling back to detection`);
          // Continue to auto-detection
        }
      } else {
        return userDevice; // For Unix systems, trust user configuration
      }
    }

    // Fall back to automatic detection
    if (process.platform === 'win32') {
      return this.getWindowsAudioDevice();
    } else if (process.platform === 'darwin') {
      return this.getMacAudioDevice();
    } else {
      return this.getLinuxAudioDevice();
    }
  }

  private async getWindowsAudioDevice(): Promise<string> {
    // Check if user has configured a specific device
    const userDevice = this.getUserAudioDevice();
    if (userDevice && userDevice !== 'auto' && userDevice !== '') {
      console.log(`🎤 Using user-configured device: ${userDevice}`);
      
      // Test the user-configured device first
      try {
        await this.runCommand('ffmpeg', ['-f', 'dshow', '-i', `audio="${userDevice}"`, '-t', '0.1', '-f', 'null', '-'], 3000);
        console.log(`✅ User device verified: ${userDevice}`);
        return userDevice;
      } catch (testError) {
        console.log(`❌ User device test failed for ${userDevice}: ${testError.message}`);
        console.log('🔄 Falling back to auto-detection...');
        // Continue with auto-detection
      }
    }

    try {
      // Use our improved discovery method that tests devices
      const workingDevices = await this.discoverAudioDevices();
      
      if (workingDevices.length > 0) {
        // Return the first working device
        const selectedDevice = workingDevices[0];
        console.log(`🎤 Auto-selected working device: ${selectedDevice}`);
        return selectedDevice;
      }
      
      // If no devices discovered, try some common fallbacks
      const fallbackNames = [
        'Microphone',
        'Microphone Array', 
        'Built-in Microphone',
        'Internal Microphone'
      ];
      
      for (const name of fallbackNames) {
        try {
          await this.runCommand('ffmpeg', ['-f', 'dshow', '-i', `audio="${name}"`, '-t', '0.1', '-f', 'null', '-'], 3000);
          console.log(`🎤 Verified Windows fallback device: ${name}`);
          return name;
        } catch (e) {
          // Continue to next name
        }
      }
      
      throw new Error('No working audio device found');
    } catch (error) {
      console.log('⚠️ Could not find any working audio device:', error.message);
      throw error; // Re-throw to let caller handle
    }
  }

  private async getMacAudioDevice(): Promise<string> {
    try {
      // macOS: use avfoundation device enumeration
      const result = await this.runCommand('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], 3000);
      const output = result.stderr;
      
      // Look for audio input devices
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('AVFoundation audio devices') || line.includes('[AVFoundation input device @')) {
          const match = line.match(/\[(\d+)\]/);
          if (match) {
            console.log(`🎤 Found macOS audio device index: ${match[1]}`);
            return `:${match[1]}`; // Use :index format for avfoundation
          }
        }
      }
      
      return ':0'; // Default to first audio device
    } catch (error) {
      console.log('⚠️ Could not enumerate macOS audio devices:', error.message);
      return ':0'; // Default fallback
    }
  }

  private async getLinuxAudioDevice(): Promise<string> {
    try {
      // Linux: check ALSA devices
      const result = await this.runCommand('arecord', ['-l'], 3000);
      const output = result.stdout;
      
      if (output.includes('card')) {
        console.log('🎤 Found Linux ALSA audio devices');
        return 'default'; // Use ALSA default
      }
      
      // Fallback to PulseAudio
      try {
        await this.runCommand('pactl', ['list', 'sources', 'short'], 3000);
        console.log('🎤 Using PulseAudio default source');
        return 'default';
      } catch (e) {
        return 'hw:0'; // Hardware device fallback
      }
    } catch (error) {
      console.log('⚠️ Could not enumerate Linux audio devices:', error.message);
      return 'default';
    }
  }

  private async startFFmpegRecording(): Promise<void> {
    console.log('🔧 Using ffmpeg for recording');
    
    let ffmpegArgs: string[];
    
    if (process.platform === 'win32') {
      // Windows: use DirectShow with proper device detection
      const deviceName = await this.getWindowsAudioDevice();
      
      // If no device name (empty string), it means use default/auto
      const audioInput = deviceName ? `audio="${deviceName}"` : 'audio=default';
      
      ffmpegArgs = [
        '-f', 'dshow',
        '-i', audioInput,
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y', // overwrite output file
        this.outputFile
      ];
      
      console.log(`🎤 Windows: Using audio input: ${audioInput}`);
    } else if (process.platform === 'darwin') {
      // macOS: use avfoundation with device detection
      const deviceInput = await this.getMacAudioDevice();
      ffmpegArgs = [
        '-f', 'avfoundation',
        '-i', deviceInput,
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y', // overwrite output file
        this.outputFile
      ];
      
      console.log(`🎤 macOS: Using audio input: ${deviceInput}`);
    } else {
      // Linux: use ALSA/PulseAudio with device detection
      const deviceName = await this.getLinuxAudioDevice();
      ffmpegArgs = [
        '-f', 'alsa',
        '-i', deviceName,
        '-acodec', 'pcm_s16le',
        '-ar', '16000',
        '-ac', '1',
        '-y', // overwrite output file
        this.outputFile
      ];
      
      console.log(`🎤 Linux: Using audio input: ${deviceName}`);
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

  public async discoverAudioDevices(): Promise<string[]> {
    const devices: string[] = [];
    
    try {
      if (process.platform === 'win32') {
        // Discover Windows DirectShow devices - use the exact names as ffmpeg reports them
        const result = await this.runCommand('ffmpeg', ['-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], 5000);
        const output = result.stderr;
        
        const lines = output.split('\n');
        let inAudioSection = false;
        
        for (const line of lines) {
          if (line.includes('DirectShow audio devices')) {
            inAudioSection = true;
            continue;
          }
          if (inAudioSection && line.includes('DirectShow video devices')) {
            break;
          }
          if (inAudioSection && line.includes('"') && !line.includes('Alternative name')) {
            const match = line.match(/"([^"]+)"/);
            if (match) {
              const deviceName = match[1];
              // Only add microphone-related devices, filter out speakers/outputs
              if (deviceName.toLowerCase().includes('mic') || 
                  deviceName.toLowerCase().includes('audio') ||
                  deviceName.toLowerCase().includes('input') ||
                  deviceName.toLowerCase().includes('capture')) {
                devices.push(deviceName);
                console.log(`🎤 Found Windows audio device: ${deviceName}`);
              }
            }
          }
        }
        
        // Test each discovered device to ensure it works
        const workingDevices = [];
        for (const device of devices) {
          try {
            console.log(`🧪 Testing device: ${device}`);
            await this.runCommand('ffmpeg', ['-f', 'dshow', '-i', `audio="${device}"`, '-t', '0.1', '-f', 'null', '-'], 3000);
            workingDevices.push(device);
            console.log(`✅ Device works: ${device}`);
          } catch (testError) {
            console.log(`❌ Device test failed for ${device}: ${testError.message}`);
          }
        }
        
        return workingDevices.length > 0 ? workingDevices : devices; // Use all if none test successful
        
      } else if (process.platform === 'darwin') {
        // Discover macOS AVFoundation devices
        const result = await this.runCommand('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], 3000);
        const output = result.stderr;
        
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('AVFoundation audio devices') || line.includes('[AVFoundation input device @')) {
            const match = line.match(/\[(\d+)\].*?([^[]+)$/);
            if (match) {
              devices.push(`${match[2].trim()} (Index: ${match[1]})`);
            }
          }
        }
      } else {
        // Linux: discover ALSA/PulseAudio devices
        try {
          const alsaResult = await this.runCommand('arecord', ['-l'], 3000);
          const alsaOutput = alsaResult.stdout;
          
          // Parse ALSA device list
          const lines = alsaOutput.split('\n');
          for (const line of lines) {
            if (line.includes('card') && line.includes('device')) {
              const match = line.match(/card (\d+):.*?\[([^\]]+)\]/);
              if (match) {
                devices.push(`${match[2]} (ALSA: hw:${match[1]})`);
              }
            }
          }
        } catch (e) {
          // ALSA not available, try PulseAudio
          try {
            const paResult = await this.runCommand('pactl', ['list', 'sources', 'short'], 3000);
            const paOutput = paResult.stdout;
            
            const lines = paOutput.split('\n');
            for (const line of lines) {
              if (line.trim() && !line.includes('monitor')) {
                const parts = line.split('\t');
                if (parts.length >= 2) {
                  devices.push(`${parts[1]} (PulseAudio)`);
                }
              }
            }
          } catch (e2) {
            devices.push('default');
          }
        }
      }
    } catch (error) {
      console.log('⚠️ Could not discover audio devices:', error.message);
    }
    
    console.log(`🎤 Discovered ${devices.length} audio devices:`, devices);
    return devices;
  }

  public async getAudioDeviceInfo(): Promise<any> {
    const discoveredDevices = await this.discoverAudioDevices();
    const userDevice = this.getUserAudioDevice();
    const currentMethod = this.fallbackMethod;
    
    return {
      discoveredDevices,
      userConfiguredDevice: userDevice,
      currentRecordingMethod: currentMethod,
      platform: process.platform,
      canUserConfigure: true,
      needsConfiguration: !userDevice && discoveredDevices.length > 1
    };
  }
} 