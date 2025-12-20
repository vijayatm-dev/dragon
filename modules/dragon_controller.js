import { ReportGenerator } from './report_generator.js';

export class DragonController {
    constructor() {
        this.isRecording = false;
        this.timerInterval = null;
        this.startTime = null;
        this.startTime = null;
        this.initEventListeners();
        this.checkRecordingState();
    }

    async checkRecordingState() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
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

        const startBtn = document.getElementById('dragon-start-recording');
        if (startBtn) {
            startBtn.addEventListener('click', async () => {
                await this.startRecording();
            });
        }

        const stopBtn = document.getElementById('dragon-stop-recording');
        if (stopBtn) {
            stopBtn.addEventListener('click', async () => {
                await this.stopRecording();
            });
        }
    }

    async takeScreenshot() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
            if (response.success) {
                // 1. Download Screenshot
                this.downloadFile(response.dataUrl, `screenshot-${Date.now()}.png`);

                // 2. Download Diagnostics (One-Click Capture)
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
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

            const response = await chrome.runtime.sendMessage({
                type: 'START_DRAGON_RECORDING',
                tabId: tab.id
            });

            if (response.success) {
                this.isRecording = true;
                this.updateRecordingUI();
                this.startTimer();
            } else {
                console.error('[DRAGON] Start recording failed:', response.error);
            }
        } catch (error) {
            console.error('[DRAGON] Error starting recording:', error);
        }
    }

    async stopRecording() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'STOP_DRAGON_RECORDING' });

            if (response.success) {
                this.isRecording = false;
                this.updateRecordingUI();
                this.stopTimer();

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
                        !log.text.includes('chrome-extension://')
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
                    console.log('[DRAGON] Video blob URL:', video);

                    // Fetch the video blob from the blob URL
                    console.log('[DRAGON] Fetching video blob...');
                    const videoBlob = await fetch(video).then(r => {
                        console.log('[DRAGON] Fetch response status:', r.status);
                        console.log('[DRAGON] Fetch response type:', r.type);
                        return r.blob();
                    });

                    console.log('[DRAGON] Video blob fetched, size:', videoBlob.size, 'bytes');
                    console.log('[DRAGON] Video blob type:', videoBlob.type);

                    if (videoBlob.size === 0) {
                        throw new Error('Video blob is empty - no data was recorded');//No I18N
                    }

                    console.log('[DRAGON] Generating HTML report...');
                    const reportHtml = await ReportGenerator.generateReport(videoBlob, logs);
                    const reportBlob = new Blob([reportHtml], { type: 'text/html' });
                    const reportUrl = URL.createObjectURL(reportBlob);

                    console.log('[DRAGON] Report generated successfully, downloading...');
                    this.downloadFile(reportUrl, `DRAGON-report-${Date.now()}.html`);
                } catch (e) {
                    console.error('[DRAGON] Failed to generate report:', e);
                    alert('Failed to generate report: ' + e.message + '. Downloading raw files instead.');//No I18N

                    // Fallback to raw download
                    this.downloadFile(video, `recording-${Date.now()}.webm`);
                    const logsBlob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
                    const logsUrl = URL.createObjectURL(logsBlob);
                    this.downloadFile(logsUrl, `logs-${Date.now()}.json`);
                }

                // 4. Notify background to cleanup offscreen document
                setTimeout(() => {
                    chrome.runtime.sendMessage({ type: 'DRAGON_RECORDING_SAVED' });
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
        const startBtn = document.getElementById('dragon-start-recording');
        const stopBtn = document.getElementById('dragon-stop-recording');
        const statusEl = document.getElementById('dragon-status');

        if (this.isRecording) {
            startBtn.disabled = true;
            stopBtn.disabled = false;
            statusEl.textContent = 'Recording...';
            statusEl.classList.add('recording');
        } else {
            startBtn.disabled = false;
            stopBtn.disabled = true;
            statusEl.textContent = 'Ready';
            statusEl.classList.remove('recording');
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
        document.getElementById('dragon-timer').textContent = '00:00';
    }

    downloadFile(url, filename) {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
    }

    async getEnvironmentInfo() {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

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
        try {
            const appDetails = await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                world: 'MAIN',  //No I18N
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
                        const i18nScript = document.querySelector('script[src*="i18n"]');//No I18N
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

        return envInfo;
    }
}
