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
    // Use a hidden directory in user's home for cross-platform compatibility
    // This survives app updates and is user-specific
    this.userDataRoot = path.join(homedir(), '.metakeyai');
    
    // Organize data by purpose
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

  public shouldUseCentralizedPython(): boolean {
    // Check if we have a centralized Python environment
    const pythonExe = process.platform === 'win32' ? 'python.exe' : 'python';
    const centralizedPython = path.join(this.pythonDir, 'bin', pythonExe);
    return fs.existsSync(centralizedPython);
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
        pythonEnv: fs.existsSync(this.getPythonEnvDir())
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
} 