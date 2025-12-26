// DRAGON - Content Script for Action Recording (Firefox)
// Screen capture handled here with user gesture via overlay button
console.log('[DRAGON CONTENT] Content script loaded (Firefox)');

// --- Screen Capture Manager ---
// Handles video recording with user gesture via overlay button
class ScreenCaptureManager {
    constructor() {
        this.mediaStream = null;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isCapturing = false;
        this.captureButton = null;
    }

    // Show a small button overlay for user to click (provides user gesture)
    showCapturePrompt() {
        if (this.captureButton) return;

        // Create overlay backdrop
        const backdrop = document.createElement('div');
        backdrop.id = 'dragon-capture-backdrop';
        backdrop.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 999998;
            display: flex;
            align-items: center;
            justify-content: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        // Create capture button container
        this.captureButton = document.createElement('div');
        this.captureButton.id = 'dragon-capture-prompt';

        // Create content wrapper
        const contentWrapper = document.createElement('div');
        contentWrapper.style.cssText = `
            background: linear-gradient(135deg, #1a1a2e, #16213e);
            border-radius: 20px;
            padding: 40px 50px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;

        // Create logo image
        const logoImg = document.createElement('img');
        logoImg.src = browser.runtime.getURL('icon128.png');
        logoImg.style.cssText = 'width: 80px; height: 80px; margin-bottom: 20px;';

        // Create title
        const title = document.createElement('h2');
        title.textContent = 'Dragon Screen Recorder';
        title.style.cssText = `
            color: #fff;
            margin: 0 0 10px 0;
            font-size: 24px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Create description
        const description = document.createElement('p');
        description.textContent = 'Click the button below to select what to record';
        description.style.cssText = `
            color: rgba(255, 255, 255, 0.7);
            margin: 0 0 25px 0;
            font-size: 14px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Create start button
        const startBtn = document.createElement('button');
        startBtn.id = 'dragon-start-capture-btn';
        startBtn.textContent = '\u25b6 Start Screen Capture';
        startBtn.style.cssText = `
            background: linear-gradient(135deg, #4caf50, #45a049);
            border: none;
            color: white;
            padding: 15px 40px;
            font-size: 16px;
            font-weight: 600;
            border-radius: 50px;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 5px 20px rgba(76, 175, 80, 0.4);
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Create cancel hint
        const cancelHint = document.createElement('p');
        cancelHint.textContent = 'Press Escape to cancel';
        cancelHint.style.cssText = `
            color: rgba(255, 255, 255, 0.5);
            margin: 20px 0 0 0;
            font-size: 12px;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        `;

        // Assemble elements
        contentWrapper.appendChild(logoImg);
        contentWrapper.appendChild(title);
        contentWrapper.appendChild(description);
        contentWrapper.appendChild(startBtn);
        contentWrapper.appendChild(cancelHint);
        this.captureButton.appendChild(contentWrapper);

        backdrop.appendChild(this.captureButton);
        document.body.appendChild(backdrop);

        // Animate in
        requestAnimationFrame(() => {
            backdrop.style.opacity = '1';
        });

        // Add event listeners to start button created above
        startBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            await this.startCapture();
        });

        // Hover effect
        startBtn.addEventListener('mouseenter', () => {
            startBtn.style.transform = 'scale(1.05)';
        });
        startBtn.addEventListener('mouseleave', () => {
            startBtn.style.transform = 'scale(1)';
        });

        // Cancel on backdrop click or Escape
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                this.hideCapturePrompt();
                browser.runtime.sendMessage({ type: 'CAPTURE_CANCELLED' });
            }
        });

        document.addEventListener('keydown', this.handleEscape);
    }

    handleEscape = (e) => {
        if (e.key === 'Escape') {
            this.hideCapturePrompt();
            browser.runtime.sendMessage({ type: 'CAPTURE_CANCELLED' });
        }
    }

    hideCapturePrompt() {
        document.removeEventListener('keydown', this.handleEscape);
        const backdrop = document.getElementById('dragon-capture-backdrop');
        if (backdrop) {
            backdrop.style.opacity = '0';
            setTimeout(() => {
                backdrop.remove();
            }, 300);
        }
        this.captureButton = null;
    }

    async startCapture() {
        try {
            // Request screen capture (this has user gesture from button click!)
            this.mediaStream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: "window",
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
                },
                audio: false
            });

            console.log('[DRAGON CAPTURE] Screen capture obtained');

            // Hide the prompt and wait for it to be fully removed before recording
            this.hideCapturePrompt();
            await new Promise(resolve => setTimeout(resolve, 350)); // Wait for 300ms fade + buffer

            // Setup MediaRecorder
            const mimeTypes = [
                'video/webm;codecs=vp9',
                'video/webm;codecs=vp8',
                'video/webm'
            ];

            let selectedMimeType = 'video/webm';
            for (const mimeType of mimeTypes) {
                if (MediaRecorder.isTypeSupported(mimeType)) {
                    selectedMimeType = mimeType;
                    console.log('[DRAGON CAPTURE] Using MIME type:', mimeType);
                    break;
                }
            }

            this.recordedChunks = [];
            this.mediaRecorder = new MediaRecorder(this.mediaStream, { mimeType: selectedMimeType });

            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.recordedChunks.push(event.data);
                    console.log('[DRAGON CAPTURE] Data available, size:', event.data.size);
                }
            };

            this.mediaRecorder.onerror = (event) => {
                console.error('[DRAGON CAPTURE] Recorder error:', event.error);
            };

            // Handle user stopping screen share via browser UI
            this.mediaStream.getVideoTracks()[0].onended = () => {
                console.log('[DRAGON CAPTURE] Screen sharing stopped by user');
                // Trigger stop recording
                window.recordingUI?.stopRecording();
            };

            this.mediaRecorder.start();
            this.isCapturing = true;

            // Notify background that capture started successfully
            browser.runtime.sendMessage({ type: 'CAPTURE_STARTED' });

            // Show the timer overlay and start action recording immediately
            const startTime = Date.now();
            window.recordingUI?.show(startTime);
            window.actionRecorder?.start();

            console.log('[DRAGON CAPTURE] MediaRecorder started, overlay shown');

        } catch (error) {
            console.error('[DRAGON CAPTURE] Screen capture failed:', error);
            this.hideCapturePrompt();

            // Notify about error but continue without video
            browser.runtime.sendMessage({
                type: 'CAPTURE_FAILED',
                error: error.message
            });
        }
    }

    async stopCapture() {
        console.log('[DRAGON CAPTURE] Stopping capture...');

        let videoUrl = null;

        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            await new Promise((resolve) => {
                this.mediaRecorder.onstop = () => {
                    console.log('[DRAGON CAPTURE] MediaRecorder stopped');
                    resolve();
                };
                this.mediaRecorder.stop();
            });

            if (this.recordedChunks.length > 0) {
                const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
                videoUrl = URL.createObjectURL(blob);
                console.log('[DRAGON CAPTURE] Video blob created, size:', blob.size);
            }
        }

        // Stop all tracks
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isCapturing = false;

        return videoUrl;
    }
}

// --- Recording Control UI ---
class RecordingControlUI {
    constructor() {
        this.overlay = null;
        this.timerInterval = null;
        this.startTime = null;
        this.isDragging = false;
        this.dragOffset = { x: 0, y: 0 };
        this.position = this.loadPosition();
    }

    createOverlay() {
        if (this.overlay) {
            return;
        }

        // Create overlay container - Light theme matching popup
        this.overlay = document.createElement('div');
        this.overlay.id = 'dragon-recording-control';
        this.overlay.style.cssText = `
            position: fixed;
            top: ${this.position.y}px;
            left: ${this.position.x}px;
            background: rgba(255, 255, 255, 0.98);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(0, 0, 0, 0.08);
            border-radius: 50px;
            padding: 10px 20px;
            display: flex;
            align-items: center;
            gap: 14px;
            z-index: 999999;
            box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04);
            cursor: move;
            user-select: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            opacity: 0;
            transform: scale(0.8) translateY(-10px);
            transition: opacity 0.3s ease, transform 0.3s ease, box-shadow 0.3s ease;
        `;

        // Recording indicator (orange dot)
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            width: 10px;
            height: 10px;
            background: #FF6B35;
            border-radius: 50%;
            animation: dragonPulse 1.5s ease-in-out infinite;
            box-shadow: 0 0 8px rgba(255, 107, 53, 0.5);
        `;

        // Add pulse animation
        if (!document.getElementById('dragon-animations')) {
            const style = document.createElement('style');
            style.id = 'dragon-animations';
            style.textContent = `
                @keyframes dragonPulse {
                    0%, 100% { opacity: 1; transform: scale(1); box-shadow: 0 0 8px rgba(255, 107, 53, 0.5); }
                    50% { opacity: 0.7; transform: scale(0.85); box-shadow: 0 0 4px rgba(255, 107, 53, 0.3); }
                }
                #dragon-recording-control:hover {
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.16), 0 0 0 1px rgba(0, 0, 0, 0.06);
                }
                #dragon-stop-btn:hover {
                    background: linear-gradient(135deg, #E55A2B, #D64520) !important;
                    transform: scale(1.08);
                    box-shadow: 0 6px 20px rgba(255, 107, 53, 0.45) !important;
                }
                #dragon-stop-btn:active {
                    transform: scale(0.95);
                }
            `;
            document.head.appendChild(style);
        }

        // Timer display
        const timer = document.createElement('div');
        timer.id = 'dragon-timer-display';
        timer.textContent = '00:00';
        timer.style.cssText = `
            color: #1A1A1A;
            font-size: 15px;
            font-weight: 600;
            font-family: 'SF Mono', 'Monaco', 'Consolas', monospace;
            letter-spacing: 0.5px;
            min-width: 48px;
            text-align: center;
        `;

        // Stop button - Orange gradient matching popup
        const stopBtn = document.createElement('button');
        stopBtn.id = 'dragon-stop-btn';
        stopBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><rect x="1" y="1" width="10" height="10" rx="1.5"/></svg>`;
        stopBtn.style.cssText = `
            background: linear-gradient(135deg, #FF6B35, #F7931E);
            border: none;
            border-radius: 50%;
            width: 34px;
            height: 34px;
            color: white;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: 0 4px 14px rgba(255, 107, 53, 0.35);
        `;

        stopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.stopRecording();
        });

        stopBtn.addEventListener('mousedown', (e) => {
            e.stopPropagation();
        });

        // Assemble overlay
        this.overlay.appendChild(indicator);
        this.overlay.appendChild(timer);
        this.overlay.appendChild(stopBtn);

        // Add drag handlers
        this.overlay.addEventListener('mousedown', this.handleDragStart.bind(this));
        document.addEventListener('mousemove', this.handleDragMove.bind(this));
        document.addEventListener('mouseup', this.handleDragEnd.bind(this));

        // Add to page
        try {
            document.body.appendChild(this.overlay);
        } catch (error) {
            console.error('[DRAGON UI] ❌ Failed to append overlay to body:', error);
            return;
        }

        // Trigger fade-in animation
        requestAnimationFrame(() => {
            this.overlay.style.opacity = '1';
            this.overlay.style.transform = 'scale(1) translateY(0)';
        });
    }

    handleDragStart(e) {
        this.isDragging = true;
        this.overlay.style.cursor = 'grabbing';

        const rect = this.overlay.getBoundingClientRect();
        this.dragOffset.x = e.clientX - rect.left;
        this.dragOffset.y = e.clientY - rect.top;
    }

    handleDragMove(e) {
        if (!this.isDragging) return;

        let x = e.clientX - this.dragOffset.x;
        let y = e.clientY - this.dragOffset.y;

        const rect = this.overlay.getBoundingClientRect();
        const maxX = window.innerWidth - rect.width;
        const maxY = window.innerHeight - rect.height;

        x = Math.max(0, Math.min(x, maxX));
        y = Math.max(0, Math.min(y, maxY));

        this.overlay.style.left = x + 'px';
        this.overlay.style.top = y + 'px';

        this.position = { x, y };
    }

    handleDragEnd() {
        if (this.isDragging) {
            this.isDragging = false;
            this.overlay.style.cursor = 'move';
            this.savePosition();
        }
    }

    show(startTime) {
        this.startTime = startTime || Date.now();
        this.createOverlay();
        this.startTimer();
    }

    hide() {
        this.stopTimer();
        if (this.overlay) {
            this.overlay.style.opacity = '0';
            this.overlay.style.transform = 'scale(0.8)';
            setTimeout(() => {
                if (this.overlay && this.overlay.parentNode) {
                    this.overlay.parentNode.removeChild(this.overlay);
                }
                this.overlay = null;
            }, 300);
        }
    }

    startTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
        }

        this.updateTimer();
        this.timerInterval = setInterval(() => {
            this.updateTimer();
        }, 1000);
    }

    updateTimer() {
        if (!this.overlay) return;

        const timerDisplay = document.getElementById('dragon-timer-display');
        if (!timerDisplay) return;

        const elapsed = Date.now() - this.startTime;
        const seconds = Math.floor((elapsed / 1000) % 60);
        const minutes = Math.floor((elapsed / (1000 * 60)) % 60);

        timerDisplay.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    stopTimer() {
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
    }

    forceStop() {
        this.hide();
        if (window.actionRecorder) {
            window.actionRecorder.stop();
        }
        if (window.screenCapture) {
            window.screenCapture.stopCapture();
        }
        console.log('[DRAGON UI] ⚠️ Recording stopped forcefully');
    }

    async stopRecording() {
        try {
            // Stop screen capture first and get video URL
            // Note: If stopping from a different tab, screenCapture will have no data
            let videoUrl = null;
            let captureWasActive = false;

            if (window.screenCapture) {
                // Check if this content script was actively capturing
                captureWasActive = window.screenCapture.isCapturing ||
                    (window.screenCapture.mediaRecorder &&
                        window.screenCapture.mediaRecorder.state === 'recording');
                videoUrl = await window.screenCapture.stopCapture();
            }

            // Notify background to stop and get logs
            const response = await browser.runtime.sendMessage({
                type: 'STOP_DRAGON_RECORDING',
                videoUrl: videoUrl
            });

            if (!response || !response.success) {
                console.error('[DRAGON UI] ❌ Stop recording failed:', response?.error);
                this.forceStop();

                // If error is "Not recording", the recording may have already stopped
                if (response?.error === 'Not recording') {
                    alert('Recording was already stopped or not active on this tab.');
                } else {
                    alert('Recording has been stopped. Data may not be saved.');
                }
                return;
            }

            this.hide();

            const { consoleLogs, networkLogs, actions } = response.data;

            // Warn user if video is not available (cross-tab scenario)
            if (!videoUrl && !captureWasActive) {
                console.warn('[DRAGON UI] ⚠️ No video captured - recording may have been started in a different tab');
                // Still generate report but without video
            }

            await this.generateAndDownloadReport(videoUrl, consoleLogs, networkLogs, actions);

            setTimeout(() => {
                browser.runtime.sendMessage({ type: 'DRAGON_RECORDING_SAVED' }).catch(() => { });
            }, 2000);

        } catch (error) {
            console.error('[DRAGON UI] ❌ Error stopping recording:', error);
            this.forceStop();
            alert('Recording stopped with error: ' + error.message);
        }
    }

    async generateAndDownloadReport(videoUrl, consoleLogs, networkLogs, actions) {
        try {
            let videoBlob = new Blob([], { type: 'video/webm' });
            if (videoUrl) {
                try {
                    videoBlob = await fetch(videoUrl).then(r => r.blob());
                } catch (e) {
                    console.warn('[DRAGON UI] Could not fetch video blob:', e);
                }
            }

            const envInfo = await this.getEnvironmentInfo();

            const logs = {
                timestamp: new Date().toISOString(),
                type: 'recording',
                environment: envInfo,
                console: consoleLogs ? consoleLogs.filter(log =>
                    !log.text.includes('[CONTENT]') &&
                    !log.text.includes('[DRAGON]') &&
                    !log.text.includes('moz-extension://')
                ) : [],
                network: networkLogs || [],
                actions: actions || []
            };

            const reportHtml = await this.generateReportHTML(videoBlob, logs);
            const reportBlob = new Blob([reportHtml], { type: 'text/html' });
            const reportUrl = URL.createObjectURL(reportBlob);
            this.downloadFile(reportUrl, `DRAGON-report-${Date.now()}.html`);

        } catch (error) {
            console.error('[DRAGON UI] ❌ Failed to generate report:', error);
            alert('Failed to generate report: ' + error.message);
        }
    }

    async generateReportHTML(videoBlob, logs) {
        const videoDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(videoBlob);
        });

        const templateUrl = browser.runtime.getURL('modules/report_template.html');
        let templateHtml = await fetch(templateUrl).then(r => r.text());

        const logsJson = JSON.stringify(logs)
            .replace(/</g, '\\u003c')
            .replace(/>/g, '\\u003e')
            .replace(/\u2028/g, '\\u2028')
            .replace(/\u2029/g, '\\u2029');

        templateHtml = templateHtml.replace('{{VIDEO_BASE64}}', videoDataUrl);
        templateHtml = templateHtml.replace('{{ LOGS_DATA }}', logsJson);

        return templateHtml;
    }

    async getEnvironmentInfo() {
        const envInfo = {
            url: window.location.href,
            title: document.title,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            viewport: { width: window.innerWidth, height: window.innerHeight },
            screen: { width: window.screen.width, height: window.screen.height }
        };

        try {
            const response = await browser.runtime.sendMessage({ type: 'EXECUTE_PAGE_SCRIPT' });
            if (response?.success && response.data && Object.keys(response.data).length > 0) {
                envInfo.applicationDetails = response.data;
            }
        } catch (error) { }

        return envInfo;
    }

    downloadFile(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    }

    loadPosition() {
        try {
            const saved = localStorage.getItem('dragon-control-position');
            if (saved) return JSON.parse(saved);
        } catch (e) { }
        return { x: window.innerWidth - 250, y: 20 };
    }

    savePosition() {
        try {
            localStorage.setItem('dragon-control-position', JSON.stringify(this.position));
        } catch (e) { }
    }
}

// --- Console/Network Capture Injection ---
class CaptureInjector {
    constructor() {
        this.isInjected = false;
    }

    inject() {
        if (this.isInjected) return;
        this.isInjected = true;

        const script = document.createElement('script');
        script.textContent = `
            (function() {
                if (window.__dragonCaptureInjected) return;
                window.__dragonCaptureInjected = true;

                // Console capture
                const originalConsole = {};
                ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
                    originalConsole[method] = console[method];
                    console[method] = function(...args) {
                        try {
                            const text = args.map(a => {
                                if (typeof a === 'object') {
                                    try { return JSON.stringify(a); } catch (e) { return String(a); }
                                }
                                return String(a);
                            }).join(' ');
                            
                            if (!text.includes('[DRAGON')) {
                                window.postMessage({ type: 'DRAGON_CONSOLE_LOG', level: method, text: text }, '*');
                            }
                        } catch (e) {}
                        originalConsole[method].apply(console, args);
                    };
                });

                // Helper to convert Headers to object
                function headersToObject(headers) {
                    const obj = {};
                    if (headers && headers.forEach) {
                        headers.forEach((value, key) => {
                            obj[key] = value;
                        });
                    }
                    return obj;
                }

                // Helper to get content type category
                function getTypeFromContentType(contentType) {
                    if (!contentType) return 'other';
                    if (contentType.includes('json')) return 'json';
                    if (contentType.includes('javascript')) return 'js';
                    if (contentType.includes('css')) return 'css';
                    if (contentType.includes('html')) return 'html';
                    if (contentType.includes('xml')) return 'xml';
                    if (contentType.includes('image')) return 'img';
                    if (contentType.includes('font')) return 'font';
                    if (contentType.includes('text')) return 'text';
                    return 'other';
                }

                // Network capture - Fetch
                const originalFetch = window.fetch;
                window.fetch = async function(...args) {
                    const startTime = Date.now();
                    const request = args[0];
                    const options = args[1] || {};
                    
                    // Extract URL
                    const url = typeof request === 'string' ? request : request?.url || '';
                    
                    // Extract method
                    const method = options.method || (request?.method) || 'GET';
                    
                    // Extract request headers
                    let requestHeaders = {};
                    if (options.headers) {
                        if (options.headers instanceof Headers) {
                            requestHeaders = headersToObject(options.headers);
                        } else if (typeof options.headers === 'object') {
                            requestHeaders = { ...options.headers };
                        }
                    }
                    
                    // Extract request body
                    let requestBody = null;
                    if (options.body) {
                        try {
                            if (typeof options.body === 'string') {
                                requestBody = options.body;
                            } else if (options.body instanceof FormData) {
                                requestBody = '[FormData]';
                            } else if (options.body instanceof URLSearchParams) {
                                requestBody = options.body.toString();
                            } else {
                                requestBody = JSON.stringify(options.body);
                            }
                        } catch (e) {
                            requestBody = '[Unable to serialize]';
                        }
                    }
                    
                    try {
                        const response = await originalFetch.apply(this, args);
                        const clonedResponse = response.clone();
                        
                        // Get response headers
                        const responseHeaders = headersToObject(response.headers);
                        const contentType = response.headers.get('content-type') || '';
                        const type = getTypeFromContentType(contentType);
                        
                        // Get response body (for JSON/text)
                        let responseBody = null;
                        try {
                            if (contentType.includes('json') || contentType.includes('text')) {
                                responseBody = await clonedResponse.text();
                                if (responseBody.length > 10000) {
                                    responseBody = responseBody.substring(0, 10000) + '... [truncated]';
                                }
                            }
                        } catch (e) {}
                        
                        window.postMessage({
                            type: 'DRAGON_NETWORK_LOG',
                            log: {
                                url: url,
                                method: method,
                                status: response.status,
                                statusText: response.statusText,
                                type: type,
                                contentType: contentType,
                                time: Date.now() - startTime,
                                requestHeaders: requestHeaders,
                                requestBody: requestBody,
                                responseHeaders: responseHeaders,
                                response: responseBody
                            }
                        }, '*');
                        
                        return response;
                    } catch (error) {
                        window.postMessage({
                            type: 'DRAGON_NETWORK_LOG',
                            log: {
                                url: url,
                                method: method,
                                failed: true,
                                errorText: error.message,
                                time: Date.now() - startTime,
                                requestHeaders: requestHeaders,
                                requestBody: requestBody
                            }
                        }, '*');
                        throw error;
                    }
                };

                // Network capture - XMLHttpRequest
                const originalXHROpen = XMLHttpRequest.prototype.open;
                const originalXHRSend = XMLHttpRequest.prototype.send;
                const originalXHRSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
                
                XMLHttpRequest.prototype.open = function(method, url, ...rest) {
                    this._dragon_method = method;
                    this._dragon_url = url;
                    this._dragon_startTime = Date.now();
                    this._dragon_requestHeaders = {};
                    return originalXHROpen.apply(this, [method, url, ...rest]);
                };
                
                XMLHttpRequest.prototype.setRequestHeader = function(name, value) {
                    if (this._dragon_requestHeaders) {
                        this._dragon_requestHeaders[name] = value;
                    }
                    return originalXHRSetRequestHeader.apply(this, [name, value]);
                };
                
                XMLHttpRequest.prototype.send = function(body) {
                    // Store request body
                    let requestBody = null;
                    if (body) {
                        try {
                            if (typeof body === 'string') {
                                requestBody = body;
                            } else if (body instanceof FormData) {
                                requestBody = '[FormData]';
                            } else {
                                requestBody = JSON.stringify(body);
                            }
                        } catch (e) {
                            requestBody = '[Unable to serialize]';
                        }
                    }
                    this._dragon_requestBody = requestBody;
                    
                    this.addEventListener('loadend', () => {
                        // Parse response headers
                        const responseHeadersStr = this.getAllResponseHeaders() || '';
                        const responseHeaders = {};
                        responseHeadersStr.split('\\r\\n').forEach(line => {
                            const parts = line.split(': ');
                            if (parts.length === 2) {
                                responseHeaders[parts[0].toLowerCase()] = parts[1];
                            }
                        });
                        
                        const contentType = this.getResponseHeader('content-type') || '';
                        const type = getTypeFromContentType(contentType);
                        
                        // Get response body (truncate if too long)
                        let responseBody = this.responseText;
                        if (responseBody && responseBody.length > 10000) {
                            responseBody = responseBody.substring(0, 10000) + '... [truncated]';
                        }
                        
                        window.postMessage({
                            type: 'DRAGON_NETWORK_LOG',
                            log: {
                                url: this._dragon_url,
                                method: this._dragon_method,
                                status: this.status,
                                statusText: this.statusText,
                                type: type,
                                contentType: contentType,
                                time: Date.now() - this._dragon_startTime,
                                requestHeaders: this._dragon_requestHeaders || {},
                                requestBody: this._dragon_requestBody,
                                responseHeaders: responseHeaders,
                                response: responseBody
                            }
                        }, '*');
                    });
                    return originalXHRSend.apply(this, [body]);
                };
            })();
        `;
        (document.head || document.documentElement).appendChild(script);
        script.remove();

        window.addEventListener('message', (event) => {
            if (event.source !== window) return;

            if (event.data.type === 'DRAGON_CONSOLE_LOG') {
                browser.runtime.sendMessage({ type: 'RECORD_CONSOLE_LOG', level: event.data.level, text: event.data.text }).catch(() => { });
            } else if (event.data.type === 'DRAGON_NETWORK_LOG') {
                browser.runtime.sendMessage({ type: 'RECORD_NETWORK_LOG', log: event.data.log }).catch(() => { });
            }
        });
    }
}

// --- Action Recorder ---
class ActionRecorder {
    constructor() {
        this.isRecording = false;
        this.currentUrl = window.location.href;
        this.inputDebounceTimers = new Map();
        this.listeners = {
            click: this.handleClick.bind(this),
            input: this.handleInput.bind(this),
            change: this.handleChange.bind(this),
            beforeunload: this.handleNavigation.bind(this)
        };
        this.captureInjector = new CaptureInjector();
        this.checkRecordingState();
    }

    async checkRecordingState() {
        try {
            const response = await browser.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
            if (response?.success && response.isRecording) {
                this.start();
                window.recordingUI?.show(response.startTime);
            }
        } catch (e) {
            console.warn('[DRAGON CONTENT] Error checking recording state:', e);
        }
    }

    start() {
        if (this.isRecording) return;
        this.isRecording = true;
        this.captureInjector.inject();
        document.addEventListener('click', this.listeners.click, true);
        document.addEventListener('input', this.listeners.input, true);
        document.addEventListener('change', this.listeners.change, true);
        window.addEventListener('beforeunload', this.listeners.beforeunload);
    }

    stop() {
        if (!this.isRecording) return;
        this.isRecording = false;
        this.inputDebounceTimers.forEach(timer => clearTimeout(timer));
        this.inputDebounceTimers.clear();
        document.removeEventListener('click', this.listeners.click, true);
        document.removeEventListener('input', this.listeners.input, true);
        document.removeEventListener('change', this.listeners.change, true);
        window.removeEventListener('beforeunload', this.listeners.beforeunload);
    }

    handleClick(event) {
        this.recordAction('click', event.target);
        setTimeout(() => {
            const newUrl = window.location.href;
            if (newUrl !== this.currentUrl) {
                this.recordAction('navigation', null, { url: newUrl });
                this.currentUrl = newUrl;
            }
        }, 100);
    }

    handleInput(event) {
        const target = event.target;
        if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA' && !target.isContentEditable) return;

        const elementKey = this.getElementKey(target);
        if (this.inputDebounceTimers.has(elementKey)) clearTimeout(this.inputDebounceTimers.get(elementKey));

        const timer = setTimeout(() => {
            const extraData = {};
            if (target.type === 'password') extraData.value = '***';
            else if (target.value !== undefined) extraData.value = target.value.substring(0, 100);
            else if (target.textContent) extraData.value = target.textContent.substring(0, 100);
            this.recordAction('typing', target, extraData);
            this.inputDebounceTimers.delete(elementKey);
        }, 300);

        this.inputDebounceTimers.set(elementKey, timer);
    }

    handleChange(event) {
        const extraData = {};
        if (event.target.type === 'password') extraData.value = '***';
        else if (event.target.value) extraData.value = event.target.value.substring(0, 100);
        this.recordAction('input', event.target, extraData);
    }

    handleNavigation() {
        const newUrl = window.location.href;
        if (newUrl !== this.currentUrl) {
            this.recordAction('navigation', null, { url: newUrl });
            this.currentUrl = newUrl;
        }
    }

    getElementKey(element) {
        return element.id || element.name || `${element.tagName}_${Array.from(element.parentNode?.children || []).indexOf(element)}`;
    }

    recordAction(type, element, extraData = {}) {
        if (!this.isRecording) return;

        const action = { type, timestamp: Date.now(), url: window.location.href, ...extraData };

        if (element) {
            action.tagName = element.tagName.toLowerCase();
            action.id = element.id;
            action.className = element.className;
            action.selector = this.getSimpleSelector(element);
            action.elementName = this.getReadableElementName(element);
            if (element.tagName === 'INPUT') action.inputType = element.type;
        }

        browser.runtime.sendMessage({ type: 'RECORD_ACTION', action }).catch(error => {
            if (error.message?.includes('Extension context invalidated')) this.stop();
        });
    }

    getReadableElementName(element) {
        if (element.textContent?.trim()) {
            const text = element.textContent.trim();
            return text.length <= 50 ? text : text.substring(0, 47) + '...';
        }
        if (element.hasAttribute('aria-label')) return element.getAttribute('aria-label');
        if (element.hasAttribute('title')) return element.getAttribute('title');
        if (element.hasAttribute('placeholder')) return element.getAttribute('placeholder');
        if (element.id) return `#${element.id}`;
        if (element.hasAttribute('name')) return element.getAttribute('name');
        return element.tagName.toLowerCase();
    }

    getSimpleSelector(element) {
        if (element.id) return '#' + element.id;
        if (element.className && typeof element.className === 'string') {
            return element.tagName.toLowerCase() + '.' + element.className.split(' ').join('.');
        }
        return element.tagName.toLowerCase();
    }
}

// --- Initialize ---
const screenCapture = new ScreenCaptureManager();
const actionRecorder = new ActionRecorder();
const recordingUI = new RecordingControlUI();

window.screenCapture = screenCapture;
window.recordingUI = recordingUI;
window.actionRecorder = actionRecorder;

// --- Message Listener ---
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[DRAGON CONTENT] 📨 Message received:', message.type);

    if (message.type === 'SHOW_CAPTURE_PROMPT') {
        // Show the capture button overlay (user will click to provide gesture)
        screenCapture.showCapturePrompt();
        sendResponse({ success: true });
    } else if (message.type === 'START_RECORDING') {
        // Start action recording (called after capture starts)
        actionRecorder.start();
        recordingUI.show(message.startTime);
        sendResponse({ success: true });
    } else if (message.type === 'STOP_RECORDING') {
        // This is received when user stops from ANOTHER tab
        // The original tab (this one) should generate the report since it has the video!

        // Check if this tab was actively capturing video
        const wasCapturing = window.screenCapture &&
            (window.screenCapture.isCapturing ||
                (window.screenCapture.mediaRecorder &&
                    window.screenCapture.mediaRecorder.state === 'recording') ||
                window.screenCapture.recordedChunks?.length > 0);

        console.log('[DRAGON CONTENT] STOP_RECORDING received, wasCapturing:', wasCapturing);

        // Stop action recording and hide UI
        actionRecorder.stop();
        recordingUI.hide();

        if (wasCapturing) {
            // This tab was recording video - generate the report FROM HERE
            console.log('[DRAGON CONTENT] Generating report from original tab (cross-tab stop)');

            // Use async IIFE to handle the async operation
            (async () => {
                try {
                    // Stop capture and get video URL
                    const videoUrl = await window.screenCapture.stopCapture();
                    console.log('[DRAGON CONTENT] Video captured, URL:', videoUrl ? 'present' : 'none');

                    // Get logs from background (background already has them)
                    // Note: We're requesting the logs that were collected during recording
                    const response = await browser.runtime.sendMessage({
                        type: 'GET_RECORDING_LOGS'
                    });

                    const consoleLogs = response?.data?.consoleLogs || [];
                    const networkLogs = response?.data?.networkLogs || [];
                    const actions = response?.data?.actions || [];

                    // Generate and download the report
                    await recordingUI.generateAndDownloadReport(videoUrl, consoleLogs, networkLogs, actions);

                    console.log('[DRAGON CONTENT] ✅ Report generated from original tab');

                    // Notify background that recording was saved
                    browser.runtime.sendMessage({ type: 'DRAGON_RECORDING_SAVED' }).catch(() => { });

                } catch (error) {
                    console.error('[DRAGON CONTENT] ❌ Failed to generate report:', error);
                    // Still stop the capture even if report fails
                    if (window.screenCapture) {
                        window.screenCapture.stopCapture().catch(() => { });
                    }
                }
            })();
        } else {
            // This tab wasn't capturing - just stop any residual capture
            if (window.screenCapture) {
                window.screenCapture.stopCapture().catch(() => {
                    console.warn('[DRAGON CONTENT] Screen capture already stopped or not active');
                });
            }
        }

        sendResponse({ success: true });
    } else if (message.type === 'PING') {
        sendResponse({ success: true });
    }
    return true; // Keep channel open for async operations
});

