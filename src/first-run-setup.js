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

// -------------------- TTS TEST --------------------
function setupTtsTest() {
    const playBtn = document.getElementById('ttsPlayBtn');
    const status = document.getElementById('ttsStatus');
    const continueBtn = document.getElementById('ttsContinueBtn');

    if (playBtn.dataset.initialized) return; // Prevent multiple bindings
    playBtn.dataset.initialized = 'true';

    const sampleText = 'MetaKeyAI is a magical way to cast spells on your clipboard! This setup will help you configure everything quickly.';

    playBtn.addEventListener('click', async () => {
        status.textContent = 'Generating audio...';
        playBtn.disabled = true;
        playBtn.textContent = '🔄 Testing...';
        
        try {
            // Test TTS using the new robust testing handler
            const result = await ipcRenderer.invoke('test-first-run-tts', { 
                voice: 'nova', 
                text: sampleText 
            });
            
            if (result.success) {
                status.textContent = '✅ Playing sample audio – did you hear it clearly?';
                continueBtn.disabled = false;
                playBtn.textContent = '🔊 Test Again';
            } else {
                status.textContent = `❌ TTS test failed: ${result.error || 'Unknown error'}`;
                playBtn.textContent = '🔊 Try Again';
                
                // If it's an API key issue, suggest going back to configure it
                if (result.error && result.error.includes('API key')) {
                    status.innerHTML = `❌ TTS test failed: ${result.error}<br><small>💡 You may need to configure your OpenAI API key first</small>`;
                }
            }
        } catch (error) {
            console.error('TTS test error:', error);
            status.textContent = `❌ TTS test failed: ${error.message}`;
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

    continueBtn.addEventListener('click', () => {
        nextStep();
    });
}

// -------------------- API KEY TESTING --------------------
function setupApiKeyTest() {
    // This function can be called from various steps to test API connectivity
    window.testApiKey = async function(apiKey) {
        try {
            const result = await ipcRenderer.invoke('test-first-run-api-key', apiKey);
            return result;
        } catch (error) {
            return { success: false, valid: false, error: error.message };
        }
    };
}

// -------------------- ENHANCED MICROPHONE TEST --------------------
// Update the existing microphone test to use the new robust testing
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
    let recordingTimer = null;

    // Details toggle functionality
    const detailsBtn = document.getElementById('detailsBtn');
    const detailsSection = document.getElementById('detailsSection');
    
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
        // First, magically vanish unnecessary elements within the ready section only
        const stepDescription = micReadySection.querySelector('.step-description');
        const detailsToggle = micReadySection.querySelector('.details-toggle');
        const detailsSection = micReadySection.querySelector('.details-section');
        
        // Fade out unnecessary elements (only those in the ready section)
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
                // Clear the animation after it completes to prevent re-triggering
                setTimeout(() => {
                    stepTitle.style.animation = '';
                }, 600);
            }, 300);
        }
        
        // After the vanishing animation, show the test section
        setTimeout(() => {
            micReadySection.style.display = 'none';
            micTestSection.style.display = 'block';
            micTestSection.style.animation = 'magicalAppear 0.8s ease-out';
            
            // Clear the animation after it completes to prevent re-triggering
            setTimeout(() => {
                micTestSection.style.animation = '';
            }, 800);
            
            setupWaveform();
        }, 600);
    });

    // Recording state management
    let mediaRecorder = null;
    let chunks = [];

    // Listen for recording commands from main process
    ipcRenderer.on('start-first-run-recording', async (event, data) => {
        console.log('📨 Received start-first-run-recording event:', data);
        await startWebRecording();
    });

    ipcRenderer.on('stop-first-run-recording', (event, data) => {
        console.log('📨 Received stop-first-run-recording event:', data);
        stopWebRecording();
    });

    // Listen for test recording commands (for quick mic test)
    ipcRenderer.on('start-first-run-test-recording', async (event, data) => {
        console.log('📨 Received start-first-run-test-recording event:', data);
        await startWebRecording('test');
    });

    ipcRenderer.on('stop-first-run-test-recording', (event, data) => {
        console.log('📨 Received stop-first-run-test-recording event:', data);
        stopWebRecording('test');
    });

    async function startWebRecording(mode = 'normal') {
        try {
            console.log(`🎬 Starting web recording in ${mode} mode`);
            
            // Get user media with selected device or default
            const deviceId = deviceSelect.value;
            const constraints = deviceId && deviceId !== 'auto' ? 
                { audio: { deviceId: { exact: deviceId } } } : 
                { audio: true };
            
            console.log('🎤 Requesting user media with constraints:', constraints);
            mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
            console.log('✅ Got media stream:', mediaStream.getTracks().map(t => ({ kind: t.kind, label: t.label })));
            
            // Setup waveform visualization (only for normal mode, not test)
            if (mode === 'normal' && waveCanvas && waveCtx) {
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
            
            console.log('🎵 Using MIME type:', mimeType || 'default');
            mediaRecorder = mimeType ? new MediaRecorder(mediaStream, { mimeType }) : new MediaRecorder(mediaStream);
            chunks = [];

            mediaRecorder.ondataavailable = e => {
                console.log('📊 Received audio data chunk:', e.data.size, 'bytes');
                chunks.push(e.data);
            };
            
            mediaRecorder.onstop = () => {
                console.log('🎵 MediaRecorder stopped, processing', chunks.length, 'chunks');
                const blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
                console.log('📦 Created blob:', blob.size, 'bytes');
                
                blob.arrayBuffer().then(arrayBuffer => {
                    console.log('🎵 Sending audio data to main process:', arrayBuffer.byteLength, 'bytes');
                    if (mode === 'test') {
                        ipcRenderer.send('first-run-test-audio-finished', { 
                            buffer: arrayBuffer, 
                            mimeType: mediaRecorder.mimeType || 'audio/webm' 
                        });
                    } else {
                        ipcRenderer.send('first-run-audio-finished', { 
                            buffer: arrayBuffer, 
                            mimeType: mediaRecorder.mimeType || 'audio/webm' 
                        });
                    }
                }).catch(error => {
                    console.error('❌ Error converting blob to array buffer:', error);
                    if (mode === 'test') {
                        ipcRenderer.send('first-run-test-audio-error', error.message);
                    } else {
                        ipcRenderer.send('first-run-audio-error', error.message);
                    }
                });
            };

            mediaRecorder.start();
            console.log('🎬 MediaRecorder started');
            
            if (mode === 'test') {
                console.log('📤 Sending first-run-test-audio-started');
                ipcRenderer.send('first-run-test-audio-started');
            } else {
                console.log('📤 Sending first-run-audio-started');
                ipcRenderer.send('first-run-audio-started');
            }
            
        } catch (error) {
            console.error('❌ Failed to start web recording:', error);
            if (mode === 'test') {
                ipcRenderer.send('first-run-test-audio-error', error.message);
            } else {
                ipcRenderer.send('first-run-audio-error', error.message);
            }
        }
    }

    function stopWebRecording(mode = 'normal') {
        console.log(`🛑 Stopping web recording in ${mode} mode`);
        
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
            console.log('🛑 Stopping MediaRecorder');
            mediaRecorder.stop();
        } else {
            console.log('⚠️ MediaRecorder not available or already stopped');
        }
        
        // Only cleanup audio for normal mode (test mode doesn't use visualization)
        if (mode === 'normal') {
            console.log('🧹 Cleaning up audio visualization');
            cleanupAudio();
        } else {
            // For test mode, just clean up the media stream
            if (mediaStream) {
                console.log('🧹 Cleaning up media stream for test mode');
                mediaStream.getTracks().forEach(track => track.stop());
                mediaStream = null;
            }
        }
    }

    // Step 2: Start recording with waveform
    micRecordBtn.addEventListener('click', async () => {
        if (isRecording) {
            // Stop recording if already recording
            await stopRecording();
            return;
        }

        try {
            status.textContent = 'Starting recording...';
            micRecordBtn.disabled = true;
            console.log('🎤 User clicked record button - attempting to start recording');

            // Start recording using the generalized recording system
            const result = await ipcRenderer.invoke('start-first-run-recording');
            console.log('🎤 Recording start result:', result);
            
            if (result.success) {
                isRecording = true;
                micRecordBtn.textContent = '⏹️ Stop Recording';
                micRecordBtn.disabled = false;
                status.textContent = 'Recording... Click Stop when finished, or it will auto-stop in 10 seconds.';
                console.log('✅ Recording UI updated successfully');
                
                // Auto-stop after 10 seconds (longer than before for user flexibility)
                recordingTimer = setTimeout(async () => {
                    if (isRecording) {
                        status.textContent = 'Auto-stopping recording...';
                        console.log('⏰ Auto-stopping recording after 10 seconds');
                        await stopRecording();
                    }
                }, 10000);
            } else {
                throw new Error(result.error || 'Failed to start recording');
            }

        } catch (error) {
            console.error('❌ Recording failed:', error);
            status.textContent = `Microphone access failed: ${error.message}. Please check permissions and try again.`;
            micRecordBtn.disabled = false;
            micRecordBtn.textContent = '🔴 Start Recording';
            isRecording = false;
            cleanupAudio();
        }
    });

    async function stopRecording() {
        try {
            // Clear the auto-stop timer
            if (recordingTimer) {
                clearTimeout(recordingTimer);
                recordingTimer = null;
            }
            
            status.textContent = 'Stopping recording...';
            console.log('🛑 Attempting to stop recording');
            
            const result = await ipcRenderer.invoke('stop-first-run-recording');
            console.log('🛑 Stop recording result:', result);
            
            if (result.success) {
                isRecording = false;
                currentRecordingPath = result.filePath;
                
                // Clean up waveform
                cleanupAudio();
                
                // Reset button
                micRecordBtn.textContent = '🔴 Start Recording';
                micRecordBtn.disabled = false;
                
                console.log('✅ Moving to playback section');
                
                // Animate away the test section and show playback
                micTestSection.style.animation = 'fadeOut 0.5s ease-out forwards';
                setTimeout(() => {
                    micTestSection.style.display = 'none';
                    micTestSection.style.animation = ''; // Clear animation
                    
                    micPlaybackSection.style.display = 'block';
                    micPlaybackSection.style.animation = 'fadeIn 0.5s ease-out forwards';
                    
                    // Clear the playback animation after it completes
                    setTimeout(() => {
                        micPlaybackSection.style.animation = '';
                    }, 500);
                }, 500);
                
            } else {
                throw new Error(result.error || 'Failed to stop recording');
            }
        } catch (error) {
            console.error('❌ Failed to stop recording:', error);
            status.textContent = `Recording failed to stop: ${error.message}`;
            isRecording = false;
            micRecordBtn.textContent = '🔴 Start Recording';
            micRecordBtn.disabled = false;
        }
    }

    // Step 3: Play back the recording
    micPlayBtn.addEventListener('click', async () => {
        if (!currentRecordingPath) return;

        try {
            micPlayBtn.disabled = true;
            micPlayBtn.textContent = '🔊 Playing...';
            
            console.log('🔊 Playing audio via IPC (cross-platform safe):', currentRecordingPath);
            
            // Use IPC to play via the improved AudioPlayer with WebM support
            const result = await ipcRenderer.invoke('play-first-run-recording', currentRecordingPath);
            
            if (result.success) {
                console.log('✅ Audio playback started successfully');
                // The AudioPlayer will handle the playback duration
                setTimeout(() => {
                    micPlayBtn.disabled = false;
                    micPlayBtn.textContent = '🔊 Play Recording';
                }, 5000); // Default timeout, AudioPlayer should finish before this
            } else {
                console.error('❌ Audio playback failed:', result.error);
                
                // Show user-friendly error message
                let errorMsg = result.error || 'Failed to play recording';
                if (errorMsg.includes('WebM') || errorMsg.includes('format')) {
                    errorMsg = 'Recording playback not supported. The recording was saved successfully though!';
                }
                
                // Update button with error indication
                micPlayBtn.textContent = '⚠️ Playback Error';
                setTimeout(() => {
                    micPlayBtn.disabled = false;
                    micPlayBtn.textContent = '🔊 Try Again';
                }, 2000);
                
                // Still allow user to continue since recording worked
                console.log('ℹ️ Playback failed but recording was successful, user can continue');
            }
            
        } catch (error) {
            console.error('❌ Playback request failed:', error);
            
            // Show user-friendly message
            micPlayBtn.textContent = '⚠️ Playback Error';
            setTimeout(() => {
                micPlayBtn.disabled = false;
                micPlayBtn.textContent = '🔊 Try Again';
            }, 2000);
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
        // Clear any active timer
        if (recordingTimer) {
            clearTimeout(recordingTimer);
            recordingTimer = null;
        }
        
        isRecording = false;
        
        // Clear all animations to prevent conflicts
        micPlaybackSection.style.animation = '';
        micAdvancedSection.style.animation = '';
        micTestSection.style.animation = '';
        
        // Reset section visibility
        micPlaybackSection.style.display = 'none';
        micAdvancedSection.style.display = 'none';
        micTestSection.style.display = 'block';
        
        // Reset UI state
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
            // First, try to get permission to access devices
            await navigator.mediaDevices.getUserMedia({ audio: true }).then(s => s.getTracks().forEach(t => t.stop())).catch(() => {});
            
            // Get devices from both web API and AudioManager
            const [webDevices, audioManagerDevices] = await Promise.all([
                navigator.mediaDevices.enumerateDevices(),
                ipcRenderer.invoke('discover-audio-devices').catch(() => [])
            ]);
            
            const audioInputs = webDevices.filter(d => d.kind === 'audioinput');
            
            deviceSelect.innerHTML = '';
            
            // Add auto-detect option first
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = '🤖 Auto-detect (Recommended)';
            deviceSelect.appendChild(autoOpt);
            
            // Add default option
            const defaultOpt = document.createElement('option');
            defaultOpt.value = 'default';
            defaultOpt.textContent = '🔧 System Default';
            deviceSelect.appendChild(defaultOpt);
            
            // Add discovered audio input devices
            audioInputs.forEach(dev => {
                const o = document.createElement('option');
                o.value = dev.deviceId;
                o.textContent = dev.label || `Microphone ${audioInputs.indexOf(dev) + 1}`;
                deviceSelect.appendChild(o);
            });
            
            // Set current selection based on AudioManager settings
            try {
                const currentDevice = await ipcRenderer.invoke('get-settings').then(settings => settings.MICROPHONE_DEVICE).catch(() => 'auto');
                if (currentDevice && deviceSelect.querySelector(`option[value="${currentDevice}"]`)) {
                    deviceSelect.value = currentDevice;
                }
            } catch (error) {
                console.log('Could not load current device setting:', error);
            }
            
            advancedStatus.textContent = `Found ${audioInputs.length} audio device(s)`;
            
            // Add device change handler
            deviceSelect.addEventListener('change', () => {
                const selectedDevice = deviceSelect.value;
                console.log('🎤 Device selection changed to:', selectedDevice);
                
                // Update the AudioManager setting
                ipcRenderer.send('set-microphone-device', selectedDevice);
                
                // Update status
                advancedStatus.textContent = `Selected: ${deviceSelect.options[deviceSelect.selectedIndex].text}`;
            });
            
        } catch (err) {
            console.error('Device enumeration failed', err);
            advancedStatus.textContent = 'Failed to discover audio devices';
            
            // Fallback: just add basic options
            deviceSelect.innerHTML = '';
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.textContent = '🤖 Auto-detect';
            deviceSelect.appendChild(autoOpt);
        }
    }

    refreshBtn.addEventListener('click', populateDevices);
}

// -------------------- SHORTCUTS TEST --------------------
function setupShortcutsTest() {
    // This function can be called to test and display shortcuts information
    window.testShortcuts = async function() {
        try {
            const result = await ipcRenderer.invoke('test-first-run-shortcuts');
            return result;
        } catch (error) {
            return { success: false, error: error.message };
        }
    };
    
    // Auto-populate shortcuts information when shortcuts step is shown
    const shortcutsStep = document.getElementById('step-shortcuts');
    if (shortcutsStep) {
        const shortcutsContainer = shortcutsStep.querySelector('.shortcuts-list') || 
                                  document.createElement('div');
        shortcutsContainer.className = 'shortcuts-list';
        
        // Test shortcuts and display them
        window.testShortcuts().then(result => {
            if (result.success && result.shortcuts) {
                shortcutsContainer.innerHTML = '<h4>🎮 Available Shortcuts:</h4>';
                
                result.shortcuts.forEach(shortcut => {
                    const shortcutItem = document.createElement('div');
                    shortcutItem.className = 'shortcut-item';
                    shortcutItem.style.cssText = `
                        display: flex; 
                        justify-content: space-between; 
                        margin: 8px 0; 
                        padding: 8px; 
                        background: rgba(79, 172, 254, 0.1); 
                        border-radius: 6px;
                    `;
                    
                    shortcutItem.innerHTML = `
                        <span>${shortcut.name || shortcut.key}</span>
                        <kbd style="background: #444; color: #fff; padding: 2px 6px; border-radius: 3px; font-size: 12px;">
                            ${shortcut.currentKey || shortcut.key}
                        </kbd>
                    `;
                    
                    shortcutsContainer.appendChild(shortcutItem);
                });
                
                if (result.message) {
                    const messageDiv = document.createElement('div');
                    messageDiv.style.cssText = 'margin-top: 16px; padding: 12px; background: rgba(255, 193, 7, 0.1); border-radius: 6px; color: #856404;';
                    messageDiv.innerHTML = `ℹ️ ${result.message}`;
                    shortcutsContainer.appendChild(messageDiv);
                }
                
                // Add to shortcuts step if not already there
                if (!shortcutsStep.contains(shortcutsContainer)) {
                    const existingContent = shortcutsStep.querySelector('.step-content');
                    if (existingContent) {
                        existingContent.appendChild(shortcutsContainer);
                    } else {
                        shortcutsStep.appendChild(shortcutsContainer);
                    }
                }
            }
        }).catch(error => {
            console.error('Failed to load shortcuts info:', error);
        });
    }
}

// Update the nextStep function to handle shortcuts testing
const originalNextStep = nextStep;
nextStep = function() {
    // Call the original nextStep first
    originalNextStep();
    
    // If we just moved to the shortcuts step, set it up
    const stepId = steps[currentStep];
    if (stepId === 'shortcuts') {
        setupShortcutsTest();
    }
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    showStep(0);
    setupOptionHandlers();
    setupApiKeyTest(); // Set up API key testing functionality
    
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