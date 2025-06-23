const { ipcRenderer: settingsIpcRenderer } = require('electron');

interface Settings {
  OPENAI_API_KEY: string;
  WHISPER_MODEL: string;
  TTS_VOICE: string;
  MICROPHONE_DEVICE?: string;
}

interface ShortcutConfig {
  id: string;
  name: string;
  description: string;
  defaultKey: string;
  currentKey: string;
  category: 'clipboard' | 'ai' | 'voice' | 'spells' | 'navigation';
}

class SettingsRenderer {
  private apiKeyInput: HTMLInputElement;
  private whisperModelSelect: HTMLSelectElement;
  private ttsVoiceSelect: HTMLSelectElement;
  private testVoiceBtn: HTMLButtonElement;
  private saveBtn: HTMLButtonElement;
  private resetBtn: HTMLButtonElement;
  private resetShortcutsBtn: HTMLButtonElement;
  private saveStatus: HTMLElement;
  private apiStatus: HTMLElement;
  private shortcutsContainer: HTMLElement;
  private envTable: HTMLElement;
  private addEnvRowBtn: HTMLButtonElement;
  private llmSelect: HTMLSelectElement;
  private llmInput: HTMLInputElement;
  private addLlmBtn: HTMLButtonElement;
  private deleteLlmBtn: HTMLButtonElement;
  private testEnvBtn: HTMLButtonElement;
  private envStatus: HTMLElement;
  private microphoneSelect: HTMLSelectElement;
  private refreshMicBtn: HTMLButtonElement;
  private testMicBtn: HTMLButtonElement;
  private testWebMicBtn: HTMLButtonElement;
  private micStatus: HTMLElement;
  private micHelpText: HTMLElement;
  private micTestResult: HTMLElement;
  private micTestStatus: HTMLElement;
  private micTestInfo: HTMLElement;
  
  private shortcuts: ShortcutConfig[] = [];
  private editingShortcut: string | null = null;
  private envVars: Record<string,string> = {};
  private llms: string[] = [];
  
  private currentSettings: Settings = {
    OPENAI_API_KEY: '',
    WHISPER_MODEL: 'whisper-1',
    TTS_VOICE: 'ballad',
    MICROPHONE_DEVICE: 'auto'
  };

  constructor() {
    this.apiKeyInput = document.getElementById('api-key') as HTMLInputElement;
    this.whisperModelSelect = document.getElementById('whisper-model') as HTMLSelectElement;
    this.ttsVoiceSelect = document.getElementById('tts-voice') as HTMLSelectElement;
    this.testVoiceBtn = document.getElementById('test-voice') as HTMLButtonElement;
    this.saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    this.resetBtn = document.getElementById('reset-btn') as HTMLButtonElement;
    this.resetShortcutsBtn = document.getElementById('reset-shortcuts-btn') as HTMLButtonElement;
    this.saveStatus = document.getElementById('save-status')!;
    this.apiStatus = document.getElementById('api-status')!;
    this.shortcutsContainer = document.getElementById('shortcuts-container')!;
    this.envTable = document.getElementById('env-table')!;
    this.addEnvRowBtn = document.getElementById('add-env-row') as HTMLButtonElement;
    this.llmSelect = document.getElementById('llm-select') as HTMLSelectElement;
    this.llmInput = document.getElementById('llm-input') as HTMLInputElement;
    this.addLlmBtn = document.getElementById('add-llm') as HTMLButtonElement;
    this.deleteLlmBtn = document.getElementById('delete-llm') as HTMLButtonElement;
    this.testEnvBtn = document.getElementById('test-env') as HTMLButtonElement;
    this.envStatus = document.getElementById('env-status')!;
    this.microphoneSelect = document.getElementById('microphone-device') as HTMLSelectElement;
    this.refreshMicBtn = document.getElementById('refresh-microphones') as HTMLButtonElement;
    this.testMicBtn = document.getElementById('test-microphone') as HTMLButtonElement;
    this.testWebMicBtn = document.getElementById('test-web-microphone') as HTMLButtonElement;
    this.micStatus = document.getElementById('mic-status')!;
    this.micHelpText = document.getElementById('mic-help-text')!;
    this.micTestResult = document.getElementById('mic-test-result')!;
    this.micTestStatus = document.getElementById('mic-test-status')!;
    this.micTestInfo = document.getElementById('mic-test-info')!;

    this.setupEventListeners();
    this.loadSettings();
    this.loadShortcuts();
    this.loadEnvSettings();
    this.loadMicrophoneSettings();
  }

  private setupEventListeners() {
    // Save button
    this.saveBtn.addEventListener('click', () => {
      this.saveSettings();
    });

    // Reset button
    this.resetBtn.addEventListener('click', () => {
      this.resetToDefaults();
    });

    // Reset shortcuts button
    this.resetShortcutsBtn.addEventListener('click', () => {
      this.resetAllShortcuts();
    });

    // Test voice button
    this.testVoiceBtn.addEventListener('click', () => {
      this.testVoice();
    });

    // API key input validation
    this.apiKeyInput.addEventListener('input', () => {
      this.validateApiKey();
    });

    // Form change detection
    [this.apiKeyInput, this.whisperModelSelect, this.ttsVoiceSelect, this.microphoneSelect].forEach(element => {
      element.addEventListener('change', () => {
        this.markUnsaved();
      });
    });

    // Microphone event listeners
    this.refreshMicBtn.addEventListener('click', () => {
      this.refreshMicrophones();
    });

    this.testMicBtn.addEventListener('click', () => {
      this.testMicrophone();
    });

    this.microphoneSelect.addEventListener('change', () => {
      this.onMicrophoneDeviceChange();
    });

    // IPC listeners
    settingsIpcRenderer.on('settings-loaded', (event: any, settings: Settings) => {
      this.currentSettings = settings;
      this.populateForm();
      this.validateApiKey();
    });

    settingsIpcRenderer.on('settings-saved', (event: any, success: boolean, message: string) => {
      this.showSaveStatus(success, message);
    });

    settingsIpcRenderer.on('api-key-validated', (event: any, isValid: boolean) => {
      this.updateApiStatus(isValid);
    });

    // Env rows
    this.addEnvRowBtn.addEventListener('click', () => this.addEnvRow());

    // LLM add/delete/select handlers
    this.addLlmBtn.addEventListener('click', () => this.handleAddLlm());
    this.deleteLlmBtn.addEventListener('click', () => this.handleDeleteLlm());
    this.llmSelect.addEventListener('change', () => this.markUnsaved());

    // Test & save env button
    this.testEnvBtn.addEventListener('click', () => {
      this.saveEnvSettings();
    });

    settingsIpcRenderer.on('env-saved', (_e: any, ok: boolean, msg: string) => {
      this.envStatus.textContent = msg;
      this.envStatus.className = ok ? 'status success' : 'status error';
      if (ok) setTimeout(()=>this.envStatus.textContent='',3000);
    });
  }

  private loadSettings() {
    console.log('📋 Loading settings from main process...');
    settingsIpcRenderer.send('load-settings');
  }

  private populateForm() {
    console.log('🔄 Populating form with settings:', this.currentSettings);
    
    // Mask API key for display
    if (this.currentSettings.OPENAI_API_KEY) {
      this.apiKeyInput.value = this.currentSettings.OPENAI_API_KEY.substring(0, 8) + '...';
      this.apiKeyInput.setAttribute('data-full-key', this.currentSettings.OPENAI_API_KEY);
    }
    
    this.whisperModelSelect.value = this.currentSettings.WHISPER_MODEL;
    this.ttsVoiceSelect.value = this.currentSettings.TTS_VOICE;
    this.microphoneSelect.value = this.currentSettings.MICROPHONE_DEVICE || 'auto';

    this.clearSaveStatus();
  }

  private saveSettings() {
    console.log('💾 Saving settings...');
    
    const settings: Settings = {
      OPENAI_API_KEY: this.getApiKey(),
      WHISPER_MODEL: this.whisperModelSelect.value,
      TTS_VOICE: this.ttsVoiceSelect.value,
      MICROPHONE_DEVICE: this.microphoneSelect.value
    };

    console.log('📤 Sending settings to main process:', {
      ...settings,
      OPENAI_API_KEY: settings.OPENAI_API_KEY ? settings.OPENAI_API_KEY.substring(0, 8) + '...' : 'empty'
    });

    settingsIpcRenderer.send('save-settings', settings);
    this.showSaveStatus(null, 'Saving...');
  }

  private resetToDefaults() {
    console.log('🔄 Resetting to defaults...');
    
    this.apiKeyInput.value = '';
    this.apiKeyInput.removeAttribute('data-full-key');
    this.whisperModelSelect.value = 'whisper-1';
    this.ttsVoiceSelect.value = 'Nova';
    this.microphoneSelect.value = 'auto';
    
    this.markUnsaved();
    this.updateApiStatus(false);
  }

  private testVoice() {
    console.log('🔊 Testing voice:', this.ttsVoiceSelect.value);
    
    const testText = "Hello! This is a test of the " + this.ttsVoiceSelect.value + " voice. How does it sound?";
    
    this.testVoiceBtn.textContent = '🔄 Testing...';
    this.testVoiceBtn.disabled = true;
    
    settingsIpcRenderer.send('test-voice', {
      voice: this.ttsVoiceSelect.value,
      text: testText
    });

    // Reset button after a delay
    setTimeout(() => {
      this.testVoiceBtn.textContent = '🔊 Test Voice';
      this.testVoiceBtn.disabled = false;
    }, 3000);
  }

  private validateApiKey() {
    const apiKey = this.getApiKey();
    
    if (!apiKey) {
      this.updateApiStatus(false);
      return;
    }

    if (apiKey.length < 20 || !apiKey.startsWith('sk-')) {
      this.updateApiStatus(false);
      return;
    }

    // Test API key with main process
    settingsIpcRenderer.send('validate-api-key', apiKey);
  }

  private getApiKey(): string {
    // If the input shows masked value, get the full key from data attribute
    const fullKey = this.apiKeyInput.getAttribute('data-full-key');
    if (fullKey && this.apiKeyInput.value.includes('...')) {
      return fullKey;
    }
    return this.apiKeyInput.value.trim();
  }

  private updateApiStatus(isValid: boolean) {
    const dot = this.apiStatus.querySelector('.api-status-dot')!;
    const text = this.apiStatus.querySelector('span')!;
    
    if (isValid) {
      this.apiStatus.className = 'api-status connected';
      text.textContent = 'Connected';
    } else {
      this.apiStatus.className = 'api-status disconnected';
      text.textContent = 'Not Connected';
    }
  }

  private markUnsaved() {
    this.showSaveStatus(null, 'Unsaved changes');
  }

  private showSaveStatus(success: boolean | null, message: string) {
    this.saveStatus.textContent = message;
    
    if (success === true) {
      this.saveStatus.className = 'status success';
    } else if (success === false) {
      this.saveStatus.className = 'status error';
    } else {
      this.saveStatus.className = 'status';
    }

    // Clear status after delay for success/error messages
    if (success !== null) {
      setTimeout(() => {
        this.clearSaveStatus();
      }, 3000);
    }
  }

  private clearSaveStatus() {
    this.saveStatus.textContent = '';
    this.saveStatus.className = 'status';
  }

  // Shortcuts Management
  private async loadShortcuts() {
    console.log('⌨️ Loading shortcuts...');
    try {
      this.shortcuts = await settingsIpcRenderer.invoke('get-shortcuts');
      this.renderShortcuts();
    } catch (error) {
      console.error('❌ Failed to load shortcuts:', error);
    }
  }

  private renderShortcuts() {
    // Group shortcuts by category
    const categories = {
      ai: { name: '🤖 AI Features', shortcuts: [] as ShortcutConfig[] },
      voice: { name: '🎤 Voice Features', shortcuts: [] as ShortcutConfig[] },
      clipboard: { name: '📋 Clipboard', shortcuts: [] as ShortcutConfig[] },
      navigation: { name: '🧭 Navigation', shortcuts: [] as ShortcutConfig[] },
      spells: { name: '🧙‍♂️ Python Spells', shortcuts: [] as ShortcutConfig[] }
    };

    // Group shortcuts by category
    this.shortcuts.forEach(shortcut => {
      if (categories[shortcut.category]) {
        categories[shortcut.category].shortcuts.push(shortcut);
      }
    });

    // Render categories
    this.shortcutsContainer.innerHTML = '';
    Object.entries(categories).forEach(([categoryKey, category]) => {
      if (category.shortcuts.length === 0) return;

      const categoryDiv = document.createElement('div');
      categoryDiv.className = 'shortcuts-category';

      const titleDiv = document.createElement('div');
      titleDiv.className = 'shortcuts-category-title';
      titleDiv.textContent = category.name;

      const gridDiv = document.createElement('div');
      gridDiv.className = 'shortcuts-grid';

      category.shortcuts.forEach(shortcut => {
        const shortcutRow = this.createShortcutRow(shortcut);
        gridDiv.appendChild(shortcutRow);
      });

      categoryDiv.appendChild(titleDiv);
      categoryDiv.appendChild(gridDiv);
      this.shortcutsContainer.appendChild(categoryDiv);
    });
  }

  private createShortcutRow(shortcut: ShortcutConfig): HTMLElement {
    const row = document.createElement('div');
    row.className = 'shortcut-row';
    row.setAttribute('data-shortcut-id', shortcut.id);

    const info = document.createElement('div');
    info.className = 'shortcut-info';

    const name = document.createElement('div');
    name.className = 'shortcut-name';
    name.textContent = shortcut.name;

    const description = document.createElement('div');
    description.className = 'shortcut-description';
    description.textContent = shortcut.description;

    info.appendChild(name);
    info.appendChild(description);

    const keyContainer = document.createElement('div');
    keyContainer.className = 'shortcut-key-container';

    const keyDisplay = document.createElement('div');
    keyDisplay.className = 'shortcut-key-display';
    if (shortcut.currentKey) {
      keyDisplay.textContent = this.formatShortcutKey(shortcut.currentKey);
    } else {
      keyDisplay.textContent = 'Click to assign';
      keyDisplay.setAttribute('data-empty', 'true');
    }
    keyDisplay.addEventListener('click', () => this.editShortcut(shortcut.id));

    const actions = document.createElement('div');
    actions.className = 'shortcut-actions';

    const resetBtn = document.createElement('button');
    resetBtn.className = 'shortcut-btn reset';
    resetBtn.textContent = '↺';
    resetBtn.title = 'Reset to default';
    resetBtn.addEventListener('click', () => this.resetShortcut(shortcut.id));

    actions.appendChild(resetBtn);
    keyContainer.appendChild(keyDisplay);
    keyContainer.appendChild(actions);

    row.appendChild(info);
    row.appendChild(keyContainer);

    return row;
  }

  private formatShortcutKey(key: string): string {
    return key
      .replace('CommandOrControl', 'Ctrl')
      .replace('numdiv', 'Num/')
      .replace('numsub', 'Num-')
      .replace('numadd', 'Num+')
      .replace('Left', '←')
      .replace('Right', '→')
      .replace('Up', '↑')
      .replace('Down', '↓')
      .replace(/\+/g, ' + ');
  }

  private async editShortcut(shortcutId: string) {
    if (this.editingShortcut) return; // Already editing another shortcut

    this.editingShortcut = shortcutId;
    const keyDisplay = document.querySelector(`[data-shortcut-id="${shortcutId}"] .shortcut-key-display`) as HTMLElement;
    
    if (!keyDisplay) return;

    keyDisplay.classList.add('editing');
    keyDisplay.textContent = 'Press keys...';

    const handleKeyPress = async (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();

      // Build the shortcut key string
      const modifiers = [];
      if (event.ctrlKey || event.metaKey) modifiers.push('CommandOrControl');
      if (event.altKey) modifiers.push('Alt');
      if (event.shiftKey) modifiers.push('Shift');

      let key = event.key;
      
      // Handle special keys
      if (key === 'ArrowLeft') key = 'Left';
      else if (key === 'ArrowRight') key = 'Right';
      else if (key === 'ArrowUp') key = 'Up';
      else if (key === 'ArrowDown') key = 'Down';
      else if (key === 'NumpadDivide') key = 'numdiv';
      else if (key === 'NumpadSubtract') key = 'numsub';
      else if (key === 'NumpadAdd') key = 'numadd';
      else if (key.startsWith('Digit')) key = key.replace('Digit', '');
      else if (key.startsWith('Numpad')) key = 'num' + key.replace('Numpad', '').toLowerCase();
      else if (key.length === 1) key = key.toLowerCase();

      // Skip if it's just a modifier key
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(key)) {
        return;
      }

      // Allow clearing shortcuts with Delete or Backspace
      if (key === 'Delete' || key === 'Backspace') {
        const success = await settingsIpcRenderer.invoke('update-shortcut', shortcutId, '');
        if (success) {
          const shortcut = this.shortcuts.find(s => s.id === shortcutId);
          if (shortcut) {
            shortcut.currentKey = '';
          }
          finishAndCleanup('');
        } else {
          finishAndCleanup(null);
        }
        return;
      }

      const newShortcutKey = modifiers.length > 0 ? `${modifiers.join('+')}+${key}` : key;

      // Check for conflicts
      const conflict = await settingsIpcRenderer.invoke('test-shortcut-key', newShortcutKey);
      
      if (!conflict.available) {
        keyDisplay.classList.add('shortcut-conflict');
        keyDisplay.textContent = `Conflict: ${conflict.usedBy}`;
        setTimeout(() => {
          finishAndCleanup(null);
        }, 2000);
        return;
      }

      // Update the shortcut
      const success = await settingsIpcRenderer.invoke('update-shortcut', shortcutId, newShortcutKey);
      
      if (success) {
        // Update local data
        const shortcut = this.shortcuts.find(s => s.id === shortcutId);
        if (shortcut) {
          shortcut.currentKey = newShortcutKey;
        }
        finishAndCleanup(newShortcutKey);
      } else {
        keyDisplay.classList.add('shortcut-conflict');
        keyDisplay.textContent = 'Failed to set';
        setTimeout(() => {
          finishAndCleanup(null);
        }, 2000);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        finishAndCleanup(null);
      }
    };

    // Listen until a valid (non-modifier) key is pressed or the user cancels.
    // We remove the listeners manually inside finishEditingShortcut / cleanup.
    document.addEventListener('keydown', handleKeyPress);
    document.addEventListener('keydown', handleEscape);

    // Helper to clean up listeners when editing ends
    const cleanupListeners = () => {
      document.removeEventListener('keydown', handleKeyPress);
      document.removeEventListener('keydown', handleEscape);
    };

    // Auto-cancel after 10 seconds
    setTimeout(() => {
      if (this.editingShortcut === shortcutId) {
        finishAndCleanup(null);
      }
    }, 10000);

    const finishAndCleanup = (newKey: string | null) => {
      cleanupListeners();
      this.editingShortcut = null;
      const keyDisplay = document.querySelector(`[data-shortcut-id="${shortcutId}"] .shortcut-key-display`) as HTMLElement;
      
      if (!keyDisplay) return;

      keyDisplay.classList.remove('editing', 'shortcut-conflict');
      
      if (newKey !== null) {
        // newKey can be empty string (for clearing shortcuts)
        if (newKey) {
          keyDisplay.textContent = this.formatShortcutKey(newKey);
          keyDisplay.removeAttribute('data-empty');
        } else {
          keyDisplay.textContent = 'Click to assign';
          keyDisplay.setAttribute('data-empty', 'true');
        }
      } else {
        // Restore original key (null means cancelled)
        const shortcut = this.shortcuts.find(s => s.id === shortcutId);
        if (shortcut) {
          if (shortcut.currentKey) {
            keyDisplay.textContent = this.formatShortcutKey(shortcut.currentKey);
            keyDisplay.removeAttribute('data-empty');
          } else {
            keyDisplay.textContent = 'Click to assign';
            keyDisplay.setAttribute('data-empty', 'true');
          }
        }
      }
    };
  }

  private async resetShortcut(shortcutId: string) {
    const success = await settingsIpcRenderer.invoke('reset-shortcut', shortcutId);
    if (success) {
      await this.loadShortcuts(); // Reload to get updated data
    }
  }

  private async resetAllShortcuts() {
    if (confirm('Reset all shortcuts to their defaults?')) {
      const success = await settingsIpcRenderer.invoke('reset-all-shortcuts');
      if (success) {
        await this.loadShortcuts(); // Reload to get updated data
      }
    }
  }

  private async loadEnvSettings() {
    try {
      const data = await settingsIpcRenderer.invoke('load-env');
      this.envVars = data?.env || {};
      const selected = data?.llm || '';
      this.llms = Array.isArray(data?.llms) ? data.llms : [];
      if (selected && !this.llms.includes(selected)) {
        this.llms.push(selected);
      }
      if (this.llms.length === 0) {
        if (selected) this.llms.push(selected);
        else this.llms = [];
      }
      this.renderLlmSelect(selected);
      this.renderEnvTable();
    } catch (err) {
      console.error('❌ Failed to load env settings', err);
    }
  }

  private renderEnvTable() {
    this.envTable.innerHTML = '';
    Object.entries(this.envVars).forEach(([k,v]) => this.addEnvRow(k,v));
  }

  private addEnvRow(key = '', value = '') {
    const row = document.createElement('div');
    row.className = 'env-row';
    row.innerHTML = `
      <input class="form-input env-key" placeholder="NAME" value="${key}"> 
      <input class="form-input env-val" placeholder="value" value="${value}"> 
      <span class="btn delete-row">✖</span>`;
    this.envTable.appendChild(row);

    const keyInput = row.querySelector('.env-key') as HTMLInputElement;
    const valInput = row.querySelector('.env-val') as HTMLInputElement;
    const delBtn = row.querySelector('.delete-row') as HTMLElement;

    const sync = () => {
      const k = keyInput.value.trim();
      const v = valInput.value.trim();
      if (k) {
        this.envVars[k] = v;
      }
    };

    keyInput.addEventListener('input', sync);
    valInput.addEventListener('input', sync);
    delBtn.addEventListener('click', () => {
      const k = keyInput.value.trim();
      if (k && this.envVars[k]) delete this.envVars[k];
      row.remove();
    });
  }

  private renderLlmSelect(selected: string) {
    this.llmSelect.innerHTML = '';
    this.llms.forEach(llm => {
      const opt = document.createElement('option');
      opt.value = llm;
      opt.textContent = llm;
      this.llmSelect.appendChild(opt);
    });
    if (selected) this.llmSelect.value = selected;
  }

  private handleAddLlm() {
    const val = this.llmInput.value.trim();
    if (!val) return;
    if (!this.llms.includes(val)) {
      this.llms.push(val);
      this.renderLlmSelect(val);
      this.markUnsaved();
    }
    this.llmInput.value = '';
  }

  private handleDeleteLlm() {
    const current = this.llmSelect.value;
    if (!current) return;
    if (confirm(`Delete LLM "${current}"?`)) {
      this.llms = this.llms.filter(l => l !== current);
      const newSelected = this.llms[0] || '';
      this.renderLlmSelect(newSelected);
      this.markUnsaved();
    }
  }

  private async saveEnvSettings() {
    this.envStatus.textContent = 'Saving & testing…';
    this.envStatus.className = 'status';
    try {
      const res = await settingsIpcRenderer.invoke('save-env', {
        env: this.envVars,
        llm: this.llmSelect.value.trim(),
        llms: this.llms
      });
      settingsIpcRenderer.emit('env-saved', null, res.ok, res.ok ? '✅ Saved' : '❌ ' + (res.msg || 'Error'));
    } catch (err) {
      settingsIpcRenderer.emit('env-saved', null, false, (err as Error).message);
    }
  }

  // Microphone Management Methods
  private async loadMicrophoneSettings() {
    console.log('🎤 Loading microphone settings...');
    this.discoverDevices();
  }

  private async discoverDevices() {
    console.log('🎤 Discovering devices via navigator.mediaDevices...');
    this.micHelpText.textContent = 'Scanning for available microphones...';
    this.updateMicrophoneStatus({ status: 'checking', message: 'Requesting permissions...' });

    try {
      // Request permission to get device labels
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputDevices = devices.filter(device => device.kind === 'audioinput');
      
      // Stop the stream immediately after getting the list
      stream.getTracks().forEach(track => track.stop());

      console.log('🎤 Discovered audio input devices:', audioInputDevices);
      this.populateMicrophoneDevices(audioInputDevices);

    } catch (error) {
      console.error('❌ Error discovering microphone devices:', error);
      let message = 'Could not access microphones.';
      if (error.name === 'NotAllowedError') {
        message = 'Permission denied. Please allow microphone access in your system settings.';
      }
      this.updateMicrophoneStatus({ status: 'disconnected', message });
      this.micHelpText.textContent = `Error: ${message}`;
    }
  }

  private refreshMicrophones() {
    console.log('🔄 Refreshing microphones...');
    this.discoverDevices();
  }

  private testMicrophone() {
    const selectedDevice = this.microphoneSelect.value;
    console.log('🎙️ Testing microphone:', selectedDevice);
    
    this.testMicBtn.textContent = '▶️ Recording... (3s)';
    this.testMicBtn.disabled = true;
    this.micTestResult.style.display = 'block';
    this.micTestStatus.textContent = 'Starting recording test...';
    this.micTestInfo.textContent = 'Please speak into your microphone.';
    this.updateMicrophoneStatus({ status: 'testing', message: 'Recording test in progress...' });

    this.runLocalTest(selectedDevice);
  }

  private async runLocalTest(deviceId: string) {
    const constraints: MediaStreamConstraints = {
        audio: (deviceId && deviceId !== 'auto') ? { deviceId } : true,
        video: false
    };

    let stream: MediaStream | null = null;

    try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const mimeTypes = [ 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4' ];
        const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
        if (!supportedMimeType) {
            throw new Error('No supported audio MIME type for test recording.');
        }

        const mediaRecorder = new MediaRecorder(stream, { mimeType: supportedMimeType });
        const chunks: BlobPart[] = [];
        let recorderError: Error | null = null;

        mediaRecorder.onerror = (e) => {
            console.error('MediaRecorder error during test:', (e as any).error);
            recorderError = (e as any).error || new Error('Unknown MediaRecorder error');
        };
        
        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) {
                chunks.push(e.data);
            }
        };

        mediaRecorder.onstop = () => {
            // Stop all stream tracks to turn off the microphone light
            stream?.getTracks().forEach(track => track.stop());
            this.testMicBtn.textContent = '🎙️ Test Recording';
            this.testMicBtn.disabled = false;

            if (recorderError) {
                this.showMicrophoneTestResult({ success: false, error: recorderError.message });
                return;
            }
            
            if (chunks.length === 0) {
                this.showMicrophoneTestResult({ success: false, error: "Recording produced no data. The microphone may be muted or unavailable." });
                return;
            }

            const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
            const audioUrl = URL.createObjectURL(blob);
            
            this.showMicrophoneTestResult({
                success: true,
                duration: 3000,
                method: 'web-audio',
                fileSize: blob.size,
                audioUrl: audioUrl
            });
        };

        mediaRecorder.start(100); // 100ms timeslice
        
        setTimeout(() => {
            if (mediaRecorder.state === 'recording') {
                mediaRecorder.stop();
            }
        }, 3000);

    } catch (error) {
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
        }
        this.showMicrophoneTestResult({ success: false, error: error.message });
        this.testMicBtn.textContent = '🎙️ Test Recording';
        this.testMicBtn.disabled = false;
    }
  }

  private onMicrophoneDeviceChange() {
    const selectedDevice = this.microphoneSelect.value;
    console.log('🔄 Microphone device changed to:', selectedDevice);
    
    if (selectedDevice === 'auto') {
      this.micHelpText.textContent = 'Auto-detect will choose the first working microphone found.';
    } else {
      this.micHelpText.textContent = `Selected: ${selectedDevice}`;
    }
    
    // Save the device selection immediately
    settingsIpcRenderer.send('set-microphone-device', selectedDevice);
    this.markUnsaved();
    
    // Update status to show the change
    this.updateMicrophoneStatus({ 
      status: 'connected', 
      message: selectedDevice === 'auto' ? 'Auto-detect enabled' : 'Manual device selected' 
    });
  }

  private populateMicrophoneDevices(devices: MediaDeviceInfo[]) {
    console.log('🎤 Populating microphone devices:', devices);
    
    // Preserve the current value
    const currentValue = this.microphoneSelect.value;

    // Clear current devices
    this.microphoneSelect.innerHTML = '';
    
    // Always add auto-detect option first
    const autoOption = document.createElement('option');
    autoOption.value = 'auto';
    autoOption.textContent = '🤖 Auto-detect (Recommended)';
    this.microphoneSelect.appendChild(autoOption);
    
    // Add discovered devices
    if (devices && devices.length > 0) {
      devices.forEach((device) => {
        if (device.deviceId && device.label) {
          const option = document.createElement('option');
          option.value = device.deviceId;
          option.textContent = `🎤 ${device.label}`;
          this.microphoneSelect.appendChild(option);
        }
      });
      
      this.micHelpText.textContent = `Found ${devices.length} microphone(s).`;
      this.updateMicrophoneStatus({ status: 'connected', message: `${devices.length} devices available` });
    } else {
      this.micHelpText.textContent = 'No microphones detected. Check your microphone connection and permissions.';
      this.updateMicrophoneStatus({ status: 'disconnected', message: 'No microphones found' });
    }
    
    // Restore previous selection if possible
    const matchingOption = Array.from(this.microphoneSelect.options).find(opt => opt.value === currentValue);
    if (matchingOption) {
        this.microphoneSelect.value = currentValue;
    } else {
        this.microphoneSelect.value = 'auto';
    }
  }

  private updateMicrophoneStatus(status: any) {
    const { status: statusType, message } = status;
    
    // Update status display
    this.micStatus.className = `mic-status ${statusType}`;
    this.micStatus.querySelector('span')!.textContent = message;
    
    // Log for debugging
    console.log(`🎤 Microphone status: ${statusType} - ${message}`);
  }

  private showMicrophoneTestResult(result: any) {
    console.log('📊 Microphone test result:', result);
    
    this.micTestResult.style.display = 'block';
    
    if (result.success) {
      this.micTestStatus.textContent = '✅ Test successful! Your microphone is working correctly.';
      this.micTestInfo.innerHTML = `
        Recorded ${result.duration}ms using ${result.method}. File size: ${result.fileSize || 'unknown'} bytes.
        <br>
        <audio controls src="${result.audioUrl}" style="margin-top: 8px; width: 100%;"></audio>
      `;
      
      this.updateMicrophoneStatus({ 
        status: 'connected', 
        message: 'Microphone test passed!' 
      });
    } else {
      this.micTestStatus.textContent = '❌ Test failed. There may be an issue with your microphone.';
      
      let errorInfo = result.error || 'Unknown error occurred during microphone test.';
      
      // Provide specific troubleshooting for common Windows errors
      if (result.error?.includes('Could not find audio only device')) {
        errorInfo = 'The selected microphone device was not found. Try refreshing the device list or selecting a different microphone.';
      } else if (result.error?.includes('I/O error')) {
        errorInfo = 'Cannot access the microphone. It may be in use by another application, disconnected, or permissions may be denied.';
      } else if (result.error?.includes('permission')) {
        errorInfo = 'Microphone access denied. Please check your Windows microphone permissions in Settings > Privacy & Security > Microphone.';
      } else if (result.error?.includes('device')) {
        errorInfo = 'Microphone device error. Please check that your microphone is connected and working in other applications.';
      }
      
      this.micTestInfo.innerHTML = `
        <div style="margin-bottom: 8px;">${errorInfo}</div>
        <div style="font-size: 10px; color: rgba(255, 255, 255, 0.4);">
          <strong>Troubleshooting tips:</strong><br>
          • Try selecting "Auto-detect" mode<br>
          • Check Windows microphone permissions<br>
          • Ensure no other apps are using the microphone<br>
          • Try refreshing the device list
        </div>
      `;
      
      this.updateMicrophoneStatus({ 
        status: 'disconnected', 
        message: 'Microphone test failed' 
      });
    }
    
    // Auto-hide test result after 15 seconds (longer for error messages)
    setTimeout(() => {
      this.micTestResult.style.display = 'none';
    }, 15000);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new SettingsRenderer();
}); 