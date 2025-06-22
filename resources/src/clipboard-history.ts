import { clipboard } from 'electron';
import { EventEmitter } from 'events';

export interface ClipboardEntry {
  id: string;
  text: string;
  timestamp: Date;
}

export class ClipboardHistory extends EventEmitter {
  private history: ClipboardEntry[] = [];
  private currentIndex: number = -1;
  private maxEntries: number = 50;
  private lastClipboardText: string = '';
  private checkInterval: NodeJS.Timeout | null = null;
  private isInternalChange: boolean = false;

  constructor(maxEntries: number = 50) {
    super();
    this.maxEntries = maxEntries;
    
    // Initialize with current clipboard content
    const currentText = clipboard.readText();
    if (currentText) {
      this.lastClipboardText = currentText;
      this.addEntry(currentText);
    }
    
    this.startMonitoring();
  }

  private startMonitoring() {
    // Check clipboard every 500ms for changes
    this.checkInterval = setInterval(() => {
      const currentText = clipboard.readText();
      if (currentText && currentText !== this.lastClipboardText && !this.isInternalChange) {
        this.addEntry(currentText);
        this.lastClipboardText = currentText;
      }
      // Reset internal change flag after each check
      this.isInternalChange = false;
    }, 500);
  }

  private addEntry(text: string) {
    // Don't add empty or duplicate entries
    if (!text.trim() || (this.history.length > 0 && this.history[0].text === text)) {
      return;
    }

    const entry: ClipboardEntry = {
      id: Date.now().toString(),
      text: text,
      timestamp: new Date()
    };

    // Add to beginning of array
    this.history.unshift(entry);
    
    // Adjust current index when new entry is added (shift all indices by 1)
    if (this.currentIndex >= 0) {
      this.currentIndex += 1;
    }
    // If this is the first entry or we want to point to the new entry
    if (this.history.length === 1) {
      this.currentIndex = 0;
    }

    // Limit history size
    if (this.history.length > this.maxEntries) {
      this.history = this.history.slice(0, this.maxEntries);
      // Adjust index if it's beyond the new size
      if (this.currentIndex >= this.history.length) {
        this.currentIndex = this.history.length - 1;
      }
    }

    console.log('📋 Clipboard history updated, entries:', this.history.length, 'currentIndex:', this.currentIndex);
    this.emit('history-updated', this.getCurrentEntry());
  }

  public cycleNext(): ClipboardEntry | null {
    if (this.history.length === 0) return null;

    this.currentIndex = (this.currentIndex + 1) % this.history.length;
    const entry = this.history[this.currentIndex];
    
    // Mark as internal change to prevent monitoring from adding it again
    this.isInternalChange = true;
    clipboard.writeText(entry.text);
    this.lastClipboardText = entry.text;
    
    console.log('➡️ Cycled to next clipboard entry:', this.currentIndex + 1, '/', this.history.length, 'Text:', entry.text.substring(0, 30) + '...');
    this.emit('current-changed', entry);
    return entry;
  }

  public cyclePrevious(): ClipboardEntry | null {
    if (this.history.length === 0) return null;

    this.currentIndex = this.currentIndex <= 0 ? this.history.length - 1 : this.currentIndex - 1;
    const entry = this.history[this.currentIndex];
    
    // Mark as internal change to prevent monitoring from adding it again
    this.isInternalChange = true;
    clipboard.writeText(entry.text);
    this.lastClipboardText = entry.text;
    
    console.log('⬅️ Cycled to previous clipboard entry:', this.currentIndex + 1, '/', this.history.length, 'Text:', entry.text.substring(0, 30) + '...');
    this.emit('current-changed', entry);
    return entry;
  }

  public getCurrentEntry(): ClipboardEntry | null {
    if (this.history.length === 0 || this.currentIndex < 0) return null;
    return this.history[this.currentIndex];
  }

  public getHistory(): ClipboardEntry[] {
    return [...this.history];
  }

  public getCurrentIndex(): number {
    return this.currentIndex;
  }

  public getHistoryLength(): number {
    return this.history.length;
  }

  public destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.removeAllListeners();
  }
} 