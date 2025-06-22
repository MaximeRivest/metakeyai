import { globalShortcut } from 'electron';
import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';

export interface ShortcutConfig {
  id: string;
  name: string;
  description: string;
  defaultKey: string;
  currentKey: string;
  category: 'clipboard' | 'ai' | 'voice' | 'spells' | 'navigation';
  handler: () => void | Promise<void>;
}

export class ShortcutsManager {
  private shortcuts: Map<string, ShortcutConfig> = new Map();
  private configPath: string;
  private isInitialized = false;

  constructor() {
    this.configPath = path.join(__dirname, 'shortcuts_config.json');
    this.setupIpcHandlers();
  }

  async initialize(handlers: Record<string, () => void | Promise<void>>): Promise<void> {
    console.log('⌨️ Initializing Shortcuts Manager...');

    // Define default shortcuts
    const defaultShortcuts: Omit<ShortcutConfig, 'handler'>[] = [
      // AI Features
      {
        id: 'quick-edit',
        name: 'Quick Edit',
        description: 'AI-powered text editing and improvement',
        defaultKey: 'CommandOrControl+Alt+Q',
        currentKey: 'CommandOrControl+Alt+Q',
        category: 'ai'
      },
      {
        id: 'text-to-speech',
        name: 'Text to Speech',
        description: 'Convert clipboard text to speech',
        defaultKey: 'CommandOrControl+Alt+E',
        currentKey: 'CommandOrControl+Alt+E',
        category: 'voice'
      },
      
      // Voice Features
      {
        id: 'voice-record',
        name: 'Voice Record',
        description: 'Record voice and transcribe to text',
        defaultKey: 'CommandOrControl+Alt+W',
        currentKey: 'CommandOrControl+Alt+W',
        category: 'voice'
      },
      
      // Clipboard Navigation
      {
        id: 'clipboard-show',
        name: 'Show Clipboard',
        description: 'Display current clipboard content',
        defaultKey: 'CommandOrControl+Alt+C',
        currentKey: 'CommandOrControl+Alt+C',
        category: 'clipboard'
      },
      {
        id: 'clipboard-next',
        name: 'Next Clipboard',
        description: 'Navigate to next clipboard entry',
        defaultKey: 'CommandOrControl+Alt+Right',
        currentKey: 'CommandOrControl+Alt+Right',
        category: 'clipboard'
      },
      {
        id: 'clipboard-previous',
        name: 'Previous Clipboard',
        description: 'Navigate to previous clipboard entry',
        defaultKey: 'CommandOrControl+Alt+Left',
        currentKey: 'CommandOrControl+Alt+Left',
        category: 'clipboard'
      },
      
      // Additional Navigation (Linux workspace style)
      {
        id: 'clipboard-next-alt1',
        name: 'Next Clipboard (Numpad /)',
        description: 'Navigate to next clipboard entry (numpad divide)',
        defaultKey: 'CommandOrControl+Alt+numdiv',
        currentKey: 'CommandOrControl+Alt+numdiv',
        category: 'navigation'
      },
      {
        id: 'clipboard-previous-alt1',
        name: 'Previous Clipboard (Numpad -)',
        description: 'Navigate to previous clipboard entry (numpad subtract)',
        defaultKey: 'CommandOrControl+Alt+numsub',
        currentKey: 'CommandOrControl+Alt+numsub',
        category: 'navigation'
      },
      {
        id: 'clipboard-next-alt2',
        name: 'Next Clipboard (Custom)',
        description: 'Navigate to next clipboard entry (user assignable)',
        defaultKey: '',
        currentKey: '',
        category: 'navigation'
      },
      {
        id: 'clipboard-previous-alt2',
        name: 'Previous Clipboard (Custom)',
        description: 'Navigate to previous clipboard entry (user assignable)',
        defaultKey: '',
        currentKey: '',
        category: 'navigation'
      },
      
      // Spell Categories
      {
        id: 'spells-analysis',
        name: 'Analysis Spells',
        description: 'Cast analysis category spells',
        defaultKey: 'CommandOrControl+Alt+A',
        currentKey: 'CommandOrControl+Alt+A',
        category: 'spells'
      },
      {
        id: 'spells-data',
        name: 'Data Spells',
        description: 'Cast data processing spells',
        defaultKey: 'CommandOrControl+Alt+D',
        currentKey: 'CommandOrControl+Alt+D',
        category: 'spells'
      },
      {
        id: 'spells-text',
        name: 'Text Spells',
        description: 'Cast text processing spells',
        defaultKey: 'CommandOrControl+Alt+T',
        currentKey: 'CommandOrControl+Alt+T',
        category: 'spells'
      }
    ];

    // Add quick spell slots (1-9)
    for (let i = 1; i <= 9; i++) {
      defaultShortcuts.push({
        id: `spell-slot-${i}`,
        name: `Quick Spell ${i}`,
        description: `Cast spell assigned to slot ${i}`,
        defaultKey: `CommandOrControl+Alt+${i}`,
        currentKey: `CommandOrControl+Alt+${i}`,
        category: 'spells'
      });
    }

    // Load saved shortcuts or use defaults
    await this.loadShortcuts();

    // Register shortcuts with handlers
    for (const shortcutData of defaultShortcuts) {
      const handler = handlers[shortcutData.id];
      if (handler) {
        const shortcut: ShortcutConfig = {
          ...shortcutData,
          handler
        };
        
        // Use saved key if available, otherwise use default
        const savedShortcut = this.shortcuts.get(shortcutData.id);
        if (savedShortcut) {
          shortcut.currentKey = savedShortcut.currentKey;
        }
        
        this.shortcuts.set(shortcutData.id, shortcut);
      }
    }

    // Register all shortcuts
    await this.registerAllShortcuts();
    
    this.isInitialized = true;
    console.log('✅ Shortcuts Manager initialized with', this.shortcuts.size, 'shortcuts');
  }

  private async loadShortcuts(): Promise<void> {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf8');
        const savedShortcuts = JSON.parse(data);
        
        for (const shortcut of savedShortcuts) {
          this.shortcuts.set(shortcut.id, shortcut);
        }
        
        console.log('📖 Loaded shortcuts configuration');
      }
    } catch (error) {
      console.warn('⚠️ Could not load shortcuts configuration:', error);
    }
  }

  private async saveShortcuts(): Promise<void> {
    try {
      const shortcutsArray = Array.from(this.shortcuts.values()).map(shortcut => ({
        id: shortcut.id,
        name: shortcut.name,
        description: shortcut.description,
        defaultKey: shortcut.defaultKey,
        currentKey: shortcut.currentKey,
        category: shortcut.category
      }));
      
      fs.writeFileSync(this.configPath, JSON.stringify(shortcutsArray, null, 2));
      console.log('💾 Saved shortcuts configuration');
    } catch (error) {
      console.error('❌ Failed to save shortcuts configuration:', error);
    }
  }

  private async registerAllShortcuts(): Promise<void> {
    // Unregister all existing shortcuts first
    globalShortcut.unregisterAll();
    
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    
    for (const [id, shortcut] of this.shortcuts) {
      // Skip empty shortcuts
      if (!shortcut.currentKey || shortcut.currentKey.trim() === '') {
        skippedCount++;
        console.log(`⌨️ ${shortcut.name}: ⏭️ Skipped (no key assigned)`);
        continue;
      }
      
      try {
        const success = globalShortcut.register(shortcut.currentKey, shortcut.handler);
        if (success) {
          successCount++;
          console.log(`⌨️ ${shortcut.name} (${shortcut.currentKey}): ✅`);
        } else {
          failCount++;
          console.log(`⌨️ ${shortcut.name} (${shortcut.currentKey}): ❌ Failed to register`);
        }
      } catch (error) {
        failCount++;
        console.log(`⌨️ ${shortcut.name} (${shortcut.currentKey}): ❌ Error:`, error.message);
      }
    }
    
    console.log(`✅ Registered ${successCount} shortcuts, ${failCount} failed, ${skippedCount} skipped`);
  }

  async updateShortcut(id: string, newKey: string): Promise<boolean> {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) {
      console.error('❌ Shortcut not found:', id);
      return false;
    }

    // Allow empty keys (to unassign shortcuts)
    if (!newKey || newKey.trim() === '') {
      // Unregister the old key if it exists
      if (shortcut.currentKey && shortcut.currentKey.trim() !== '') {
        globalShortcut.unregister(shortcut.currentKey);
      }
      shortcut.currentKey = '';
      await this.saveShortcuts();
      console.log(`✅ Unassigned shortcut ${shortcut.name}`);
      return true;
    }

    // Check if the new key is already in use
    for (const [otherId, otherShortcut] of this.shortcuts) {
      if (otherId !== id && otherShortcut.currentKey === newKey) {
        console.error('❌ Shortcut key already in use:', newKey);
        return false;
      }
    }

    // Test if the new key can be registered
    try {
      // Temporarily unregister the old key if it exists
      if (shortcut.currentKey && shortcut.currentKey.trim() !== '') {
        globalShortcut.unregister(shortcut.currentKey);
      }
      
      // Try to register the new key
      const success = globalShortcut.register(newKey, shortcut.handler);
      
      if (success) {
        shortcut.currentKey = newKey;
        await this.saveShortcuts();
        console.log(`✅ Updated shortcut ${shortcut.name}: ${newKey}`);
        return true;
      } else {
        // Re-register the old key if new one failed and old key existed
        if (shortcut.currentKey && shortcut.currentKey.trim() !== '') {
          globalShortcut.register(shortcut.currentKey, shortcut.handler);
        }
        console.error('❌ Failed to register new shortcut key:', newKey);
        return false;
      }
    } catch (error) {
      // Re-register the old key if there was an error and old key existed
      if (shortcut.currentKey && shortcut.currentKey.trim() !== '') {
        globalShortcut.register(shortcut.currentKey, shortcut.handler);
      }
      console.error('❌ Error updating shortcut:', error);
      return false;
    }
  }

  async resetShortcut(id: string): Promise<boolean> {
    const shortcut = this.shortcuts.get(id);
    if (!shortcut) {
      return false;
    }

    // If default key is empty, just unassign the shortcut
    if (!shortcut.defaultKey || shortcut.defaultKey.trim() === '') {
      return this.updateShortcut(id, '');
    }

    return this.updateShortcut(id, shortcut.defaultKey);
  }

  async resetAllShortcuts(): Promise<void> {
    for (const [id, shortcut] of this.shortcuts) {
      shortcut.currentKey = shortcut.defaultKey;
    }
    
    await this.registerAllShortcuts();
    await this.saveShortcuts();
    console.log('🔄 Reset all shortcuts to defaults');
  }

  getShortcuts(): ShortcutConfig[] {
    return Array.from(this.shortcuts.values()).map(shortcut => ({
      ...shortcut,
      handler: undefined as any // Don't send the handler function over IPC
    }));
  }

  getShortcutsByCategory(category: string): ShortcutConfig[] {
    return this.getShortcuts().filter(shortcut => shortcut.category === category);
  }

  private setupIpcHandlers(): void {
    ipcMain.handle('get-shortcuts', () => {
      return this.getShortcuts();
    });

    ipcMain.handle('get-shortcuts-by-category', (event, category: string) => {
      return this.getShortcutsByCategory(category);
    });

    ipcMain.handle('update-shortcut', async (event, id: string, newKey: string) => {
      return this.updateShortcut(id, newKey);
    });

    ipcMain.handle('reset-shortcut', async (event, id: string) => {
      return this.resetShortcut(id);
    });

    ipcMain.handle('reset-all-shortcuts', async () => {
      await this.resetAllShortcuts();
      return true;
    });

    ipcMain.handle('test-shortcut-key', (event, key: string) => {
      // Check if key is already in use
      for (const shortcut of this.shortcuts.values()) {
        if (shortcut.currentKey === key) {
          return { available: false, usedBy: shortcut.name };
        }
      }
      return { available: true };
    });
  }

  cleanup(): void {
    console.log('🧹 Cleaning up Shortcuts Manager...');
    globalShortcut.unregisterAll();
  }
} 