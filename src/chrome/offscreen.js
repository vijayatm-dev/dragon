console.log('[OFFSCREEN] Script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[OFFSCREEN] Message received:', message.type);

    if (message.type === 'START_RECORDING') {
        startRecording(message.streamId, message.sourceType || 'tab')
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    } else if (message.type === 'START_DISPLAY_MEDIA_RECORDING') {
        // Use getDisplayMedia for full screen/window capture
        startDisplayMediaRecording()
            .then(() => sendResponse({ success: true }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    } else if (message.type === 'STOP_RECORDING') {
        stopRecording()
            .then((url) => {
                sendResponse({ success: true, dataUrl: url });
            })
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true;
    }
});

let recorder;
let data = [];

async function startRecording(streamId, sourceType = 'tab') {
    if (recorder?.state === 'recording') {
        throw new Error('Called startRecording while already recording.');
    }

    console.log('[OFFSCREEN] Getting media stream with ID:', streamId, 'Source type:', sourceType);

    // Build constraints based on source type
    let constraints;

    if (sourceType === 'desktop') {
        // Desktop capture constraints - for full screen/window recording
        constraints = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: streamId
                }
            }
        };
        console.log('[OFFSCREEN] Using desktop capture mode');
    } else {
        // Tab capture constraints - for current tab only
        constraints = {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId
                }
            }
        };
        console.log('[OFFSCREEN] Using tab capture mode');
    }

    const media = await navigator.mediaDevices.getUserMedia(constraints);

    console.log('[OFFSCREEN] Media stream obtained:', media);

    // Audio playback removed as per user request (muted video)

    // Check supported MIME types
    const mimeTypes = [
        'video/webm;codecs=vp9',//No I18N
        'video/webm;codecs=vp8',//No I18N
        'video/webm'//No I18N
    ];

    let selectedMimeType = 'video/webm';//No I18N
    for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            selectedMimeType = mimeType;
            console.log('[OFFSCREEN] Using MIME type:', mimeType);
            break;
        }
    }

    // Start recording with supported MIME type
    recorder = new MediaRecorder(media, { mimeType: selectedMimeType });

    recorder.ondataavailable = (event) => {
        console.log('[OFFSCREEN] Data available, size:', event.data.size);
        if (event.data.size > 0) {
            data.push(event.data);
        }
    };

    recorder.onstop = () => {
        console.log('[OFFSCREEN] Recorder stopped event fired');
    };

    recorder.onerror = (event) => {
        console.error('[OFFSCREEN] Recorder error:', event.error);
    };

    recorder.start();
    console.log('[OFFSCREEN] Recorder started with state:', recorder.state);
}

// Start recording using getDisplayMedia (for full screen/window capture)
async function startDisplayMediaRecording() {
    if (recorder?.state === 'recording') {
        throw new Error('Called startDisplayMediaRecording while already recording.');
    }

    console.log('[OFFSCREEN] Starting display media recording...');

    // Use getDisplayMedia to show the picker and get the stream
    const media = await navigator.mediaDevices.getDisplayMedia({
        video: {
            displaySurface: 'monitor' // Prefer full screen, but user can choose window
        },
        audio: false
    });

    console.log('[OFFSCREEN] Display media stream obtained:', media);

    // Clear previous data
    data = [];

    // Check supported MIME types
    const mimeTypes = [
        'video/webm;codecs=vp9',//No I18N
        'video/webm;codecs=vp8',//No I18N
        'video/webm'//No I18N
    ];

    let selectedMimeType = 'video/webm';//No I18N
    for (const mimeType of mimeTypes) {
        if (MediaRecorder.isTypeSupported(mimeType)) {
            selectedMimeType = mimeType;
            console.log('[OFFSCREEN] Using MIME type:', mimeType);
            break;
        }
    }

    // Start recording
    recorder = new MediaRecorder(media, { mimeType: selectedMimeType });

    recorder.ondataavailable = (event) => {
        console.log('[OFFSCREEN] Data available, size:', event.data.size);
        if (event.data.size > 0) {
            data.push(event.data);
        }
    };

    recorder.onstop = () => {
        console.log('[OFFSCREEN] Display media recorder stopped event fired');
    };

    recorder.onerror = (event) => {
        console.error('[OFFSCREEN] Display media recorder error:', event.error);
    };

    recorder.start();
    console.log('[OFFSCREEN] Display media recorder started with state:', recorder.state);
}

// Helper function to convert blob to base64 data URL
// This is needed because blob URLs are origin-scoped and cannot be accessed
// from content scripts in other tabs (e.g., when user stops recording from pill button in a new tab)
async function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
}

async function stopRecording() {
    console.log('[OFFSCREEN] stopRecording called, recorder state:', recorder?.state);

    // Handle case where recorder doesn't exist
    if (!recorder) {
        console.warn('[OFFSCREEN] No recorder found, returning empty data URL');
        const emptyBlob = new Blob([], { type: 'video/webm' });//No I18N
        return await blobToDataUrl(emptyBlob);
    }

    const currentState = recorder.state;

    // Handle case where recorder is not in 'recording' state
    // Note: 'inactive' state is valid - it means recording has stopped naturally
    if (currentState !== 'recording' && currentState !== 'inactive') {
        console.warn('[OFFSCREEN] Recorder in unexpected state:', currentState);

        // If we have data from a previous recording, use it
        if (data.length > 0) {
            console.log('[OFFSCREEN] Found existing data, creating blob from it');
            const blob = new Blob(data, { type: 'video/webm' });//No I18N
            data = [];

            // Stop all tracks to release the camera/tab capture
            if (recorder.stream) {
                recorder.stream.getTracks().forEach(t => t.stop());
            }

            return await blobToDataUrl(blob);
        }

        // If recorder is in unexpected state and no data, return empty data URL
        console.warn('[OFFSCREEN] No data available, returning empty data URL');
        const emptyBlob = new Blob([], { type: 'video/webm' });//No I18N
        return await blobToDataUrl(emptyBlob);
    }

    // If recorder is already inactive but we have data, use it directly
    if (currentState === 'inactive') {
        console.log('[OFFSCREEN] Recorder already inactive, using existing data');
        if (data.length > 0) {
            const blob = new Blob(data, { type: 'video/webm' });//No I18N
            data = [];

            // Stop all tracks to release the camera/tab capture
            if (recorder.stream) {
                recorder.stream.getTracks().forEach(t => t.stop());
            }

            return await blobToDataUrl(blob);
        } else {
            console.warn('[OFFSCREEN] Recorder inactive but no data available');
            const emptyBlob = new Blob([], { type: 'video/webm' });//No I18N
            return await blobToDataUrl(emptyBlob);
        }
    }

    // Normal case: recorder is recording, stop it properly
    console.log('[OFFSCREEN] Stopping active recorder');
    return new Promise((resolve, reject) => {
        recorder.onstop = async () => {
            console.log('[OFFSCREEN] Recorder stopped, creating blob from data');
            const blob = new Blob(data, { type: 'video/webm' });//No I18N
            data = [];

            // Stop all tracks to release the camera/tab capture
            if (recorder.stream) {
                recorder.stream.getTracks().forEach(t => t.stop());
            }

            try {
                const dataUrl = await blobToDataUrl(blob);
                console.log('[OFFSCREEN] Data URL created, length:', dataUrl.length);
                resolve(dataUrl);
            } catch (error) {
                console.error('[OFFSCREEN] Failed to convert blob to data URL:', error);
                reject(error);
            }
        };
        recorder.stop();
    });
}
