const { ipcRenderer: firstRunIpcRenderer } = require('electron');

interface Model {
  id: string;
  name: string;
  description: string;
}

let currentStep = 0;
let setupMode: 'auto' | 'manual' = 'auto';
let selectedModel: string | null = null;

const steps = ['welcome', 'detection', 'microphone', 'tts', 'python', 'models', 'shortcuts', 'complete'];

const commonModels: Model[] = [
    {
        id: 'openai/gpt-4.1',
        name: 'GPT-4.1',
        description: 'Latest OpenAI model, excellent for all tasks'
    },
    {
        id: 'gemini/gemini-2.5-pro',
        name: 'Gemini 2.5 pro',
        description: 'Google\'s powerful model with large context'
    }
];

function updateProgress(): void {
    const progress = ((currentStep + 1) / steps.length) * 100;
    const progressElement = document.getElementById('progressFill') as HTMLElement;
    if (progressElement) {
        progressElement.style.width = `${progress}%`;
    }
}

function showStep(stepIndex: number): void {
    // Hide all steps
    document.querySelectorAll('.setup-step').forEach(step => {
        step.classList.remove('active');
    });
    
    // Show current step
    const stepId = steps[stepIndex];
    const stepElement = document.getElementById(`step-${stepId}`);
    if (stepElement) {
        stepElement.classList.add('active');
    }
    
    updateProgress();
}

function nextStep(): void {
    if (currentStep < steps.length - 1) {
        currentStep++;
        showStep(currentStep);
        
        // Handle step-specific logic
        const stepId = steps[currentStep];
        switch (stepId) {
            case 'detection':
                startDetection();
                break;
            case 'microphone':
                setupMicrophoneTest();
                break;
            case 'tts':
                setupTtsTest();
                break;
            case 'python':
                setupPython();
                break;
            case 'models':
                setupModels();
                break;
        }
    }
}

function startSetup(): void {
    // Check which setup mode was selected
    const autoOption = document.getElementById('option-auto');
    const manualOption = document.getElementById('option-manual');
    
    if (manualOption?.classList.contains('selected')) {
        setupMode = 'manual';
        // Skip to shortcuts for manual setup
        currentStep = steps.indexOf('shortcuts');
        showStep(currentStep);
        return;
    }
    
    setupMode = 'auto';
    nextStep(); // Go to detection
}

async function startDetection(): Promise<void> {
    // Magical preparation - just show the animation for a bit
    console.log('✨ Starting magical preparation...');
    
    // Let the magic happen for 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Optionally do some quick background checks without showing them
    try {
        // Silently check some basics without scaring the user
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
        await firstRunIpcRenderer.invoke('check-python-setup').catch(() => {});
        await firstRunIpcRenderer.invoke('load-env').catch(() => {});
    } catch (error) {
        // Ignore errors during silent preparation
        console.log('Background preparation completed with some items to configure later');
    }
    
    console.log('✨ Magic preparation complete!');
    
    // Auto-advance to microphone test
    nextStep();
}

async function setupPython(): Promise<void> {
    const statusContainer = document.getElementById('pythonStatus');
    const skipBtn = document.getElementById('skipPythonBtn') as HTMLButtonElement;
    
    try {
        // Check if Python is already configured
        const pythonStatus = await firstRunIpcRenderer.invoke('check-python-setup');
        if (pythonStatus && pythonStatus.isConfigured) {
            updatePythonStatus('✅', 'Python environment already configured');
            setTimeout(() => nextStep(), 1500);
            return;
        }
        
        // Start auto setup
        updatePythonStatus('🔄', 'Installing UV package manager...');
        
        // Listen for progress updates
        const progressHandler = (event: any, message: string) => {
            updatePythonStatus('🔄', message);
        };
        firstRunIpcRenderer.on('python-setup-progress', progressHandler);
        
        const result = await firstRunIpcRenderer.invoke('setup-python-auto');
        
        // Remove progress listener
        firstRunIpcRenderer.removeListener('python-setup-progress', progressHandler);
        
        if (result.success) {
            updatePythonStatus('✅', 'Python environment configured successfully');
            if (skipBtn) skipBtn.style.display = 'none';
            setTimeout(() => nextStep(), 2000);
        } else {
            updatePythonStatus('❌', `Setup failed: ${result.error || 'Unknown error'}`);
            if (skipBtn) {
                skipBtn.textContent = 'Continue Without Python';
                skipBtn.style.display = 'block';
            }
        }
        
    } catch (error) {
        console.error('Python setup error:', error);
        updatePythonStatus('❌', 'Python setup failed');
        if (skipBtn) {
            skipBtn.textContent = 'Continue Without Python';
            skipBtn.style.display = 'block';
        }
    }
}

function updatePythonStatus(icon: string, message: string): void {
    const statusContainer = document.getElementById('pythonStatus');
    const statusItem = statusContainer?.querySelector('.status-item');
    const iconElement = statusItem?.querySelector('.status-icon');
    const textElement = statusItem?.querySelector('div:last-child');
    
    if (iconElement) iconElement.innerHTML = icon;
    if (textElement) textElement.textContent = message;
}

function skipPython(): void {
    nextStep();
}

async function setupModels(): Promise<void> {
    const modelGrid = document.getElementById('modelGrid');
    const continueBtn = document.getElementById('continueModelsBtn') as HTMLButtonElement;
    
    // Load existing model configuration
    try {
        const envConfig = await firstRunIpcRenderer.invoke('load-env');
        if (envConfig && envConfig.llm) {
            selectedModel = envConfig.llm;
        }
    } catch (error) {
        console.error('Failed to load model config:', error);
    }
    
    // Populate model options
    if (modelGrid) {
        modelGrid.innerHTML = '';
        commonModels.forEach(model => {
            const modelCard = document.createElement('div');
            modelCard.className = 'model-card';
            if (selectedModel === model.id) {
                modelCard.classList.add('selected');
                if (continueBtn) continueBtn.disabled = false;
            }
            
            modelCard.innerHTML = `
                <div class="model-info">
                    <div class="model-name">${model.name}</div>
                    <div class="model-desc">${model.description}</div>
                </div>
            `;
            
            modelCard.addEventListener('click', () => {
                // Remove selection from other cards
                document.querySelectorAll('.model-card').forEach(card => {
                    card.classList.remove('selected');
                });
                
                // Select this card
                modelCard.classList.add('selected');
                selectedModel = model.id;
                if (continueBtn) continueBtn.disabled = false;
            });
            
            modelGrid.appendChild(modelCard);
        });
    }
    
    // If no model was pre-selected, enable continue button anyway
    if (!selectedModel && continueBtn) {
        continueBtn.disabled = false;
    }
}

async function finishSetup(): Promise<void> {
    try {
        // Save selected model if any
        if (selectedModel) {
            const envConfig = await firstRunIpcRenderer.invoke('load-env');
            const updatedConfig = {
                env: envConfig?.env || {},
                llm: selectedModel,
                llms: envConfig?.llms || commonModels.map(m => m.id)
            };
            
            await firstRunIpcRenderer.invoke('save-env', updatedConfig);
        }
        
        // Mark first run as complete
        await firstRunIpcRenderer.invoke('mark-first-run-complete');
        
        // Close setup window
        firstRunIpcRenderer.send('close-first-run-setup');
        
    } catch (error) {
        console.error('Failed to save setup:', error);
        // Still close the window
        firstRunIpcRenderer.send('close-first-run-setup');
    }
}

// Setup option selection
function setupOptionHandlers(): void {
    const autoOption = document.getElementById('option-auto');
    const manualOption = document.getElementById('option-manual');
    
    autoOption?.addEventListener('click', () => {
        document.querySelectorAll('.metakey-option-card').forEach(card => card.classList.remove('selected'));
        autoOption.classList.add('selected');
    });

    manualOption?.addEventListener('click', () => {
        document.querySelectorAll('.metakey-option-card').forEach(card => card.classList.remove('selected'));
        manualOption.classList.add('selected');
    });
}

// -------------------- TTS TEST --------------------
function setupTtsTest(): void {
    const playBtn = document.getElementById('ttsPlayBtn') as HTMLButtonElement;
    const status = document.getElementById('ttsStatus');
    const continueBtn = document.getElementById('ttsContinueBtn') as HTMLButtonElement;

    if (playBtn?.dataset.initialized) return; // Prevent multiple bindings
    if (playBtn) playBtn.dataset.initialized = 'true';

    const sampleText = 'MetaKeyAI is a magical way to cast spells on your clipboard! This setup will help you configure everything quickly.';

    playBtn?.addEventListener('click', async () => {
        if (status) status.textContent = 'Generating audio...';
        playBtn.disabled = true;
        playBtn.textContent = '🔄 Testing...';
        
        try {
            // Test TTS using the new robust testing handler
            const result = await firstRunIpcRenderer.invoke('test-first-run-tts', { 
                voice: 'nova', 
                text: sampleText 
            });
            
            if (result.success) {
                if (status) status.textContent = '✅ Playing sample audio – did you hear it clearly?';
                if (continueBtn) continueBtn.disabled = false;
                playBtn.textContent = '🔊 Test Again';
            } else {
                if (status) status.textContent = `❌ TTS test failed: ${result.error || 'Unknown error'}`;
                playBtn.textContent = '🔊 Try Again';
                
                // If it's an API key issue, suggest going back to configure it
                if (result.error && result.error.includes('API key') && status) {
                    status.innerHTML = `❌ TTS test failed: ${result.error}<br><small>💡 You may need to configure your OpenAI API key first</small>`;
                }
            }
        } catch (error: any) {
            console.error('TTS test error:', error);
            if (status) status.textContent = `❌ TTS test failed: ${error.message}`;
            playBtn.textContent = '🔊 Try Again';
        }
        
        // Reset button after a delay
        setTimeout(() => {
            playBtn.disabled = false;
            if (playBtn.textContent.includes('Testing')) {
                playBtn.textContent = '🔊 Play Sample Audio';
            }
        }, 3000);
    });

    continueBtn?.addEventListener('click', () => {
        nextStep();
    });
}

// -------------------- API KEY TESTING --------------------
function setupApiKeyTest(): void {
    // This function can be called from various steps to test API connectivity
    (window as any).testApiKey = async function(apiKey: string) {
        try {
            const result = await firstRunIpcRenderer.invoke('test-first-run-api-key', apiKey);
            return result;
        } catch (error: any) {
            return { success: false, valid: false, error: error.message };
        }
    };
}

// -------------------- ENHANCED MICROPHONE TEST --------------------
function setupMicrophoneTest(): void {
    const micReadyBtn = document.getElementById('micReadyBtn') as HTMLButtonElement;
    const micRecordBtn = document.getElementById('micRecordBtn') as HTMLButtonElement;
    const micPlayBtn = document.getElementById('micPlayBtn') as HTMLButtonElement;
    const micWorksBtn = document.getElementById('micWorksBtn') as HTMLButtonElement;
    const micTryAgainBtn = document.getElementById('micTryAgainBtn') as HTMLButtonElement;
    const deviceAdvancedBtn = document.getElementById('deviceAdvancedBtn') as HTMLButtonElement;
    const micTestAgainBtn = document.getElementById('micTestAgainBtn') as HTMLButtonElement;
    const deviceSelect = document.getElementById('micDeviceSelect') as HTMLSelectElement;
    const refreshBtn = document.getElementById('micRefreshBtn') as HTMLButtonElement;
    
    const micReadySection = document.getElementById('micReadySection') as HTMLElement;
    const micTestSection = document.getElementById('micTestSection') as HTMLElement;
    const micPlaybackSection = document.getElementById('micPlaybackSection') as HTMLElement;
    const micAdvancedSection = document.getElementById('micAdvancedSection') as HTMLElement;
    
    const status = document.getElementById('micStatus') as HTMLElement;
    const advancedStatus = document.getElementById('advancedMicStatus') as HTMLElement;
    const waveCanvas = document.getElementById('micWave') as HTMLCanvasElement;
    const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;

    if (micReadyBtn.dataset.initialized) return; // Prevent multiple bindings
    micReadyBtn.dataset.initialized = 'true';

    let currentRecordingPath: string | null = null;
    let isRecording = false;
    let waveAnimation: number | null = null;
    let audioContext: AudioContext | null = null;
    let analyser: AnalyserNode | null = null;
    let mediaStream: MediaStream | null = null;
    let recordingTimer: NodeJS.Timeout | null = null;
    let mediaRecorder: MediaRecorder | null = null;
    let chunks: Blob[] = [];

    // Details toggle functionality
    const detailsBtn = document.getElementById('detailsBtn') as HTMLButtonElement;
    const detailsSection = document.getElementById('detailsSection') as HTMLElement;
    
    if (detailsBtn && detailsSection) {
        detailsBtn.addEventListener('click', () => {
            const isVisible = detailsSection.style.display !== 'none';
            if (isVisible) {
                detailsSection.style.display = 'none';
                detailsBtn.textContent = 'What does this do? 🤔';
            } else {
                detailsSection.style.display = 'block';
                detailsBtn.textContent = 'Got it! 👍';
            }
        });
    }

    // Step 1: User clicks "I'm ready" - magical focus transition
    micReadyBtn.addEventListener('click', () => {
        const stepDescription = micReadySection.querySelector('.step-description') as HTMLElement;
        const detailsToggle = micReadySection.querySelector('.details-toggle') as HTMLElement;
        const detailsSection = micReadySection.querySelector('.details-section') as HTMLElement;
        
        if (stepDescription) {
            stepDescription.style.animation = 'magicalVanish 0.6s ease-out forwards';
        }
        if (detailsToggle) {
            detailsToggle.style.animation = 'magicalVanish 0.6s ease-out forwards';
        }
        if (detailsSection && detailsSection.style.display !== 'none') {
            detailsSection.style.animation = 'magicalVanish 0.6s ease-out forwards';
        }
        
        const stepTitle = document.querySelector('#step-microphone .step-title') as HTMLElement;
        if (stepTitle) {
            setTimeout(() => {
                stepTitle.textContent = '🎤 Let\'s Test Your Voice!';
                stepTitle.style.animation = 'magicalAppear 0.6s ease-out';
                setTimeout(() => {
                    stepTitle.style.animation = '';
                }, 600);
            }, 300);
        }
        
        setTimeout(() => {
            micReadySection.style.display = 'none';
            micTestSection.style.display = 'block';
            micTestSection.style.animation = 'magicalAppear 0.8s ease-out';
            
            setTimeout(() => {
                micTestSection.style.animation = '';
            }, 800);
            
            setupWaveform();
        }, 600);
    });

    micRecordBtn.addEventListener('click', async () => {
        if (isRecording) {
            await stopRecording();
            return;
        }

        try {
            status.textContent = 'Starting recording...';
            micRecordBtn.disabled = true;
            console.log('🎤 User clicked record button - attempting to start recording');

            const result = await firstRunIpcRenderer.invoke('start-first-run-recording');
            console.log('🎤 Recording start result:', result);
            
            if (result.success) {
                isRecording = true;
                micRecordBtn.textContent = '⏹️ Stop Recording';
                micRecordBtn.disabled = false;
                status.textContent = 'Recording... Click Stop when finished.';
                
            } else {
                throw new Error(result.error || 'Failed to start recording');
            }

        } catch (error: any) {
            console.error('❌ Recording failed:', error);
            status.textContent = `Microphone access failed: ${error.message}. Please check permissions and try again.`;
            micRecordBtn.disabled = false;
            micRecordBtn.textContent = '🔴 Start Recording';
            isRecording = false;
        }
    });

    // Listen for the main process to trigger the web recording
    firstRunIpcRenderer.on('start-web-audio', async (event: any, payload: any) => {
        const eventPrefix = typeof payload === 'string' ? payload : payload.prefix || payload.eventPrefix || 'first-run';
        try {
            console.log(`🎤 Received start-web-audio (${eventPrefix}) command from main`);
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(mediaStream);
            chunks = [];
            mediaRecorder.ondataavailable = e => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: mediaRecorder.mimeType });
                blob.arrayBuffer().then(buffer => {
                    // Send the completed data back to the main process
                    console.log(`🎤 Sending ${eventPrefix}-audio-finished (size ${blob.size})`);
                    firstRunIpcRenderer.send(`${eventPrefix}-audio-finished`, { buffer, mimeType: mediaRecorder.mimeType });
                });
                if (mediaStream) {
                    mediaStream.getTracks().forEach(t => t.stop());
                }
            };
            mediaRecorder.start();
            // Confirm to main process that we have started
            console.log(`🎤 Sending ${eventPrefix}-audio-started`);
            firstRunIpcRenderer.send(`${eventPrefix}-audio-started`);
        } catch (error) {
            console.log(`🎤 Sending ${eventPrefix}-audio-error: ${(error as Error).message}`);
            firstRunIpcRenderer.send(`${eventPrefix}-audio-error`, { error: (error as Error).message });
        }
    });

    // Listen for the main process to trigger the stop command
    firstRunIpcRenderer.on('stop-web-audio', (event: any, payload: any) => {
        const eventPrefix = typeof payload === 'string' ? payload : payload.prefix || payload.eventPrefix || 'first-run';
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
        }
    });

    async function stopRecording() {
        if (!isRecording) return;
        
        status.textContent = 'Stopping recording...';
        console.log('🛑 Attempting to stop recording');
        
        // This will now resolve when the audio manager gets the finished event
        const result = await firstRunIpcRenderer.invoke('stop-first-run-recording');
        console.log('🛑 Stop recording result:', result);
        
        if (result.success) {
            isRecording = false;
            currentRecordingPath = result.filePath;
            micRecordBtn.textContent = '🔴 Start Recording';
            micRecordBtn.disabled = false;
            
            micTestSection.style.display = 'none';
            micPlaybackSection.style.display = 'block';
        } else {
            status.textContent = `Error: ${result.error}`;
        }
    }

    micPlayBtn.addEventListener('click', async () => {
        if (!currentRecordingPath) return;

        try {
            micPlayBtn.disabled = true;
            micPlayBtn.textContent = '🔊 Playing...';
            
            console.log('🔊 Playing audio via IPC (cross-platform safe):', currentRecordingPath);
            
            const result = await firstRunIpcRenderer.invoke('play-first-run-recording', currentRecordingPath);
            
            if (result.success) {
                console.log('✅ Audio playback started successfully');
                setTimeout(() => {
                    micPlayBtn.disabled = false;
                    micPlayBtn.textContent = '🔊 Play Recording';
                }, 5000); 
            } else {
                console.error('❌ Audio playback failed:', result.error);
                
                let errorMsg = result.error || 'Failed to play recording';
                if (errorMsg.includes('WebM') || errorMsg.includes('format')) {
                    errorMsg = 'Recording playback not supported. The recording was saved successfully though!';
                }
                
                micPlayBtn.textContent = '⚠️ Playback Error';
                setTimeout(() => {
                    micPlayBtn.disabled = false;
                    micPlayBtn.textContent = '🔊 Try Again';
                }, 2000);
                
                console.log('ℹ️ Playback failed but recording was successful, user can continue');
            }
            
        } catch (error) {
            console.error('❌ Playback request failed:', error);
            
            micPlayBtn.textContent = '⚠️ Playback Error';
            setTimeout(() => {
                micPlayBtn.disabled = false;
                micPlayBtn.textContent = '🔊 Try Again';
            }, 2000);
        }
    });

    micWorksBtn.addEventListener('click', () => {
        firstRunIpcRenderer.send('set-microphone-device', 'auto');
        nextStep();
    });

    micTryAgainBtn.addEventListener('click', () => {
        resetToTestSection();
    });

    deviceAdvancedBtn.addEventListener('click', () => {
        micAdvancedSection.style.display = 'block';
        populateDevices();
    });

    micTestAgainBtn.addEventListener('click', async () => {
        const deviceId = deviceSelect.value;
        resetToTestSection();
        
        if (deviceId && deviceId !== 'auto') {
            firstRunIpcRenderer.send('set-microphone-device', deviceId);
        }
    });

    function resetToTestSection() {
        if (recordingTimer) {
            clearTimeout(recordingTimer);
            recordingTimer = null;
        }
        isRecording = false;
        
        micPlaybackSection.style.animation = '';
        micAdvancedSection.style.animation = '';
        micTestSection.style.animation = '';
        
        micPlaybackSection.style.display = 'none';
        micAdvancedSection.style.display = 'none';
        micTestSection.style.display = 'block';
        
        micRecordBtn.disabled = false;
        micRecordBtn.textContent = '🔴 Start Recording';
        status.textContent = '';
        if (waveCanvas) waveCanvas.style.display = 'none';
        currentRecordingPath = null;
        setupWaveform();
    }

    function setupWaveform() {
        if (waveCanvas && waveCtx) {
            const rect = waveCanvas.getBoundingClientRect();
            waveCanvas.width = rect.width;
            waveCanvas.height = rect.height;
        }
    }

    function setupAudioVisualization(stream: MediaStream) {
        try {
            audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            const draw = () => {
                if (!isRecording) return;
                
                waveCtx!.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
                analyser!.getByteTimeDomainData(dataArray);
                waveCtx!.lineWidth = 3;
                waveCtx!.strokeStyle = '#4facfe';
                waveCtx!.beginPath();
                
                const slice = waveCanvas.width / dataArray.length;
                for (let i = 0; i < dataArray.length; i++) {
                    const v = (dataArray[i] - 128) / 128;
                    const y = waveCanvas.height / 2 + v * (waveCanvas.height / 2 * 0.8);
                    if (i === 0) waveCtx!.moveTo(0, y);
                    else waveCtx!.lineTo(i * slice, y);
                }
                waveCtx!.stroke();
                
                waveAnimation = requestAnimationFrame(draw);
            };
            
            draw();
        } catch (error) {
            console.error('Failed to setup audio visualization:', error);
        }
    }

    function cleanupAudio() {
        if (waveAnimation) {
            cancelAnimationFrame(waveAnimation);
            waveAnimation = null;
        }
        if (mediaStream) {
            mediaStream.getTracks().forEach(track => track.stop());
            mediaStream = null;
        }
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        if (waveCanvas) {
            waveCanvas.style.display = 'none';
        }
    }

    async function populateDevices() {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
            
            const [webDevices, audioManagerDevices] = await Promise.all([
                navigator.mediaDevices.enumerateDevices(),
                firstRunIpcRenderer.invoke('discover-audio-devices').catch((): any[] => [])
            ]);
            
            const audioInputs = webDevices.filter(d => d.kind === 'audioinput');
            
            deviceSelect.innerHTML = '';
            
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = '🤖 Auto-detect (Recommended)';
            deviceSelect.appendChild(autoOpt);
            
            const defaultOpt = document.createElement('option');
            defaultOpt.value = 'default';
            defaultOpt.textContent = '🔧 System Default';
            deviceSelect.appendChild(defaultOpt);
            
            audioInputs.forEach(dev => {
                const o = document.createElement('option');
                o.value = dev.deviceId;
                o.textContent = dev.label || `Microphone ${audioInputs.indexOf(dev) + 1}`;
                deviceSelect.appendChild(o);
            });
            
            try {
                const currentDevice = await firstRunIpcRenderer.invoke('get-settings').then((settings: any) => settings.MICROPHONE_DEVICE).catch(() => 'auto');
                if (currentDevice && deviceSelect.querySelector(`option[value="${currentDevice}"]`)) {
                    deviceSelect.value = currentDevice;
                }
            } catch (error) {
                console.log('Could not load current device setting:', error);
            }
            
            advancedStatus.textContent = `Found ${audioInputs.length} audio device(s)`;
            
            deviceSelect.addEventListener('change', () => {
                const selectedDevice = deviceSelect.value;
                console.log('🎤 Device selection changed to:', selectedDevice);
                firstRunIpcRenderer.send('set-microphone-device', selectedDevice);
                advancedStatus.textContent = `Selected: ${deviceSelect.options[deviceSelect.selectedIndex].text}`;
            });
            
        } catch (err) {
            console.error('Device enumeration failed', err);
            advancedStatus.textContent = 'Failed to discover audio devices';
            
            deviceSelect.innerHTML = '';
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = '🤖 Auto-detect';
            deviceSelect.appendChild(autoOpt);
        }
    }

    refreshBtn.addEventListener('click', populateDevices);
}

function setupShortcutsTest(): void {
    const nextBtn = document.getElementById('shortcutsNextBtn') as HTMLButtonElement;
    
    nextBtn?.addEventListener('click', () => {
        nextStep();
    });
}

// Window controls
function minimizeWindow(): void {
    firstRunIpcRenderer.send('minimize-first-run-setup');
}

function closeWindow(): void {
    firstRunIpcRenderer.send('close-first-run-setup');
}

// Main initialization
document.addEventListener('DOMContentLoaded', () => {
    console.log('🎬 First-run setup script loaded');
    
    // Initialize window controls
    const closeBtn = document.getElementById('closeBtn');
    const minimizeBtn = document.getElementById('minimizeBtn');
    const startSetupBtn = document.getElementById('startSetupBtn') as HTMLButtonElement;
    const finishSetupBtn = document.getElementById('finishSetupBtn') as HTMLButtonElement;
    const skipPythonBtn = document.getElementById('skipPythonBtn') as HTMLButtonElement;
    const continueModelsBtn = document.getElementById('continueModelsBtn') as HTMLButtonElement;
    const ttsContinueBtn = document.getElementById('ttsContinueBtn') as HTMLButtonElement;
    
    console.log('📋 DOM loaded, setting up window control listeners');
    
    if (closeBtn) {
        console.log('✅ Close button found, adding listener');
        closeBtn.addEventListener('click', closeWindow);
    } else {
        console.warn('❌ Close button not found');
    }
    
    if (minimizeBtn) {
        console.log('✅ Minimize button found, adding listener');
        minimizeBtn.addEventListener('click', minimizeWindow);
    } else {
        console.warn('❌ Minimize button not found');
    }
    
    // Initialize step handlers
    setupOptionHandlers();
    setupApiKeyTest();
    setupShortcutsTest();
    
    // Setup main action buttons
    startSetupBtn?.addEventListener('click', startSetup);
    finishSetupBtn?.addEventListener('click', finishSetup);
    skipPythonBtn?.addEventListener('click', skipPython);
    continueModelsBtn?.addEventListener('click', () => nextStep());
    ttsContinueBtn?.addEventListener('click', () => nextStep());
    
    console.log('✅ First-run setup initialized');
}); 