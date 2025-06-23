import { PythonRunner } from './python-runner';
import { PythonDaemon } from './python-daemon';
import { ipcMain, BrowserWindow, globalShortcut, app, clipboard, Notification } from 'electron';
import path from 'path';
import fs from 'fs';
import { PythonEnvironmentManager } from './python-env-manager';
import { UserDataManager } from './user-data-manager';

export interface PythonSpell {
  id: string;
  name: string;
  description: string;
  script?: string;           // Inline Python code
  scriptFile?: string;       // Path to Python file
  args?: string[];          // Default arguments
  category: string;         // Category like 'text', 'data', 'analysis', etc.
  icon?: string;            // Emoji icon for the spell
  shortcut?: string;        // Keyboard shortcut (e.g., 'Ctrl+Alt+1')
  quickSlot?: number;       // Quick cast slot (1-9)
  timeout?: number;         // Custom timeout
  requiresInput?: boolean;  // Whether spell needs clipboard input
  outputFormat?: 'text' | 'json' | 'replace' | 'append';
  estimatedTime?: string;   // Human readable execution time estimate
}

export interface SpellResult {
  spellId: string;
  spellName: string;
  success: boolean;
  output: string;
  executionTime: number;
  error?: string;
}

interface SpellDependencyInfo {
  requirements: string[];
  optionalRequirements?: string[];
  conflicts?: string[];
  jupyterInstalls?: string[];  // Lines starting with #!uv add or #!pip install
}

export class PythonSpellCaster {
  private pythonRunner: PythonRunner;
  private pythonDaemon: PythonDaemon | null = null;
  private spellBook: Map<string, PythonSpell> = new Map();
  private quickSlots: (PythonSpell | null)[] = new Array(9).fill(null);
  private userDataManager: UserDataManager;
  private isInitialized = false;
  private loadedSpells: Set<string> = new Set(); // Track what's loaded in Python process
  private pythonEnvManager: PythonEnvironmentManager;

  constructor() {
    this.pythonRunner = new PythonRunner();
    this.userDataManager = UserDataManager.getInstance();
    this.pythonEnvManager = new PythonEnvironmentManager();
    this.setupIpcHandlers();
  }

  private getScriptPath(filename: string): string {
    // In webpack build, scripts are copied to __dirname/python_scripts
    const webpackPath = path.join(__dirname, 'python_scripts', filename);
    
    // In development, scripts are in src/python_scripts relative to project root
    const devPath = path.join(__dirname, '..', 'src', 'python_scripts', filename);
    
    // In packaged app, they should be in resources - Note: Electron Forge copies our 'resources' folder into the app's resources directory
    const prodPath = path.join(process.resourcesPath, 'resources', 'python_scripts', filename);
    
    console.log('🔍 Checking script paths:');
    console.log('  Webpack path:', webpackPath, fs.existsSync(webpackPath) ? '✅' : '❌');
    console.log('  Dev path:', devPath, fs.existsSync(devPath) ? '✅' : '❌');
    console.log('  Prod path:', prodPath, fs.existsSync(prodPath) ? '✅' : '❌');
    
    // Check paths in order of preference
    if (fs.existsSync(webpackPath)) {
      console.log('📁 Using webpack path:', webpackPath);
      return webpackPath;
    } else if (fs.existsSync(devPath)) {
      console.log('📁 Using dev path:', devPath);
      return devPath;
    } else if (fs.existsSync(prodPath)) {
      console.log('📁 Using prod path:', prodPath);
      return prodPath;
    } else {
      console.error('❌ No valid Python script path found for:', filename);
      return webpackPath; // Return the expected path anyway
    }
  }

  async initialize(): Promise<void> {
    console.log('🧙‍♂️ Initializing Python Spell Caster...');
    
    try {
      // In development, initialize the environment to support running .py scripts directly
      if (!app.isPackaged) {
        const envInfo = await this.pythonRunner.initializeEnvironment();
        console.log(`🐍 In dev mode, Python detected: ${envInfo.version}`);
      }

      // Start the shared Python daemon (which now knows if it's packaged or not)
      this.pythonDaemon = await PythonDaemon.getInstance();

      // Load spell book
      await this.loadSpellBook();
      
      // Register default spells
      await this.registerDefaultSpells();
      
      // Setup keyboard shortcuts
      this.setupKeyboardShortcuts();
      
      this.isInitialized = true;
      console.log('✨ Spell Caster ready! Spell book contains', this.spellBook.size, 'spells');
      
    } catch (error) {
      console.error('❌ Failed to initialize Spell Caster:', error);
      
      // Try to continue with fallback Python
      try {
        console.log('🔄 Attempting fallback initialization...');
        await this.loadSpellBook();
        await this.registerDefaultSpells();
        this.setupKeyboardShortcuts();
        this.isInitialized = true;
        console.log('⚠️ Spell Caster initialized with limited functionality');
      } catch (fallbackError) {
        console.error('❌ Fallback initialization also failed:', fallbackError);
        throw error;
      }
    }
  }

  async initializeFallback(): Promise<void> {
    console.log('🧙‍♂️ Initializing Python Spell Caster in fallback mode...');
    
    try {
      // Load spell book
      await this.loadSpellBook();
      
      // Register default spells with local Python only
      await this.registerDefaultSpells();
      
      // Setup keyboard shortcuts
      this.setupKeyboardShortcuts();
      
      this.isInitialized = true;
      console.log('⚠️ Spell Caster ready with limited functionality! Spell book contains', this.spellBook.size, 'spells');
      console.log('📝 Note: Python daemon not available - spells will run with local Python only');
      
    } catch (error) {
      console.error('❌ Failed to initialize Spell Caster in fallback mode:', error);
      throw error;
    }
  }

  private setupIpcHandlers(): void {
    // Cast spell by ID
    ipcMain.handle('cast-spell', async (event, spellId: string, input?: string) => {
      return this.castSpell(spellId, input);
    });

    // Cast spell by quick slot
    ipcMain.handle('cast-quick-spell', async (event, slot: number, input?: string) => {
      return this.castQuickSpell(slot, input);
    });

    // Get all spells
    ipcMain.handle('get-spell-book', async () => {
      return this.getSpellBook();
    });

    // Get quick slots
    ipcMain.handle('get-quick-slots', async () => {
      return this.getQuickSlots();
    });

    // Assign spell to quick slot
    ipcMain.handle('assign-quick-slot', async (event, spellId: string, slot: number) => {
      return this.assignQuickSlot(spellId, slot);
    });

    // Add custom spell
    ipcMain.handle('add-custom-spell', async (event, spell: Partial<PythonSpell>) => {
      return this.addCustomSpell(spell);
    });

    // Update spell
    ipcMain.handle('update-spell', async (event, spellId: string, updates: Partial<PythonSpell>) => {
      return this.updateSpell(spellId, updates);
    });

    // Delete spell
    ipcMain.handle('delete-spell', async (event, spellId: string) => {
      return this.deleteSpell(spellId);
    });

    // Test Python setup
    ipcMain.handle('test-python', async () => {
      try {
        const info = await this.pythonRunner.getInfo();
        return { success: true, info };
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });

    // Test custom spell
    ipcMain.handle('test-custom-spell', async (event, spell: Partial<PythonSpell>, input?: string) => {
      try {
        const result = await this.testSpell(spell, input);
        return result;
      } catch (error) {
        return { success: false, error: (error as Error).message };
      }
    });
  }

  private setupKeyboardShortcuts(): void {
    console.log('⌨️ Spell shortcuts will be managed by ShortcutsManager');
    // Shortcuts are now handled by the global ShortcutsManager to allow customization
  }

  private async castSpellByCategory(category: string): Promise<void> {
    const categorySpells = Array.from(this.spellBook.values())
      .filter(spell => spell.category === category);

    if (categorySpells.length === 0) {
      this.showSpellError('Category Cast', `No spells found in category: ${category}`);
      return;
    }

    // Use the first spell in the category (could be enhanced with a selection dialog)
    const spell = categorySpells[0];
    const clipboardContent = clipboard.readText();
    
    const result = await this.castSpell(spell.id, clipboardContent);
    this.showSpellResult(result);
  }

  /**
   * Parse spell file for dependency declarations
   */
  private parseSpellDependencies(spellContent: string): SpellDependencyInfo {
    const lines = spellContent.split('\n');
    const jupyterInstalls: string[] = [];
    let requirements: string[] = [];
    let optionalRequirements: string[] = [];
    let conflicts: string[] = [];

    // Extract META if present
    const metaMatch = spellContent.match(/META\s*=\s*{([^}]+)}/g);
    if (metaMatch) {
      try {
        // Simple extraction - in production, use proper Python AST parsing
        const metaContent = metaMatch[1];
        
        const reqMatch = metaContent.match(/"requirements":\s*\[([^\]]+)\]/);
        if (reqMatch) {
          requirements = reqMatch[1].split(',').map(r => r.trim().replace(/['"]/g, ''));
        }

        const optMatch = metaContent.match(/"optional_requirements":\s*\[([^\]]+)\]/);
        if (optMatch) {
          optionalRequirements = optMatch[1].split(',').map(r => r.trim().replace(/['"]/g, ''));
        }

        const conflictMatch = metaContent.match(/"conflicts":\s*\[([^\]]+)\]/);
        if (conflictMatch) {
          conflicts = conflictMatch[1].split(',').map(r => r.trim().replace(/['"]/g, ''));
        }
      } catch (error) {
        console.warn('Failed to parse META block:', error);
      }
    }

    // Extract Jupyter-style install commands
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('#!uv add') || trimmed.startsWith('#!pip install')) {
        jupyterInstalls.push(trimmed.substring(2)); // Remove #!
      }
    }

    return {
      requirements,
      optionalRequirements,
      conflicts,
      jupyterInstalls
    };
  }

  /**
   * Smart spell installation with dependency conflict resolution
   */
  async installSpell(spellPath: string, spellContent?: string): Promise<{success: boolean, conflicts?: string[], resolution?: string}> {
    try {
      // Read spell content if not provided
      if (!spellContent) {
        spellContent = fs.readFileSync(spellPath, 'utf-8');
      }

      const depInfo = this.parseSpellDependencies(spellContent);
      
      // Check for conflicts with existing environment
      const conflicts = await this.checkDependencyConflicts(depInfo);
      
      if (conflicts.length > 0) {
        // Return conflict information for user resolution
        return {
          success: false,
          conflicts,
          resolution: await this.suggestConflictResolution(conflicts, depInfo)
        };
      }

      // Install dependencies
      await this.installSpellDependencies(depInfo);
      
      // Register the spell
      const spell = await this.parseSpellFile(spellPath);
      this.spellBook.set(spell.id, spell);
      await this.saveSpellBook();
      
      console.log(`✅ Spell installed successfully: ${spell.name}`);
      return { success: true };

    } catch (error) {
      console.error('❌ Failed to install spell:', error);
      return { success: false, conflicts: [(error as Error).message] };
    }
  }

  /**
   * Parse a spell file to create a PythonSpell object
   */
  private async parseSpellFile(spellPath: string): Promise<PythonSpell> {
    const spellContent = fs.readFileSync(spellPath, 'utf-8');
    const filename = path.basename(spellPath, '.py');
    
    // Extract basic info from file content (could be enhanced with proper parsing)
    const nameMatch = spellContent.match(/# *NAME: *(.+)/i);
    const descMatch = spellContent.match(/# *DESCRIPTION: *(.+)/i);
    const categoryMatch = spellContent.match(/# *CATEGORY: *(.+)/i);
    const iconMatch = spellContent.match(/# *ICON: *(.+)/i);
    
    return {
      id: filename,
      name: nameMatch ? nameMatch[1].trim() : filename,
      description: descMatch ? descMatch[1].trim() : 'Custom spell',
      scriptFile: spellPath,
      category: categoryMatch ? categoryMatch[1].trim() : 'custom',
      icon: iconMatch ? iconMatch[1].trim() : '✨',
      requiresInput: true,
      outputFormat: 'text'
    };
  }

  /**
   * Check for dependency conflicts
   */
  private async checkDependencyConflicts(depInfo: SpellDependencyInfo): Promise<string[]> {
    const conflicts: string[] = [];
    
    try {
      // Get current environment state
      const envInfo = await this.pythonEnvManager.getEnvironmentInfo();
      const installedPackages = envInfo.packages;

      // Check explicit conflicts
      for (const conflict of depInfo.conflicts || []) {
        const conflictPackage = conflict.split(/[<>=!]/)[0];
        if (installedPackages.some(pkg => pkg.startsWith(conflictPackage))) {
          conflicts.push(`Conflicts with installed package: ${conflict}`);
        }
      }

      // Check for version conflicts (simplified - UV will do the real check)
      for (const requirement of depInfo.requirements) {
        const packageName = requirement.split(/[<>=!]/)[0];
        const existing = installedPackages.find(pkg => pkg.startsWith(packageName));
        
        if (existing && requirement.includes('==')) {
          // Exact version requirement - check if it matches
          const requiredVersion = requirement.split('==')[1];
          if (!existing.includes(requiredVersion)) {
            conflicts.push(`Version conflict: need ${requirement}, have ${existing}`);
          }
        }
      }

      return conflicts;
    } catch (error) {
      console.warn('Could not check conflicts:', error);
      return []; // Proceed if we can't check
    }
  }

  /**
   * Suggest resolution for conflicts
   */
  private async suggestConflictResolution(conflicts: string[], depInfo: SpellDependencyInfo): Promise<string> {
    const suggestions = [
      "Dependency conflicts detected. Options:",
      "",
      "1. Update conflicting packages to compatible versions",
      "2. Remove conflicting spells",
      "3. Use optional dependencies instead",
      "",
      "Conflicts:",
      ...conflicts.map(c => `  - ${c}`),
      "",
      "Would you like to:"
    ];

    // Add specific suggestions based on conflict type
    if (conflicts.some(c => c.includes('Version conflict'))) {
      suggestions.push("  • Update existing packages to compatible versions?");
    }
    
    if (depInfo.optionalRequirements?.length) {
      suggestions.push("  • Install with optional dependencies only?");
    }

    return suggestions.join('\n');
  }

  /**
   * Install spell dependencies using UV
   */
  private async installSpellDependencies(depInfo: SpellDependencyInfo): Promise<void> {
    // Process Jupyter-style installs first
    for (const installCmd of depInfo.jupyterInstalls || []) {
      if (installCmd.startsWith('uv add')) {
        const packages = installCmd.substring(6).trim().split(' ');
        await this.pythonEnvManager.installSpellDependencies(packages);
      } else if (installCmd.startsWith('pip install')) {
        // Convert to UV add
        const packages = installCmd.substring(11).trim().split(' ');
        await this.pythonEnvManager.installSpellDependencies(packages);
      }
    }

    // Install required dependencies
    if (depInfo.requirements.length > 0) {
      await this.pythonEnvManager.installSpellDependencies(depInfo.requirements);
    }
  }

  /**
   * Load spell into shared Python process for execution
   */
  private async loadSpellIntoProcess(spellId: string): Promise<void> {
    if (this.loadedSpells.has(spellId)) {
      return; // Already loaded
    }

    try {
      const spell = this.spellBook.get(spellId);
      if (!spell) {
        throw new Error(`Spell not found: ${spellId}`);
      }

      // For now, just mark as loaded. In a full implementation,
      // this would send the spell to the daemon for preprocessing
      this.loadedSpells.add(spellId);
      console.log(`📚 Loaded spell into process: ${spellId}`);
    } catch (error) {
      console.error(`❌ Failed to load spell ${spellId}:`, error);
      throw error;
    }
  }

  /**
   * Enhanced spell casting with lazy loading
   */
  async castSpell(spellId: string, input?: string): Promise<SpellResult> {
    const startTime = Date.now();
    
    try {
      // Ensure spell is loaded in process
      await this.loadSpellIntoProcess(spellId);
      
      const spell = this.spellBook.get(spellId);
      if (!spell) {
        throw new Error(`Spell not found: ${spellId}`);
      }

      // Get input from clipboard if needed
      let actualInput = input;
      if (spell.requiresInput && !actualInput) {
        actualInput = clipboard.readText();
      }

      let output: string;

      // Execute spell based on type
      if (spell.script) {
        // Inline script
        if (this.pythonDaemon) {
          const result = await this.pythonDaemon.castSpell({
            spellId,
            script: spell.script,
            input: actualInput || ''
          });
          output = result.output || '';
        } else {
          output = await this.pythonRunner.runScript(spell.script, actualInput);
        }
      } else if (spell.scriptFile) {
        // Script file
        if (this.pythonDaemon) {
          const result = await this.pythonDaemon.castSpell({
            spellId,
            scriptFile: spell.scriptFile,
            input: actualInput || ''
          });
          output = result.output || '';
        } else {
          output = await this.pythonRunner.runFile(spell.scriptFile, spell.args, actualInput);
        }
      } else {
        throw new Error('Spell has no script or scriptFile');
      }

      const executionTime = Date.now() - startTime;
      
      // Handle output formatting
      await this.handleSpellOutput(spell, output);

      const result: SpellResult = {
        spellId,
        spellName: spell.name,
        success: true,
        output,
        executionTime
      };

      return result;

    } catch (error) {
      const executionTime = Date.now() - startTime;
      const result: SpellResult = {
        spellId,
        spellName: this.spellBook.get(spellId)?.name || spellId,
        success: false,
        output: '',
        executionTime,
        error: (error as Error).message
      };

      return result;
    }
  }

  /**
   * Cast spell by quick slot number
   */
  async castQuickSpell(slot: number, input?: string): Promise<SpellResult> {
    const spell = this.quickSlots[slot - 1];
    if (!spell) {
      throw new Error(`No spell assigned to quick slot ${slot}`);
    }
    return this.castSpell(spell.id, input);
  }

  /**
   * Preload shortcut spells for instant access
   */
  async preloadShortcutSpells(): Promise<void> {
    console.log('🚀 Preloading shortcut spells...');
    
    const shortcutSpells = this.quickSlots.filter(spell => spell !== null);
    for (const spell of shortcutSpells) {
      try {
        await this.loadSpellIntoProcess(spell!.id);
      } catch (error) {
        console.warn(`⚠️ Failed to preload spell ${spell!.id}:`, error);
      }
    }
    
    console.log(`✅ Preloaded ${shortcutSpells.length} shortcut spells`);
  }

  private async handleSpellOutput(spell: PythonSpell, output: string): Promise<void> {
    switch (spell.outputFormat) {
      case 'replace':
        clipboard.writeText(output);
        console.log('📋 ✨ Replaced clipboard with spell output');
        break;
        
      case 'append': {
        const currentClipboard = clipboard.readText();
        clipboard.writeText(currentClipboard + '\n\n' + output);
        console.log('📋 ✨ Appended spell output to clipboard');
        break;
      }
        
      case 'text':
      case 'json':
      default:
        clipboard.writeText(output);
        console.log('📋 ✨ Copied spell output to clipboard');
        break;
    }
    
    // Trigger magical feedback by sending IPC to main process
    const windows = BrowserWindow.getAllWindows();
    const mainWindow = windows.find(w => w.webContents.getURL().includes('pastille'));
    
    if (mainWindow && output) {
      // Send spell completion to trigger magical feedback
      mainWindow.webContents.send('show-spell-result', output);
      console.log('✨ Triggered magical spell completion feedback');
    }
  }

  private showSpellResult(result: SpellResult): void {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach(window => {
      window.webContents.send('spell-result', result);
    });

    // Also show system notification for quick feedback
    if (result.success) {
      new Notification({
        title: `✨ ${result.spellName}`,
        body: `Spell completed in ${result.executionTime}ms`,
        silent: true
      }).show();
    } else {
      new Notification({
        title: `❌ ${result.spellName} Failed`,
        body: result.error || 'Spell casting failed',
        silent: false
      }).show();
    }
  }

  private showSpellError(spellName: string, error: string): void {
    new Notification({
      title: `❌ ${spellName} Failed`,
      body: error,
      silent: false
    }).show();
  }

  private async registerDefaultSpells(): Promise<void> {
    console.log('📚 Registering default spells...');

    // 1) Try to fetch spells advertised by the Python daemon
    let discovered: unknown[] = [];
    if (this.pythonDaemon) {
      try {
        discovered = await this.pythonDaemon.listSpells();
        console.log('🔍 Daemon reported', discovered.length, 'spells');
      } catch (err) {
        console.warn('⚠️ Could not list spells from daemon:', (err as Error).message);
      }
    }

    // 2) Convert meta objects → PythonSpell and register
    for (const meta of discovered) {
      const spellMeta = meta as Record<string, unknown>;
      const spell: PythonSpell = {
        id: spellMeta.id as string,
        name: (spellMeta.name as string) || (spellMeta.id as string),
        description: (spellMeta.description as string) || '',
        scriptFile: spellMeta.scriptFile as string,
        category: (spellMeta.category as string) || 'misc',
        icon: spellMeta.icon as string,
        requiresInput: true,
        outputFormat: 'text',
      };
      this.spellBook.set(spell.id, spell);
    }

    // 3) If nothing discovered, register two tiny placeholder spells to teach users
    if (this.spellBook.size === 0) {
      const echoPath = this.getScriptPath(path.join('spells', 'echo.py'));
      const wcPath = this.getScriptPath(path.join('spells', 'word_count.py'));

      const placeholders: PythonSpell[] = [
        {
          id: 'echo',
          name: 'Echo',
          description: 'Returns the input unchanged. Use it as a template for new spells.',
          scriptFile: echoPath,
          category: 'text',
          icon: '🪞',
          requiresInput: true,
          outputFormat: 'replace',
        },
        {
          id: 'word_count',
          name: 'Word Count',
          description: 'Counts words and characters – another simple template.',
          scriptFile: wcPath,
          category: 'text',
          icon: '🔢',
          requiresInput: true,
          outputFormat: 'text',
        },
      ];

      for (const p of placeholders) {
        this.spellBook.set(p.id, p);
      }
    }

    console.log('📖 Default spells registered:', Array.from(this.spellBook.keys()));
  }

  private async loadSpellBook(): Promise<void> {
    try {
      const savedData = this.userDataManager.loadSpellBook();
      
      if (savedData) {
        // Load custom spells
        if (savedData.spells) {
          for (const spell of savedData.spells) {
            this.spellBook.set(spell.id, spell);
          }
        }
        
        // Load quick slot assignments
        if (savedData.quickSlots) {
          this.quickSlots = savedData.quickSlots;
        }
        
        console.log('📖 Loaded spell book from centralized storage');
      }
    } catch (error) {
      console.warn('⚠️ Could not load spell book:', error);
    }
  }

  private async saveSpellBook(): Promise<void> {
    try {
      const data = {
        spells: Array.from(this.spellBook.values()),
        quickSlots: this.quickSlots,
      };

      this.userDataManager.saveSpellBook(data);
    } catch (error) {
      console.error('❌ Failed to save spell book:', error);
    }
  }

  // Public API methods

  getSpellBook(): PythonSpell[] {
    return Array.from(this.spellBook.values());
  }

  getQuickSlots(): (PythonSpell | null)[] {
    return this.quickSlots;
  }

  assignQuickSlot(spellId: string, slot: number): boolean {
    if (slot < 1 || slot > 9) return false;
    
    const spell = this.spellBook.get(spellId);
    if (!spell) return false;
    
    this.quickSlots[slot - 1] = spell;
    this.saveSpellBook();
    return true;
  }

  async addCustomSpell(spellData: Partial<PythonSpell>): Promise<string> {
    const spell: PythonSpell = {
      id: spellData.id || `spell_${Date.now()}`,
      name: spellData.name || 'Unnamed Spell',
      description: spellData.description || '',
      script: spellData.script,
      scriptFile: spellData.scriptFile,
      args: spellData.args,
      category: spellData.category || 'custom',
      icon: spellData.icon || '✨',
      shortcut: spellData.shortcut,
      quickSlot: spellData.quickSlot,
      timeout: spellData.timeout,
      requiresInput: spellData.requiresInput ?? true,
      outputFormat: spellData.outputFormat || 'text',
      estimatedTime: spellData.estimatedTime
    };

    this.spellBook.set(spell.id, spell);
    await this.saveSpellBook();
    
    return spell.id;
  }

  updateSpell(spellId: string, updates: Partial<PythonSpell>): boolean {
    const spell = this.spellBook.get(spellId);
    if (!spell) return false;

    Object.assign(spell, updates);
    this.saveSpellBook();
    return true;
  }

  deleteSpell(spellId: string): boolean {
    if (!this.spellBook.has(spellId)) return false;
    
    this.spellBook.delete(spellId);
    
    // Remove from quick slots
    for (let i = 0; i < this.quickSlots.length; i++) {
      if (this.quickSlots[i]?.id === spellId) {
        this.quickSlots[i] = null;
      }
    }
    
    this.saveSpellBook();
    return true;
  }

  async testSpell(spellData: Partial<PythonSpell>, input?: string): Promise<SpellResult> {
    const tempSpell: PythonSpell = {
      id: 'test_spell',
      name: spellData.name || 'Test Spell',
      description: spellData.description || '',
      script: spellData.script,
      scriptFile: spellData.scriptFile,
      args: spellData.args,
      category: spellData.category || 'test',
      icon: spellData.icon || '🧪',
      timeout: spellData.timeout,
      requiresInput: spellData.requiresInput ?? true,
      outputFormat: spellData.outputFormat || 'text'
    };

    const startTime = Date.now();

    try {
      let output: string;

      if (tempSpell.script) {
        if (this.pythonDaemon) {
          const result = await this.pythonDaemon.castSpell({
            spellId: 'test_spell',
            script: tempSpell.script,
            input: input || ''
          });
          output = result.output || '';
        } else {
          output = await this.pythonRunner.runScript(tempSpell.script, input);
        }
      } else if (tempSpell.scriptFile) {
        if (this.pythonDaemon) {
          const result = await this.pythonDaemon.castSpell({
            spellId: 'test_spell',
            scriptFile: tempSpell.scriptFile,
            input: input || ''
          });
          output = result.output || '';
        } else {
          output = await this.pythonRunner.runFile(tempSpell.scriptFile, tempSpell.args, input);
        }
      } else {
        throw new Error('No script or scriptFile provided');
      }

      return {
        spellId: 'test_spell',
        spellName: tempSpell.name,
        success: true,
        output,
        executionTime: Date.now() - startTime
      };

    } catch (error) {
      return {
        spellId: 'test_spell',
        spellName: tempSpell.name,
        success: false,
        output: '',
        executionTime: Date.now() - startTime,
        error: (error as Error).message
      };
    }
  }

  cleanup(): void {
    console.log('🧹 Cleaning up Python Spell Caster...');
    
    globalShortcut.unregisterAll();
  }
}

// Export singleton instance
export const pythonSpellCaster = new PythonSpellCaster(); 