const { ipcRenderer } = require('electron');

let currentStep = 0;
let setupMode = 'auto'; // 'auto' or 'manual'
let selectedModel = null;

const steps = ['welcome', 'detection', 'microphone', 'tts', 'python', 'models', 'shortcuts', 'complete'];

const commonModels = [
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

function updateProgress() {
    const progress = ((currentStep + 1) / steps.length) * 100;
    document.getElementById('progressFill').style.width = `${progress}%`;
}

function showStep(stepIndex) {
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

function nextStep() {
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

function startSetup() {
    // Check which setup mode was selected
    const autoOption = document.getElementById('option-auto');
    const manualOption = document.getElementById('option-manual');
    
    if (manualOption.classList.contains('selected')) {
        setupMode = 'manual';
        // Skip to shortcuts for manual setup
        currentStep = steps.indexOf('shortcuts');
        showStep(currentStep);
        return;
    }
    
    setupMode = 'auto';
    nextStep(); // Go to detection
}

async function startDetection() {
    // Magical preparation - just show the animation for a bit
    console.log('✨ Starting magical preparation...');
    
    // Let the magic happen for 3 seconds
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Optionally do some quick background checks without showing them
    try {
        // Silently check some basics without scaring the user
        await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
        await ipcRenderer.invoke('check-python-setup').catch(() => {});
        await ipcRenderer.invoke('load-env').catch(() => {});
    } catch (error) {
        // Ignore errors during silent preparation
        console.log('Background preparation completed with some items to configure later');
    }
    
    console.log('✨ Magic preparation complete!');
    
    // Auto-advance to microphone test
    nextStep();
}

async function setupPython() {
    const statusContainer = document.getElementById('pythonStatus');
    const skipBtn = document.getElementById('skipPythonBtn');
    
    try {
        // Check if Python is already configured
        const pythonStatus = await ipcRenderer.invoke('check-python-setup');
        if (pythonStatus && pythonStatus.isConfigured) {
            updatePythonStatus('✅', 'Python environment already configured');
            setTimeout(() => nextStep(), 1500);
            return;
        }
        
        // Start auto setup
        updatePythonStatus('🔄', 'Installing UV package manager...');
        
        // Listen for progress updates
        const progressHandler = (event, message) => {
            updatePythonStatus('🔄', message);
        };
        ipcRenderer.on('python-setup-progress', progressHandler);
        
        const result = await ipcRenderer.invoke('setup-python-auto');
        
        // Remove progress listener
        ipcRenderer.removeListener('python-setup-progress', progressHandler);
        
        if (result.success) {
            updatePythonStatus('✅', 'Python environment configured successfully');
            skipBtn.style.display = 'none';
            setTimeout(() => nextStep(), 2000);
        } else {
            updatePythonStatus('❌', `Setup failed: ${result.error || 'Unknown error'}`);
            skipBtn.textContent = 'Continue Without Python';
            skipBtn.style.display = 'block';
        }
        
    } catch (error) {
        console.error('Python setup error:', error);
        updatePythonStatus('❌', 'Python setup failed');
        skipBtn.textContent = 'Continue Without Python';
        skipBtn.style.display = 'block';
    }
}

function updatePythonStatus(icon, message) {
    const statusContainer = document.getElementById('pythonStatus');
    const statusItem = statusContainer.querySelector('.status-item');
    const iconElement = statusItem.querySelector('.status-icon');
    const textElement = statusItem.querySelector('div:last-child');
    
    iconElement.innerHTML = icon;
    textElement.textContent = message;
}

function skipPython() {
    nextStep();
}

async function setupModels() {
    const modelGrid = document.getElementById('modelGrid');
    const continueBtn = document.getElementById('continueModelsBtn');
    
    // Load existing model configuration
    try {
        const envConfig = await ipcRenderer.invoke('load-env');
        if (envConfig && envConfig.llm) {
            selectedModel = envConfig.llm;
        }
    } catch (error) {
        console.error('Failed to load model config:', error);
    }
    
    // Populate model options
    modelGrid.innerHTML = '';
    commonModels.forEach(model => {
        const modelCard = document.createElement('div');
        modelCard.className = 'model-card';
        if (selectedModel === model.id) {
            modelCard.classList.add('selected');
            continueBtn.disabled = false;
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
            continueBtn.disabled = false;
        });
        
        modelGrid.appendChild(modelCard);
    });
    
    // If no model was pre-selected, enable continue button anyway
    if (!selectedModel) {
        continueBtn.disabled = false;
    }
}

async function finishSetup() {
    try {
        // Save selected model if any
        if (selectedModel) {
            const envConfig = await ipcRenderer.invoke('load-env');
            const updatedConfig = {
                env: envConfig?.env || {},
                llm: selectedModel,
                llms: envConfig?.llms || commonModels.map(m => m.id)
            };
            
            await ipcRenderer.invoke('save-env', updatedConfig);
        }
        
        // Mark first run as complete
        await ipcRenderer.invoke('mark-first-run-complete');
        
        // Close setup window
        ipcRenderer.send('close-first-run-setup');
        
    } catch (error) {
        console.error('Failed to save setup:', error);
        // Still close the window
        ipcRenderer.send('close-first-run-setup');
    }
}

// Setup option selection
function setupOptionHandlers() {
    document.getElementById('option-auto').addEventListener('click', () => {
        document.querySelectorAll('.option-card').forEach(card => card.classList.remove('selected'));
        document.getElementById('option-auto').classList.add('selected');
    });

    document.getElementById('option-manual').addEventListener('click', () => {
        document.querySelectorAll('.option-card').forEach(card => card.classList.remove('selected'));
        document.getElementById('option-manual').classList.add('selected');
    });
}

// -------------------- MICROPHONE TEST --------------------
function setupMicrophoneTest() {
    const micReadyBtn = document.getElementById('micReadyBtn');
    const micRecordBtn = document.getElementById('micRecordBtn');
    const micPlayBtn = document.getElementById('micPlayBtn');
    const micWorksBtn = document.getElementById('micWorksBtn');
    const micTryAgainBtn = document.getElementById('micTryAgainBtn');
    const deviceAdvancedBtn = document.getElementById('deviceAdvancedBtn');
    const micTestAgainBtn = document.getElementById('micTestAgainBtn');
    const deviceSelect = document.getElementById('micDeviceSelect');
    const refreshBtn = document.getElementById('micRefreshBtn');
    
    const micReadySection = document.getElementById('micReadySection');
    const micTestSection = document.getElementById('micTestSection');
    const micPlaybackSection = document.getElementById('micPlaybackSection');
    const micAdvancedSection = document.getElementById('micAdvancedSection');
    
    const status = document.getElementById('micStatus');
    const advancedStatus = document.getElementById('advancedMicStatus');
    const waveCanvas = document.getElementById('micWave');
    const waveCtx = waveCanvas ? waveCanvas.getContext('2d') : null;

    if (micReadyBtn.dataset.initialized) return; // Prevent multiple bindings
    micReadyBtn.dataset.initialized = 'true';

    let currentRecordingPath = null;
    let isRecording = false;
    let waveAnimation = null;
    let audioContext = null;
    let analyser = null;
    let mediaStream = null;

    // Details toggle functionality
    const detailsBtn = document.getElementById('detailsBtn');
    const detailsSection = document.getElementById('detailsSection');
    
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

    // Step 1: User clicks "I'm ready" - magical focus transition
    micReadyBtn.addEventListener('click', () => {
        // First, magically vanish unnecessary elements
        const stepDescription = document.querySelector('#step-microphone .step-description');
        const detailsToggle = document.querySelector('.details-toggle');
        const detailsSection = document.querySelector('.details-section');
        
        // Fade out unnecessary elements
        if (stepDescription) {
            stepDescription.style.animation = 'magicalVanish 0.6s ease-out forwards';
        }
        if (detailsToggle) {
            detailsToggle.style.animation = 'magicalVanish 0.6s ease-out forwards';
        }
        if (detailsSection && detailsSection.style.display !== 'none') {
            detailsSection.style.animation = 'magicalVanish 0.6s ease-out forwards';
        }
        
        // Update the title to be more focused on the test
        const stepTitle = document.querySelector('#step-microphone .step-title');
        if (stepTitle) {
            setTimeout(() => {
                stepTitle.textContent = '🎤 Let\'s Test Your Voice!';
                stepTitle.style.animation = 'magicalAppear 0.6s ease-out';
            }, 300);
        }
        
        // After the vanishing animation, show the test section
        setTimeout(() => {
            micReadySection.style.display = 'none';
            micTestSection.style.display = 'block';
            micTestSection.style.animation = 'magicalAppear 0.8s ease-out';
            setupWaveform();
        }, 600);
    });

    // Recording state management
    let mediaRecorder = null;
    let chunks = [];

    // Listen for recording commands from main process
    ipcRenderer.on('start-first-run-recording', async () => {
        await startWebRecording();
    });

    ipcRenderer.on('stop-first-run-recording', () => {
        stopWebRecording();
    });

    async function startWebRecording() {
        try {
            // Get user media with selected device or default
            const deviceId = deviceSelect.value;
            const constraints = deviceId && deviceId !== 'auto' ? 
                { audio: { deviceId: { exact: deviceId } } } : 
                { audio: true };
            
            mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            
            // Setup waveform visualization
            if (waveCanvas && waveCtx) {
                waveCanvas.style.display = 'block';
                setupAudioVisualization(mediaStream);
            }

            // Setup MediaRecorder
            let mimeType = '';
            if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                mimeType = 'audio/webm;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
                mimeType = 'audio/ogg;codecs=opus';
            } else if (MediaRecorder.isTypeSupported('audio/webm')) {
                mimeType = 'audio/webm';
            }
            
            mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
            chunks = [];

            mediaRecorder.ondataavailable = e => chunks.push(e.data);
            mediaRecorder.onstop = () => {
                const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                const buffer = blob.arrayBuffer().then(arrayBuffer => {
                    ipcRenderer.send('first-run-audio-finished', { 
                        buffer: arrayBuffer, 
                        mimeType: mediaRecorder.mimeType || 'audio/webm' 
                    });
                });
            };

            mediaRecorder.start();
            ipcRenderer.send('first-run-audio-started');
            
        } catch (error) {
            console.error('Failed to start web recording:', error);
            ipcRenderer.send('first-run-audio-error', error.message);
        }
    }

    function stopWebRecording() {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
        }
        cleanupAudio();
    }

    // Step 2: Start recording with waveform
    micRecordBtn.addEventListener('click', async () => {
        if (isRecording) return;

        try {
            status.textContent = 'Starting recording...';
            micRecordBtn.disabled = true;

            // Start recording using the generalized recording system
            // Option 1: Use the specific first-run handler (backwards compatibility)
            const result = await ipcRenderer.invoke('start-first-run-recording');
            
            // Option 2: Use the generalized handler (for future flexibility)
            // const result = await ipcRenderer.invoke('start-recording-session', {
            //     sessionId: 'first-run-mic-test',
            //     windowType: 'first-run',
            //     filePrefix: 'first_run_test',
            //     eventPrefix: 'first-run'
            // });
            
            if (result.success) {
                isRecording = true;
                micRecordBtn.textContent = '🎤 Recording... (speak now!)';
                status.textContent = 'Recording for 5 seconds... Please read the text aloud!';
                
                // Auto-stop after 5 seconds
                setTimeout(async () => {
                    if (isRecording) {
                        await stopRecording();
                    }
                }, 5000);
            } else {
                throw new Error(result.error || 'Failed to start recording');
            }

        } catch (error) {
            console.error('Recording failed:', error);
            status.textContent = 'Microphone access failed. Please check permissions and try again.';
            micRecordBtn.disabled = false;
            micRecordBtn.textContent = '🔴 Start Recording';
            cleanupAudio();
        }
    });

    async function stopRecording() {
        try {
            const result = await ipcRenderer.invoke('stop-first-run-recording');
            
            if (result.success) {
                isRecording = false;
                currentRecordingPath = result.filePath;
                
                // Clean up waveform
                cleanupAudio();
                
                // Animate away the test section and show playback
                micTestSection.style.animation = 'fadeOut 0.5s ease-out forwards';
                setTimeout(() => {
                    micTestSection.style.display = 'none';
                    micPlaybackSection.style.display = 'block';
                    micPlaybackSection.style.animation = 'fadeIn 0.5s ease-out forwards';
                }, 500);
                
            } else {
                throw new Error(result.error || 'Failed to stop recording');
            }
        } catch (error) {
            console.error('Failed to stop recording:', error);
            status.textContent = 'Recording failed to stop properly.';
        }
    }

    // Step 3: Play back the recording
    micPlayBtn.addEventListener('click', async () => {
        if (!currentRecordingPath) return;

        try {
            micPlayBtn.disabled = true;
            micPlayBtn.textContent = '🔊 Playing...';
            
            const result = await ipcRenderer.invoke('play-first-run-recording', currentRecordingPath);
            
            if (result.success) {
                // Re-enable button after a delay
                setTimeout(() => {
                    micPlayBtn.disabled = false;
                    micPlayBtn.textContent = '🔊 Play Recording';
                }, 3000);
            } else {
                throw new Error(result.error || 'Failed to play recording');
            }
        } catch (error) {
            console.error('Playback failed:', error);
            micPlayBtn.disabled = false;
            micPlayBtn.textContent = '🔊 Play Recording';
        }
    });

    // Step 4: User confirms it works
    micWorksBtn.addEventListener('click', () => {
        // Save the current device setting (default)
        ipcRenderer.send('set-microphone-device', 'auto');
        nextStep();
    });

    // Or user wants to try again
    micTryAgainBtn.addEventListener('click', () => {
        resetToTestSection();
    });

    // Advanced device selection
    deviceAdvancedBtn.addEventListener('click', () => {
        micAdvancedSection.style.display = 'block';
        populateDevices();
    });

    micTestAgainBtn.addEventListener('click', async () => {
        // Use the selected device for testing
        const deviceId = deviceSelect.value;
        resetToTestSection();
        
        // Set the selected device for next recording
        if (deviceId && deviceId !== 'auto') {
            ipcRenderer.send('set-microphone-device', deviceId);
        }
    });

    function resetToTestSection() {
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

    function setupAudioVisualization(stream) {
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            const source = audioContext.createMediaStreamSource(stream);
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 512;
            source.connect(analyser);
            
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            const draw = () => {
                if (!isRecording) return;
                
                waveCtx.clearRect(0, 0, waveCanvas.width, waveCanvas.height);
                analyser.getByteTimeDomainData(dataArray);
                waveCtx.lineWidth = 3;
                waveCtx.strokeStyle = '#4facfe';
                waveCtx.beginPath();
                
                const slice = waveCanvas.width / dataArray.length;
                for (let i = 0; i < dataArray.length; i++) {
                    const v = (dataArray[i] - 128) / 128;
                    const y = waveCanvas.height / 2 + v * (waveCanvas.height / 2 * 0.8);
                    if (i === 0) waveCtx.moveTo(0, y);
                    else waveCtx.lineTo(i * slice, y);
                }
                waveCtx.stroke();
                
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

    // Enumerate devices helper
    async function populateDevices() {
        try {
            await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
            const devices = await navigator.mediaDevices.enumerateDevices();
            const audioInputs = devices.filter(d => d.kind === 'audioinput');
            
            deviceSelect.innerHTML = '';
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = '🤖 Auto-detect (Recommended)';
            deviceSelect.appendChild(autoOpt);
            
            audioInputs.forEach(dev => {
                const o = document.createElement('option');
                o.value = dev.deviceId;
                o.textContent = dev.label || `Microphone ${audioInputs.indexOf(dev) + 1}`;
                deviceSelect.appendChild(o);
            });
            
            advancedStatus.textContent = `Found ${audioInputs.length} audio device(s)`;
        } catch (err) {
            console.error('Device enumeration failed', err);
            advancedStatus.textContent = 'Failed to discover audio devices';
        }
    }

    refreshBtn.addEventListener('click', populateDevices);
}

// -------------------- TTS TEST --------------------
function setupTtsTest() {
    const playBtn = document.getElementById('ttsPlayBtn');
    const status = document.getElementById('ttsStatus');
    const continueBtn = document.getElementById('ttsContinueBtn');

    if (playBtn.dataset.initialized) return; // Prevent multiple bindings
    playBtn.dataset.initialized = 'true';

    const sampleText = 'MetaKeyAI is a magical way to cast spells on your clipboard! This setup will help you configure everything quickly.';

    playBtn.addEventListener('click', () => {
        status.textContent = 'Generating audio...';
        playBtn.disabled = true;
        playBtn.textContent = '🔄 Playing...';
        
        ipcRenderer.send('test-voice', { voice: 'nova', text: sampleText });
        
        status.textContent = 'Playing sample audio – did you hear it clearly?';
        continueBtn.disabled = false;
        
        // Reset button after a delay
        setTimeout(() => {
            playBtn.disabled = false;
            playBtn.textContent = '🔊 Play Sample Audio';
        }, 5000);
    });

    continueBtn.addEventListener('click', () => {
        nextStep();
    });
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    showStep(0);
    setupOptionHandlers();
    
    // Add event listeners for buttons
    document.getElementById('startSetupBtn')?.addEventListener('click', startSetup);
        document.getElementById('skipPythonBtn')?.addEventListener('click', skipPython);
    document.getElementById('continueModelsBtn')?.addEventListener('click', nextStep);
    document.getElementById('shortcutsNextBtn')?.addEventListener('click', nextStep);
    document.getElementById('finishSetupBtn')?.addEventListener('click', finishSetup);
});

// Handle window events
window.addEventListener('beforeunload', () => {
    // Mark first run as complete even if user closes window
    ipcRenderer.invoke('mark-first-run-complete').catch(console.error);
});

// First-run setup JavaScript
console.log('🎬 First-run setup script loaded');

// Window control functions
function minimizeWindow() {
    console.log('📊 Minimize button clicked');
    try {
        console.log('📤 Sending minimize-first-run-window IPC message');
        ipcRenderer.send('minimize-first-run-window');
    } catch (error) {
        console.error('❌ Error sending minimize IPC:', error);
    }
}

function closeWindow() {
    console.log('🔴 Close button clicked');
    try {
        console.log('📤 Sending close-first-run-setup IPC message');
        ipcRenderer.send('close-first-run-setup');
    } catch (error) {
        console.error('❌ Error sending close IPC:', error);
    }
}

// Set up event listeners when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('📋 DOM loaded, setting up window control listeners');
    
    const closeBtn = document.getElementById('closeBtn');
    const minimizeBtn = document.getElementById('minimizeBtn');
    
    if (closeBtn) {
        console.log('✅ Close button found, adding listener');
        closeBtn.addEventListener('click', function(e) {
            console.log('🎯 Close button click event fired');
            e.preventDefault();
            e.stopPropagation();
            closeWindow();
        });
        closeBtn.addEventListener('mousedown', function(e) {
            console.log('🖱️ Close button mousedown event');
        });
    } else {
        console.error('❌ Close button not found!');
    }
    
    if (minimizeBtn) {
        console.log('✅ Minimize button found, adding listener');
        minimizeBtn.addEventListener('click', function(e) {
            console.log('🎯 Minimize button click event fired');
            e.preventDefault();
            e.stopPropagation();
            minimizeWindow();
        });
    } else {
        console.error('❌ Minimize button not found!');
    }
});

// Export functions to global scope for any inline handlers
window.minimizeWindow = minimizeWindow;
window.closeWindow = closeWindow; 