// DRAGON - Background Service Worker
// Chrome Extension

console.log('[DRAGON BACKGROUND] Background script loaded');

let xhrRequests = new Map();
let requestIdCounter = 0;

// Recording state management
// NOTE: This state can be lost when service worker restarts in MV3
// We persist critical state to chrome.storage.session for cross-tab scenarios
let recordingState = {
    isRecording: false,
    isFullscreen: false,
    tabId: null,
    startTime: null,
    debuggerAttached: false,
    consoleLogs: [],
    networkLogs: [],
    actions: []
};

// Persist recording state to chrome.storage.session
// This ensures recording can be stopped even after service worker restarts
async function saveRecordingState() {
    try {
        await chrome.storage.session.set({
            dragonRecordingState: {
                isRecording: recordingState.isRecording,
                isFullscreen: recordingState.isFullscreen,
                tabId: recordingState.tabId,
                startTime: recordingState.startTime
            }
        });
    } catch (error) {
        console.error('[DRAGON BACKGROUND] Failed to save recording state:', error);
    }
}

// Load recording state from chrome.storage.session on startup
async function loadRecordingState() {
    try {
        const result = await chrome.storage.session.get('dragonRecordingState');
        if (result.dragonRecordingState) {
            const saved = result.dragonRecordingState;
            recordingState.isRecording = saved.isRecording || false;
            recordingState.isFullscreen = saved.isFullscreen || false;
            recordingState.tabId = saved.tabId || null;
            recordingState.startTime = saved.startTime || null;
            console.log('[DRAGON BACKGROUND] Restored recording state from session storage:', saved);
        }
    } catch (error) {
        console.error('[DRAGON BACKGROUND] Failed to load recording state:', error);
    }
}

// Load state when service worker starts
loadRecordingState();


// Message handling
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[DRAGON BACKGROUND] Message received:', message.type);

    if (message.type === 'START_DRAGON_RECORDING') {
        handleStartDragonRecording(message.tabId)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    } else if (message.type === 'START_DRAGON_RECORDING_FULLSCREEN') {
        handleStartFullscreenRecording(message.tabId)
            .then(() => sendResponse({ success: true }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    } else if (message.type === 'STOP_DRAGON_RECORDING') {
        handleStopDragonRecording()
            .then((data) => sendResponse({ success: true, data }))
            .catch(err => sendResponse({ success: false, error: err.message }));
        return true;
    } else if (message.type === 'RECORD_ACTION') {
        console.log('[DRAGON BACKGROUND] Received RECORD_ACTION:', message.action);

        if (recordingState.isRecording && sender.tab.id === recordingState.tabId) {
            recordingState.actions.push({
                ...message.action,
                timestamp: Date.now()
            });
            console.log('[DRAGON BACKGROUND] ✅ Action recorded. Total actions:', recordingState.actions.length);
        }
        return false;
    } else if (message.type === 'TAKE_SCREENSHOT') {
        chrome.tabs.captureVisibleTab(null, { format: 'png' }, (dataUrl) => {//No I18N
            if (chrome.runtime.lastError) {
                sendResponse({ success: false, error: chrome.runtime.lastError.message });
            } else {
                sendResponse({ success: true, dataUrl });
            }
        });
        return true;
    } else if (message.type === 'GET_RECORDING_STATE') {
        // Only report as recording if startTime is set (picker confirmed)
        // This prevents showing pill timer while picker dialog is open
        const actuallyRecording = recordingState.isRecording && recordingState.startTime !== null;
        sendResponse({
            success: true,
            isRecording: actuallyRecording,
            startTime: recordingState.startTime
        });
        return false;
    } else if (message.type === 'EXECUTE_PAGE_SCRIPT') {
        // Execute script in page's MAIN world to access page variables (bypasses CSP)
        // Use sender.tab.id since content scripts can't access chrome.tabs API
        const tabId = sender.tab?.id;
        if (!tabId) {
            sendResponse({ success: false, data: {}, error: 'No tab ID available' });
            return false;
        }

        chrome.scripting.executeScript({
            target: { tabId: tabId },
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
        }).then(result => {
            sendResponse({ success: true, data: result[0]?.result || {} });
        }).catch(error => {
            console.error('[DRAGON BACKGROUND] Failed to execute page script:', error);
            sendResponse({ success: false, data: {} });
        });
        return true; // Will respond asynchronously
    } else if (message.type === 'DRAGON_RECORDING_SAVED') {
        // Cleanup offscreen document after download
        closeOffscreenDocument().catch(console.error);
        sendResponse({ success: true });
        return false;
    }

    return false;
});

// Ensure content script is injected in already-open tabs
async function ensureContentScriptInjected(tabId) {
    try {
        // Try to ping the content script to see if it's already loaded
        const response = await chrome.tabs.sendMessage(tabId, { type: 'PING' });
        if (response && response.success) {
            console.log('[DRAGON BACKGROUND] Content script already loaded');
            return true;
        }
    } catch (error) {
        // Content script not loaded, inject it
        console.log('[DRAGON BACKGROUND] Content script not loaded, injecting...');
        try {
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            });
            console.log('[DRAGON BACKGROUND] Content script injected successfully');
            // Wait a bit for the script to initialize
            await new Promise(resolve => setTimeout(resolve, 100));
            return true;
        } catch (injectError) {
            console.error('[DRAGON BACKGROUND] Failed to inject content script:', injectError);
            // This might fail on restricted pages (chrome://, chrome-extension://, etc.)
            return false;
        }
    }
}

// Start Dragon recording
async function handleStartDragonRecording(tabId) {
    if (recordingState.isRecording) {
        throw new Error('Already recording');
    }

    console.log('[DRAGON BACKGROUND] Starting recording for tab:', tabId);

    // Set state
    recordingState.isRecording = true;
    recordingState.tabId = tabId;
    recordingState.startTime = Date.now();
    recordingState.consoleLogs = [];
    recordingState.networkLogs = [];
    recordingState.actions = [];
    xhrRequests.clear(); // Clear previous XHR requests

    // Persist state for cross-tab scenarios (survives service worker restarts)
    await saveRecordingState();

    console.log('[DRAGON BACKGROUND] 🔄 Recording state initialized:', {
        tabId: recordingState.tabId,
        startTime: new Date(recordingState.startTime).toISOString(),
        consoleLogs: recordingState.consoleLogs.length,
        networkLogs: recordingState.networkLogs.length,
        actions: recordingState.actions.length
    });

    try {
        // 1. Ensure content script is injected (for already-open tabs)
        await ensureContentScriptInjected(tabId);

        // 2. Create offscreen document
        await createOffscreenDocument();

        // 3. Get stream ID
        const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: tabId });

        // 4. Start recording in offscreen
        const response = await chrome.runtime.sendMessage({
            type: 'START_RECORDING',
            streamId: streamId
        });

        if (!response || !response.success) {
            throw new Error(response?.error || 'Failed to start recording in offscreen document');
        }

        // 5. Notify Content Script to start recording actions
        console.log('[DRAGON BACKGROUND] Sending START_RECORDING to content script with startTime:', recordingState.startTime);
        chrome.tabs.sendMessage(tabId, {
            type: 'START_RECORDING',
            startTime: recordingState.startTime
        }).catch(() => {
            console.warn('[DRAGON BACKGROUND] Failed to send START_RECORDING to content script');
        });

        // 6. Attach debugger for Console and Network logs
        // Note: Will gracefully handle failures if page has restricted iframes (chrome-extension://, etc.)
        try {
            await chrome.debugger.attach({ tabId }, '1.3');
            recordingState.debuggerAttached = true;

            await chrome.debugger.sendCommand({ tabId }, 'Console.enable');
            await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
            await chrome.debugger.sendCommand({ tabId }, 'Network.enable');

            console.log('[DRAGON BACKGROUND] Debugger attached and domains enabled');
        } catch (e) {
            // Check if error is due to restricted content
            const errorMsg = e.message.toLowerCase();
            const isRestrictedError =
                errorMsg.includes('chrome-extension') ||
                errorMsg.includes('chrome://') ||
                errorMsg.includes('devtools://') ||
                errorMsg.includes('cannot access') ||
                errorMsg.includes('not allowed');

            if (isRestrictedError) {
                console.warn('[DRAGON BACKGROUND] Cannot attach debugger - page has restricted content (e.g., extension iframes)');
                console.warn('[DRAGON BACKGROUND] Recording will continue without console/network logs');
            } else {
                console.error('[DRAGON BACKGROUND] Debugger setup failed:', e.message);
            }
            recordingState.debuggerAttached = false;
        }
    } catch (error) {
        console.error('[DRAGON BACKGROUND] Failed to start recording:', error);
        // Rollback state
        recordingState.isRecording = false;
        recordingState.tabId = null;
        recordingState.startTime = null;
        recordingState.debuggerAttached = false;
        throw error;
    }
}

// Start Dragon fullscreen recording (uses getDisplayMedia in offscreen document)
async function handleStartFullscreenRecording(tabId) {
    if (recordingState.isRecording) {
        throw new Error('Already recording');
    }

    console.log('[DRAGON BACKGROUND] Starting fullscreen recording for tab:', tabId);

    try {
        // Set preliminary state (startTime will be set after picker confirmation)
        recordingState.isRecording = true;
        recordingState.isFullscreen = true;
        recordingState.tabId = tabId;
        recordingState.startTime = null; // Will be set after user confirms picker
        recordingState.consoleLogs = [];
        recordingState.networkLogs = [];
        recordingState.actions = [];
        xhrRequests.clear();

        // Persist preliminary state (will be updated after picker confirmation)
        await saveRecordingState();

        console.log('[DRAGON BACKGROUND] 🔄 Fullscreen recording state initialized (waiting for picker)');

        // 1. Ensure content script is injected
        await ensureContentScriptInjected(tabId);

        // 2. Create offscreen document with DISPLAY_MEDIA reason for getDisplayMedia
        await createOffscreenDocumentForDisplayMedia();

        // 3. Start recording in offscreen - this will show the picker dialog
        // The call only returns AFTER user clicks Share (or cancels)
        const response = await chrome.runtime.sendMessage({
            type: 'START_DISPLAY_MEDIA_RECORDING'
        });

        if (!response || !response.success) {
            throw new Error(response?.error || 'Failed to start screen recording');
        }

        // 4. NOW set the startTime - user has confirmed the picker
        recordingState.startTime = Date.now();

        // Persist state for cross-tab scenarios (survives service worker restarts)
        await saveRecordingState();

        console.log('[DRAGON BACKGROUND] ✅ Recording started at:', new Date(recordingState.startTime).toISOString());

        // 5. Notify Content Script to start recording actions
        console.log('[DRAGON BACKGROUND] Sending START_RECORDING to content script');
        chrome.tabs.sendMessage(tabId, {
            type: 'START_RECORDING',
            startTime: recordingState.startTime
        }).catch(() => {
            console.warn('[DRAGON BACKGROUND] Failed to send START_RECORDING to content script');
        });

        // 5. Attach debugger for Console and Network logs
        try {
            await chrome.debugger.attach({ tabId }, '1.3');
            recordingState.debuggerAttached = true;

            await chrome.debugger.sendCommand({ tabId }, 'Console.enable');
            await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
            await chrome.debugger.sendCommand({ tabId }, 'Network.enable');

            console.log('[DRAGON BACKGROUND] Debugger attached and domains enabled');
        } catch (e) {
            const errorMsg = e.message.toLowerCase();
            const isRestrictedError =
                errorMsg.includes('chrome-extension') ||
                errorMsg.includes('chrome://') ||
                errorMsg.includes('devtools://') ||
                errorMsg.includes('cannot access') ||
                errorMsg.includes('not allowed');

            if (isRestrictedError) {
                console.warn('[DRAGON BACKGROUND] Cannot attach debugger - page has restricted content');
            } else {
                console.error('[DRAGON BACKGROUND] Debugger setup failed:', e.message);
            }
            recordingState.debuggerAttached = false;
        }
    } catch (error) {
        console.error('[DRAGON BACKGROUND] Failed to start fullscreen recording:', error);
        // Rollback state
        recordingState.isRecording = false;
        recordingState.isFullscreen = false;
        recordingState.tabId = null;
        recordingState.startTime = null;
        recordingState.debuggerAttached = false;
        throw error;
    }
}

// Stop Dragon recording
async function handleStopDragonRecording() {
    // Check if we think we're recording
    // Note: State may have been lost if service worker restarted
    // We'll still try to stop offscreen recording to be safe
    const wasRecording = recordingState.isRecording;

    if (!wasRecording) {
        console.warn('[DRAGON BACKGROUND] State says not recording - service worker may have restarted');
        console.log('[DRAGON BACKGROUND] Attempting to stop offscreen recording anyway...');
    }

    console.log('[DRAGON BACKGROUND] Stopping recording...');

    // 1. Stop recording in offscreen - ALWAYS try this
    let videoDataUrl = '';
    try {
        const response = await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });

        if (response && response.success) {
            videoDataUrl = response.dataUrl;
        } else {
            console.warn('[DRAGON BACKGROUND] Offscreen stop failed:', response?.error);
            // If state was lost and offscreen also fails, throw error
            if (!wasRecording) {
                throw new Error('Not recording');
            }
        }
    } catch (offscreenError) {
        console.warn('[DRAGON BACKGROUND] Could not communicate with offscreen:', offscreenError);
        // If state was lost and offscreen also fails, throw error
        if (!wasRecording) {
            throw new Error('Not recording');
        }
        // Otherwise continue with whatever data we have
    }

    // 2. Notify Content Script to stop recording actions
    if (recordingState.tabId) {
        chrome.tabs.sendMessage(recordingState.tabId, { type: 'STOP_RECORDING' }).catch(() => {
            console.warn('[DRAGON BACKGROUND] Failed to send STOP_RECORDING to content script');
        });
    }

    // Set a timeout to close offscreen document eventually
    setTimeout(() => {
        closeOffscreenDocument().catch(console.error);
    }, 60000); // 1 minute timeout

    // 3. Detach debugger
    if (recordingState.debuggerAttached && recordingState.tabId) {
        try {
            await chrome.debugger.detach({ tabId: recordingState.tabId });
            recordingState.debuggerAttached = false;
        } catch (e) {
            console.warn('[DRAGON BACKGROUND] Debugger detach failed:', e);
        }
    }

    const result = {
        video: videoDataUrl,
        consoleLogs: recordingState.consoleLogs || [],
        networkLogs: Array.from(xhrRequests.values()),
        actions: recordingState.actions || []
    };

    console.log('[DRAGON BACKGROUND] Recording stopped - Console logs:', result.consoleLogs.length, 'Network logs:', result.networkLogs.length, 'Actions:', result.actions.length);

    recordingState.isRecording = false;
    recordingState.isFullscreen = false;
    recordingState.tabId = null;
    recordingState.startTime = null;
    recordingState.debuggerAttached = false;
    recordingState.consoleLogs = [];
    recordingState.actions = [];

    // Clear persisted state
    await saveRecordingState();

    return result;
}

// Create offscreen document for screen recording
async function createOffscreenDocument() {
    // Check if offscreen document exists using chrome.runtime.getContexts
    try {
        const existingContexts = await chrome.runtime.getContexts({
            contextTypes: ['OFFSCREEN_DOCUMENT'],
            documentUrls: ['offscreen.html']
        });

        if (existingContexts.length > 0) {
            console.log('[DRAGON BACKGROUND] Offscreen document already exists');
            return;
        }
    } catch (e) {
        console.warn('[DRAGON BACKGROUND] chrome.runtime.getContexts failed:', e);
    }

    try {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['USER_MEDIA'],
            justification: 'Recording from tab'
        });
        console.log('[DRAGON BACKGROUND] Offscreen document created');
    } catch (error) {
        if (error.message.startsWith('Only a single offscreen document may be created')) {
            console.log('[DRAGON BACKGROUND] Offscreen document already exists');
            return;
        }
        throw error;
    }
}

// Create offscreen document for display media (screen/window capture)
async function createOffscreenDocumentForDisplayMedia() {
    // First close any existing offscreen document
    try {
        await chrome.offscreen.closeDocument();
    } catch (e) {
        // Ignore - document may not exist
    }

    try {
        await chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['DISPLAY_MEDIA'],
            justification: 'Recording screen or window for bug report'
        });
        console.log('[DRAGON BACKGROUND] Offscreen document created for display media');
    } catch (error) {
        if (error.message.startsWith('Only a single offscreen document may be created')) {
            console.log('[DRAGON BACKGROUND] Offscreen document already exists');
            return;
        }
        throw error;
    }
}

// Close offscreen document
async function closeOffscreenDocument() {
    console.log('[DRAGON BACKGROUND] Closing offscreen document...');
    try {
        await chrome.offscreen.closeDocument();
        console.log('[DRAGON BACKGROUND] Offscreen document closed');
    } catch (error) {
        console.warn('[DRAGON BACKGROUND] Failed to close offscreen document:', error);
    }
}

// Handle debugger events for Console and Network
function handleDebuggerEvent(source, method, params) {
    const isDragonTab = recordingState.isRecording && source.tabId === recordingState.tabId;

    if (!isDragonTab) return;

    switch (method) {
        case 'Network.requestWillBeSent':
            handleRequestWillBeSent(params, source.tabId);
            break;
        case 'Network.responseReceived':
            handleResponseReceived(params, source.tabId);
            break;
        case 'Network.loadingFinished':
            handleLoadingFinished(params, source.tabId);
            break;
        case 'Network.loadingFailed':
            handleLoadingFailed(params, source.tabId);
            break;
        case 'Console.messageAdded':
            if (recordingState.isRecording && source.tabId === recordingState.tabId) {
                const text = params.message.text;
                // Filter out extension logs (don't capture [DRAGON BACKGROUND], [DRAGON UI], etc.)
                if (!text.startsWith('[DRAGON')) {
                    recordingState.consoleLogs.push({
                        type: 'console',
                        level: params.message.level,
                        text: text,
                        timestamp: Date.now()
                    });
                }
            }
            break;
        case 'Runtime.consoleAPICalled':
            if (recordingState.isRecording && source.tabId === recordingState.tabId) {
                const text = params.args.map(a => a.value || a.description).join(' ');
                // Filter out extension logs (don't capture [DRAGON BACKGROUND], [DRAGON UI], etc.)
                if (!text.startsWith('[DRAGON')) {
                    recordingState.consoleLogs.push({
                        type: 'console',
                        level: params.type,
                        text: text,
                        timestamp: params.timestamp
                    });
                }
            }
            break;
    }
}

// Handle network request
function handleRequestWillBeSent(params, tabId) {
    const request = params.request;
    const requestId = params.requestId;

    const requestData = {
        id: requestIdCounter++,
        requestId: requestId,
        url: request.url,
        method: request.method,
        type: params.type,
        requestHeaders: request.headers,
        requestBody: request.postData || null,
        timestamp: params.timestamp * 1000,
        startTime: Date.now()
    };

    xhrRequests.set(requestId, requestData);
}

// Handle network response
function handleResponseReceived(params, tabId) {
    const response = params.response;
    const requestId = params.requestId;

    const request = xhrRequests.get(requestId);
    if (!request) return;

    request.status = response.status;
    request.statusText = response.statusText;
    request.responseHeaders = response.headers;
    request.mimeType = response.mimeType;

    xhrRequests.set(requestId, request);
}

// Handle network loading finished
async function handleLoadingFinished(params, tabId) {
    const requestId = params.requestId;
    const request = xhrRequests.get(requestId);

    if (!request) return;

    request.time = Date.now() - request.startTime;
    request.encodedDataLength = params.encodedDataLength;
    request.size = params.encodedDataLength;

    // Skip capturing response body for static resources
    const ignoredTypes = ['Script', 'Stylesheet', 'Document', 'Image', 'Font', 'Media', 'Other'];
    if (ignoredTypes.includes(request.type)) {
        request.response = `[Response body not captured for ${request.type}]`;
    } else {
        try {
            const responseBody = await chrome.debugger.sendCommand(
                { tabId: tabId },
                'Network.getResponseBody',
                { requestId: requestId }
            );
            request.response = responseBody.body;

            // Try to parse JSON response
            try {
                request.responseParsed = JSON.parse(responseBody.body);
            } catch (e) {
                // Not JSON, keep as string
            }
        } catch (error) {
            request.response = null;
        }
    }

    xhrRequests.set(requestId, request);
}

// Handle network loading failed
function handleLoadingFailed(params, tabId) {
    const requestId = params.requestId;
    const request = xhrRequests.get(requestId);

    if (!request) return;

    request.failed = true;
    request.errorText = params.errorText;
    request.time = Date.now() - request.startTime;

    xhrRequests.set(requestId, request);
}

// Register global debugger event listener
chrome.debugger.onEvent.addListener(handleDebuggerEvent);
console.log('[DRAGON BACKGROUND] Global debugger event listener registered');

// Handle debugger detach
chrome.debugger.onDetach.addListener((source, reason) => {
    if (source.tabId === recordingState.tabId) {
        console.warn('[DRAGON BACKGROUND] Recording tab debugger detached');
        recordingState.debuggerAttached = false;
    }
});
