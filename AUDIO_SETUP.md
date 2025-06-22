# Audio Recording Setup Guide

MetaKeyAI uses audio recording for voice input functionality. This guide explains how to set up audio recording dependencies across different platforms.

## Quick Setup

Run the automated setup script:

```bash
npm run setup-audio
```

This script will automatically detect your platform and install the necessary audio dependencies.

## Audio Recording Methods

MetaKeyAI supports multiple audio recording methods with automatic fallback:

1. **SoX (Recommended)** - Cross-platform audio processing toolkit
2. **FFmpeg** - Universal multimedia framework
3. **PowerShell Speech** - Windows-specific fallback
4. **Native APIs** - Platform-specific implementations (future)

## Platform-Specific Setup

### Linux

#### Automatic Setup
```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get install -y sox libsox-fmt-all

# RHEL/CentOS/Rocky
sudo yum install -y sox

# Fedora
sudo dnf install -y sox

# Arch Linux
sudo pacman -S sox
```

#### Manual Verification
```bash
sox --version
```

### macOS

#### Automatic Setup
```bash
# Install via Homebrew (recommended)
brew install sox
```

#### Manual Verification
```bash
sox --version
which sox
```

### Windows

#### Method 1: Winget (Recommended)
```powershell
winget install --id shanebutler.SoX
```

#### Method 2: Chocolatey
```powershell
choco install sox.portable
```

#### Method 3: Direct Download
1. Download from [SoX SourceForge](https://sourceforge.net/projects/sox/)
2. Extract the archive
3. Copy `sox.exe` to `resources/binaries/windows/sox.exe`

#### Manual Verification
```powershell
sox --version
```

## Alternative: FFmpeg Setup

If SoX is not available, FFmpeg can be used as a fallback:

### Linux
```bash
# Ubuntu/Debian
sudo apt-get install ffmpeg

# RHEL/CentOS
sudo yum install ffmpeg

# Fedora
sudo dnf install ffmpeg
```

### macOS
```bash
brew install ffmpeg
```

### Windows
```powershell
# Via Chocolatey
choco install ffmpeg

# Via Winget
winget install Gyan.FFmpeg
```

## Troubleshooting

### Common Issues

#### 1. "Sox binary not found" Error
- **Cause**: SoX is not installed or not in the expected location
- **Solution**: Run `npm run setup-audio` or install SoX manually

#### 2. "No audio recording method available" Error
- **Cause**: None of the supported audio tools are available
- **Solutions**:
  - Install SoX (recommended)
  - Install FFmpeg as fallback
  - On Windows, ensure PowerShell is available

#### 3. Permission Denied Errors (Linux/macOS)
```bash
# Fix permissions for sox binary
chmod +x resources/binaries/linux/sox  # or macos/sox
```

#### 4. CI/CD Build Failures
- Check the GitHub Actions logs for specific platform errors
- Verify the build script is finding audio dependencies
- Review platform-specific installation paths

### Development Environment Setup

For local development, ensure audio dependencies are available:

1. **Run the setup script**:
   ```bash
   npm run setup-audio
   ```

2. **Verify the setup**:
   ```bash
   # Check if binary exists
   ls -la resources/binaries/
   
   # Test the binary (Linux/macOS)
   ./resources/binaries/linux/sox --version
   ./resources/binaries/macos/sox --version
   
   # Test the binary (Windows)
   resources\binaries\windows\sox.exe --version
   ```

3. **Check application logs**:
   Look for audio initialization messages in the console:
   ```
   🎙️ Audio recording initialized with sox
   🎙️ Audio recording initialized with ffmpeg
   🎙️ Audio recording initialized with PowerShell
   ⚠️ No suitable audio recording method found
   ```

### CI/CD Environment

The build process automatically handles audio dependencies:

- **Linux**: Installs SoX via apt-get
- **macOS**: Installs SoX via Homebrew
- **Windows**: Uses multiple fallback methods (winget, chocolatey, direct download)

If builds fail, check the "Set up sox" step in GitHub Actions for platform-specific errors.

### Advanced Configuration

#### Custom SoX Binary Location

If you have SoX installed in a non-standard location, you can create a symlink:

```bash
# Linux/macOS
ln -s /custom/path/to/sox resources/binaries/linux/sox

# Windows (as Administrator)
mklink resources\binaries\windows\sox.exe C:\custom\path\sox.exe
```

#### Debugging Audio Issues

Enable verbose logging by setting environment variables:

```bash
# Enable debug logging
export DEBUG=audio-recorder
npm start
```

#### Testing Audio Recording

Use the built-in recording test:

```javascript
// In the Electron main process
const { AudioRecorder } = require('./src/audio-recorder');
const recorder = new AudioRecorder();

console.log('Recording method:', recorder.getRecordingMethod());
console.log('Recording available:', recorder.isRecordingAvailable());
```

## Contributing

If you encounter audio setup issues:

1. Check the [GitHub Issues](https://github.com/your-repo/metakeyai/issues) for existing reports
2. Include your platform details and error messages
3. Attach relevant logs from the setup process
4. Test the manual installation steps before reporting

## Platform Support Matrix

| Platform | SoX | FFmpeg | PowerShell | Native |
|----------|-----|--------|------------|---------|
| Linux    | ✅  | ✅     | ❌         | 🚧      |
| macOS    | ✅  | ✅     | ❌         | 🚧      |
| Windows  | ✅  | ✅     | ✅         | 🚧      |

- ✅ Supported
- ❌ Not supported
- 🚧 Planned for future release

## License

Audio dependencies (SoX, FFmpeg) have their own licenses. Please review their respective licensing terms:

- [SoX License](https://sourceforge.net/projects/sox/)
- [FFmpeg License](https://ffmpeg.org/legal.html) 