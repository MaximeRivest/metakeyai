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
  private overwriteBtn: HTMLButtonElement;
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
  private hasExplicitlySaved = false;
  private currentIndex: number = 0;
  private totalCount: number = 0;

  // Web Audio Recording state
  private mediaRecorder: MediaRecorder | null = null;
  private audioStream: MediaStream | null = null;
  private audioChunks: Blob[] = [];

  constructor() {
    this.pastilleElement = document.getElementById('pastille')!;
    this.contentElement = document.getElementById('content')!;
    this.counterElement = document.getElementById('counter')!;
    this.waveCanvas = document.getElementById('waveform') as HTMLCanvasElement;
    this.waveCtx = this.waveCanvas.getContext('2d');
    this.editor = document.getElementById('editor') as HTMLTextAreaElement;
    this.backdrop = document.getElementById('backdrop')!;
    this.saveBtn = document.getElementById('save-btn') as HTMLButtonElement;
    this.overwriteBtn = document.getElementById('overwrite-btn') as HTMLButtonElement;
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
    this.setupRecordingEvents();
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

    pastilleIpcRenderer.on('show-spell-launch', (_: any, message: string) => {
      this.showSpellLaunch(message);
    });

    pastilleIpcRenderer.on('show-spell-result', (_: any, result: string) => {
      this.showSpellResult(result);
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

    // Overwrite button
    this.overwriteBtn.addEventListener('click', () => {
      this.overwriteAndCollapse();
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
      } else if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        this.saveAndCollapse();
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

  private setupRecordingEvents() {
    pastilleIpcRenderer.on('start-pastille-recording', async (event: any, options: { deviceId: string }) => {
      console.log('🎤 Pastille received start-recording', options);
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        console.warn('⚠️ Recording is already in progress.');
        return;
      }

      try {
        const constraints: MediaStreamConstraints = {
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            sampleRate: 16000,
            channelCount: 1,
          },
          video: false,
        };

        if (options.deviceId && options.deviceId !== 'default' && options.deviceId !== 'auto') {
          (constraints.audio as MediaTrackConstraints).deviceId = { exact: options.deviceId };
        }

        this.audioStream = await navigator.mediaDevices.getUserMedia(constraints);
        pastilleIpcRenderer.send('pastille-audio-started');
        console.log('✅ Got microphone stream');

        const mimeTypes = [
          'audio/webm;codecs=opus',
          'audio/webm',
          'audio/mp4',
        ];
        const supportedMimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
        if (!supportedMimeType) {
          throw new Error('No supported audio MIME type found for MediaRecorder.');
        }

        this.mediaRecorder = new MediaRecorder(this.audioStream, { mimeType: supportedMimeType });
        this.audioChunks = [];

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = async () => {
          console.log('🎤 MediaRecorder stopped.');
          const audioBlob = new Blob(this.audioChunks, { type: supportedMimeType });
          const arrayBuffer = await audioBlob.arrayBuffer();

          pastilleIpcRenderer.send('pastille-audio-finished', {
            buffer: arrayBuffer,
            mimeType: supportedMimeType
          });

          this.audioChunks = [];
          if (this.audioStream) {
            this.audioStream.getTracks().forEach(track => track.stop());
            this.audioStream = null;
          }
        };
        
        this.mediaRecorder.onerror = (event) => {
          const err = (event as any).error;
          console.error('❌ MediaRecorder error:', err);
          let msg = 'Unknown MediaRecorder error';
          if (err) {
            msg = err.message ? `${err.name}: ${err.message}` : JSON.stringify(err);
          }
          pastilleIpcRenderer.send('pastille-audio-error', msg);
        };

        this.mediaRecorder.start(100); // Trigger ondataavailable every 100ms
        console.log('🎤 MediaRecorder started');

      } catch (error) {
        console.error('❌ Error starting recording in pastille:', error);
        let errorMessage = 'An unknown recording error occurred.';
        if (error instanceof Error) {
            errorMessage = `${error.name}: ${error.message}`;
        } else if (typeof error === 'string') {
            errorMessage = error;
        } else {
            try {
                errorMessage = JSON.stringify(error);
            } catch {
                errorMessage = 'Unstringifiable error object caught.';
            }
        }
        pastilleIpcRenderer.send('pastille-audio-error', errorMessage);
      }
    });

    pastilleIpcRenderer.on('stop-pastille-recording', () => {
      console.log('🛑 Pastille received stop-recording');
      if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
        this.mediaRecorder.stop();
      }
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
    // Safely handle entry.text for logging
    const entryText = typeof entry?.text === 'string' ? entry.text : String(entry?.text || '');
    console.log('📋 Pastille renderer: updating with entry:', entryText.substring(0, 30) + '...', `${currentIndex + 1}/${totalCount}`);
    
    this.currentEntry = entry;
    this.currentIndex = currentIndex;
    this.totalCount = totalCount;
    
    // Update collapsed state elements
    if (!entry || totalCount === 0) {
      this.contentElement.textContent = 'No clipboard content';
      this.contentElement.className = 'content empty';
      this.counterElement.textContent = '0/0';
    } else {
      // Ensure entry.text is a string before using substring
      const safeText = typeof entry.text === 'string' ? entry.text : String(entry.text || '');
      
      // Truncate long text for display
      const displayText = safeText.length > 80 
        ? safeText.substring(0, 80) + '...' 
        : safeText;
      
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

  // Spell feedback methods
  private showSpellLaunch(message: string) {
    console.log('✨ Pastille renderer: show spell launch');
    this.isRecording = false;
    
    // Update collapsed state
    this.waveCanvas.classList.add('hidden');
    this.contentElement.textContent = message;
    this.contentElement.style.color = '#9c27b0'; // Purple for magic
    this.counterElement.textContent = '';
    
    // Update expanded state
    this.controlWaveform.classList.add('hidden');
    this.updateControlBar();

    // Add sparkle animation
    this.clearProcessing();
    let sparkleCount = 0;
    this.processingInterval = setInterval(() => {
      sparkleCount = (sparkleCount + 1) % 4;
      const sparkles = '✨'.repeat(sparkleCount + 1);
      this.contentElement.textContent = `${sparkles} ${message} ${sparkles}`;
      if (this.expanded) {
        this.controlStatus.textContent = `${sparkles} ${message} ${sparkles}`;
      }
    }, 300);

    this.show();
  }

  private showSpellResult(result: any) {
    console.log('🎯 ✨ Pastille renderer: show magical spell result');
    this.isRecording = false;
    
    // Clear any processing animation
    this.clearProcessing();
    
    // Create magical stardust effect
    this.createStardustEffect();
    
    // Ensure result is a string - handle different input types
    let resultText: string;
    if (typeof result === 'string') {
      resultText = result;
    } else if (result && typeof result === 'object') {
      // If it's a SpellResult object, extract the output
      resultText = result.output || result.toString();
    } else {
      resultText = String(result || '');
    }
    
    // Update collapsed state with magical styling
    this.waveCanvas.classList.add('hidden');
    this.contentElement.textContent = resultText.substring(0, 100) + (resultText.length > 100 ? '...' : '');
    this.contentElement.style.color = '#4caf50'; // Green for success
    this.contentElement.style.textShadow = '0 0 10px rgba(76, 175, 80, 0.6)'; // Magical glow
    this.counterElement.textContent = `✨ Spell completed (${resultText.length} chars)`;
    
    // Add magical pulsing effect to the pastille
    this.pastilleElement.style.boxShadow = '0 8px 32px rgba(76, 175, 80, 0.4), 0 0 20px rgba(76, 175, 80, 0.3)';
    this.pastilleElement.style.borderColor = 'rgba(76, 175, 80, 0.5)';
    
    // Update expanded state
    this.controlWaveform.classList.add('hidden');
    this.updateControlBar();

    this.show();
    
    // Reset magical effects after a few seconds
    setTimeout(() => {
      this.contentElement.style.color = '';
      this.contentElement.style.textShadow = '';
      this.pastilleElement.style.boxShadow = '';
      this.pastilleElement.style.borderColor = '';
    }, 3000);
  }

  private createStardustEffect() {
    // Create multiple stardust particles that float away from the pastille
    const colors = ['#FFD700', '#FFA500', '#FF69B4', '#9370DB', '#00CED1'];
    const particles = 12;
    
    for (let i = 0; i < particles; i++) {
      setTimeout(() => {
        const star = document.createElement('div');
        star.innerHTML = '✨';
        star.style.position = 'fixed';
        star.style.fontSize = `${Math.random() * 8 + 12}px`;
        star.style.color = colors[Math.floor(Math.random() * colors.length)];
        star.style.pointerEvents = 'none';
        star.style.zIndex = '10000';
        star.style.textShadow = '0 0 6px currentColor';
        
        // Start from pastille center
        const pastilleRect = this.pastilleElement.getBoundingClientRect();
        const startX = pastilleRect.left + pastilleRect.width / 2;
        const startY = pastilleRect.top + pastilleRect.height / 2;
        
        star.style.left = `${startX}px`;
        star.style.top = `${startY}px`;
        
        document.body.appendChild(star);
        
        // Animate the stardust flying away
        const angle = (Math.PI * 2 * i) / particles + Math.random() * 0.5;
        const distance = 100 + Math.random() * 100;
        const duration = 1000 + Math.random() * 500;
        
        star.animate([
          {
            transform: 'translate(0, 0) scale(0.5) rotate(0deg)',
            opacity: '1'
          },
          {
            transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(1.2) rotate(360deg)`,
            opacity: '0'
          }
        ], {
          duration: duration,
          easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
        }).addEventListener('finish', () => {
          document.body.removeChild(star);
        });
      }, i * 50); // Stagger the particle creation
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
    this.hasExplicitlySaved = false; // Reset save flag
    
    // Store original text
    this.originalText = this.currentEntry?.text || '';
    
    // Notify main process that edit mode has started
    pastilleIpcRenderer.send('edit-mode-start', {
      entryIndex: this.currentIndex,
      entryText: this.originalText
    });
    
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
    
    // Check if there are unsaved changes and user didn't explicitly save
    const currentText = this.editor.value.trim();
    const hasUnsavedChanges = currentText !== this.originalText;
    
    if (hasUnsavedChanges && !this.hasExplicitlySaved) {
      // Auto-save: keep both original and final (save mode)
      pastilleIpcRenderer.send('update-clipboard', currentText, 'save');
      console.log('💾 Auto-save: keeping both original and final versions');
    } else if (!hasUnsavedChanges) {
      // No changes: just cancel edit mode
      pastilleIpcRenderer.send('update-clipboard', this.originalText, 'cancel');
      console.log('📝 No changes: cancelling edit mode');
    }
    
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
      // Final save: keep both original and final versions
      pastilleIpcRenderer.send('update-clipboard', newText, 'save');
      console.log('💾 Final save: keeping both original and final versions');
      this.hasExplicitlySaved = true;
    } else {
      // No changes: just cancel edit mode
      pastilleIpcRenderer.send('update-clipboard', this.originalText, 'cancel');
      console.log('📝 No changes: cancelling edit mode');
    }
    
    this.collapse();
  }

  private overwriteAndCollapse() {
    const newText = this.editor.value.trim();
    
    // Overwrite: replace original with final version only
    pastilleIpcRenderer.send('update-clipboard', newText, 'overwrite');
    console.log('📝 Overwrite: replacing original with final version only');
    this.hasExplicitlySaved = true;
    
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

  private cancelAndCollapse() {
    // Cancel: keep only original version
    pastilleIpcRenderer.send('update-clipboard', this.originalText, 'cancel');
    console.log('❌ Cancelled editing: keeping only original version');
    
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