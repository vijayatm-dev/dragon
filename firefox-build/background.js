// DRAGON - Background Script for Firefox
// Firefox Extension (Manifest V3)
// Screen recording handled in content script via user gesture

console.log('[DRAGON BACKGROUND] Background script loaded (Firefox)');

// Recording state management
let recordingState = {
    isRecording: false,
    tabId: null,
    startTime: null,
    consoleLogs: [],
    networkLogs: [],
    actions: [],
    pendingCapture: false // Waiting for user to click capture button
};

// Message handling
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[DRAGON BACKGROUND] Message received:', message.type);

    // Use async IIFE for proper promise handling in Firefox
    (async () => {
        try {
            if (message.type === 'START_DRAGON_RECORDING') {
                await handleStartDragonRecording(message.tabId);
                sendResponse({ success: true });
            } else if (message.type === 'STOP_DRAGON_RECORDING') {
                const data = await handleStopDragonRecording();
                sendResponse({ success: true, data });
            } else if (message.type === 'RECORD_ACTION') {
                console.log('[DRAGON BACKGROUND] Received RECORD_ACTION:', message.action);
                if (recordingState.isRecording && sender.tab.id === recordingState.tabId) {
                    recordingState.actions.push({
                        ...message.action,
                        timestamp: Date.now()
                    });
                    console.log('[DRAGON BACKGROUND] ✅ Action recorded. Total actions:', recordingState.actions.length);
                }
                sendResponse({ success: true });
            } else if (message.type === 'RECORD_CONSOLE_LOG') {
                // Receive console logs from content script
                if (recordingState.isRecording && sender.tab.id === recordingState.tabId) {
                    recordingState.consoleLogs.push({
                        type: 'console',
                        level: message.level,
                        text: message.text,
                        timestamp: Date.now()
                    });
                }
                sendResponse({ success: true });
            } else if (message.type === 'RECORD_NETWORK_LOG') {
                // Receive network logs from content script
                if (recordingState.isRecording && sender.tab.id === recordingState.tabId) {
                    recordingState.networkLogs.push({
                        ...message.log,
                        timestamp: Date.now()
                    });
                }
                sendResponse({ success: true });
            } else if (message.type === 'TAKE_SCREENSHOT') {
                const dataUrl = await browser.tabs.captureVisibleTab(null, { format: 'png' });
                sendResponse({ success: true, dataUrl });
            } else if (message.type === 'GET_RECORDING_STATE') {
                sendResponse({
                    success: true,
                    isRecording: recordingState.isRecording,
                    startTime: recordingState.startTime
                });
            } else if (message.type === 'EXECUTE_PAGE_SCRIPT') {
                // Firefox: Execute script in page context
                const tabId = sender.tab?.id;
                if (!tabId) {
                    sendResponse({ success: false, data: {}, error: 'No tab ID available' });
                    return;
                }

                try {
                    const result = await browser.scripting.executeScript({
                        target: { tabId: tabId },
                        func: () => {
                            try {
                                const details = {};

                                function decodeHtmlEntities(text) {
                                    if (!text) return text;
                                    const doc = new DOMParser().parseFromString(text, 'text/html');
                                    return doc.documentElement.textContent;
                                }

                                if (typeof _STATIC_VER !== 'undefined') {
                                    details.static = _STATIC_VER;
                                }
                                if (typeof _LOGGEDIN_ZUID !== 'undefined') {
                                    details.zuid = _LOGGEDIN_ZUID;
                                }
                                if (typeof _LOGGEDIN_ACCZSOID !== 'undefined') {
                                    details.zsoid = _LOGGEDIN_ACCZSOID;
                                    if (typeof portalName !== 'undefined') {
                                        details.portalName = portalName;
                                    }
                                }
                                if (typeof erecno !== 'undefined') {
                                    details.erecno = erecno;
                                }

                                const i18nScript = document.querySelector('script[src*="i18n"]');
                                if (i18nScript) {
                                    details.i18n = i18nScript.getAttribute('src').split("/").pop();
                                }

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
                                        // Silently fail
                                    }
                                }

                                return details;
                            } catch (error) {
                                return {};
                            }
                        }
                    });
                    sendResponse({ success: true, data: result[0]?.result || {} });
                } catch (error) {
                    console.error('[DRAGON BACKGROUND] Failed to execute page script:', error);
                    sendResponse({ success: false, data: {} });
                }
            } else if (message.type === 'DRAGON_RECORDING_SAVED') {
                sendResponse({ success: true });
            } else if (message.type === 'REQUEST_CAPTURE_PROMPT') {
                // Popup requests to show capture prompt on the page
                await handleRequestCapturePrompt(message.tabId);
                sendResponse({ success: true });
            } else if (message.type === 'CAPTURE_STARTED') {
                // Content script successfully started screen capture
                console.log('[DRAGON BACKGROUND] Capture started');
                if (recordingState.pendingCapture && recordingState.tabId) {
                    recordingState.pendingCapture = false;
                    recordingState.isRecording = true;
                    recordingState.startTime = Date.now();
                    // Tell content script to show timer and start action recording
                    browser.tabs.sendMessage(recordingState.tabId, {
                        type: 'START_RECORDING',
                        startTime: recordingState.startTime
                    }).catch(() => { });
                }
                sendResponse({ success: true });
            } else if (message.type === 'CAPTURE_FAILED') {
                // Screen capture failed, but continue without video
                console.warn('[DRAGON BACKGROUND] Capture failed:', message.error);
                if (recordingState.pendingCapture && recordingState.tabId) {
                    recordingState.pendingCapture = false;
                    recordingState.isRecording = true;
                    recordingState.startTime = Date.now();
                    // Tell content script to start recording without video
                    browser.tabs.sendMessage(recordingState.tabId, {
                        type: 'START_RECORDING',
                        startTime: recordingState.startTime
                    }).catch(() => { });
                }
                sendResponse({ success: true });
            } else if (message.type === 'CAPTURE_CANCELLED') {
                // User cancelled the capture prompt
                console.log('[DRAGON BACKGROUND] Capture cancelled');
                recordingState.pendingCapture = false;
                recordingState.tabId = null;
                sendResponse({ success: true });
            } else {
                sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('[DRAGON BACKGROUND] Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    })();

    return true; // Keep message channel open for async response
});

// Ensure content script is injected in already-open tabs
async function ensureContentScriptInjected(tabId) {
    try {
        const response = await browser.tabs.sendMessage(tabId, { type: 'PING' });
        if (response && response.success) {
            console.log('[DRAGON BACKGROUND] Content script already loaded');
            return true;
        }
    } catch (error) {
        console.log('[DRAGON BACKGROUND] Content script not loaded, injecting...');
        try {
            await browser.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            console.log('[DRAGON BACKGROUND] Content script injected successfully');
            await new Promise(resolve => setTimeout(resolve, 100));
            return true;
        } catch (injectError) {
            console.error('[DRAGON BACKGROUND] Failed to inject content script:', injectError);
            return false;
        }
    }
}

// Request capture prompt - shows overlay button on page
async function handleRequestCapturePrompt(tabId) {
    if (recordingState.isRecording || recordingState.pendingCapture) {
        throw new Error('Already recording or pending');
    }

    console.log('[DRAGON BACKGROUND] Requesting capture prompt for tab:', tabId);

    // Set pending state
    recordingState.pendingCapture = true;
    recordingState.tabId = tabId;
    recordingState.consoleLogs = [];
    recordingState.networkLogs = [];
    recordingState.actions = [];

    try {
        // 1. Ensure content script is injected
        await ensureContentScriptInjected(tabId);

        // 2. Tell content script to show the capture prompt overlay
        await browser.tabs.sendMessage(tabId, { type: 'SHOW_CAPTURE_PROMPT' });

    } catch (error) {
        console.error('[DRAGON BACKGROUND] Failed to show capture prompt:', error);
        recordingState.pendingCapture = false;
        recordingState.tabId = null;
        throw error;
    }
}

// Start Dragon recording - called after capture is confirmed
async function handleStartDragonRecording(tabId) {
    if (recordingState.isRecording) {
        throw new Error('Already recording');
    }

    console.log('[DRAGON BACKGROUND] Starting recording for tab:', tabId);

    recordingState.isRecording = true;
    recordingState.tabId = tabId;
    recordingState.startTime = Date.now();
    recordingState.consoleLogs = [];
    recordingState.networkLogs = [];
    recordingState.actions = [];

    try {
        await ensureContentScriptInjected(tabId);
        browser.tabs.sendMessage(tabId, {
            type: 'START_RECORDING',
            startTime: recordingState.startTime
        }).catch(() => { });
    } catch (error) {
        console.error('[DRAGON BACKGROUND] Failed to start recording:', error);
        recordingState.isRecording = false;
        recordingState.tabId = null;
        recordingState.startTime = null;
        throw error;
    }
}

// Stop Dragon recording
async function handleStopDragonRecording() {
    if (!recordingState.isRecording) {
        throw new Error('Not recording');
    }

    console.log('[DRAGON BACKGROUND] Stopping recording...');

    // Notify Content Script to stop recording actions
    if (recordingState.tabId) {
        browser.tabs.sendMessage(recordingState.tabId, { type: 'STOP_RECORDING' }).catch(() => {
            console.warn('[DRAGON BACKGROUND] Failed to send STOP_RECORDING to content script');
        });
    }

    const result = {
        // Video is not included - handled in popup
        consoleLogs: recordingState.consoleLogs,
        networkLogs: recordingState.networkLogs,
        actions: recordingState.actions
    };

    console.log('[DRAGON BACKGROUND] Recording stopped - Console logs:', result.consoleLogs.length, 'Network logs:', result.networkLogs.length, 'Actions:', result.actions.length);

    // Reset state
    recordingState.isRecording = false;
    recordingState.tabId = null;
    recordingState.startTime = null;
    recordingState.consoleLogs = [];
    recordingState.networkLogs = [];
    recordingState.actions = [];

    return result;
}
