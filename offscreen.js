console.log('[OFFSCREEN] Script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[OFFSCREEN] Message received:', message.type);

    if (message.type === 'START_RECORDING') {
        startRecording(message.streamId)
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

async function startRecording(streamId) {
    if (recorder?.state === 'recording') {
        throw new Error('Called startRecording while already recording.');
    }

    console.log('[OFFSCREEN] Getting media stream with ID:', streamId);

    // Chrome video constraints
    const constraints = {
        audio: false,
        video: {
            mandatory: {
                chromeMediaSource: 'tab',
                chromeMediaSourceId: streamId
            }
        }
    };

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

async function stopRecording() {
    console.log('[OFFSCREEN] stopRecording called, recorder state:', recorder?.state);

    // Handle case where recorder doesn't exist
    if (!recorder) {
        console.warn('[OFFSCREEN] No recorder found, returning empty blob');
        const emptyBlob = new Blob([], { type: 'video/mp4' });//No I18N
        return URL.createObjectURL(emptyBlob);
    }

    const currentState = recorder.state;

    // Handle case where recorder is not in 'recording' state
    // Note: 'inactive' state is valid - it means recording has stopped naturally
    if (currentState !== 'recording' && currentState !== 'inactive') {
        console.warn('[OFFSCREEN] Recorder in unexpected state:', currentState);

        // If we have data from a previous recording, use it
        if (data.length > 0) {
            console.log('[OFFSCREEN] Found existing data, creating blob from it');
            const blob = new Blob(data, { type: 'video/mp4' });//No I18N
            const url = URL.createObjectURL(blob);
            data = [];

            // Stop all tracks to release the camera/tab capture
            if (recorder.stream) {
                recorder.stream.getTracks().forEach(t => t.stop());
            }

            return url;
        }

        // If recorder is in unexpected state and no data, return empty blob
        console.warn('[OFFSCREEN] No data available, returning empty blob');
        const emptyBlob = new Blob([], { type: 'video/mp4' });//No I18N
        return URL.createObjectURL(emptyBlob);
    }

    // If recorder is already inactive but we have data, use it directly
    if (currentState === 'inactive') {
        console.log('[OFFSCREEN] Recorder already inactive, using existing data');
        if (data.length > 0) {
            const blob = new Blob(data, { type: 'video/mp4' });//No I18N
            const url = URL.createObjectURL(blob);
            data = [];

            // Stop all tracks to release the camera/tab capture
            if (recorder.stream) {
                recorder.stream.getTracks().forEach(t => t.stop());
            }

            return url;
        } else {
            console.warn('[OFFSCREEN] Recorder inactive but no data available');
            const emptyBlob = new Blob([], { type: 'video/mp4' });//No I18N
            return URL.createObjectURL(emptyBlob);
        }
    }

    // Normal case: recorder is recording, stop it properly
    console.log('[OFFSCREEN] Stopping active recorder');
    return new Promise((resolve) => {
        recorder.onstop = () => {
            console.log('[OFFSCREEN] Recorder stopped, creating blob from data');
            const blob = new Blob(data, { type: 'video/mp4' });//No I18N
            data = [];

            // Stop all tracks to release the camera/tab capture
            if (recorder.stream) {
                recorder.stream.getTracks().forEach(t => t.stop());
            }

            const url = URL.createObjectURL(blob);
            console.log('[OFFSCREEN] Blob URL created:', url);
            resolve(url);
        };
        recorder.stop();
    });
}
