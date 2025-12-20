import { ReportGenerator } from './report_generator.js';

export class DragonController {
    constructor() {
        this.isRecording = false;
        this.timerInterval = null;
        this.startTime = null;
        this.initEventListeners();
        this.checkRecordingState();
    }

    async checkRecordingState() {
        try {
            const response = await browser.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
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
                await this.openRecordingTab();
            });
        }
    }

    async takeScreenshot() {
        try {
            const response = await browser.runtime.sendMessage({ type: 'TAKE_SCREENSHOT' });
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
            // Get the current active tab
            const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

            // Tell background to show the capture prompt on the page
            const response = await browser.runtime.sendMessage({
                type: 'REQUEST_CAPTURE_PROMPT',
                tabId: tab.id
            });

            if (response.success) {
                // Close popup - user will interact with the page overlay
                window.close();
            } else {
                alert('Failed to start recording: ' + (response.error || 'Unknown error'));
            }

        } catch (error) {
            console.error('[DRAGON] Error starting recording:', error);
            alert('Error starting recording: ' + error.message);
        }
    }

    async openRecordingTab() {
        try {
            // Get the recording tab and focus it
            const response = await browser.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
            if (response.success && response.isRecording) {
                // Just close popup - user can stop from the overlay on the page
                window.close();
            }
        } catch (error) {
            console.error('[DRAGON] Error:', error);
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

        if (this.timerInterval) clearInterval(this.timerInterval);

        this.updateTimerDisplay(timerEl);

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
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });

        return {
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
    }
}
