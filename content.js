// DRAGON - Content Script for Action Recording
console.log('[DRAGON CONTENT] Content script loaded');

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


        // Create overlay container
        this.overlay = document.createElement('div');
        this.overlay.id = 'dragon-recording-control';
        this.overlay.style.cssText = `
            position: fixed;
            top: ${this.position.y}px;
            left: ${this.position.x}px;
            background: linear-gradient(135deg, rgba(30, 30, 30, 0.95), rgba(20, 20, 20, 0.95));
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.1);
            border-radius: 50px;
            padding: 10px 18px;
            display: flex;
            align-items: center;
            gap: 16px;
            z-index: 999999;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.05);
            cursor: move;
            user-select: none;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            opacity: 0;
            transform: scale(0.8);
            transition: opacity 0.3s ease, transform 0.3s ease;
        `;


        // Recording indicator (red dot)
        const indicator = document.createElement('div');
        indicator.style.cssText = `
            width: 10px;
            height: 10px;
            background: #ff4444;
            border-radius: 50%;
            animation: pulse 2s ease-in-out infinite;
        `;

        // Add pulse animation
        const style = document.createElement('style');
        style.textContent = `
            @keyframes pulse {
                0%, 100% { opacity: 1; transform: scale(1); }
                50% { opacity: 0.6; transform: scale(0.8); }
            }
            @keyframes ripple {
                from { transform: scale(0.8); opacity: 1; }
                to { transform: scale(1.2); opacity: 0; }
            }
            #dragon-recording-control:hover {
                box-shadow: 0 12px 48px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.1);
            }
            #dragon-stop-btn:hover {
                background: linear-gradient(135deg, #ff5555, #cc0000);
                transform: scale(1.05);
            }
            #dragon-stop-btn:active {
                transform: scale(0.95);
            }
        `;
        document.head.appendChild(style);

        // Timer display
        const timer = document.createElement('div');
        timer.id = 'dragon-timer-display';
        timer.textContent = '00:00';
        timer.style.cssText = `
            color: #ffffff;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: 0.5px;
            min-width: 50px;
            text-align: center;
        `;

        // Stop button
        const stopBtn = document.createElement('button');
        stopBtn.id = 'dragon-stop-btn';
        stopBtn.innerHTML = '■';
        stopBtn.style.cssText = `
            background: linear-gradient(135deg, #ff4444, #cc0000);
            border: none;
            border-radius: 50%;
            width: 36px;
            height: 36px;
            color: white;
            font-size: 14px;
            font-weight: bold;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all 0.2s ease;
            box-shadow: 0 4px 12px rgba(255, 68, 68, 0.3);
        `;

        stopBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.stopRecording();
        });

        // Prevent dragging when interacting with stop button
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
            this.overlay.style.transform = 'scale(1)';
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

        // Keep overlay within viewport bounds
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
        } else {
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
        if (!this.overlay) {
            return;
        }

        const timerDisplay = document.getElementById('dragon-timer-display');
        if (!timerDisplay) {
            return;
        }

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
        // Forcefully hide UI
        this.hide();

        // Stop the action recorder
        if (window.actionRecorder) {
            window.actionRecorder.stop();
        }

        console.log('[DRAGON UI] ⚠️ Recording stopped forcefully');
    }

    async stopRecording() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'STOP_DRAGON_RECORDING' });

            if (!response || !response.success) {
                console.error('[DRAGON UI] ❌ Stop recording failed:', response?.error);

                // Forcefully stop recording - clean up UI and recorder
                this.forceStop();

                alert('Recording has been stopped forcefully due to connection error. Data may not be saved.');
                return;
            }

            // Hide UI immediately
            this.hide();

            const { video, consoleLogs, networkLogs, actions } = response.data;

            // Generate and download report
            await this.generateAndDownloadReport(video, consoleLogs, networkLogs, actions);

            // Notify background to cleanup
            setTimeout(() => {
                chrome.runtime.sendMessage({ type: 'DRAGON_RECORDING_SAVED' }).catch(() => {
                    // Silently ignore if background is not responding
                });
            }, 2000);

        } catch (error) {
            console.error('[DRAGON UI] ❌ Error stopping recording:', error);

            // Forcefully stop recording on any error (including connection failures)
            this.forceStop();

            alert('Recording has been stopped forcefully due to an error: ' + error.message);
        }
    }

    async generateAndDownloadReport(video, consoleLogs, networkLogs, actions) {
        try {

            // 1. Fetch video blob
            const videoBlob = await fetch(video).then(r => r.blob());

            if (videoBlob.size === 0) {
                throw new Error('Video blob is empty - no data was recorded');
            }

            // 2. Get environment info
            const envInfo = await this.getEnvironmentInfo();

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

            // 4. Generate report HTML
            const reportHtml = await this.generateReportHTML(videoBlob, logs);

            // 5. Download report
            const reportBlob = new Blob([reportHtml], { type: 'text/html' });
            const reportUrl = URL.createObjectURL(reportBlob);
            this.downloadFile(reportUrl, `DRAGON-report-${Date.now()}.html`);


        } catch (error) {
            console.error('[DRAGON UI] ❌ Failed to generate report:', error);
            alert('Failed to generate report: ' + error.message + '. Please try stopping from the extension popup.');
        }
    }

    async generateReportHTML(videoBlob, logs) {
        // Convert video blob to data URL
        const videoDataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(videoBlob);
        });


        // Fetch the report template
        const templateUrl = chrome.runtime.getURL('modules/report_template.html');
        let templateHtml = await fetch(templateUrl).then(r => r.text());

        // Properly escape the logs data to prevent script injection
        const logsJson = JSON.stringify(logs)
            .replace(/</g, '\\u003c')  // Escape < to prevent </script> from breaking out
            .replace(/>/g, '\\u003e')  // Escape > for consistency
            .replace(/\u2028/g, '\\u2028')  // Escape line separator
            .replace(/\u2029/g, '\\u2029'); // Escape paragraph separator

        // Replace placeholders - template uses {{VIDEO_BASE64}} and {{ LOGS_DATA }}
        templateHtml = templateHtml.replace('{{VIDEO_BASE64}}', videoDataUrl);
        templateHtml = templateHtml.replace('{{ LOGS_DATA }}', logsJson);

        return templateHtml;
    }

    async getEnvironmentInfo() {
        // Collect basic environment info (available in content script)
        const envInfo = {
            url: window.location.href,
            title: document.title,
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

        // Try to collect application-specific details from the page's MAIN world
        // Use background script to execute via chrome.scripting API (bypasses CSP)
        try {
            const response = await chrome.runtime.sendMessage({
                type: 'EXECUTE_PAGE_SCRIPT'
            });

            if (response && response.success && response.data && Object.keys(response.data).length > 0) {
                envInfo.applicationDetails = response.data;
            }
        } catch (error) {
        }

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
            if (saved) {
                const position = JSON.parse(saved);
                return position;
            }
        } catch (e) {
        }
        // Default position: top-right with some margin
        const defaultPos = { x: window.innerWidth - 250, y: 20 };
        return defaultPos;
    }

    savePosition() {
        try {
            localStorage.setItem('dragon-control-position', JSON.stringify(this.position));
        } catch (e) {
        }
    }
}

// --- Action Recorder Logic ---
class ActionRecorder {
    constructor() {
        this.isRecording = false;
        this.currentUrl = window.location.href; // Track current URL
        this.inputDebounceTimers = new Map(); // Track debounce timers per element
        this.listeners = {
            click: this.handleClick.bind(this),
            input: this.handleInput.bind(this),
            change: this.handleChange.bind(this),
            beforeunload: this.handleNavigation.bind(this)
        };
        this.checkRecordingState();
    }

    async checkRecordingState() {
        console.log('[DRAGON CONTENT] Checking recording state...');
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_RECORDING_STATE' });
            console.log('[DRAGON CONTENT] Recording state response:', response);
            if (response && response.success && response.isRecording) {
                console.log('[DRAGON CONTENT] Restoring recording state');
                this.start();
                // Notify RecordingControlUI about the restored state
                if (window.recordingUI) {
                    console.log('[DRAGON CONTENT] Showing recording UI with startTime:', response.startTime);
                    window.recordingUI.show(response.startTime);
                }
            }
        } catch (e) {
            console.warn('[DRAGON CONTENT] Error checking recording state:', e);
        }
    }

    start() {
        if (this.isRecording) {
            return;
        }
        this.isRecording = true;
        document.addEventListener('click', this.listeners.click, true);
        document.addEventListener('input', this.listeners.input, true);  // Real-time typing
        document.addEventListener('change', this.listeners.change, true); // Final value
        window.addEventListener('beforeunload', this.listeners.beforeunload);
    }

    stop() {
        if (!this.isRecording) {
            return;
        }
        this.isRecording = false;

        // Clear all debounce timers
        this.inputDebounceTimers.forEach(timer => clearTimeout(timer));
        this.inputDebounceTimers.clear();

        document.removeEventListener('click', this.listeners.click, true);
        document.removeEventListener('input', this.listeners.input, true);
        document.removeEventListener('change', this.listeners.change, true);
        window.removeEventListener('beforeunload', this.listeners.beforeunload);
    }

    handleClick(event) {
        // Record the click action first
        this.recordAction('click', event.target);

        // Then check if URL changed after a small delay (for SPA navigation)
        // This avoids capturing wrong elements when URL changes synchronously
        setTimeout(() => {
            const newUrl = window.location.href;
            if (newUrl !== this.currentUrl) {
                this.recordAction('navigation', null, { url: newUrl });
                this.currentUrl = newUrl;
            }
        }, 100); // 100ms delay to let SPA navigation settle
    }

    handleInput(event) {
        // Only handle input, textarea, and contenteditable elements
        const target = event.target;
        const isInputElement = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;

        if (!isInputElement) {
            return;
        }

        // Debounce: Clear existing timer for this element
        const elementKey = this.getElementKey(target);
        if (this.inputDebounceTimers.has(elementKey)) {
            clearTimeout(this.inputDebounceTimers.get(elementKey));
        }

        // Set new timer to record after 300ms of no typing
        const timer = setTimeout(() => {
            const extraData = {};

            // Capture the current input value
            if (target.type === 'password') {
                extraData.value = '***';  // Don't capture passwords
            } else if (target.value !== undefined) {
                extraData.value = target.value.substring(0, 100);  // Capture up to 100 chars
            } else if (target.textContent) {
                extraData.value = target.textContent.substring(0, 100);  // For contenteditable
            }

            this.recordAction('typing', target, extraData);

            // Remove timer from map
            this.inputDebounceTimers.delete(elementKey);
        }, 300); // 300ms debounce

        this.inputDebounceTimers.set(elementKey, timer);
    }

    handleChange(event) {
        const extraData = {};

        // Capture the input value (be careful with sensitive data)
        if (event.target.type === 'password') {
            extraData.value = '***';  // Don't capture passwords
        } else if (event.target.value) {
            extraData.value = event.target.value.substring(0, 100);  // Limit length
        }

        this.recordAction('input', event.target, extraData);
    }

    handleNavigation(event) {
        const newUrl = window.location.href;
        // Only log navigation if the URL has actually changed
        if (newUrl !== this.currentUrl) {
            this.recordAction('navigation', null, { url: newUrl });
            this.currentUrl = newUrl; // Update current URL
        }
    }

    getElementKey(element) {
        // Generate a unique key for the element
        return element.id ||
            element.name ||
            `${element.tagName}_${Array.from(element.parentNode?.children || []).indexOf(element)}`;
    }

    recordAction(type, element, extraData = {}) {
        if (!this.isRecording) {
            return;
        }

        const action = {
            type,
            timestamp: Date.now(),
            url: window.location.href,
            ...extraData
        };

        if (element) {
            action.tagName = element.tagName.toLowerCase();
            action.id = element.id;
            action.className = element.className;
            action.selector = this.getSimpleSelector(element);

            // Generate readable element name
            action.elementName = this.getReadableElementName(element);

            // Capture full element details
            action.elementDetails = this.getElementDetails(element);

            // For input, capture type
            if (element.tagName === 'INPUT') {
                action.inputType = element.type;
            }
        }

        // Safely send message with error handling for extension context invalidation
        try {
            chrome.runtime.sendMessage({
                type: 'RECORD_ACTION',
                action
            }).catch(error => {
                // Silently ignore errors when extension context is invalidated
                // This happens when extension is reloaded/updated
                if (error.message && error.message.includes('Extension context invalidated')) {
                    // Extension was reloaded, stop recording
                    this.stop();
                }
            });
        } catch (error) {
            // Handle synchronous errors (e.g., extension context already invalid)
            if (error.message && error.message.includes('Extension context invalidated')) {
                this.stop();
            }
        }
    }

    getReadableElementName(element) {
        // Priority 1: Text content (for buttons, links, etc.)
        if (element.textContent && element.textContent.trim()) {
            const text = element.textContent.trim();
            // Only use text if it's reasonably short
            if (text.length <= 50) {
                return text;
            }
            // Truncate long text
            return text.substring(0, 47) + '...';
        }

        // Priority 2: aria-label
        if (element.hasAttribute('aria-label')) {
            return element.getAttribute('aria-label');
        }

        // Priority 3: title attribute
        if (element.hasAttribute('title')) {
            return element.getAttribute('title');
        }

        // Priority 4: placeholder (for inputs)
        if (element.hasAttribute('placeholder')) {
            return element.getAttribute('placeholder');
        }

        // Priority 5: value attribute (for inputs/buttons)
        if (element.hasAttribute('value') && element.getAttribute('value')) {
            return element.getAttribute('value');
        }

        // Priority 6: alt attribute (for images)
        if (element.hasAttribute('alt')) {
            return element.getAttribute('alt');
        }

        // Priority 7: id
        if (element.id) {
            return `#${element.id}`;
        }

        // Priority 8: name attribute
        if (element.hasAttribute('name')) {
            return element.getAttribute('name');
        }

        // Fallback: tag name with type if available
        if (element.hasAttribute('type')) {
            return `${element.tagName.toLowerCase()}[type="${element.getAttribute('type')}"]`;
        }

        return element.tagName.toLowerCase();
    }

    getElementDetails(element) {
        const details = {
            attributes: {},
            outerHTML: '',
            position: {},
            computed: {}
        };

        // Capture all attributes
        if (element.attributes) {
            for (let i = 0; i < element.attributes.length; i++) {
                const attr = element.attributes[i];
                details.attributes[attr.name] = attr.value;
            }
        }

        // Capture outerHTML (truncate if too long)
        const outerHTML = element.outerHTML;
        if (outerHTML.length <= 500) {
            details.outerHTML = outerHTML;
        } else {
            details.outerHTML = outerHTML.substring(0, 497) + '...';
        }

        // Capture position and dimensions
        try {
            const rect = element.getBoundingClientRect();
            details.position = {
                top: Math.round(rect.top),
                left: Math.round(rect.left),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            };
        } catch (e) {
            // Ignore if element is not in DOM
        }

        // Capture some useful computed styles
        try {
            const computed = window.getComputedStyle(element);
            details.computed = {
                display: computed.display,
                visibility: computed.visibility,
                opacity: computed.opacity,
                zIndex: computed.zIndex
            };
        } catch (e) {
            // Ignore if computation fails
        }

        return details;
    }

    getSimpleSelector(element) {
        if (element.id) return '#' + element.id;
        if (element.className && typeof element.className === 'string') {
            return element.tagName.toLowerCase() + '.' + element.className.split(' ').join('.');
        }
        return element.tagName.toLowerCase();
    }
}

const actionRecorder = new ActionRecorder();
const recordingUI = new RecordingControlUI();
window.recordingUI = recordingUI; // Expose for state restoration
window.actionRecorder = actionRecorder; // Expose for force stop

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[DRAGON CONTENT] 📨 Message received:', message.type);

    if (message.type === 'START_RECORDING') {
        console.log('[DRAGON CONTENT] Starting recording, startTime:', message.startTime);
        actionRecorder.start();
        recordingUI.show(message.startTime);
        sendResponse({ success: true });
    } else if (message.type === 'STOP_RECORDING') {
        console.log('[DRAGON CONTENT] Stopping recording');
        actionRecorder.stop();
        recordingUI.hide();
        sendResponse({ success: true });
    } else if (message.type === 'PING') {
        sendResponse({ success: true });
    }
    return false;
});
