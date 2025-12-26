import { api, isFirefox } from '../browser-compat.js';
import { ReportGenerator } from './report_generator.js';

export class DragonController {
    constructor() {
        this.isRecording = false;
        this.timerInterval = null;
        this.startTime = null;
        this.initEventListeners();
        this.initModeSelector();
        this.checkRecordingState();
    }

    async checkRecordingState() {
        try {
            const response = await api.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
            if (response && response.success && response.isRecording) {
                console.log('[DRAGON] Restoring recording state');
                this.isRecording = true;
                this.startTime = response.startTime;
                this.updateRecordingUI();
                this.startTimer();
            }
        } catch (error) {
            console.error('[DRAGON] Error checking recording state:', error);
        }
    }

    initEventListeners() {
        const screenshotBtn = document.getElementById('dragon-screenshot');
        if (screenshotBtn) {
            screenshotBtn.addEventListener('click', async () => {
                await this.takeScreenshot();
            });
        }

        // Single record button that toggles between start/stop
        const recordBtn = document.getElementById('dragon-record-btn');
        if (recordBtn) {
            recordBtn.addEventListener('click', async () => {
                if (this.isRecording) {
                    if (isFirefox) {
                        await this.openRecordingTab();
                    } else {
                        await this.stopRecording();
                    }
                } else {
                    await this.startRecording();
                }
            });
        }
    }

    // Initialize recording mode selector (Chrome only)
    async initModeSelector() {
        const modeSelector = document.getElementById('recording-mode-selector');
        const modeToggle = document.getElementById('recording-mode-toggle');
        const modeHint = document.getElementById('mode-hint');
        const tabLabel = document.getElementById('mode-label-tab');
        const fullscreenLabel = document.getElementById('mode-label-fullscreen');

        // Hide mode selector on Firefox - it uses a different recording method
        if (isFirefox && modeSelector) {
            modeSelector.classList.add('hidden');
            return;
        }

        // Load saved recording mode preference
        try {
            const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
            const result = await storage.local.get('recordingModeFullscreen');
            if (result.recordingModeFullscreen !== undefined && modeToggle) {
                modeToggle.checked = result.recordingModeFullscreen;
            }
        } catch (error) {
            console.error('[DRAGON] Error loading recording mode preference:', error);
        }

        // Initialize state
        this.updateModeLabels(modeToggle, tabLabel, fullscreenLabel, modeHint);

        // Update hint text and labels when mode changes
        if (modeToggle && modeHint) {
            modeToggle.addEventListener('change', async () => {
                this.updateModeLabels(modeToggle, tabLabel, fullscreenLabel, modeHint);

                // Save recording mode preference
                try {
                    const storage = typeof browser !== 'undefined' ? browser.storage : chrome.storage;
                    await storage.local.set({ recordingModeFullscreen: modeToggle.checked });
                } catch (error) {
                    console.error('[DRAGON] Error saving recording mode preference:', error);
                }
            });
        }
    }

    updateModeLabels(toggle, tabLabel, fullscreenLabel, hint) {
        const isFullscreen = toggle?.checked || false;
        if (isFullscreen) {
            tabLabel?.classList.remove('active');
            fullscreenLabel?.classList.add('active');
            if (hint) hint.textContent = 'Picker dialog will appear - can record DevTools';
        } else {
            tabLabel?.classList.add('active');
            fullscreenLabel?.classList.remove('active');
            if (hint) hint.textContent = 'Silent capture of tab content';
        }
    }

    async takeScreenshot() {
        try {
            const response = await api.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
            if (response.success) {
                this.downloadFile(response.dataUrl, `screenshot-${Date.now()}.png`);

                const envInfo = await this.getEnvironmentInfo();
                const diagnostics = {
                    timestamp: new Date().toISOString(),
                    type: 'snapshot',
                    environment: envInfo
                };

                const diagBlob = new Blob([JSON.stringify(diagnostics, null, 2)], { type: 'application/json' });
                const diagUrl = URL.createObjectURL(diagBlob);
                this.downloadFile(diagUrl, `diagnostics-${Date.now()}.json`);

            } else {
                console.error('[DRAGON] Screenshot failed:', response.error);
            }
        } catch (error) {
            console.error('[DRAGON] Error taking screenshot:', error);
        }
    }

    async startRecording() {
        try {
            const [tab] = await api.tabs.query({ active: true, currentWindow: true });

            if (isFirefox) {
                // Firefox: Tell background to show the capture prompt on the page
                const response = await api.runtime.sendMessage({
                    type: 'REQUEST_CAPTURE_PROMPT',
                    tabId: tab.id
                });

                if (response.success) {
                    // Close popup - user will interact with the page overlay
                    window.close();
                } else {
                    alert('Failed to start recording: ' + (response.error || 'Unknown error'));
                }
            } else {
                // Chrome: Check recording mode
                const recordingMode = document.getElementById('recording-mode-toggle')?.checked ? 'fullscreen' : 'tab';

                const messageType = recordingMode === 'fullscreen'
                    ? 'START_DRAGON_RECORDING_FULLSCREEN'
                    : 'START_DRAGON_RECORDING';

                console.log('[DRAGON] Starting recording in mode:', recordingMode);

                if (recordingMode === 'fullscreen') {
                    // For fullscreen mode, close the popup immediately
                    // The picker dialog will appear and user can select screen/window
                    // When they click Share, recording will start
                    // Timer will show when popup reopens
                    api.runtime.sendMessage({
                        type: messageType,
                        tabId: tab.id
                    });
                    window.close();
                    return;
                }

                // Tab-only mode - wait for response
                const response = await api.runtime.sendMessage({
                    type: messageType,
                    tabId: tab.id
                });

                if (response.success) {
                    this.isRecording = true;
                    this.updateRecordingUI();
                    this.startTimer();

                    // Hide mode selector while recording
                    const modeSelector = document.getElementById('recording-mode-selector');
                    if (modeSelector) {
                        modeSelector.style.display = 'none';
                    }
                } else {
                    console.error('[DRAGON] Start recording failed:', response.error);
                    alert('Failed to start recording: ' + (response.error || 'Unknown error'));
                }
            }
        } catch (error) {
            console.error('[DRAGON] Error starting recording:', error);
            if (isFirefox) {
                alert('Error starting recording: ' + error.message);
            } else {
                alert('Error starting recording: ' + error.message);
            }
        }
    }

    // Firefox-only: Open the recording tab for user to stop via overlay
    async openRecordingTab() {
        try {
            const response = await api.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
            if (response.success && response.isRecording) {
                // Just close popup - user can stop from the overlay on the page
                window.close();
            }
        } catch (error) {
            console.error('[DRAGON] Error:', error);
        }
    }

    // Chrome-only: Full stop recording with report generation
    async stopRecording() {
        try {
            const response = await api.runtime.sendMessage({ type: 'STOP_DRAGON_RECORDING' });

            if (response.success) {
                this.isRecording = false;
                this.updateRecordingUI();
                this.stopTimer();

                // Show mode selector again
                const modeSelector = document.getElementById('recording-mode-selector');
                if (modeSelector) {
                    modeSelector.style.display = '';
                }

                const { video, consoleLogs, networkLogs, actions } = response.data;
                console.log('[DRAGON] Stop recording response data:', {
                    video: video ? 'present' : 'missing',
                    consoleLogs: consoleLogs?.length,
                    networkLogs: networkLogs?.length,
                    actions: actions?.length
                });

                // 1. Fetch Environment Info
                const envInfo = await this.getEnvironmentInfo();

                // 2. Prepare Logs Object
                const logs = {
                    timestamp: new Date().toISOString(),
                    type: 'recording',
                    environment: envInfo,
                    console: consoleLogs ? consoleLogs.filter(log =>
                        !log.text.includes('[CONTENT]') &&
                        !log.text.includes('[DRAGON]') &&
                        !log.text.includes('[XHRController]') &&
                        !log.text.includes('chrome-extension://') &&
                        !log.text.includes('moz-extension://')
                    ) : [],
                    network: networkLogs,
                    actions: actions
                };

                console.log('[DRAGON] 📋 Prepared logs object:');
                console.log('  - Console logs (filtered):', logs.console.length);
                console.log('  - Network logs:', logs.network.length);
                console.log('  - Actions:', logs.actions.length);
                console.log('[DRAGON] Actions details:', logs.actions);

                // 3. Generate HTML Report
                try {
                    console.log('[DRAGON] Video URL (type):', video.startsWith('data:') ? 'data URL' : video.startsWith('blob:') ? 'blob URL' : 'unknown');
                    console.log('[DRAGON] Video URL length:', video.length);

                    // Convert video data URL to blob
                    // The video is now a base64 data URL from the offscreen document
                    console.log('[DRAGON] Fetching video blob...');
                    let videoBlob;
                    if (video.startsWith('data:')) {
                        // Convert data URL to blob using fetch (works well for data URLs)
                        const response = await fetch(video);
                        videoBlob = await response.blob();
                    } else if (video.startsWith('blob:')) {
                        // Handle blob URLs for backward compatibility
                        console.warn('[DRAGON] Received blob URL instead of data URL');
                        videoBlob = await fetch(video).then(r => r.blob());
                    } else {
                        throw new Error('Invalid video URL format');
                    }

                    console.log('[DRAGON] Video blob fetched, size:', videoBlob.size, 'bytes');
                    console.log('[DRAGON] Video blob type:', videoBlob.type);

                    if (videoBlob.size === 0) {
                        throw new Error('Video blob is empty - no data was recorded');
                    }

                    console.log('[DRAGON] Generating HTML report...');
                    const reportHtml = await ReportGenerator.generateReport(videoBlob, logs);
                    const reportBlob = new Blob([reportHtml], { type: 'text/html' });
                    const reportUrl = URL.createObjectURL(reportBlob);

                    console.log('[DRAGON] Report generated successfully, downloading...');
                    this.downloadFile(reportUrl, `DRAGON-report-${Date.now()}.html`);
                } catch (e) {
                    console.error('[DRAGON] Failed to generate report:', e);
                    alert('Failed to generate report: ' + e.message + '. Downloading raw files instead.');

                    // Fallback to raw download
                    this.downloadFile(video, `recording-${Date.now()}.webm`);
                    const logsBlob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
                    const logsUrl = URL.createObjectURL(logsBlob);
                    this.downloadFile(logsUrl, `logs-${Date.now()}.json`);
                }

                // 4. Notify background to cleanup offscreen document
                setTimeout(() => {
                    api.runtime.sendMessage({ type: 'DRAGON_RECORDING_SAVED' });
                }, 2000); // Give a bit more time for heavy report generation

            } else {
                console.error('[DRAGON] Stop recording failed:', response.error);
                alert('Stop recording failed: ' + response.error);
            }
        } catch (error) {
            console.error('[DRAGON] Error stopping recording:', error);
            alert('Error stopping recording: ' + error.message);
        }
    }

    updateRecordingUI() {
        const recordBtn = document.getElementById('dragon-record-btn');
        const timerBadge = document.getElementById('dragon-timer-badge');
        const recordIcon = recordBtn?.querySelector('.record-icon');
        const stopIcon = recordBtn?.querySelector('.stop-icon');

        if (this.isRecording) {
            recordBtn?.classList.add('recording');
            timerBadge?.classList.add('active');
            if (recordIcon) recordIcon.style.display = 'none';
            if (stopIcon) stopIcon.style.display = 'block';
            recordBtn?.setAttribute('title', 'Stop Recording');
        } else {
            recordBtn?.classList.remove('recording');
            timerBadge?.classList.remove('active');
            if (recordIcon) recordIcon.style.display = 'block';
            if (stopIcon) stopIcon.style.display = 'none';
            recordBtn?.setAttribute('title', 'Start Recording');
        }
    }

    startTimer() {
        if (!this.startTime) {
            this.startTime = Date.now();
        }
        const timerEl = document.getElementById('dragon-timer');

        // Clear existing interval if any
        if (this.timerInterval) clearInterval(this.timerInterval);

        this.updateTimerDisplay(timerEl); // Update immediately

        this.timerInterval = setInterval(() => {
            this.updateTimerDisplay(timerEl);
        }, 1000);
    }

    updateTimerDisplay(timerEl) {
        const diff = Date.now() - this.startTime;
        const seconds = Math.floor((diff / 1000) % 60);
        const minutes = Math.floor((diff / (1000 * 60)) % 60);
        timerEl.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    stopTimer() {
        clearInterval(this.timerInterval);
        this.startTime = null;
        document.getElementById('dragon-timer').textContent = '00:00';
    }

    downloadFile(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    }

    async getEnvironmentInfo() {
        const [tab] = await api.tabs.query({ active: true, currentWindow: true });

        // Collect basic environment info
        const envInfo = {
            url: tab.url,
            title: tab.title,
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight
            },
            screen: {
                width: window.screen.width,
                height: window.screen.height
            }
        };

        // Try to collect application-specific details from the page
        // Both Chrome and Firefox (102+) support scripting.executeScript with world: 'MAIN'
        if (api.scripting) {
            try {
                const appDetails = await api.scripting.executeScript({
                    target: { tabId: tab.id },
                    world: 'MAIN',
                    func: () => {
                        try {
                            const details = {};

                            // Helper function to decode HTML entities
                            function decodeHtmlEntities(text) {
                                if (!text) return text;
                                const textarea = document.createElement('textarea');
                                textarea.innerHTML = text;
                                return textarea.value;
                            }

                            // Static version
                            if (typeof _STATIC_VER !== 'undefined') {
                                details.static = _STATIC_VER;
                            }

                            // ZUID
                            if (typeof _LOGGEDIN_ZUID !== 'undefined') {
                                details.zuid = _LOGGEDIN_ZUID;
                            }

                            // ZSOID and Portal Name
                            if (typeof _LOGGEDIN_ACCZSOID !== 'undefined') {
                                details.zsoid = _LOGGEDIN_ACCZSOID;
                                if (typeof portalName !== 'undefined') {
                                    details.portalName = portalName;
                                }
                            }

                            // ERECNO
                            if (typeof erecno !== 'undefined') {
                                details.erecno = erecno;
                            }

                            // i18n
                            const i18nScript = document.querySelector('script[src*="i18n"]');
                            if (i18nScript) {
                                details.i18n = i18nScript.getAttribute('src').split("/").pop();
                            }

                            // Employee details (if ZPeople API is available)
                            if (typeof ZPeople !== 'undefined' && typeof erecno !== 'undefined') {
                                try {
                                    const resp = ZPeople.getUserDetailsById(erecno);
                                    if (resp) {
                                        details.employee = {
                                            empId: resp.empid,
                                            erecno: erecno,
                                            fullName: resp.name,
                                            firstName: resp.fname,
                                            lastName: resp.lname,
                                            email: decodeHtmlEntities(resp.email),
                                            dateOfJoining: resp.empDOJ,
                                            designation: resp.designation,
                                            designationId: resp.desiId,
                                            department: resp.deptName,
                                            departmentId: resp.deptId,
                                            location: resp.locName,
                                            locationId: resp.locId,
                                            role: resp.roleName,
                                            roleId: resp.roleId
                                        };
                                    }
                                } catch (e) {
                                    // Silently fail if employee details cannot be fetched
                                }
                            }

                            return details;
                        } catch (error) {
                            return {};
                        }
                    }
                });

                if (appDetails && appDetails[0] && appDetails[0].result) {
                    envInfo.applicationDetails = appDetails[0].result;
                }
            } catch (error) {
                console.error('[DRAGON] Error collecting application details:', error);
            }
        }

        return envInfo;
    }
}
