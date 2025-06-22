import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import { EventEmitter } from 'events';

export class AudioPlayer extends EventEmitter {
  private currentProcess: ChildProcess | null = null;
  private isPlaying = false;

  constructor() {
    super();
  }

  async play(filePath: string): Promise<void> {
    console.log('🔊 AudioPlayer.play() called with file:', filePath);
    
    if (this.isPlaying) {
      console.log('⚠️ Already playing audio, stopping current playback');
      this.stop();
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

    // Try different audio players based on platform
    const audioPlayers = this.getAudioPlayers();
    
    for (const player of audioPlayers) {
      try {
        console.log('🎵 Trying audio player:', player.name);
        await this.tryPlayer(player, filePath);
        return; // Success, exit
      } catch (error) {
        console.log(`❌ ${player.name} failed:`, error.message);
        continue; // Try next player
      }
    }

    // If we get here, all players failed
    const error = new Error('No suitable audio player found');
    console.error('❌ All audio players failed');
    this.emit('error', error);
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

  private getAudioPlayers() {
    const platform = process.platform;
    
    if (platform === 'darwin') {
      // macOS
      return [
        { name: 'afplay', command: 'afplay', args: (file: string) => [file] }
      ];
    } else if (platform === 'win32') {
      // Windows
      return [
        { name: 'powershell', command: 'powershell', args: (file: string) => ['-c', `(New-Object Media.SoundPlayer '${file}').PlaySync()`] }
      ];
    } else {
      // Linux and others
      return [
        { name: 'aplay', command: 'aplay', args: (file: string) => [file] },
        { name: 'paplay', command: 'paplay', args: (file: string) => [file] },
        { name: 'ffplay', command: 'ffplay', args: (file: string) => ['-nodisp', '-autoexit', file] },
        { name: 'mpv', command: 'mpv', args: (file: string) => ['--no-video', '--really-quiet', file] }
      ];
    }
  }

  private async tryPlayer(player: any, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = player.args(filePath);
      console.log('🔧 Starting audio player with args:', player.command, args);
      
      this.currentProcess = spawn(player.command, args);
      this.isPlaying = true;

      this.currentProcess.on('error', (err: any) => {
        console.error(`❌ ${player.name} error:`, err.message);
        this.isPlaying = false;
        this.currentProcess = null;
        reject(err);
      });

      this.currentProcess.on('close', (code) => {
        console.log(`🔚 ${player.name} process exited with code:`, code);
        this.isPlaying = false;
        this.currentProcess = null;
        
        if (code === 0) {
          console.log('✅ Audio playback completed successfully');
          this.emit('finished');
          resolve();
        } else {
          const error = new Error(`${player.name} exited with code ${code}`);
          reject(error);
        }
      });

      // Handle stderr for debugging
      if (this.currentProcess.stderr) {
        this.currentProcess.stderr.on('data', (data) => {
          console.log(`📻 ${player.name} stderr:`, data.toString());
        });
      }

      console.log(`🎤 ${player.name} started, PID:`, this.currentProcess.pid);
    });
  }

  get playing(): boolean {
    return this.isPlaying;
  }
} 