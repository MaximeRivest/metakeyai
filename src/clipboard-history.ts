import { clipboard } from 'electron';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

export interface ClipboardEntry {
  id: string;
  text: string;
  timestamp: Date;
  hash: string; // SHA-256 hash for deduplication
}

export class ClipboardHistory extends EventEmitter {
  private history: ClipboardEntry[] = [];
  private currentIndex: number = -1;
  private maxEntries: number = 50;
  private lastClipboardText: string = '';
  private checkInterval: NodeJS.Timeout | null = null;
  private isInternalChange: boolean = false;
  private isEditModeActive: boolean = false; // Prevent monitoring during edit mode

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
      // Skip monitoring during edit mode to prevent draft spam
      if (this.isEditModeActive) {
        return;
      }
      
      const currentText = clipboard.readText();
      if (currentText && currentText !== this.lastClipboardText && !this.isInternalChange) {
        this.addEntry(currentText);
        this.lastClipboardText = currentText;
      }
      // Reset internal change flag after each check
      this.isInternalChange = false;
    }, 500);
  }

  private generateHash(text: string): string {
    return crypto.createHash('sha256').update(text.trim()).digest('hex');
  }

  private addEntry(text: string) {
    // Don't add empty entries
    if (!text.trim()) {
      return;
    }

    const hash = this.generateHash(text);
    
    // Remove any existing entries with the same hash (deduplication)
    const existingIndex = this.history.findIndex(entry => entry.hash === hash);
    if (existingIndex !== -1) {
      console.log('🔄 Removing duplicate clipboard entry at index:', existingIndex);
      this.history.splice(existingIndex, 1);
      
      // Adjust currentIndex if needed
      if (this.currentIndex > existingIndex) {
        this.currentIndex--;
      } else if (this.currentIndex === existingIndex) {
        // If we removed the current entry, adjust to valid index
        this.currentIndex = Math.min(this.currentIndex, this.history.length - 1);
      }
    }

    const entry: ClipboardEntry = {
      id: Date.now().toString(),
      text: text,
      timestamp: new Date(),
      hash: hash
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

  // Add entry with optional replacement of specific entry (for edit mode)
  public addEntryWithReplacement(text: string, replaceEntryId?: string): ClipboardEntry {
    if (!text.trim()) {
      throw new Error('Cannot add empty clipboard entry');
    }

    const hash = this.generateHash(text);
    
    // If replaceEntryId is provided, replace that specific entry
    if (replaceEntryId) {
      const replaceIndex = this.history.findIndex(entry => entry.id === replaceEntryId);
      if (replaceIndex !== -1) {
        console.log('🔄 Replacing clipboard entry at index:', replaceIndex);
        
        // Remove the old entry
        this.history.splice(replaceIndex, 1);
        
        // Adjust currentIndex if needed
        if (this.currentIndex > replaceIndex) {
          this.currentIndex--;
        } else if (this.currentIndex === replaceIndex) {
          this.currentIndex = Math.min(this.currentIndex, this.history.length - 1);
        }
      }
    }
    
    // Remove any other duplicates by hash
    const existingIndex = this.history.findIndex(entry => entry.hash === hash);
    if (existingIndex !== -1) {
      console.log('🔄 Removing duplicate clipboard entry at index:', existingIndex);
      this.history.splice(existingIndex, 1);
      
      // Adjust currentIndex if needed
      if (this.currentIndex > existingIndex) {
        this.currentIndex--;
      } else if (this.currentIndex === existingIndex) {
        this.currentIndex = Math.min(this.currentIndex, this.history.length - 1);
      }
    }

    const entry: ClipboardEntry = {
      id: Date.now().toString(),
      text: text,
      timestamp: new Date(),
      hash: hash
    };

    // Add to beginning of array
    this.history.unshift(entry);
    
    // Adjust current index when new entry is added
    if (this.currentIndex >= 0) {
      this.currentIndex += 1;
    }
    
    // Set current index to the new entry
    this.currentIndex = 0;

    // Limit history size
    if (this.history.length > this.maxEntries) {
      this.history = this.history.slice(0, this.maxEntries);
      if (this.currentIndex >= this.history.length) {
        this.currentIndex = this.history.length - 1;
      }
    }

    console.log('📋 Added clipboard entry with replacement, entries:', this.history.length, 'currentIndex:', this.currentIndex);
    this.emit('history-updated', entry);
    return entry;
  }

  // Edit mode control methods
  public setEditModeActive(active: boolean) {
    this.isEditModeActive = active;
    console.log(`📝 Edit mode ${active ? 'ACTIVATED' : 'DEACTIVATED'} - clipboard monitoring ${active ? 'paused' : 'resumed'}`);
  }

  // Handle different edit completion modes
  public handleEditComplete(finalText: string, mode: 'save' | 'cancel' | 'overwrite', originalIndex: number) {
    console.log(`📝 Edit complete - mode: ${mode}, originalIndex: ${originalIndex}`);
    
    // Always update system clipboard first
    this.isInternalChange = true;
    clipboard.writeText(finalText);
    this.lastClipboardText = finalText;
    
    switch (mode) {
      case 'cancel':
        // Restore original entry - remove any that were added during edit
        console.log('📝 CANCEL: Restoring original entry only');
        // Nothing to do - just reactivate monitoring
        break;
        
      case 'save':
        // Keep both original and final (if different)
        console.log('📝 SAVE: Keeping both original and final');
        const saveOriginalEntry = this.history[originalIndex];
        if (saveOriginalEntry && saveOriginalEntry.text !== finalText) {
          // Add new entry for the final version
          this.addEntryWithReplacement(finalText, null);
        }
        break;
        
      case 'overwrite':
        // Replace original with final
        console.log('📝 OVERWRITE: Replacing original with final');
        const overwriteOriginalEntry = this.history[originalIndex];
        if (overwriteOriginalEntry) {
          this.addEntryWithReplacement(finalText, overwriteOriginalEntry.id);
        }
        break;
    }
    
    // Reactivate monitoring
    this.setEditModeActive(false);
  }

  public destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.removeAllListeners();
  }
} 