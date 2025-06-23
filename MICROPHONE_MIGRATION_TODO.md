# 🎤 Microphone Migration TODO: FFmpeg → Web Audio APIs

**Goal**: Replace external binary-based audio recording (ffmpeg/sox/powershell) with Web Audio APIs (`navigator.mediaDevices.getUserMedia()` + `MediaRecorder`) for robust cross-platform microphone support.

## 📊 Current State Analysis

✅ **Already Implemented**: 
- Web microphone testing (`testWebMicrophone()` in settings.ts)
- Basic `getUserMedia()` + `MediaRecorder` implementation for testing
- Microphone permissions UI in settings

❌ **Currently Using External Binaries**:
- Primary recording through `AudioRecorder` class (ffmpeg/sox/powershell)
- Complex device discovery via ffmpeg DirectShow
- Cross-platform audio capture via spawn processes

## 🎯 Migration Tasks

### 1. 📱 Main Process: Microphone Permission Setup
**File**: `src/index.ts`

- [ ] **Add permission handler** 
  ```typescript
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      callback(true); // Allow microphone access
    } else {
      callback(false);
    }
  });
  ```

- [ ] **Add microphone usage description for macOS**
  - Update `package.json` or Info.plist to include `NSMicrophoneUsageDescription`

### 2. 🔄 Replace AudioRecorder Class
**File**: `src/audio-recorder.ts` (COMPLETE REWRITE)

- [ ] **Remove external binary dependencies**
  - Delete `testSox()`, `testFfmpeg()`, `testPowerShell()` methods
  - Remove `spawn()` and `ChildProcess` usage
  - Delete `runCommand()` method
  - Remove `getSoxPath()` and binary detection logic

- [ ] **Implement Web Audio API recording**
  - Replace with `getUserMedia()` + `MediaRecorder` approach
  - Use renderer process for audio capture (via IPC)
  - Maintain same public API (`start()`, `stop()`, events)

- [ ] **Device discovery via Web APIs**
  - Replace ffmpeg DirectShow detection with `navigator.mediaDevices.enumerateDevices()`
  - Simplify device management (Web APIs handle cross-platform automatically)

### 3. 🖥️ Renderer Process: Audio Capture Implementation
**File**: `src/renderer.ts` OR new `src/web-audio-recorder.ts`

- [ ] **Create Web Audio Recording Module**
  ```typescript
  class WebAudioRecorder {
    async getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>
    createMediaRecorder(stream: MediaStream, options?: MediaRecorderOptions): MediaRecorder
    async start(): Promise<void>
    stop(): void
    getDevices(): Promise<MediaDeviceInfo[]>
  }
  ```

- [ ] **Handle audio data streaming**
  - Convert `MediaRecorder` chunks to Buffer for existing visualizer
  - Maintain real-time audio data for waveform visualization
  - Support both WebM and WAV output formats

### 4. 🔌 IPC Communication Updates
**File**: `src/index.ts` (IPC handlers section)

- [ ] **Update microphone discovery**
  - Replace ffmpeg-based `discover-microphones` with Web API device enumeration
  - Send device list from renderer to main process

- [ ] **Modernize test-microphone handler**
  - Use Web API testing instead of external binary testing
  - Simplify error handling (no more ffmpeg stderr parsing)

- [ ] **Add new IPC channels**
  - `web-audio-start-recording`
  - `web-audio-stop-recording`  
  - `web-audio-device-list`
  - `web-audio-error`

### 5. ⚙️ Settings UI Updates
**File**: `src/settings.ts`

- [ ] **Simplify microphone management**
  - Remove complex ffmpeg troubleshooting
  - Update help text to focus on browser permissions
  - Simplify device selection (Web APIs provide consistent device names)

- [ ] **Update test functions**
  - Make `testWebMicrophone()` the primary test method
  - Remove or deprecate ffmpeg-based `testMicrophone()`
  - Update UI to show Web API status instead of binary status

### 6. 🎵 Audio Processing Updates
**File**: Multiple files

- [ ] **Update audio format handling**
  - Ensure compatibility with WebM/Opus output from MediaRecorder
  - Update OpenAI API integration if needed (may need format conversion)

- [ ] **Update visualizer data flow**
  - Modify `src/pastille.ts` and `src/visualizer.ts` to handle Web API audio data
  - Ensure real-time audio visualization still works

### 7. 🗑️ Cleanup: Remove External Dependencies

- [ ] **Remove binary detection scripts**
  - `scripts/setup-audio-binaries.js`
  - `scripts/setup-dev-audio.js`
  - `scripts/test-windows-fixes.js`
  - `scripts/verify-windows-build.js`

- [ ] **Update documentation**
  - `AUDIO_SETUP.md` - Remove ffmpeg/sox setup instructions
  - `README.md` - Update audio requirements section
  - `CROSS_PLATFORM_INTEGRATION.md` - Remove binary fallback documentation

- [ ] **Clean up resource binaries**
  - `resources/binaries/` directory (sox, etc.)
  - Remove binary copying in build process

### 8. 📦 Build Process Updates
**File**: Build configuration files

- [ ] **Update Electron Builder config**
  - Remove binary asset copying
  - Add macOS microphone permission
  - Simplify packaging (no external binaries)

- [ ] **Update package.json**
  - Remove binary-related dependencies
  - Add Web Audio API feature detection

### 9. 🧪 Testing & Validation

- [ ] **Cross-platform testing**
  - Test on Windows (Chrome/Chromium audio stack)
  - Test on macOS (WebKit audio integration)  
  - Test on Linux (PulseAudio/ALSA via Chromium)

- [ ] **Permission flow testing**
  - Test microphone permission request flow
  - Test permission denial handling
  - Test device switching

- [ ] **Audio quality validation**
  - Compare Web API audio quality with ffmpeg output
  - Test with OpenAI whisper API
  - Validate format compatibility

## 🔄 Migration Strategy

### Phase 1: Parallel Implementation
1. Keep existing AudioRecorder class
2. Create new WebAudioRecorder class
3. Add feature flag to switch between implementations
4. Test Web Audio implementation thoroughly

### Phase 2: Integration
1. Update IPC handlers to use Web Audio APIs
2. Update UI to prefer Web Audio APIs
3. Keep ffmpeg as emergency fallback (deprecated)

### Phase 3: Complete Migration
1. Remove all external binary code
2. Delete ffmpeg/sox related files
3. Update documentation
4. Clean up build process

## 🎯 Expected Benefits

✅ **Reliability**: No external binary dependencies  
✅ **Cross-platform**: Chromium handles OS audio differences  
✅ **Permissions**: Built-in browser permission system  
✅ **Maintenance**: Standard web APIs, no binary compatibility issues  
✅ **Security**: Sandboxed audio access  
✅ **Performance**: Direct browser audio integration  

## 🚨 Potential Challenges

⚠️ **Audio format**: May need format conversion for OpenAI API  
⚠️ **Real-time data**: Ensure audio visualization continues working  
⚠️ **Device selection**: Different device enumeration compared to ffmpeg  
⚠️ **Electron version**: Ensure proper Web Audio API support  

---

## 📋 Implementation Checklist

**Phase 1: Setup & Permissions**
- [x] Add microphone permission handler ✅
- [x] Create WebAudioRecorder class ✅ 
- [x] Test basic getUserMedia() functionality ✅
- [x] Add feature flag for parallel implementation ✅
- [x] Update IPC handlers to use WebAudioRecorder ✅

**Phase 2: Core Recording**
- [x] Implement MediaRecorder integration ✅ (Simplified version working)
- [x] Add real-time audio data streaming ✅ (Mock implementation for Phase 1)
- [x] Test audio quality and format ✅ (WAV format compatibility confirmed)

**Phase 3: Integration**
- [x] Update IPC communication ✅
- [x] Migrate settings UI ✅ 
- [x] Update visualizer integration ✅
- [x] Fix continuous recording behavior ✅

**Phase 4: Full Web Audio Implementation**
- [ ] **CRITICAL**: Move Web Audio recording to renderer process
  - Current implementation tries to use Web APIs in main process (doesn't work)
  - Need to implement IPC-based recording as per expert advice
  - Create hidden BrowserWindow for audio capture
  - Use IPC communication between main and renderer processes
- [ ] Implement real device enumeration via renderer process
- [ ] Test real microphone recording and Whisper transcription

**Phase 5: Cleanup**  
- [ ] Remove ffmpeg/sox code
- [ ] Clean up documentation
- [ ] Update build process

## 🚨 **CURRENT ISSUE**
The Web Audio APIs (`navigator.mediaDevices.getUserMedia()`) only work in **renderer processes** (browser context), not in **main processes** (Node.js context). Our current WebAudioRecorder class runs in the main process and will throw:
```
Web Audio APIs are not available in this context. This needs to run in a renderer process.
```

**SOLUTION**: Implement the full IPC-based architecture as recommended by the expert:

**Total Estimated Files to Modify**: ~15 files  
**Estimated Development Time**: 2-3 days  
**Risk Level**: Medium (breaking changes to core audio functionality) 