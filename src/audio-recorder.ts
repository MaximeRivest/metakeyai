import { EventEmitter } from 'events';
import { UserDataManager } from './user-data-manager';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fs from 'fs';
import { ipcMain } from 'electron';

/**
 * Web Audio API-based audio recorder.
 * This class orchestrates recording in the renderer process (Pastille window)
 * to avoid creating hidden windows and to simplify the architecture.
 */
export class WebAudioRecorder extends EventEmitter {
  public isRecording = false;
  private userDataManager: UserDataManager;
  private audioSettings: any = null;
  private outputFile: string = '';
  private cleanupRecordingHandlers: (() => void) | null = null;

  constructor() {
    super();
    this.userDataManager = UserDataManager.getInstance();
    this.loadAudioSettings();
  }

  private loadAudioSettings(): void {
    try {
      this.audioSettings = this.userDataManager.loadAudioSettings() || {};
    } catch (error) {
      console.log('⚠️ Could not load audio settings, using defaults');
      this.audioSettings = {};
    }
  }

  private saveAudioSettings(): void {
    try {
      this.userDataManager.saveAudioSettings(this.audioSettings);
    } catch (error) {
      console.error('❌ Failed to save audio settings:', error);
    }
  }

  public setUserAudioDevice(deviceName: string): void {
    console.log('🎤 Setting user audio device:', deviceName);
    
    this.audioSettings.preferredDevice = deviceName || 'auto'; // If empty string, save as 'auto'
    this.audioSettings.platform = process.platform;
    this.saveAudioSettings();
  }

  public getUserAudioDevice(): string | null {
    if (!this.audioSettings || typeof this.audioSettings.preferredDevice !== 'string') {
      return null;
    }
    
    const device = this.audioSettings.preferredDevice;
    
    if (!device || device === 'auto') {
        return null;
    }

    // Heuristic to detect old, label-based settings from previous versions.
    // Real deviceIds are typically long, unbroken strings. Labels often have spaces or parentheses.
    // Also captures the literal string "default" which was used by old ffmpeg logic but is not a valid deviceId for getUserMedia.
    const isLikelyOldLabel = /[\s()]/.test(device) || device === 'default';

    if (isLikelyOldLabel) {
        console.warn(`🎤 Detected potentially invalid device setting: "${device}". It appears to be an old label. Resetting to auto-detect.`);
        this.setUserAudioDevice(''); // Reset to 'auto' by passing empty string
        return null; // Force auto-detection for this session
    }
    
    return device;
  }

  async start(): Promise<void> {
    console.log('🎙️ WebAudioRecorder.start() called');
    
    if (this.isRecording) {
      console.warn('⚠️ Recording is already in progress.');
      return;
    }

    this.outputFile = join(tmpdir(), `recording_${Date.now()}.webm`);
    console.log('📁 Recording file path:', this.outputFile);
    console.log('🔧 Orchestrating Web Audio API recording in Pastille renderer');

    try {
      // Setup IPC listeners for this recording session from the Pastille window
      const handleStarted = () => {
        console.log('✅ Microphone recording started in renderer.');
        this.isRecording = true;
      };
      
      const handleAudioData = (event: any, data: ArrayBuffer) => {
        const buffer = Buffer.from(data);
        this.emit('audio-data', buffer);
      };

      const handleFinished = (event: any, audioData: { buffer: ArrayBuffer, mimeType: string }) => {
        console.log('🎵 Web Audio recording finished in renderer, size:', audioData.buffer.byteLength);
        
        try {
          fs.writeFileSync(this.outputFile, Buffer.from(audioData.buffer));
          console.log('✅ Microphone audio file written:', this.outputFile);
          
          this.emit('finished', this.outputFile);
        } catch (error) {
          console.error('❌ Error writing audio file:', error);
          this.emit('error', error);
        } finally {
          this.isRecording = false;
          this.cleanup();
        }
      };

      const handleError = (event: any, error: string) => {
        console.error('❌ Web Audio recording error from renderer:', error);
        this.emit('error', new Error(error));
        this.isRecording = false;
        this.cleanup();
      };
      
      ipcMain.once('pastille-audio-started', handleStarted);
      ipcMain.on('pastille-audio-data', handleAudioData);
      ipcMain.once('pastille-audio-finished', handleFinished);
      ipcMain.once('pastille-audio-error', handleError);

      this.cleanupRecordingHandlers = () => {
        ipcMain.removeListener('pastille-audio-started', handleStarted);
        ipcMain.removeListener('pastille-audio-data', handleAudioData);
        ipcMain.removeListener('pastille-audio-finished', handleFinished);
        ipcMain.removeListener('pastille-audio-error', handleError);
      };

      // Get the main window (Pastille) and send the start command
      const pastilleWindow = (global as any).pastilleWindow;
      if (pastilleWindow) {
        const userDevice = this.getUserAudioDevice();
        console.log('🎤 Requesting recording start in Pastille with device:', userDevice || 'default');
        pastilleWindow.webContents.send('start-pastille-recording', { deviceId: userDevice || 'default' });
      } else {
        throw new Error('Pastille window not available to start recording.');
      }

    } catch (error) {
      console.error('❌ Failed to orchestrate Web Audio recording:', error);
      this.emit('error', error);
    }
  }

  stop(): void {
    console.log('🛑 WebAudioRecorder.stop() called');
    
    if (!this.isRecording) {
      console.log('⚠️ Cannot stop: not recording');
      return;
    }

    console.log('🔪 Stopping Web Audio recording in renderer...');
    
    const pastilleWindow = (global as any).pastilleWindow;
    if (pastilleWindow) {
      pastilleWindow.webContents.send('stop-pastille-recording');
    } else {
      console.warn('⚠️ Pastille window not found to stop recording. Cleaning up from main process.');
      this.isRecording = false;
      this.cleanup();
    }
  }

  private cleanup(): void {
    console.log('🧹 Cleaning up audio recording IPC handlers.');
    if (this.cleanupRecordingHandlers) {
      this.cleanupRecordingHandlers();
      this.cleanupRecordingHandlers = null;
    }
  }

  // Utility methods to maintain compatibility
  public async isRecordingAvailable(): Promise<boolean> {
    return true; // Web Audio is always available in Electron renderer
  }

  public getRecordingMethod(): string {
    return 'web-audio';
  }

  public async getAudioDeviceInfo(): Promise<any> {
    // Device discovery must now be done in a renderer process.
    // This will be handled by the settings page.
    // This function can return static info or be removed if not used in main.
    return {
      discoveredDevices: [],
      userConfiguredDevice: this.getUserAudioDevice() || 'auto',
      currentRecordingMethod: 'web-audio',
      platform: process.platform,
      canUserConfigure: true,
      needsConfiguration: false,
    };
  }
}