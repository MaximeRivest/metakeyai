# 🪟 Windows Debugging Guide for MetaKeyAI

This guide helps you debug MetaKeyAI issues on Windows, especially the "no suitable audio player found" error and missing console output.

## 🐛 Common Windows Issues

### 1. **No Console Output**
**Problem**: Windows Electron apps don't show console output by default, making debugging nearly impossible.

**Solutions**:
- **Development**: A separate debug console window is automatically spawned
- **Production**: Log files are created in `%APPDATA%\MetaKeyAI\logs\`
- **Debug Menu**: Access via the Debug menu in the app (Windows only)

### 2. **"No Suitable Audio Player Found"**
**Problem**: Audio playback fails because Windows lacks Sox or other audio tools.

**Solutions**:
- **Automatic**: The GitHub Actions build now downloads audio binaries
- **Manual**: Install Sox via `winget install shanebutler.SoX`
- **Fallback**: PowerShell MediaPlayer is used when Sox is unavailable

## 🔧 Debugging Tools

### **Enhanced Logging**
All console output is now logged to files:
```
%APPDATA%\MetaKeyAI\logs\metakeyai-YYYY-MM-DD.log
```

### **Debug Menu (Windows Only)**
Access via the application menu:
- **Open Log File**: View current log file
- **Open Log Directory**: Browse all log files
- **Show Debug Info**: System information popup
- **Test Audio Recording**: Test microphone functionality
- **Test Audio Playback**: Test speaker functionality
- **Generate Debug Report**: Comprehensive system report

### **Audio Capabilities Testing**
The debug menu includes audio testing that checks:
- Sox availability
- FFmpeg availability
- PowerShell MediaPlayer
- Windows Media Player
- Recording capabilities

## 🎵 Audio System Architecture

### **Priority Order** (Windows):
1. **Sox** (bundled via GitHub Actions)
2. **PowerShell MediaPlayer** (fallback)
3. **Windows Media Player** (system)
4. **FFmpeg** (if installed)

### **Audio Binaries Setup**
The build process now automatically:
1. Downloads Sox for Windows via winget/chocolatey
2. Creates PowerShell audio handler as fallback
3. Bundles everything in `resources/binaries/windows/`

## 🚀 Build Process Changes

### **GitHub Actions Enhancement**
```yaml
- name: Setup audio binaries
  run: node scripts/setup-audio-binaries.js
```

This step:
- Downloads platform-specific audio tools
- Creates fallback handlers
- Tests audio capabilities
- Bundles everything for distribution

### **Local Testing**
```bash
# Test audio setup locally
npm run setup:audio

# Check what was installed
ls -la resources/binaries/windows/
```

## 🔍 Troubleshooting Steps

### **Step 1: Check Debug Menu**
1. Launch MetaKeyAI
2. Click "Debug" in the menu bar (Windows only)
3. Select "Generate Debug Report"
4. Review the audio capabilities section

### **Step 2: Test Audio Components**
```bash
# Test audio playback
powershell -ExecutionPolicy Bypass -File resources/binaries/windows/audio-handler.ps1 -Action test

# Test specific audio file
powershell -ExecutionPolicy Bypass -File resources/binaries/windows/audio-handler.ps1 -Action play -InputFile "C:\path\to\audio.wav"
```

### **Step 3: Check Log Files**
Look for these patterns in logs:
```
🔍 Detecting available audio playback methods...
🧪 Testing powershell playback availability...
✅ PowerShell MediaPlayer is available
🔊 Audio playback initialized with powershell
```

### **Step 4: Manual Audio Installation**
If automatic setup fails:
```powershell
# Install Sox via winget
winget install --id shanebutler.SoX

# Or via Chocolatey
choco install sox.portable

# Verify installation
sox --version
```

## 📊 Debug Report Contents

The debug report includes:
- **System Info**: Platform, versions, paths
- **Audio Capabilities**: All available audio methods
- **Environment Variables**: PATH, program files locations
- **File Locations**: Log files, config files
- **Component Status**: All MetaKeyAI components
- **Recent Logs**: Last 50 log entries

## 🆘 Getting Help

### **When Reporting Issues**:
1. Generate a debug report (Debug → Generate Debug Report)
2. Include the debug report JSON file
3. Attach recent log files from `%APPDATA%\MetaKeyAI\logs\`
4. Describe the exact error message and steps to reproduce

### **Log File Locations**:
- **Development**: `./logs/metakeyai-*.log`
- **Production**: `%APPDATA%\MetaKeyAI\logs\metakeyai-*.log`

### **Audio Handler Locations**:
- **Development**: `./resources/binaries/windows/audio-handler.ps1`
- **Production**: `%USERPROFILE%\AppData\Local\Programs\metakeyai-app\resources\binaries\windows\audio-handler.ps1`

## 🔮 Future Improvements

- **Native Windows Audio APIs**: Direct integration with Windows audio
- **Real-time Audio Monitoring**: Live audio level indicators
- **Audio Device Selection**: Choose specific input/output devices
- **Enhanced Error Recovery**: Automatic fallback switching

## 🎯 Quick Fixes

### **Audio Not Working**:
```powershell
# Quick test
powershell -Command "Add-Type -AssemblyName PresentationCore; (New-Object System.Windows.Media.MediaPlayer).ToString()"
```

### **No Console Output**:
```bash
# Check log file
notepad "%APPDATA%\MetaKeyAI\logs\metakeyai-*.log"
```

### **Transcription Failing**:
1. Check API keys in settings
2. Test internet connectivity
3. Review transcription logs
4. Verify audio file format (should be WAV)

---

**Remember**: Windows debugging is now much more comprehensive with file logging, debug menus, and automatic audio setup. The days of blind debugging are over! 🎉 