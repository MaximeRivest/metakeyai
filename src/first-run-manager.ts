import { BrowserWindow, app, ipcMain } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { UserDataManager } from './user-data-manager';
import { PythonSetupManager } from './python-setup-manager';

// Webpack entry point declarations - for first-run setup window
declare const FIRST_RUN_SETUP_WINDOW_WEBPACK_ENTRY: string;

export class FirstRunManager {
  private setupWindow: BrowserWindow | null = null;
  private userDataManager: UserDataManager;
  private pythonSetupManager: PythonSetupManager;
  private onSetupCompleteCallback?: () => void;
  private explicitCloseRequested = false;

  constructor(userDataManager: UserDataManager, onSetupComplete?: () => void) {
    this.userDataManager = userDataManager;
    this.pythonSetupManager = PythonSetupManager.getInstance();
    this.onSetupCompleteCallback = onSetupComplete;
    this.setupIpcHandlers();
  }

  private setupIpcHandlers(): void {
    // First-run completion handler
    ipcMain.handle('mark-first-run-complete', async () => {
      try {
        await this.markFirstRunComplete();
        
        // Close the setup window
        this.closeSetupWindow();
        
        // Call the completion callback if provided
        if (this.onSetupCompleteCallback) {
          this.onSetupCompleteCallback();
        }
        
        return { success: true };
      } catch (error) {
        console.error('Failed to mark first run complete:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.on('close-first-run-setup', () => {
      console.log('🛑 Close button pressed during first-run setup');
      
      // Mark that this is an explicit close request
      this.explicitCloseRequested = true;
      
      // Clean up any partial setup state
      this.cleanupPartialSetup();
      
      // Close the setup window
      this.closeSetupWindow();
      
      // Quit the entire application
      app.quit();
    });

    // NOTE: Audio device handlers are now managed by AudioManager
    // NOTE: Microphone device setting is handled by AudioManager
    // NOTE: load-env and save-env are handled in setupEssentialIpcHandlers()
    // NOTE: test-voice is handled in setupEssentialIpcHandlers()

    // Python setup handlers (specific to first-run setup)
    // NOTE: check-python-setup handler is registered in main setupIpcListeners()
    // to avoid duplicate registration errors

    ipcMain.handle('setup-python-auto', async () => {
      try {
        console.log('🚀 Starting automatic Python setup from first-run...');
        
        // Set up progress listener
        const progressHandler = (message: string) => {
          if (this.setupWindow) {
            this.setupWindow.webContents.send('python-setup-progress', message);
          }
        };

        this.pythonSetupManager.on('progress', progressHandler);
        
        const success = await this.pythonSetupManager.performAutoSetup();
        
        // Remove progress listener
        this.pythonSetupManager.removeListener('progress', progressHandler);
        
        if (success) {
          console.log('✅ Python auto setup completed successfully');
          return { success: true };
        } else {
          console.error('❌ Python auto setup failed');
          return { success: false, error: 'Auto setup failed - check console for details' };
        }
      } catch (error) {
        console.error('❌ Python auto setup error:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('reset-python-setup', async () => {
      try {
        const success = await this.pythonSetupManager.resetSetup();
        return { success };
      } catch (error) {
        console.error('Failed to reset Python setup:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // First-run specific testing handlers
    ipcMain.handle('test-first-run-microphone', async () => {
      try {
        console.log('🎤 Testing microphone for first-run setup...');
        const audioManager = (global as any).audioManager;
        if (!audioManager) {
          return { success: false, error: 'Audio manager not available' };
        }
        
        // Use the AudioManager's testMicrophoneDevice with first-run window preference
        const currentDevice = audioManager.getMicrophoneDevice() || 'auto';
        const testResult = await audioManager.testMicrophoneDevice(currentDevice, 'first-run');
        
        return {
          success: testResult.success,
          deviceId: currentDevice,
          filePath: testResult.filePath,
          error: testResult.error,
          deviceInfo: testResult.deviceInfo
        };
      } catch (error) {
        console.error('❌ First-run microphone test failed:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('test-first-run-tts', async (event, { text, voice }: { text: string; voice: string }) => {
      try {
        console.log(`🔊 Testing TTS for first-run setup: voice=${voice}`);
        
        // Import the TTS function
        const { callTextToSpeechApi } = require('./openai-api');
        const config = require('./config').config;
        
        if (!config.OPENAI_API_KEY) {
          return { success: false, error: 'OpenAI API key not configured' };
        }
        
        const audioFilePath = await callTextToSpeechApi(text, voice);
        if (!audioFilePath) {
          return { success: false, error: 'Failed to generate audio' };
        }
        
        // Play the audio using AudioManager
        const audioManager = (global as any).audioManager;
        if (audioManager) {
          await audioManager.playAudioFile(audioFilePath);
        }
        
        return { success: true, audioFile: audioFilePath };
      } catch (error) {
        console.error('❌ First-run TTS test failed:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('test-first-run-api-key', async (event, apiKey: string) => {
      try {
        console.log('🔑 Testing API key for first-run setup...');
        
        // Simple validation - try to make a basic API call with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);
        
        const response = await fetch('https://api.openai.com/v1/models', {
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        const isValid = response.ok;
        
        if (isValid) {
          // Temporarily store the API key in config for testing
          const config = require('./config').config;
          config.OPENAI_API_KEY = apiKey;
        }
        
        return { success: isValid, valid: isValid };
      } catch (error) {
        console.error('❌ API key test failed:', error);
        return { success: false, valid: false, error: (error as Error).message };
      }
    });

    ipcMain.handle('test-first-run-shortcuts', async () => {
      try {
        console.log('⌨️ Testing shortcuts for first-run setup...');
        
        const shortcutsManager = (global as any).shortcutsManager;
        if (!shortcutsManager) {
          // Shortcuts aren't initialized yet during first-run, that's expected
          return { 
            success: true, 
            message: 'Shortcuts will be available after first-run setup completes',
            shortcuts: [
              { name: 'Voice Record', key: 'Ctrl+Alt+W' },
              { name: 'Text-to-Speech', key: 'Ctrl+Alt+E' },
              { name: 'Quick Edit', key: 'Ctrl+Alt+Q' },
              { name: 'Clipboard History', key: 'Ctrl+Alt+C' }
            ]
          };
        }
        
        const shortcuts = shortcutsManager.getShortcuts();
        return { success: true, shortcuts };
      } catch (error) {
        console.error('❌ Shortcuts test failed:', error);
        return { success: false, error: (error as Error).message };
      }
    });

    // Window control handlers
    ipcMain.on('minimize-first-run-window', () => {
      if (this.setupWindow) {
        this.setupWindow.minimize();
      }
    });
  }

  private cleanupPartialSetup(): void {
    try {
      console.log('🧹 Cleaning up partial setup state...');
      
      // Remove any partial settings file
      const settingsPath = this.userDataManager.getSettingsPath();
      if (fs.existsSync(settingsPath)) {
        const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        
        // If first run was not completed, remove the partial settings
        if (!settings.firstRunCompleted) {
          console.log('🗑️ Removing partial setup configuration');
          fs.unlinkSync(settingsPath);
        }
      }
      
      // Clean up any temporary Python setup state
      try {
        this.pythonSetupManager.resetSetup();
      } catch (error) {
        console.warn('⚠️ Failed to reset Python setup:', error);
      }
      
      console.log('✅ Partial setup cleanup completed');
    } catch (error) {
      console.error('❌ Error during partial setup cleanup:', error);
    }
  }

  async isFirstRun(): Promise<boolean> {
    try {
      const settingsPath = this.userDataManager.getSettingsPath();
      if (!fs.existsSync(settingsPath)) {
        return true;
      }
      
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return !settings.firstRunCompleted;
    } catch (error) {
      console.error('Failed to check first run status:', error);
      return true; // Default to showing setup on error
    }
  }

  async markFirstRunComplete(): Promise<void> {
    try {
      const settingsPath = this.userDataManager.getSettingsPath();
      let settings = {};
      
      // Load existing settings if they exist
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
      
      // Mark first run as complete
      (settings as any).firstRunCompleted = true;
      (settings as any).firstRunCompletedAt = new Date().toISOString();
      
      // Save settings
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log('✅ First run marked as complete');
    } catch (error) {
      console.error('Failed to mark first run complete:', error);
      throw error;
    }
  }

  async showSetupWindow(): Promise<void> {
    if (this.setupWindow) {
      this.setupWindow.focus();
      this.setupWindow.show();
      return;
    }

    console.log('🚀 Showing first-run setup window');

    this.setupWindow = new BrowserWindow({
      width: 800,
      height: 750,
      resizable: true,
      maximizable: false,  // Disable maximize for widget feel
      minimizable: true,
      center: true,
      show: true,
      frame: false,        // Remove native frame for floating widget feel
      transparent: true,   // Enable transparency for magical effect
      titleBarStyle: 'hidden',  // Hide title bar
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      },
      skipTaskbar: false,
      focusable: true,
      title: 'MetaKeyAI - Initial Setup',
      icon: undefined,
      // Floating widget styling
      backgroundColor: undefined,  // Let CSS handle background
      thickFrame: false,   // Thin frame for floating feel
      // Position and behavior
      alwaysOnTop: true,   // Float above other windows
      movable: true,       // Allow dragging
      closable: true,
      // Modern styling
      vibrancy: undefined,
      visualEffectState: 'active',
      hasShadow: true,     // Add shadow for floating effect
      roundedCorners: true // Round corners if supported
    });

    this.setupWindow.show();

    // Load the setup page using webpack entry point
    console.log('🔗 Loading first-run setup from:', FIRST_RUN_SETUP_WINDOW_WEBPACK_ENTRY);
    
    try {
      await this.setupWindow.loadURL(FIRST_RUN_SETUP_WINDOW_WEBPACK_ENTRY);
      console.log('✅ First-run setup page loaded successfully');
      
      // Show window immediately and focus it
      this.setupWindow.show();
      this.setupWindow.focus();
      this.setupWindow.moveTop();
      
      // Log window state for debugging
      console.log('🪟 Window state:', {
        isVisible: this.setupWindow.isVisible(),
        isFocused: this.setupWindow.isFocused(),
        isMinimized: this.setupWindow.isMinimized(),
        bounds: this.setupWindow.getBounds()
      });
      
      // Only open dev tools if explicitly requested
      if (process.env.METAKEYAI_DEBUG === 'true') {
        console.log('🔧 Opening dev tools for debugging');
        this.setupWindow.webContents.openDevTools();
      }
      
    } catch (error) {
      console.error('❌ Failed to load first-run setup page:', error);
    }

    // Handle window closed
    this.setupWindow.on('closed', () => {
      this.setupWindow = null;
      console.log('🔒 First-run setup window closed');
    });

    // Prevent window from being closed accidentally
    this.setupWindow.on('close', (event) => {
      // Allow closing if first run is complete or explicitly requested
      if (this.isFirstRunComplete() || this.explicitCloseRequested) {
        return;
      }
      
      // Otherwise, just hide the window
      event.preventDefault();
      this.setupWindow?.hide();
    });
  }

  closeSetupWindow(): void {
    if (this.setupWindow) {
      this.setupWindow.destroy();
      this.setupWindow = null;
      console.log('🔒 First-run setup window closed');
    }
  }

  getSetupWindow(): BrowserWindow | null {
    return this.setupWindow;
  }

  private isFirstRunComplete(): boolean {
    try {
      const settingsPath = this.userDataManager.getSettingsPath();
      if (!fs.existsSync(settingsPath)) {
        return false;
      }
      
      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return !!settings.firstRunCompleted;
    } catch (error) {
      return false;
    }
  }

  async shouldShowSetup(): Promise<boolean> {
    // Check if it's the first run
    const isFirst = await this.isFirstRun();
    if (!isFirst) {
      return false;
    }

    // Additional checks to determine if setup should be shown
    try {
      // Check if essential components are already configured
      let settings = {};
      const settingsPath = this.userDataManager.getSettingsPath();
      if (fs.existsSync(settingsPath)) {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      }
      
      const modelConfig = this.userDataManager.loadModelConfig();
      
      // If we have API key and model configured, maybe skip detailed setup
      if ((settings as any).OPENAI_API_KEY && modelConfig?.llm) {
        console.log('🔍 First run but API key and model already configured');
        // Still show setup but might auto-advance through some steps
        return true;
      }

      return true;
    } catch (error) {
      console.error('Error checking setup requirements:', error);
      return true; // Show setup on error to be safe
    }
  }

  async handleAppReady(): Promise<void> {
    // Wait a bit for the app to fully initialize
    await new Promise(resolve => setTimeout(resolve, 1000));

    const shouldShow = await this.shouldShowSetup();
    if (shouldShow) {
      await this.showSetupWindow();
    }
  }

  // Cleanup method
  destroy(): void {
    this.closeSetupWindow();
  }
} 