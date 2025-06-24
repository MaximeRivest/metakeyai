import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';

export class AudioPlayer extends EventEmitter {
  private static instance: AudioPlayer | null = null;
  private static cachedPlaybackMethod: 'ffplay' | 'vlc' | 'powershell' | 'windows-media' | 'sox' | null = null;
  private static methodInitialized = false;
  
  private currentProcess: ChildProcess | null = null;
  private playbackMethod: 'ffplay' | 'vlc' | 'powershell' | 'windows-media' | 'sox' | null = null;
  private isPlaying = false;

  constructor() {
    super();
    // Don't initialize in constructor - do it lazily in play()
    this.playbackMethod = AudioPlayer.cachedPlaybackMethod;
  }

  /**
   * Get singleton instance for better performance
   */
  public static getInstance(): AudioPlayer {
    if (!AudioPlayer.instance) {
      AudioPlayer.instance = new AudioPlayer();
    }
    return AudioPlayer.instance;
  }

  private async initializePlaybackMethod(): Promise<void> {
    // Return cached result if already initialized
    if (AudioPlayer.methodInitialized && AudioPlayer.cachedPlaybackMethod) {
      this.playbackMethod = AudioPlayer.cachedPlaybackMethod;
      return;
    }

    console.log('🔍 Detecting available audio playback methods...');
    
    // Test methods in order of preference for each platform
    // FFplay and VLC handle WebM/Opus better than sox
    const methods = process.platform === 'win32' ? [
      { name: 'ffplay', test: () => this.testFfplay() },
      { name: 'vlc', test: () => this.testVlc() },
      { name: 'powershell', test: () => this.testPowerShellPlayback() },
      { name: 'windows-media', test: () => this.testWindowsMediaPlayer() },
      { name: 'sox', test: () => this.testSox() }
    ] : [
      { name: 'ffplay', test: () => this.testFfplay() },
      { name: 'vlc', test: () => this.testVlc() },
      { name: 'sox', test: () => this.testSox() }
    ];

    for (const method of methods) {
      try {
        console.log(`🧪 Testing ${method.name} playback availability...`);
        const available = await method.test();
        if (available) {
          this.playbackMethod = method.name as any;
          // Cache the result for future instances
          AudioPlayer.cachedPlaybackMethod = this.playbackMethod;
          AudioPlayer.methodInitialized = true;
          console.log(`🔊 Audio playback initialized with ${method.name}`);
          return;
        }
      } catch (error) {
        console.log(`⚠️ ${method.name} playback test failed:`, error.message);
      }
    }

    console.error('❌ No audio playback method available');
    AudioPlayer.methodInitialized = true; // Mark as attempted even if failed
    throw new Error('No audio playback method available');
  }

  private async testPowerShellPlayback(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }

    try {
      console.log('🧪 Testing PowerShell MediaPlayer...');
      
      // First try our custom audio handler
      const audioHandler = this.getWindowsAudioHandler();
      if (audioHandler) {
        console.log('🧪 Testing custom Windows audio handler...');
        await this.runCommand('powershell', ['-ExecutionPolicy', 'Bypass', '-File', audioHandler, '-Action', 'test'], 5000);
        console.log('✅ Custom Windows audio handler is available');
        return true;
      }
      
      // Fallback to basic PowerShell MediaPlayer test
      const script = `
        try {
          Add-Type -AssemblyName PresentationCore
          $player = New-Object System.Windows.Media.MediaPlayer
          Write-Output "PowerShell MediaPlayer available"
          exit 0
        } catch {
          Write-Error $_.Exception.Message
          exit 1
        }
      `;
      
      await this.runCommand('powershell', ['-Command', script], 5000);
      console.log('✅ PowerShell MediaPlayer is available');
      return true;
    } catch (error) {
      console.log('❌ PowerShell MediaPlayer test failed:', error.message);
      return false;
    }
  }

  private async testWindowsMediaPlayer(): Promise<boolean> {
    if (process.platform !== 'win32') {
      return false;
    }

    try {
      console.log('🧪 Testing Windows Media Player...');
      const wmplayerPaths = [
        'C:\\Program Files\\Windows Media Player\\wmplayer.exe',
        'C:\\Program Files (x86)\\Windows Media Player\\wmplayer.exe'
      ];

      for (const wmplayerPath of wmplayerPaths) {
        if (fs.existsSync(wmplayerPath)) {
          console.log(`✅ Found Windows Media Player at: ${wmplayerPath}`);
          return true;
        }
      }

      // Try system PATH
      await this.runCommand('wmplayer', ['/help'], 3000);
      console.log('✅ Windows Media Player is available in PATH');
      return true;
    } catch (error) {
      console.log('❌ Windows Media Player test failed:', error.message);
      return false;
    }
  }

  private async testFfplay(): Promise<boolean> {
    try {
      console.log('🧪 Testing ffplay availability...');
      await this.runCommand('ffplay', ['-version'], 3000);
      console.log('✅ ffplay is available');
      return true;
    } catch (error) {
      console.log('❌ ffplay test failed:', error.message);
      return false;
    }
  }

  private async testVlc(): Promise<boolean> {
    try {
      console.log('🧪 Testing VLC availability...');
      const vlcCommands = process.platform === 'win32' ? 
        ['vlc', 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'] :
        ['vlc', 'cvlc'];

      for (const vlcCmd of vlcCommands) {
        try {
          if (process.platform === 'win32' && vlcCmd.includes(':\\')) {
            if (fs.existsSync(vlcCmd)) {
              console.log(`✅ Found VLC at: ${vlcCmd}`);
              return true;
            }
          } else {
            await this.runCommand(vlcCmd, ['--version'], 3000);
            console.log(`✅ VLC is available: ${vlcCmd}`);
            return true;
          }
        } catch (error) {
          // Continue to next VLC command
        }
      }
      
      return false;
    } catch (error) {
      console.log('❌ VLC test failed:', error.message);
      return false;
    }
  }

  private async testSox(): Promise<boolean> {
    try {
      console.log('🧪 Testing sox play availability...');
      const soxPath = this.getSoxPath();
      if (!soxPath) {
        return false;
      }
      
      await this.runCommand(soxPath, ['--version'], 3000);
      console.log('✅ sox is available');
      return true;
    } catch (error) {
      console.log('❌ sox test failed:', error.message);
      return false;
    }
  }

  private getSoxPath(): string | null {
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    
    if (isDev) {
      // Development mode paths
      const devPaths = {
        win32: path.join(process.cwd(), 'resources', 'binaries', 'windows', 'sox.exe'),
        darwin: path.join(process.cwd(), 'resources', 'binaries', 'macos', 'sox'),
        linux: path.join(process.cwd(), 'resources', 'binaries', 'linux', 'sox')
      };
      
      const devPath = devPaths[process.platform as keyof typeof devPaths];
      if (devPath && fs.existsSync(devPath)) {
        return devPath;
      }
    } else {
      // Production mode paths
      const prodPaths = {
        win32: path.join(process.resourcesPath, 'resources', 'binaries', 'windows', 'sox.exe'),
        darwin: path.join(process.resourcesPath, 'resources', 'binaries', 'macos', 'sox'),
        linux: path.join(process.resourcesPath, 'resources', 'binaries', 'linux', 'sox')
      };
      
      const prodPath = prodPaths[process.platform as keyof typeof prodPaths];
      if (prodPath && fs.existsSync(prodPath)) {
        return prodPath;
      }
    }

    // Try system sox
    return 'sox';
  }

  private getWindowsAudioHandler(): string | null {
    const isDev = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
    
    if (isDev) {
      const devPath = path.join(process.cwd(), 'resources', 'binaries', 'windows', 'audio-handler.ps1');
      if (fs.existsSync(devPath)) {
        return devPath;
      }
    } else {
      const prodPath = path.join(process.resourcesPath, 'resources', 'binaries', 'windows', 'audio-handler.ps1');
      if (fs.existsSync(prodPath)) {
        return prodPath;
      }
    }
    
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

  async play(filePath: string): Promise<void> {
    console.log('🔊 AudioPlayer.play() called with file:', filePath);
    
    if (this.isPlaying) {
      console.log('⚠️ Already playing audio, stopping current playback');
      this.stop();
    }

    // Only initialize if we don't have a cached method
    if (!this.playbackMethod) {
      await this.initializePlaybackMethod();
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error('❌ Audio file does not exist:', filePath);
      this.emit('error', new Error(`Audio file not found: ${filePath}`));
      return;
    }

    const fileStats = fs.statSync(filePath);
    console.log('📊 Audio file stats:', {
      size: fileStats.size,
      sizeKB: Math.round(fileStats.size / 1024),
    });

    console.log(`🔊 Playing audio file: ${filePath} using ${this.playbackMethod}`);

    // Check if file is WebM and playback method is sox (which doesn't support WebM)
    const isWebM = filePath.toLowerCase().endsWith('.webm');
    if (isWebM && this.playbackMethod === 'sox') {
      console.log('⚠️ WebM file detected with sox - will try other methods first');
      
      // Try alternative methods for WebM
      const webmMethods = ['ffplay', 'vlc', 'powershell'];
      for (const method of webmMethods) {
        try {
          console.log(`🧪 Trying ${method} for WebM playback...`);
          if (method === 'ffplay' && await this.testFfplay()) {
            await this.playWithFfplay(filePath);
            return;
          } else if (method === 'vlc' && await this.testVlc()) {
            await this.playWithVlc(filePath);
            return;
          } else if (method === 'powershell' && process.platform === 'win32' && await this.testPowerShellPlayback()) {
            await this.playWithPowerShell(filePath);
            return;
          }
        } catch (error) {
          console.log(`❌ ${method} failed for WebM:`, error.message);
        }
      }
      
      // If all else fails, inform about the limitation
      throw new Error('WebM files are not supported by sox. Please install FFmpeg or VLC for WebM playback.');
    }

    try {
      switch (this.playbackMethod) {
        case 'ffplay':
          await this.playWithFfplay(filePath);
          break;
        case 'vlc':
          await this.playWithVlc(filePath);
          break;
        case 'powershell':
          await this.playWithPowerShell(filePath);
          break;
        case 'windows-media':
          await this.playWithWindowsMedia(filePath);
          break;
        case 'sox':
          await this.playWithSox(filePath);
          break;
        default:
          throw new Error('No audio playback method available');
      }
    } catch (error) {
      console.error(`❌ Audio playback failed with ${this.playbackMethod}:`, error);
      
      // If it's a WebM file and the error mentions format, suggest alternatives
      if (isWebM && error.message.includes('format')) {
        const betterError = new Error(`WebM playback failed with ${this.playbackMethod}. Please install FFmpeg or VLC for better WebM support.`);
        this.emit('error', betterError);
        throw betterError;
      }
      
      this.emit('error', error);
      throw error;
    }
  }

  private async playWithPowerShell(filePath: string): Promise<void> {
    // First try our custom audio handler
    const audioHandler = this.getWindowsAudioHandler();
    if (audioHandler) {
      console.log('🔊 Using custom Windows audio handler for playback');
      await this.runCommand('powershell', [
        '-ExecutionPolicy', 'Bypass', 
        '-File', audioHandler, 
        '-Action', 'play', 
        '-InputFile', filePath
      ], 30000);
      return;
    }
    
    // Fallback to basic PowerShell MediaPlayer
    console.log('🔊 Using basic PowerShell MediaPlayer for playback');
    const script = `
      try {
        Add-Type -AssemblyName PresentationCore
        $player = New-Object System.Windows.Media.MediaPlayer
        $uri = [System.Uri]::new("${filePath.replace(/\\/g, '\\\\')}")
        $player.Open($uri)
        $player.Play()
        
        # Wait for playback to start
        Start-Sleep -Milliseconds 500
        
        # Wait for playback to finish
        $timeout = 0
        while ($player.NaturalDuration.HasTimeSpan -eq $false -and $timeout -lt 50) {
          Start-Sleep -Milliseconds 100
          $timeout++
        }
        
        if ($player.NaturalDuration.HasTimeSpan) {
          $duration = $player.NaturalDuration.TimeSpan.TotalSeconds
          Start-Sleep -Seconds $duration
        } else {
          Start-Sleep -Seconds 3
        }
        
        $player.Close()
        Write-Output "Playback completed"
      } catch {
        Write-Error $_.Exception.Message
        exit 1
      }
    `;

    await this.runCommand('powershell', ['-Command', script], 30000);
  }

  private async playWithWindowsMedia(filePath: string): Promise<void> {
    const wmplayerPaths = [
      'wmplayer',
      'C:\\Program Files\\Windows Media Player\\wmplayer.exe',
      'C:\\Program Files (x86)\\Windows Media Player\\wmplayer.exe'
    ];

    let wmplayerPath = 'wmplayer';
    for (const path of wmplayerPaths) {
      if (path.includes(':\\') && fs.existsSync(path)) {
        wmplayerPath = path;
        break;
      }
    }

    // Use /close to close after playback
    await this.runCommand(wmplayerPath, [filePath, '/close'], 30000);
  }

  private async playWithFfplay(filePath: string): Promise<void> {
    const args = [
      '-nodisp',      // No video display
      '-autoexit',    // Exit when playback finishes
      '-loglevel', 'quiet', // Suppress output
      filePath
    ];

    await this.runCommand('ffplay', args, 30000);
  }

  private async playWithVlc(filePath: string): Promise<void> {
    const vlcCommands = process.platform === 'win32' ? 
      ['vlc', 'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe', 'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'] :
      ['vlc', 'cvlc'];

    let vlcCmd = 'vlc';
    for (const cmd of vlcCommands) {
      if (cmd.includes(':\\') && fs.existsSync(cmd)) {
        vlcCmd = cmd;
        break;
      } else if (!cmd.includes(':\\')) {
        try {
          await this.runCommand(cmd, ['--version'], 1000);
          vlcCmd = cmd;
          break;
        } catch (error) {
          // Continue to next command
        }
      }
    }

    const args = [
      '--intf', 'dummy',    // No interface
      '--play-and-exit',    // Exit after playback
      '--quiet',            // Suppress output
      filePath
    ];

    await this.runCommand(vlcCmd, args, 30000);
  }

  private async playWithSox(filePath: string): Promise<void> {
    const soxPath = this.getSoxPath();
    if (!soxPath) {
      throw new Error('Sox not available');
    }

    const args = [filePath, '-d']; // -d means default output device

    await this.runCommand(soxPath, args, 30000);
  }

  stop(): void {
    console.log('🛑 AudioPlayer.stop() called');
    
    if (this.currentProcess) {
      console.log('🔪 Killing audio process PID:', this.currentProcess.pid);
      this.currentProcess.kill('SIGTERM');
      this.currentProcess = null;
    }
    
    this.isPlaying = false;
    this.emit('stopped');
  }

  get playing(): boolean {
    return this.isPlaying;
  }
} 