const { ipcRenderer: pastilleIpcRenderer } = require('electron');

interface ClipboardEntry {
  id: string;
  text: string;
  timestamp: Date;
}

class PastilleRenderer {
  private pastilleElement: HTMLElement;
  private contentElement: HTMLElement;
  private counterElement: HTMLElement;
  private waveCanvas: HTMLCanvasElement;
  private waveCtx: CanvasRenderingContext2D | null;
  private processingInterval: any = null;
  private isRecording = false;
  private fontSize = 15;
  private expanded = false;
  private editor: HTMLTextAreaElement;
  private backdrop: HTMLElement;
  private saveBtn: HTMLButtonElement;
  private cancelBtn: HTMLButtonElement;
  private charCount: HTMLElement;
  private wordCount: HTMLElement;
  private lineCount: HTMLElement;
  
  // Control bar elements (for expanded mode)
  private controlIndicator: HTMLElement;
  private controlWaveform: HTMLCanvasElement;
  private controlWaveCtx: CanvasRenderingContext2D | null;
  private controlStatus: HTMLElement;
  private navCounter: HTMLElement;
  private navPrevBtn: HTMLButtonElement;
  private navNextBtn: HTMLButtonElement;
  private settingsBtn: HTMLButtonElement;
  private spellBookBtn: HTMLButtonElement;
  
  // State management
  private currentEntry: ClipboardEntry | null = null;
  private originalText: string = '';
  private isEditing = false;
  private doubleClickTimeout: any = null;
  private clipboardUpdateTimeout: any = null;
  private currentIndex: number = 0;
  private totalCount: number = 0;

  constructor() {
    this.pastilleElement = document.getElementById('pastille')!;
    this.contentElement = document.getElementById('content')!;
    this.counterElement = document.getElementById('counter')!;
    this.waveCanvas = document.getElementById('waveform') as HTMLCanvasElement;
    this.waveCtx = this.waveCanvas.getContext('2d');
    this.editor = document.getElementById('editor') as HTMLTextAreaElement;
    this.backdrop = document.getElementById('backdrop')!;
    this.saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    this.cancelBtn = document.getElementById('cancel-btn') as HTMLButtonElement;
    this.charCount = document.getElementById('char-count')!;
    this.wordCount = document.getElementById('word-count')!;
    this.lineCount = document.getElementById('line-count')!;
    
    // Control bar elements
    this.controlIndicator = document.getElementById('control-indicator')!;
    this.controlWaveform = document.getElementById('control-waveform') as HTMLCanvasElement;
    this.controlWaveCtx = this.controlWaveform.getContext('2d');
    this.controlStatus = document.getElementById('control-status')!;
    this.navCounter = document.getElementById('nav-counter')!;
    this.navPrevBtn = document.getElementById('nav-prev') as HTMLButtonElement;
    this.navNextBtn = document.getElementById('nav-next') as HTMLButtonElement;
    this.settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
    this.spellBookBtn = document.getElementById('spell-book-btn') as HTMLButtonElement;

    // Set canvas sizes to match styles
    this.waveCanvas.width = 300;
    this.waveCanvas.height = 40;
    this.controlWaveform.width = 120;
    this.controlWaveform.height = 30;
    
    // Apply initial font size
    this.applyFontSize();

    // Listen for Ctrl+Alt scroll to change font size
    document.addEventListener('wheel', (e) => {
      if (e.altKey && e.ctrlKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          this.fontSize = Math.min(this.fontSize + 1, 32);
        } else {
          this.fontSize = Math.max(this.fontSize - 1, 10);
        }
        this.applyFontSize();
      }
    }, { passive: false });

    this.setupEventListeners();
    this.setupEditorEvents();
    this.setupControlBarEvents();
  }

  private setupEventListeners() {
    // Listen for clipboard updates from main process
    pastilleIpcRenderer.on('clipboard-updated', (event: any, data: { entry: ClipboardEntry | null, currentIndex: number, totalCount: number }) => {
      this.updatePastille(data.entry, data.currentIndex, data.totalCount);
    });

    // Listen for show/hide commands
    pastilleIpcRenderer.on('show-pastille', () => {
      this.show();
    });

    pastilleIpcRenderer.on('hide-pastille', () => {
      this.hide();
    });

    // Generic notification
    pastilleIpcRenderer.on('show-message', (_: any, message: string) => {
      this.showMessage(message);
    });

    // Recording lifecycle
    pastilleIpcRenderer.on('start-recording', (_: any, msg: string) => {
      this.startRecording(msg);
    });

    pastilleIpcRenderer.on('audio-data', (_: any, data: Buffer) => {
      this.drawWaveform(data);
    });

    pastilleIpcRenderer.on('show-processing', (_: any, msg: string) => {
      this.showProcessing(msg);
    });

    // Double-click to expand/collapse
    this.pastilleElement.addEventListener('dblclick', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.handleDoubleClick();
    });

    // Backdrop click to collapse
    this.backdrop.addEventListener('click', (e) => {
      if (e.target === this.backdrop) {
        this.collapse();
      }
    });
  }

  private setupEditorEvents() {
    // Editor input events
    this.editor.addEventListener('input', () => {
      this.updateEditorStats();
      this.updateClipboardRealTime();
    });

    // Save button
    this.saveBtn.addEventListener('click', () => {
      this.saveAndCollapse();
    });

    // Cancel button
    this.cancelBtn.addEventListener('click', () => {
      this.cancelAndCollapse();
    });

    // Keyboard shortcuts in editor
    this.editor.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.cancelAndCollapse();
      } else if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        this.saveAndCollapse();
      }
    });
  }

  private setupControlBarEvents() {
    // Navigation buttons
    this.navPrevBtn.addEventListener('click', () => {
      pastilleIpcRenderer.send('clipboard-navigate', 'previous');
    });

    this.navNextBtn.addEventListener('click', () => {
      pastilleIpcRenderer.send('clipboard-navigate', 'next');
    });

    // Settings button
    this.settingsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pastilleIpcRenderer.send('open-settings');
    });

    // Spell book button
    this.spellBookBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      pastilleIpcRenderer.send('open-spell-book');
    });
  }

  private updateControlBar() {
    // Update navigation counter and buttons
    this.navCounter.textContent = this.totalCount > 0 ? `${this.currentIndex + 1}/${this.totalCount}` : '0/0';
    this.navPrevBtn.disabled = this.totalCount <= 1;
    this.navNextBtn.disabled = this.totalCount <= 1;
    
    // Update status based on current state
    if (this.isRecording) {
      this.controlStatus.textContent = 'Recording...';
      this.controlIndicator.className = 'control-indicator recording';
    } else if (this.processingInterval) {
      this.controlStatus.textContent = 'Processing...';
      this.controlIndicator.className = 'control-indicator processing';
    } else {
      this.controlStatus.textContent = 'Ready';
      this.controlIndicator.className = 'control-indicator';
    }
  }

  private handleDoubleClick() {
    // Clear any existing timeout to prevent multiple rapid clicks
    if (this.doubleClickTimeout) {
      clearTimeout(this.doubleClickTimeout);
      this.doubleClickTimeout = null;
    }

    // Add a small delay to ensure the click is processed properly
    this.doubleClickTimeout = setTimeout(() => {
      if (this.expanded) {
        this.collapse();
      } else {
        this.expand();
      }
    }, 50);
  }

  private updatePastille(entry: ClipboardEntry | null, currentIndex: number, totalCount: number) {
    console.log('📋 Pastille renderer: updating with entry:', entry?.text?.substring(0, 30) + '...', `${currentIndex + 1}/${totalCount}`);
    
    this.currentEntry = entry;
    this.currentIndex = currentIndex;
    this.totalCount = totalCount;
    
    // Update collapsed state elements
    if (!entry || totalCount === 0) {
      this.contentElement.textContent = 'No clipboard content';
      this.contentElement.className = 'content empty';
      this.counterElement.textContent = '0/0';
    } else {
      // Truncate long text for display
      const displayText = entry.text.length > 80 
        ? entry.text.substring(0, 80) + '...' 
        : entry.text;
      
      this.contentElement.textContent = displayText;
      this.contentElement.className = 'content';
      this.counterElement.textContent = `${currentIndex + 1}/${totalCount}`;
    }

    // Update control bar (for expanded state)
    this.updateControlBar();

    // If we're currently editing, don't update the editor content
    // unless this is a completely different entry
    if (this.expanded && this.isEditing) {
      if (this.originalText !== (entry?.text || '')) {
        // Different entry selected while editing - ask user what to do
        this.handleEntryChangeWhileEditing(entry);
      }
    }
  }

  private handleEntryChangeWhileEditing(newEntry: ClipboardEntry | null) {
    const hasChanges = this.editor.value !== this.originalText;
    
    if (hasChanges) {
      // User has unsaved changes - show a subtle indication
      this.saveBtn.textContent = 'Save*';
      this.saveBtn.style.background = '#ff9800';
    } else {
      // No changes, safe to switch
      this.originalText = newEntry?.text || '';
      this.editor.value = this.originalText;
      this.updateEditorStats();
    }
  }

  private show() {
    console.log('👁️ Pastille renderer: showing pastille');
    this.pastilleElement.classList.remove('hidden');
  }

  private hide() {
    if (this.expanded) {
      this.collapse();
    }
    this.pastilleElement.classList.add('hidden');
  }

  private showMessage(message: string) {
    console.log('🔔 Pastille renderer: showing message:', message);
    this.clearProcessing();
    this.isRecording = false;
    this.waveCanvas.classList.add('hidden');
    this.contentElement.textContent = message;
    this.contentElement.className = 'content';
    this.counterElement.textContent = '';
    this.show();
  }

  // Recording UI
  private startRecording(message: string) {
    console.log('🎤 Pastille renderer: start recording');
    this.clearProcessing();
    this.isRecording = true;
    
    // Update collapsed state
    this.waveCanvas.classList.remove('hidden');
    this.contentElement.textContent = message;
    this.counterElement.textContent = '';
    
    // Update expanded state control bar
    this.controlWaveform.classList.remove('hidden');
    this.updateControlBar();
    
    this.show();
  }

  private drawWaveform(buffer: any) {
    if (!this.isRecording) return;

    const data = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 2);

    // Draw on main waveform (collapsed state)
    if (this.waveCtx) {
      this.drawWaveformOnCanvas(this.waveCtx, this.waveCanvas.width, this.waveCanvas.height, data);
    }

    // Draw on control waveform (expanded state)
    if (this.controlWaveCtx) {
      this.drawWaveformOnCanvas(this.controlWaveCtx, this.controlWaveform.width, this.controlWaveform.height, data);
    }
  }

  private drawWaveformOnCanvas(ctx: CanvasRenderingContext2D, width: number, height: number, data: Int16Array) {
    ctx.clearRect(0, 0, width, height);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.beginPath();

    const sliceWidth = width / data.length;
    let x = 0;

    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 32768.0;
      const y = (v * height) / 2 + height / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();
  }

  // Processing animation
  private showProcessing(message: string) {
    console.log('⏳ Pastille renderer: show processing');
    this.isRecording = false;
    
    // Update collapsed state
    this.waveCanvas.classList.add('hidden');
    this.contentElement.textContent = message;
    this.counterElement.textContent = '';
    
    // Update expanded state
    this.controlWaveform.classList.add('hidden');
    this.updateControlBar();

    this.clearProcessing();
    let dots = 0;
    this.processingInterval = setInterval(() => {
      dots = (dots + 1) % 4;
      this.contentElement.textContent = message + '.'.repeat(dots);
      if (this.expanded) {
        this.controlStatus.textContent = message + '.'.repeat(dots);
      }
    }, 500);

    this.show();
  }

  private clearProcessing() {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
  }

  private applyFontSize() {
    this.pastilleElement.style.fontSize = `${this.fontSize}px`;
    this.counterElement.style.fontSize = `${Math.max(8, this.fontSize - 4)}px`;
  }

  private expand() {
    if (this.expanded) return;
    
    console.log('📖 Expanding pastille editor');
    this.expanded = true;
    this.isEditing = true;
    
    // Store original text
    this.originalText = this.currentEntry?.text || '';
    
    // Set up editor
    this.editor.value = this.originalText;
    this.updateEditorStats();
    
    // Add CSS classes
    this.pastilleElement.classList.add('expanded');
    this.backdrop.classList.remove('hidden');
    
    // Disable drag on main element while editing
    this.pastilleElement.style.setProperty('-webkit-app-region', 'no-drag');

    // Request main process to handle window expansion
    pastilleIpcRenderer.send('expand-pastille');

    // Focus editor after animation
    setTimeout(() => {
      this.editor.focus();
      this.editor.setSelectionRange(this.editor.value.length, this.editor.value.length);
    }, 150);
  }

  private collapse() {
    if (!this.expanded) return;
    
    console.log('📕 Collapsing pastille editor');
    this.expanded = false;
    this.isEditing = false;
    
    // Remove CSS classes
    this.pastilleElement.classList.remove('expanded');
    this.backdrop.classList.add('hidden');
    
    // Re-enable drag
    this.pastilleElement.style.setProperty('-webkit-app-region', 'drag');

    // Request main process to handle window collapse
    pastilleIpcRenderer.send('collapse-pastille');
    
    // Reset button states
    this.saveBtn.textContent = 'Save';
    this.saveBtn.style.background = '#4CAF50';
  }

  private saveAndCollapse() {
    const newText = this.editor.value.trim();
    
    if (newText !== this.originalText) {
      // Update clipboard with new content
      pastilleIpcRenderer.send('update-clipboard', newText);
      console.log('💾 Saved changes to clipboard');
    }
    
    this.collapse();
  }

  private cancelAndCollapse() {
    // Restore original text without saving
    this.editor.value = this.originalText;
    this.collapse();
    console.log('❌ Cancelled editing, changes discarded');
  }

  private updateClipboardRealTime() {
    // Update clipboard in real-time while editing (debounced)
    const newText = this.editor.value;
    
    if (newText !== this.originalText) {
      // Debounce the clipboard update
      clearTimeout(this.clipboardUpdateTimeout);
      this.clipboardUpdateTimeout = setTimeout(() => {
        pastilleIpcRenderer.send('update-clipboard-draft', newText);
      }, 500);
    }
  }

  private updateEditorStats() {
    const text = this.editor.value;
    const charCount = text.length;
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const lineCount = text.split('\n').length;

    this.charCount.textContent = `${charCount} character${charCount !== 1 ? 's' : ''}`;
    this.wordCount.textContent = `${wordCount} word${wordCount !== 1 ? 's' : ''}`;
    this.lineCount.textContent = `${lineCount} line${lineCount !== 1 ? 's' : ''}`;
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PastilleRenderer();
}); 