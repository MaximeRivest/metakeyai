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
      console.log('👁️ Pastille renderer: showing pastille');
      this.show();
    });

    pastilleIpcRenderer.on('hide-pastille', () => {
      console.log('🙈 Pastille renderer: hiding pastille');
      this.hide();
    });

    // Generic notification
    pastilleIpcRenderer.on('show-message', (event: any, message: string) => {
      console.log('🔔 Pastille renderer: showing message:', message);
      this.showMessage(message);
    });

    // Recording lifecycle
    pastilleIpcRenderer.on('start-recording', (_: any, msg: string) => {
      this.startRecording(msg);
      this.setIndicatorState('recording');
    });

    pastilleIpcRenderer.on('audio-data', (_: any, data: Buffer) => {
      this.drawWaveform(data);
    });

    pastilleIpcRenderer.on('show-processing', (_: any, msg: string) => {
      this.showProcessing(msg);
      this.setIndicatorState('processing');
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

    // Listen for magical blue orb success events
    pastilleIpcRenderer.on('spell-success-magic', (_: any, data: { spellName: string, output: string, timestamp: number }) => {
      console.log('🔵 Pastille received magical success event:', data);
      
      // Show success message with blue orb
      this.showMessage(`🔵 ${data.spellName}: ${data.output.substring(0, 80)}${data.output.length > 80 ? '...' : ''}`);
      
      // Trigger blue orb celebration animation
      this.triggerBlueCelebration();
      
      // Set indicator to celebratory blue state
      this.setIndicatorState('celebration');
    });

    // Listen for magical blue orb error events
    pastilleIpcRenderer.on('spell-error-magic', (_: any, data: { spellName: string, error: string, timestamp: number }) => {
      console.log('🔵 Pastille received magical error event:', data);
      
      // Show error message with blue orb
      this.showMessage(`🔵 ${data.spellName} Error: ${data.error}`);
      
      // Set indicator to error blue state  
      this.setIndicatorState('error');
    });

    // Listen for IPC messages from main process
    pastilleIpcRenderer.on('highlight-pastille', () => {
      console.log('✨ Pastille renderer: highlighting pastille for preview');
      this.highlightForPreview();
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

    // Generic unified recording start handler
    pastilleIpcRenderer.on('start-web-audio', async (event: any, payload: any) => {
      const prefix = typeof payload === 'string' ? payload : payload.prefix || payload.eventPrefix || '';
      if (prefix !== 'pastille') return; // not for us

      const options: { deviceId: string } = typeof payload === 'object' && payload.deviceId ? { deviceId: payload.deviceId } : { deviceId: 'default' };
      // Reuse existing handler logic by emitting a synthetic event with same signature
      pastilleIpcRenderer.emit('start-pastille-recording', event, options);
    });

    pastilleIpcRenderer.on('stop-web-audio', (event: any, payload: any) => {
      const prefix = typeof payload === 'string' ? payload : payload.prefix || payload.eventPrefix || '';
      if (prefix !== 'pastille') return;
      // Delegate to existing stop handler logic
      pastilleIpcRenderer.emit('stop-pastille-recording');
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
      this.setIndicatorState('recording');
    } else if (this.processingInterval) {
      this.controlStatus.textContent = 'Processing...';
      this.controlIndicator.className = 'control-indicator processing';
    } else {
      this.controlStatus.textContent = 'Ready';
      this.controlIndicator.className = 'control-indicator';
    }
  }

  private handleDoubleClick() {
    console.log('🖱️ 🚀 DOUBLE-CLICK: Double-click detected!');
    console.log('🖱️ 🔍 DOUBLE-CLICK: Current expanded state:', this.expanded);
    
    // Clear any existing timeout to prevent multiple rapid clicks
    if (this.doubleClickTimeout) {
      clearTimeout(this.doubleClickTimeout);
      this.doubleClickTimeout = null;
      console.log('🖱️ ⏱️ DOUBLE-CLICK: Cleared existing timeout');
    }

    // Add a small delay to ensure the click is processed properly
    this.doubleClickTimeout = setTimeout(() => {
      console.log('🖱️ ▶️ DOUBLE-CLICK: Timeout executed, expanded state:', this.expanded);
      if (this.expanded) {
        console.log('🖱️ 📕 DOUBLE-CLICK: Collapsing...');
        this.collapse();
      } else {
        console.log('🖱️ 📖 DOUBLE-CLICK: Expanding...');
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
      
      // Apply adaptive text sizing and get display text
      const { displayText, sizeClass } = this.getAdaptiveDisplayText(safeText);
      
      this.contentElement.textContent = displayText;
      this.contentElement.className = `content ${sizeClass}`;
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

  private getAdaptiveDisplayText(text: string): { displayText: string, sizeClass: string } {
    // Try different truncation lengths based on text size
    const baseLength = 40;  // Base length for short text
    let maxLength = baseLength;
    let sizeClass = 'text-short';
    
    // Calculate display length based on fixed pastille width (520px)
    // Approximate character widths for different font sizes
    const charWidths: Record<string, number> = {
      'text-short': 9,     // 0.95rem ≈ 15px → ~9px per char
      'text-medium': 8,    // 0.85rem ≈ 13px → ~8px per char  
      'text-long': 7,      // 0.75rem ≈ 12px → ~7px per char
      'text-very-long': 6, // 0.65rem ≈ 10px → ~6px per char
      'text-extreme': 5    // 0.55rem ≈ 9px → ~5px per char
    };
    
    // Available width for text (520px total - 40px padding - 20px for indicator - 40px for counter - 20px for gaps)
    const availableWidth = 400;
    
    // Try each size class to find the best fit
    const sizeOptions: (keyof typeof charWidths)[] = ['text-short', 'text-medium', 'text-long', 'text-very-long', 'text-extreme'];
    
    for (const size of sizeOptions) {
      const maxChars = Math.floor(availableWidth / charWidths[size]);
      if (text.length <= maxChars) {
        return { displayText: text, sizeClass: size };
      }
      maxLength = maxChars;
      sizeClass = size;
    }
    
    // If text is still too long even at smallest size, truncate with ellipsis
    const truncatedText = text.substring(0, maxLength - 3) + '...';
    return { displayText: truncatedText, sizeClass: sizeClass };
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
    
    // Apply adaptive text sizing to message
    const { displayText, sizeClass } = this.getAdaptiveDisplayText(message);
    this.contentElement.textContent = displayText;
    this.contentElement.className = `content ${sizeClass}`;
    this.counterElement.textContent = '';
    this.show();
  }

  // Recording UI
  private startRecording(message: string) {
    console.log('🎤 Pastille renderer: start recording');
    this.clearProcessing();
    this.isRecording = true;
    
    // Update collapsed state with adaptive sizing
    this.waveCanvas.classList.remove('hidden');
    const { displayText, sizeClass } = this.getAdaptiveDisplayText(message);
    this.contentElement.textContent = displayText;
    this.contentElement.className = `content ${sizeClass}`;
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
    
    // Update collapsed state with adaptive sizing
    this.waveCanvas.classList.add('hidden');
    const { displayText, sizeClass } = this.getAdaptiveDisplayText(message);
    this.contentElement.textContent = displayText;
    this.contentElement.className = `content ${sizeClass}`;
    this.counterElement.textContent = '';
    
    // Update expanded state
    this.controlWaveform.classList.add('hidden');
    this.updateControlBar();

    this.clearProcessing();
    let dots = 0;
    this.processingInterval = setInterval(() => {
      dots = (dots + 1) % 4;
      const messageWithDots = message + '.'.repeat(dots);
      const { displayText: animatedDisplayText, sizeClass: animatedSizeClass } = this.getAdaptiveDisplayText(messageWithDots);
      this.contentElement.textContent = animatedDisplayText;
      this.contentElement.className = `content ${animatedSizeClass}`;
      if (this.expanded) {
        this.controlStatus.textContent = messageWithDots;
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
    
    // Update collapsed state with adaptive sizing
    this.waveCanvas.classList.add('hidden');
    const { displayText, sizeClass } = this.getAdaptiveDisplayText(message);
    this.contentElement.textContent = displayText;
    this.contentElement.className = `content ${sizeClass}`;
    this.contentElement.style.color = 'var(--color-primary)'; // Blue for magic consistency
    this.counterElement.textContent = '';
    
    // Update expanded state
    this.controlWaveform.classList.add('hidden');
    this.updateControlBar();

    // Add sparkle animation with adaptive sizing
    this.clearProcessing();
    let sparkleCount = 0;
    this.processingInterval = setInterval(() => {
      sparkleCount = (sparkleCount + 1) % 4;
      const sparkles = '✨'.repeat(sparkleCount + 1);
      const sparklyMessage = `${sparkles} ${message} ${sparkles}`;
      const { displayText: sparklyDisplayText, sizeClass: sparklySizeClass } = this.getAdaptiveDisplayText(sparklyMessage);
      this.contentElement.textContent = sparklyDisplayText;
      this.contentElement.className = `content ${sparklySizeClass}`;
      if (this.expanded) {
        this.controlStatus.textContent = sparklyMessage;
      }
    }, 300);

    this.show();
  }

  private showSpellResult(result: any) {
    console.log('🎯 ✨ Pastille renderer: show magical spell result');
    this.isRecording = false;
    
    // Clear any processing animation
    this.clearProcessing();
    
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
    
    // Update collapsed state with magical styling and adaptive sizing
    this.waveCanvas.classList.add('hidden');
    const { displayText, sizeClass } = this.getAdaptiveDisplayText(resultText);
    this.contentElement.textContent = displayText;
    this.contentElement.className = `content ${sizeClass}`;
    this.contentElement.style.color = 'var(--color-primary)'; // Blue for success
    this.counterElement.textContent = `✨ Spell completed (${resultText.length} chars)`;
    
    // Add magical blue pulsing effect to the pastille
    this.pastilleElement.style.boxShadow = '0 8px 32px var(--color-primary), 0 0 20px var(--color-primary-end)';
    this.pastilleElement.style.borderColor = 'var(--color-primary)';
    
    // Add sweeping blue effect through the text
    this.createSweepingBlueEffect();
    
    // Update expanded state
    this.controlWaveform.classList.add('hidden');
    this.updateControlBar();

    this.show();
    
    // Reset magical effects after a few seconds
    setTimeout(() => {
      this.contentElement.style.color = '';
      this.pastilleElement.style.boxShadow = '';
      this.pastilleElement.style.borderColor = '';
    }, 3000);
  }

  private createSweepingBlueEffect() {
    // Create a sweeping blue light effect that moves across the content text
    const contentRect = this.contentElement.getBoundingClientRect();
    
    // Create the sweeping light element
    const sweep = document.createElement('div');
    sweep.style.position = 'fixed';
    sweep.style.top = `${contentRect.top}px`;
    sweep.style.left = `${contentRect.left - 20}px`; // Start slightly before
    sweep.style.width = '20px';
    sweep.style.height = `${contentRect.height}px`;
    sweep.style.background = 'linear-gradient(90deg, transparent, var(--color-primary), var(--color-primary-end), transparent)';
    sweep.style.pointerEvents = 'none';
    sweep.style.zIndex = '9999';
    sweep.style.opacity = '0.8';
    sweep.style.filter = 'blur(1px)';
    sweep.style.boxShadow = '0 0 20px var(--color-primary), 0 0 40px var(--color-primary-end)';
    
    document.body.appendChild(sweep);
    
    // Animate the sweep across the text
    const sweepDistance = contentRect.width + 40; // Content width plus padding
    
    sweep.animate([
      {
        transform: 'translateX(0px)',
        opacity: '0'
      },
      {
        transform: `translateX(${sweepDistance * 0.2}px)`,
        opacity: '0.8'
      },
      {
        transform: `translateX(${sweepDistance * 0.8}px)`,
        opacity: '0.8'
      },
      {
        transform: `translateX(${sweepDistance}px)`,
        opacity: '0'
      }
    ], {
      duration: 1000,
      easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)'
    }).addEventListener('finish', () => {
      if (document.body.contains(sweep)) {
        document.body.removeChild(sweep);
      }
    });
  }

  private applyFontSize() {
    this.pastilleElement.style.fontSize = `${this.fontSize}px`;
    this.counterElement.style.fontSize = `${Math.max(8, this.fontSize - 4)}px`;
  }

  private expand() {
    if (this.expanded) return;
    
    console.log('📖 🚀 EXPAND: Starting pastille editor expansion');
    console.log('📖 🔍 EXPAND: Current window size before expansion:', window.innerWidth, 'x', window.innerHeight);
    
    this.expanded = true;
    this.isEditing = true;
    this.hasExplicitlySaved = false; // Reset save flag
    
    // Store original text
    this.originalText = this.currentEntry?.text || '';
    console.log('📖 📝 EXPAND: Original text length:', this.originalText.length);
    
    // Notify main process that edit mode has started
    pastilleIpcRenderer.send('edit-mode-start', {
      entryIndex: this.currentIndex,
      entryText: this.originalText
    });
    
    // Set up editor
    this.editor.value = this.originalText;
    this.updateEditorStats();
    console.log('📖 📝 EXPAND: Editor value set, textarea element:', this.editor);
    
    // Add CSS classes
    console.log('📖 🎨 EXPAND: Adding CSS classes...');
    this.pastilleElement.classList.add('expanded');
    this.backdrop.classList.remove('hidden');
    console.log('📖 🎨 EXPAND: CSS classes added. Pastille classes:', this.pastilleElement.className);
    
    // Disable drag on main element while editing
    this.pastilleElement.style.setProperty('-webkit-app-region', 'no-drag');

    // Request main process to handle window expansion
    console.log('📖 🔗 EXPAND: Sending expand-pastille IPC message...');
    pastilleIpcRenderer.send('expand-pastille');
    
    // Fallback: Also try to trigger resize from renderer side after a short delay
    setTimeout(() => {
      console.log('📖 🔄 EXPAND: Fallback - checking if window resized...');
      console.log('📖 🔍 EXPAND: Window size check:', window.innerWidth, 'x', window.innerHeight);
      if (window.innerHeight < 400) {
        console.log('📖 ⚠️ EXPAND: Window still small, trying fallback resize...');
        // Try to force window resize via webContents
        pastilleIpcRenderer.send('force-window-resize', { 
          width: Math.round(window.screen.availWidth * 0.8), 
          height: Math.round(window.screen.availHeight * 0.8) 
        });
      }
    }, 200);

    // Focus editor after animation
    setTimeout(() => {
      console.log('📖 🎯 EXPAND: Focusing editor and setting cursor position...');
      console.log('📖 🔍 EXPAND: Window size after expansion:', window.innerWidth, 'x', window.innerHeight);
      console.log('📖 🔍 EXPAND: Editor container display:', getComputedStyle(document.querySelector('.editor-container')).display);
      console.log('📖 🔍 EXPAND: Editor visibility:', getComputedStyle(this.editor).visibility);
      console.log('📖 🔍 EXPAND: Editor dimensions:', this.editor.offsetWidth, 'x', this.editor.offsetHeight);
      
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

  // Function to trigger blue orb celebration
  private triggerBlueCelebration() {
    // Create celebration blue orbs
    const pastilleElement = document.getElementById('pastille');
    if (!pastilleElement) return;
    
    const rect = pastilleElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    
    // Create 8 celebration orbs that burst outward
    for (let i = 0; i < 8; i++) {
      const orb = document.createElement('div');
      const angle = (i / 8) * 2 * Math.PI;
      const distance = 100 + Math.random() * 50;
      const size = 8 + Math.random() * 6;
      
      orb.style.cssText = `
        position: fixed;
        width: ${size}px;
        height: ${size}px;
        background: radial-gradient(circle, var(--color-primary) 0%, var(--color-primary-end) 70%, transparent 100%);
        border-radius: 50%;
        left: ${centerX}px;
        top: ${centerY}px;
        pointer-events: none;
        z-index: 10000;
        box-shadow: 
          0 0 ${size * 2}px var(--color-primary),
          0 0 ${size * 4}px var(--color-primary-end);
        animation: celebrationBurst 2s ease-out forwards;
        --target-x: ${Math.cos(angle) * distance}px;
        --target-y: ${Math.sin(angle) * distance}px;
      `;
      
      document.body.appendChild(orb);
      
      // Remove after animation
      setTimeout(() => {
        if (document.body.contains(orb)) {
          document.body.removeChild(orb);
        }
      }, 2000);
    }
    
    // Add celebration burst animation
    if (!document.getElementById('celebration-styles')) {
      const style = document.createElement('style');
      style.id = 'celebration-styles';
      style.textContent = `
        @keyframes celebrationBurst {
          0% {
            opacity: 1;
            transform: translate(0, 0) scale(0.5);
          }
          50% {
            opacity: 1;
            transform: translate(var(--target-x), var(--target-y)) scale(1.2);
          }
          100% {
            opacity: 0;
            transform: translate(var(--target-x), var(--target-y)) scale(0.3);
          }
        }
      `;
      document.head.appendChild(style);
    }
  }

  // Function to set indicator state with blue orb variations
  private setIndicatorState(state: 'normal' | 'recording' | 'processing' | 'celebration' | 'error') {
    const indicator = document.querySelector('.indicator') as HTMLElement;
    const controlIndicator = document.querySelector('.control-indicator') as HTMLElement;
    
    if (!indicator) return;
    
    // Remove existing state classes
    indicator.className = 'indicator';
    if (controlIndicator) {
      controlIndicator.className = 'control-indicator';
    }
    
    // Apply new state
    switch (state) {
      case 'recording':
        indicator.classList.add('recording');
        if (controlIndicator) controlIndicator.classList.add('recording');
        break;
      case 'processing':
        indicator.classList.add('processing');
        if (controlIndicator) controlIndicator.classList.add('processing');
        break;
      case 'celebration':
        indicator.classList.add('celebration');
        if (controlIndicator) controlIndicator.classList.add('celebration');
        // Auto-return to normal after celebration
        setTimeout(() => this.setIndicatorState('normal'), 3000);
        break;
      case 'error':
        indicator.classList.add('error');
        if (controlIndicator) controlIndicator.classList.add('error');
        // Auto-return to normal after error display
        setTimeout(() => this.setIndicatorState('normal'), 5000);
        break;
      case 'normal':
      default:
        // Already cleaned up above
        break;
    }
  }

  private highlightForPreview() {
    // Add a temporary highlight effect to make the pastille more visible during preview
    const originalClasses = this.pastilleElement.className;
    
    // Add highlight CSS class
    this.pastilleElement.classList.add('preview-highlight');
    
    // Force the pastille to be visible during preview
    this.show();
    
    // Remove highlight after a short duration
    setTimeout(() => {
      this.pastilleElement.className = originalClasses;
    }, 1500);
  }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PastilleRenderer();
}); 