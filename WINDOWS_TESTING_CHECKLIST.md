# Windows Testing Checklist

After cleaning up legacy build scripts, here's how to ensure a clean Windows build and test:

## 🧹 **Clean Build Process**

```bash
# 1. Clean all legacy artifacts
npm run clean

# 2. Fresh dependency install  
npm install

# 3. Start the application
npm start
```

## ✅ **Key Things to Test on Windows**

### **First-Run Setup**
- [ ] Application launches without errors
- [ ] First-run setup window appears
- [ ] Microphone detection and recording works
- [ ] Audio playback works (ffplay/VLC/PowerShell fallback)
- [ ] TTS test works with API key
- [ ] Python setup completes automatically (UV-based)
- [ ] Models selection saves correctly
- [ ] Shortcuts registration works

### **Audio System** 
- [ ] Recording works with multiple microphones
- [ ] WebM files play correctly (ffplay should handle this)
- [ ] AudioPlayer singleton prevents initialization delays
- [ ] No "sox not found" errors (we removed sox dependency)

### **Python Integration**
- [ ] UV auto-installs if needed
- [ ] Python environment creates automatically  
- [ ] FastAPI daemon starts correctly
- [ ] DSPy initializes without threading errors
- [ ] Quick Edit spells work

### **Performance**
- [ ] No "check-python-setup" handler errors
- [ ] Audio playback doesn't hang
- [ ] First-run setup flows smoothly
- [ ] No legacy build artifacts causing issues

## 🚫 **What Should NOT Happen**

- ❌ No "sox FAIL formats" errors (we use ffplay/VLC now)
- ❌ No Windows-specific Python download attempts 
- ❌ No build-time Python environment creation
- ❌ No audio binary setup requirements
- ❌ No missing IPC handler errors

## 📝 **Build Commands (Updated)**

```bash
# Development
npm start

# Package for distribution (no pre-build steps needed)
npm run package

# Create installer
npm run make

# Create release
npm run release
```

## 🔧 **Troubleshooting**

If issues occur:

1. **Clean everything**: `npm run clean && npm install`
2. **Check logs**: Look in `logs/` directory for detailed error info
3. **Test individually**: 
   - Audio: Test microphone in first-run setup
   - Python: Check if UV is available in PATH
   - IPC: Look for handler registration errors in console

## 🎯 **Success Criteria**

The Windows build is successful if:
- ✅ First-run setup completes without errors
- ✅ Recording and playback work
- ✅ Python spells execute 
- ✅ No legacy build dependencies
- ✅ All shortcuts register correctly
- ✅ Application performance is smooth 