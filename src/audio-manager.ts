import { EventEmitter } from 'events';
import { UserDataManager } from './user-data-manager';
import { tmpdir } from 'os';
import { join } from 'path';
import * as fs from 'fs';
import { ipcMain, BrowserWindow } from 'electron';
import { AudioPlayer } from './audio-player';

/**
 * Unified Audio Manager for microphone setup, device discovery, and recording
 * Used across first-run setup, settings window, and normal usage
 */
export class AudioManager extends EventEmitter {
  private static instance: AudioManager;
  private userDataManager: UserDataManager;
  private audioSettings: any = {};
  private audioPlayer: AudioPlayer | null = null;
  private activeSessions = new Map<string, RecordingSession>();

  private constructor() {
    super();
    this.userDataManager = UserDataManager.getInstance();
    this.loadAudioSettings();
    this.setupGlobalIpcHandlers();
  }

  public static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  private loadAudioSettings(): void {
    try {
      const settings = this.userDataManager.loadAudioSettings();
      this.audioSettings = settings || {
        microphoneDevice: 'auto',
        platform: process.platform,
        lastUpdated: new Date().toISOString()
      };
      
      // Migrate old device label-based settings to device ID
      if (this.audioSettings.preferredDevice && !this.audioSettings.microphoneDevice) {
        this.audioSettings.microphoneDevice = this.audioSettings.preferredDevice === 'auto' ? 'auto' : this.audioSettings.preferredDevice;
        delete this.audioSettings.preferredDevice;
        this.saveAudioSettings();
      }
    } catch (error) {
      console.error('Failed to load audio settings:', error);
      this.audioSettings = {
        microphoneDevice: 'auto',
        platform: process.platform,
        lastUpdated: new Date().toISOString()
      };
    }
  }

  private saveAudioSettings(): void {
    try {
      this.audioSettings.lastUpdated = new Date().toISOString();
      this.userDataManager.saveAudioSettings(this.audioSettings);
    } catch (error) {
      console.error('Failed to save audio settings:', error);
    }
  }

  private setupGlobalIpcHandlers(): void {
    // Audio device discovery (shared across all windows)
    ipcMain.handle('discover-audio-devices', async () => {
      return this.discoverAudioDevices();
    });

    // Microphone device setting (shared across all windows)
    ipcMain.on('set-microphone-device', (event, deviceId: string) => {
      this.setMicrophoneDevice(deviceId);
    });

    // Audio testing (shared across all windows)
    ipcMain.handle('test-microphone-device', async (event, deviceId: string) => {
      return this.testMicrophoneDevice(deviceId);
    });

    ipcMain.handle('play-audio-file', async (event, filePath: string) => {
      return this.playAudioFile(filePath);
    });

    ipcMain.handle('stop-audio-playback', async () => {
      return this.stopAudioPlayback();
    });

    // Generic recording session handlers
    ipcMain.handle('start-recording-session', async (event, params: {
      sessionId: string;
      windowType: 'first-run' | 'settings' | 'pastille' | 'main';
      filePrefix?: string;
      eventPrefix?: string;
    }) => {
      return this.startRecordingSession(params);
    });

    ipcMain.handle('stop-recording-session', async (event, sessionId: string) => {
      return this.stopRecordingSession(sessionId);
    });

    // Backwards compatibility handlers for first-run setup
    ipcMain.handle('start-first-run-recording', async () => {
      return this.startRecordingSession({
        sessionId: 'first-run',
        windowType: 'first-run',
        filePrefix: 'first_run_recording',
        eventPrefix: 'first-run'
      });
    });

    ipcMain.handle('stop-first-run-recording', async () => {
      return this.stopRecordingSession('first-run');
    });

    ipcMain.handle('play-first-run-recording', async (event, filePath: string) => {
      return this.playAudioFile(filePath);
    });
  }

  /**
   * Discover available audio input devices
   * Returns basic device info - detailed enumeration happens in renderer
   */
  public async discoverAudioDevices(): Promise<Array<{ deviceId: string; label: string }>> {
    try {
      // For Electron, we rely on the renderer process for detailed device discovery
      // This provides fallback device options
      return [
        { deviceId: 'default', label: 'System Default Microphone' },
        { deviceId: 'auto', label: 'Auto-detect Best Microphone' }
      ];
    } catch (error) {
      console.error('Failed to discover audio devices:', error);
      return [
        { deviceId: 'auto', label: 'Auto-detect' }
      ];
    }
  }

  /**
   * Set the microphone device preference
   */
  public setMicrophoneDevice(deviceId: string): void {
    console.log('🎤 Setting microphone device:', deviceId);
    
    this.audioSettings.microphoneDevice = deviceId || 'auto';
    this.audioSettings.platform = process.platform;
    this.saveAudioSettings();
    
    // Emit event for UI updates
    this.emit('device-changed', deviceId);
  }

  /**
   * Get the current microphone device setting
   */
  public getMicrophoneDevice(): string {
    return this.audioSettings.microphoneDevice || 'auto';
  }

  /**
   * Validate and migrate device settings if needed
   */
  public async validateDeviceSettings(): Promise<void> {
    const currentDevice = this.getMicrophoneDevice();
    
    if (currentDevice && currentDevice !== 'auto' && currentDevice !== 'default') {
      // Test if the device still exists
      try {
        const testResult = await this.testMicrophoneDevice(currentDevice);
        if (!testResult.success) {
          console.warn(`⚠️ Configured device ${currentDevice} no longer available, falling back to auto`);
          this.setMicrophoneDevice('auto');
        }
      } catch (error) {
        console.warn(`⚠️ Failed to validate device ${currentDevice}, falling back to auto:`, error);
        this.setMicrophoneDevice('auto');
      }
    }
  }

  /**
   * Test microphone device by recording a short sample
   */
  public async testMicrophoneDevice(deviceId: string, preferredWindowType?: 'first-run' | 'settings' | 'pastille' | 'main'): Promise<{
    success: boolean;
    filePath?: string;
    error?: string;
    deviceInfo?: any;
  }> {
    try {
      console.log('🧪 Testing microphone device:', deviceId);
      
      // Determine which window to use for testing
      let windowType: 'first-run' | 'settings' | 'pastille' | 'main' = 'settings';
      
      if (preferredWindowType) {
        windowType = preferredWindowType;
      } else {
        // Auto-detect available window
        const firstRunWindow = this.getWindowByType('first-run');
        const settingsWindow = this.getWindowByType('settings');
        const pastilleWindow = this.getWindowByType('pastille');
        
        if (firstRunWindow) {
          windowType = 'first-run';
        } else if (settingsWindow) {
          windowType = 'settings';
        } else if (pastilleWindow) {
          windowType = 'pastille';
        } else {
          return { success: false, error: 'No suitable window available for microphone testing' };
        }
      }
      
      console.log(`🎤 Using ${windowType} window for microphone test`);
      
      // Start a test recording session
      const testSession = await this.startRecordingSession({
        sessionId: `test_${windowType}_${Date.now()}`,
        windowType: windowType,
        filePrefix: 'mic_test',
        eventPrefix: windowType === 'first-run' ? 'first-run-test' : 'test'
      });
      
      if (!testSession.success) {
        return { success: false, error: testSession.error };
      }
      
      // Let it record for 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Stop the test recording
      const stopResult = await this.stopRecordingSession(testSession.sessionId!);
      
      if (stopResult.success && testSession.filePath) {
        // Verify the file was created and has content
        if (fs.existsSync(testSession.filePath)) {
          const stats = fs.statSync(testSession.filePath);
          return {
            success: true,
            filePath: testSession.filePath,
            deviceInfo: {
              fileSize: stats.size,
              duration: 2000,
              deviceId: deviceId,
              windowUsed: windowType
            }
          };
        }
      }
      
      return { success: false, error: 'Test recording failed to produce output' };
    } catch (error) {
      console.error('❌ Microphone test failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Play an audio file
   */
  public async playAudioFile(filePath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.audioPlayer) {
        this.audioPlayer = new AudioPlayer();
      }
      
      await this.audioPlayer.play(filePath);
      return { success: true };
    } catch (error) {
      console.error('❌ Audio playback failed:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Stop audio playback
   */
  public async stopAudioPlayback(): Promise<{ success: boolean; error?: string }> {
    try {
      if (this.audioPlayer) {
        this.audioPlayer.stop();
      }
      return { success: true };
    } catch (error) {
      console.error('❌ Failed to stop audio playback:', error);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Start a recording session in a specific window
   */
  public async startRecordingSession(params: {
    sessionId: string;
    windowType: 'first-run' | 'settings' | 'pastille' | 'main';
    filePrefix?: string;
    eventPrefix?: string;
  }): Promise<{ success: boolean; sessionId?: string; filePath?: string; error?: string }> {
    const { sessionId, windowType, filePrefix = 'recording', eventPrefix = sessionId } = params;
    
    // Check if session already exists
    if (this.activeSessions.has(sessionId)) {
      return { success: false, error: 'Recording session already active' };
    }
    
    // Get the target window
    const targetWindow = this.getWindowByType(windowType);
    if (!targetWindow) {
      return { success: false, error: `Window not available: ${windowType}` };
    }
    
    // Create recording session
    const outputFile = join(tmpdir(), `${filePrefix}_${Date.now()}.webm`);
    const session: RecordingSession = {
      id: sessionId,
      isRecording: false,
      outputFile,
      window: targetWindow,
      cleanupHandlers: null,
      startEvent: `${eventPrefix}-audio-started`,
      finishedEvent: `${eventPrefix}-audio-finished`,
      errorEvent: `${eventPrefix}-audio-error`,
      startCommand: `start-${eventPrefix}-recording`,
      stopCommand: `stop-${eventPrefix}-recording`
    };
    
    this.activeSessions.set(sessionId, session);
    
    try {
      return await this.executeRecordingStart(session);
    } catch (error) {
      this.activeSessions.delete(sessionId);
      return { success: false, error: (error as Error).message };
    }
  }

  /**
   * Stop a recording session
   */
  public async stopRecordingSession(sessionId: string): Promise<{ success: boolean; filePath?: string; error?: string }> {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return { success: false, error: 'Recording session not found' };
    }

    if (!session.isRecording) {
      return { success: false, error: 'No recording in progress' };
    }

    console.log(`🛑 Stopping recording session: ${sessionId}`);

    return new Promise((resolve) => {
      // Set up timeout for stop confirmation
      const stopTimeout = setTimeout(() => {
        console.warn(`⚠️ Stop timeout for session ${sessionId}, cleaning up anyway`);
        session.isRecording = false;
        if (session.cleanupHandlers) {
          session.cleanupHandlers();
        }
        this.activeSessions.delete(sessionId);
        resolve({ success: true, filePath: session.outputFile });
      }, 3000);

      // Listen for the finished event
      const handleFinished = (event: any, audioData: { buffer: ArrayBuffer, mimeType: string }) => {
        clearTimeout(stopTimeout);
        console.log(`🎵 Recording finished for session: ${sessionId}, size: ${audioData.buffer.byteLength}`);
        
        try {
          fs.writeFileSync(session.outputFile, Buffer.from(audioData.buffer));
          console.log(`✅ Audio file written: ${session.outputFile}`);
          
          session.isRecording = false;
          if (session.cleanupHandlers) {
            session.cleanupHandlers();
          }
          this.activeSessions.delete(sessionId);
          
          resolve({ success: true, filePath: session.outputFile });
        } catch (error) {
          console.error(`❌ Error writing audio file for session ${sessionId}:`, error);
          session.isRecording = false;
          if (session.cleanupHandlers) {
            session.cleanupHandlers();
          }
          this.activeSessions.delete(sessionId);
          resolve({ success: false, error: (error as Error).message });
        }
      };

      // Replace the existing finished handler temporarily
      ipcMain.removeAllListeners(session.finishedEvent);
      ipcMain.once(session.finishedEvent, handleFinished);

      if (session.window) {
        session.window.webContents.send(session.stopCommand);
      } else {
        clearTimeout(stopTimeout);
        console.warn(`⚠️ Window not found for session: ${sessionId}`);
        session.isRecording = false;
        if (session.cleanupHandlers) {
          session.cleanupHandlers();
        }
        this.activeSessions.delete(sessionId);
        resolve({ success: false, error: 'Window not available' });
      }
    });
  }

  /**
   * Execute the recording start process
   */
  private async executeRecordingStart(session: RecordingSession): Promise<{ success: boolean; sessionId: string; filePath: string; error?: string }> {
    return new Promise((resolve, reject) => {
      // Set up timeout for start confirmation
      const startTimeout = setTimeout(() => {
        cleanup();
        reject(new Error('Recording start timeout - no confirmation received'));
      }, 5000);

      const handleStarted = () => {
        console.log(`✅ Recording started for session: ${session.id}`);
        session.isRecording = true;
        clearTimeout(startTimeout);
        
        // Resolve immediately when recording starts (not when it finishes)
        resolve({ success: true, sessionId: session.id, filePath: session.outputFile });
      };
      
      const handleFinished = (event: any, audioData: { buffer: ArrayBuffer, mimeType: string }) => {
        console.log(`🎵 Recording finished for session: ${session.id}, size: ${audioData.buffer.byteLength}`);
        
        try {
          fs.writeFileSync(session.outputFile, Buffer.from(audioData.buffer));
          console.log(`✅ Audio file written: ${session.outputFile}`);
          
          session.isRecording = false;
          cleanup();
        } catch (error) {
          console.error(`❌ Error writing audio file for session ${session.id}:`, error);
          session.isRecording = false;
          cleanup();
        }
      };

      const handleError = (event: any, error: string) => {
        console.error(`❌ Recording error for session ${session.id}:`, error);
        clearTimeout(startTimeout);
        session.isRecording = false;
        cleanup();
        reject(new Error(error));
      };

      const cleanup = () => {
        ipcMain.removeListener(session.startEvent, handleStarted);
        ipcMain.removeListener(session.finishedEvent, handleFinished);
        ipcMain.removeListener(session.errorEvent, handleError);
        session.cleanupHandlers = null;
      };
      
      ipcMain.once(session.startEvent, handleStarted);
      ipcMain.once(session.finishedEvent, handleFinished);
      ipcMain.once(session.errorEvent, handleError);

      session.cleanupHandlers = cleanup;

      if (session.window) {
        console.log(`🎤 Sending start command to window for session: ${session.id}`);
        const userDevice = this.getMicrophoneDevice();
        session.window.webContents.send(session.startCommand, { deviceId: userDevice || 'default' });
      } else {
        clearTimeout(startTimeout);
        cleanup();
        this.activeSessions.delete(session.id);
        reject(new Error(`Window not available for session: ${session.id}`));
      }
    });
  }

  /**
   * Get window by type
   */
  private getWindowByType(windowType: 'first-run' | 'settings' | 'pastille' | 'main'): BrowserWindow | null {
    try {
      switch (windowType) {
        case 'first-run':
          // Get first-run manager instance
          const firstRunManager = (global as any).firstRunManager;
          return firstRunManager?.getSetupWindow() || null;
        case 'settings':
          return (global as any).settingsWindow || null;
        case 'pastille':
          return (global as any).pastilleWindow || null;
        case 'main':
          return (global as any).mainWindow || null;
        default:
          return null;
      }
    } catch (error) {
      console.error(`Failed to get window of type ${windowType}:`, error);
      return null;
    }
  }

  /**
   * Get audio settings for display in UI
   */
  public getAudioSettings(): any {
    return {
      ...this.audioSettings,
      currentDevice: this.getMicrophoneDevice(),
      platform: process.platform,
      hasSettings: !!this.audioSettings && Object.keys(this.audioSettings).length > 0
    };
  }

  /**
   * Get recording session status
   */
  public getActiveSessionIds(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  /**
   * Check if any recording is active
   */
  public hasActiveRecording(): boolean {
    return Array.from(this.activeSessions.values()).some(session => session.isRecording);
  }

  /**
   * Cleanup method
   */
  public cleanup(): void {
    // Stop all active sessions
    for (const [sessionId, session] of this.activeSessions) {
      if (session.isRecording) {
        this.stopRecordingSession(sessionId);
      }
    }
    
    // Stop audio playback
    if (this.audioPlayer) {
      this.audioPlayer.stop();
    }
    
    // Clear all sessions
    this.activeSessions.clear();
  }
}

// Recording session interface
interface RecordingSession {
  id: string;
  isRecording: boolean;
  outputFile: string;
  window: BrowserWindow | null;
  cleanupHandlers: (() => void) | null;
  startEvent: string;
  finishedEvent: string;
  errorEvent: string;
  startCommand: string;
  stopCommand: string;
} 