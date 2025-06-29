import * as path from 'path';
import * as fs from 'fs';
import { app } from 'electron';
import { homedir } from 'os';

/**
 * Centralized User Data Manager for MetaKeyAI
 * 
 * Manages all persistent data in a centralized location that survives app updates:
 * - Spell books and custom spells
 * - User preferences and settings
 * - Python environment and dependencies
 * - Database files (future)
 * - Cache and temporary data
 */
export class UserDataManager {
  private static instance: UserDataManager;
  private readonly userDataRoot: string;
  private readonly spellsDir: string;
  private readonly pythonDir: string;
  private readonly settingsDir: string;
  private readonly cacheDir: string;
  private readonly databaseDir: string;

  private constructor() {
    // Use Electron's standard userData directory for proper app integration
    // This is the recommended approach for Electron apps
    try {
      this.userDataRoot = app.getPath('userData');
    } catch (error) {
      // Fallback for cases where app might not be ready yet
      console.warn('⚠️ Electron app not ready, using fallback userData path');
      this.userDataRoot = path.join(homedir(), '.config', 'metakeyai-app');
    }
    
    // Organize data by purpose within the standard directory
    this.spellsDir = path.join(this.userDataRoot, 'spells');
    this.pythonDir = path.join(this.userDataRoot, 'python-env');
    this.settingsDir = path.join(this.userDataRoot, 'settings');
    this.cacheDir = path.join(this.userDataRoot, 'cache');
    this.databaseDir = path.join(this.userDataRoot, 'database');

    this.ensureDirectories();
  }

  public static getInstance(): UserDataManager {
    if (!UserDataManager.instance) {
      UserDataManager.instance = new UserDataManager();
    }
    return UserDataManager.instance;
  }

  private ensureDirectories(): void {
    const dirs = [
      this.userDataRoot,
      this.spellsDir,
      this.pythonDir,
      this.settingsDir,
      this.cacheDir,
      this.databaseDir
    ];

    dirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
        console.log(`📁 Created user data directory: ${dir}`);
      }
    });
  }

  // Spell Management
  public getSpellBookPath(): string {
    return path.join(this.spellsDir, 'spell_book.json');
  }

  public getCustomSpellsDir(): string {
    return path.join(this.spellsDir, 'custom');
  }

  public saveSpellBook(spellBook: any): void {
    try {
      const spellBookPath = this.getSpellBookPath();
      fs.writeFileSync(spellBookPath, JSON.stringify(spellBook, null, 2));
      console.log(`📚 Spell book saved to: ${spellBookPath}`);
    } catch (error) {
      console.error('❌ Failed to save spell book:', error);
      throw error;
    }
  }

  public loadSpellBook(): any {
    try {
      const spellBookPath = this.getSpellBookPath();
      if (fs.existsSync(spellBookPath)) {
        const data = fs.readFileSync(spellBookPath, 'utf8');
        console.log(`📚 Spell book loaded from: ${spellBookPath}`);
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to load spell book:', error);
      return null;
    }
  }

  // Python Environment Management
  public getPythonEnvDir(): string {
    return this.pythonDir;
  }

  public getPythonProjectDir(): string {
    return path.join(this.pythonDir, 'project');
  }

  // Settings Management
  public getSettingsPath(): string {
    return path.join(this.settingsDir, 'config.json');
  }

  public getAudioSettingsPath(): string {
    return path.join(this.settingsDir, 'audio.json');
  }

  public saveAudioSettings(settings: any): void {
    try {
      const audioSettingsPath = this.getAudioSettingsPath();
      fs.writeFileSync(audioSettingsPath, JSON.stringify(settings, null, 2));
      console.log(`🎤 Audio settings saved to: ${audioSettingsPath}`);
    } catch (error) {
      console.error('❌ Failed to save audio settings:', error);
    }
  }

  public loadAudioSettings(): any {
    try {
      const audioSettingsPath = this.getAudioSettingsPath();
      if (fs.existsSync(audioSettingsPath)) {
        const data = fs.readFileSync(audioSettingsPath, 'utf8');
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to load audio settings:', error);
      return null;
    }
  }

  // Shortcuts Management
  public getShortcutsSettingsPath(): string {
    return path.join(this.settingsDir, 'shortcuts.json');
  }

  public saveShortcutsSettings(shortcuts: any): void {
    try {
      const shortcutsPath = this.getShortcutsSettingsPath();
      fs.writeFileSync(shortcutsPath, JSON.stringify(shortcuts, null, 2));
      console.log(`⌨️ Shortcuts settings saved to: ${shortcutsPath}`);
    } catch (error) {
      console.error('❌ Failed to save shortcuts settings:', error);
    }
  }

  public loadShortcutsSettings(): any {
    try {
      const shortcutsPath = this.getShortcutsSettingsPath();
      if (fs.existsSync(shortcutsPath)) {
        const data = fs.readFileSync(shortcutsPath, 'utf8');
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to load shortcuts settings:', error);
      return null;
    }
  }

  // Model Configuration Management
  public getModelConfigPath(): string {
    return path.join(this.settingsDir, 'model-config.json');
  }

  public saveModelConfig(config: { env: Record<string, string>; llm: string; llms?: string[] }): void {
    try {
      const configPath = this.getModelConfigPath();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`🤖 Model configuration saved to: ${configPath}`);
    } catch (error) {
      console.error('❌ Failed to save model configuration:', error);
      throw error;
    }
  }

  public loadModelConfig(): { env: Record<string, string>; llm: string; llms?: string[] } | null {
    try {
      const configPath = this.getModelConfigPath();
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to load model configuration:', error);
      return null;
    }
  }

  public migrateOldModelConfig(oldConfigPath: string): boolean {
    try {
      if (fs.existsSync(oldConfigPath)) {
        console.log('🔄 Migrating old model configuration from:', oldConfigPath);
        const oldData = JSON.parse(fs.readFileSync(oldConfigPath, 'utf8'));
        this.saveModelConfig(oldData);
        
        // Create backup of old file before removing
        const backupPath = oldConfigPath + '.backup';
        fs.copyFileSync(oldConfigPath, backupPath);
        fs.unlinkSync(oldConfigPath);
        
        console.log('✅ Model configuration migrated successfully');
        console.log('📦 Old file backed up to:', backupPath);
        return true;
      }
      return false;
    } catch (error) {
      console.error('❌ Failed to migrate old model configuration:', error);
      return false;
    }
  }

  // Cache Management
  public getCacheDir(): string {
    return this.cacheDir;
  }

  public getTempDir(): string {
    return path.join(this.cacheDir, 'temp');
  }

  // Database Management (future)
  public getDatabaseDir(): string {
    return this.databaseDir;
  }

  // Utility methods
  public getUserDataRoot(): string {
    return this.userDataRoot;
  }

  public getInfo(): any {
    return {
      userDataRoot: this.userDataRoot,
      directories: {
        spells: this.spellsDir,
        python: this.pythonDir,
        settings: this.settingsDir,
        cache: this.cacheDir,
        database: this.databaseDir
      },
      exists: {
        spellBook: fs.existsSync(this.getSpellBookPath()),
        audioSettings: fs.existsSync(this.getAudioSettingsPath()),
        shortcutsSettings: fs.existsSync(this.getShortcutsSettingsPath()),
        modelConfig: fs.existsSync(this.getModelConfigPath()),
        pythonConfig: fs.existsSync(this.getPythonConfigPath()),
        pythonEnv: fs.existsSync(this.getPythonEnvDir()),
        pastillePosition: fs.existsSync(this.getPastillePositionPath())
      }
    };
  }

  public cleanup(): void {
    // Clean up temporary files older than 24 hours
    try {
      const tempDir = this.getTempDir();
      if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        
        files.forEach(file => {
          const filePath = path.join(tempDir, file);
          const stats = fs.statSync(filePath);
          if (stats.mtime.getTime() < oneDayAgo) {
            fs.unlinkSync(filePath);
            console.log(`🧹 Cleaned up old temp file: ${file}`);
          }
        });
      }
    } catch (error) {
      console.log('⚠️ Cleanup failed:', error.message);
    }
  }

  // Python Configuration Management
  public getPythonConfigPath(): string {
    return path.join(this.settingsDir, 'python-config.json');
  }

  public savePythonConfig(config: {
    setupMethod: 'auto' | 'custom' | 'none';
    customPythonPath?: string;
    uvPath?: string;
    projectPath?: string;
    pythonPath?: string;
    uvInstallLocation?: 'system' | 'user-config';
    configuredAt: string;
    preferences?: {
      preferredPythonVersion?: string;
      autoUpdateDependencies?: boolean;
      useSystemPython?: boolean;
    };
  }): void {
    try {
      const configPath = this.getPythonConfigPath();
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
      console.log(`🐍 Python configuration saved to: ${configPath}`);
    } catch (error) {
      console.error('❌ Failed to save Python configuration:', error);
      throw error;
    }
  }

  public loadPythonConfig(): {
    setupMethod: 'auto' | 'custom' | 'none';
    customPythonPath?: string;
    uvPath?: string;
    projectPath?: string;
    pythonPath?: string;
    uvInstallLocation?: 'system' | 'user-config';
    configuredAt: string;
    preferences?: {
      preferredPythonVersion?: string;
      autoUpdateDependencies?: boolean;
      useSystemPython?: boolean;
    };
  } | null {
    try {
      const configPath = this.getPythonConfigPath();
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(data);
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to load Python configuration:', error);
      return null;
    }
  }

  // Legacy Python Config Migration
  public migrateLegacyPythonConfig(): boolean {
    try {
      // Check for old python-config.json in app userData directory
      const legacyPath = path.join(app.getPath('userData'), 'python-config.json');
      
      if (fs.existsSync(legacyPath)) {
        console.log('🔄 Migrating legacy Python configuration...');
        
        const legacyData = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        
        // Convert to new format
        const newConfig = {
          setupMethod: legacyData.setupMethod || 'none',
          customPythonPath: legacyData.customPythonPath,
          configuredAt: legacyData.configuredAt || new Date().toISOString(),
          preferences: {
            useSystemPython: legacyData.setupMethod === 'custom'
          }
        };
        
        this.savePythonConfig(newConfig);
        
        // Remove legacy file
        fs.unlinkSync(legacyPath);
        console.log('✅ Legacy Python configuration migrated successfully');
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('❌ Failed to migrate legacy Python configuration:', error);
      return false;
    }
  }

  // Pastille Position Management
  public getPastillePositionPath(): string {
    return path.join(this.settingsDir, 'pastille-position.json');
  }

  public getPastilleConfigPath(): string {
    return path.join(this.settingsDir, 'pastille-config.json');
  }

  public savePastillePosition(position: { x: number; y: number; displayId?: number }): void {
    try {
      const positionPath = this.getPastillePositionPath();
      const positionData = {
        ...position,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(positionPath, JSON.stringify(positionData, null, 2));
      console.log(`📍 Pastille position saved: ${position.x}, ${position.y}`);
    } catch (error) {
      console.error('❌ Failed to save pastille position:', error);
    }
  }

  public savePastilleConfig(config: {
    displayMode: string;
    mode: string;
    x?: number;
    y?: number;
  }): void {
    try {
      const configPath = this.getPastilleConfigPath();
      const configData = {
        ...config,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2));
      console.log(`📍 Pastille configuration saved:`, config);
    } catch (error) {
      console.error('❌ Failed to save pastille configuration:', error);
    }
  }

  public loadPastillePosition(): { x: number; y: number; displayId?: number; savedAt?: string } | null {
    try {
      const positionPath = this.getPastillePositionPath();
      if (fs.existsSync(positionPath)) {
        const data = fs.readFileSync(positionPath, 'utf8');
        const position = JSON.parse(data);
        console.log(`📍 Pastille position loaded: ${position.x}, ${position.y}`);
        return position;
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to load pastille position:', error);
      return null;
    }
  }

  public loadPastilleConfig(): {
    displayMode: string;
    mode: string;
    x?: number;
    y?: number;
    savedAt?: string;
  } | null {
    try {
      const configPath = this.getPastilleConfigPath();
      if (fs.existsSync(configPath)) {
        const data = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(data);
        console.log(`📍 Pastille configuration loaded:`, config);
        return config;
      }
      return null;
    } catch (error) {
      console.error('❌ Failed to load pastille configuration:', error);
      return null;
    }
  }

  // General Settings Management
  public getSettings(): any {
    try {
      const settingsPath = this.getSettingsPath();
      if (fs.existsSync(settingsPath)) {
        const data = fs.readFileSync(settingsPath, 'utf8');
        return JSON.parse(data);
      }
      return {};
    } catch (error) {
      console.error('❌ Failed to load general settings:', error);
      return {};
    }
  }

  public saveSettings(settings: any): void {
    try {
      const settingsPath = this.getSettingsPath();
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
      console.log(`⚙️ General settings saved to: ${settingsPath}`);
    } catch (error) {
      console.error('❌ Failed to save general settings:', error);
      throw error;
    }
  }

  public updateSettings(partialSettings: any): void {
    try {
      const currentSettings = this.getSettings();
      const updatedSettings = { ...currentSettings, ...partialSettings };
      this.saveSettings(updatedSettings);
      console.log(`⚙️ General settings updated`);
    } catch (error) {
      console.error('❌ Failed to update general settings:', error);
      throw error;
    }
  }
} 