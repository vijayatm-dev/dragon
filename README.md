# Dragon - Detailed Report Analysis Generator - ON!

A comprehensive Chrome extension that captures screen recordings, console logs, network activity, and user actions for QA and testing purposes.

## Features

- 🎥 **Screen Recording**: Capture video of your browser tab
- 📸 **Screenshots**: Take instant screenshots with diagnostics
- 📝 **Console Logs**: Record all console output (filtered to exclude extension logs)
- 🌐 **Network Activity**: Capture XHR/Fetch requests and responses
- 🖱️ **User Actions**: Track clicks, inputs, and navigation
- 📊 **Environment Info**: Collect browser and application details
- 📄 **HTML Reports**: Generate self-contained HTML reports with embedded video

## Browser Support

- ✅ **Google Chrome**: Version 116+ (Manifest V3)

> **Note**: A separate Firefox build is available in the `firefox-build` folder.

## Installation

1. Clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked"
5. Select the `dragon` directory
6. The extension should now appear in your toolbar

## Usage

1. Click the Dragon extension icon in your toolbar
2. Choose an action:
   - **Take Screenshot**: Instantly capture a screenshot with diagnostics
   - **Start Recording**: Begin recording video, console, network, and actions
   - **Stop Recording**: Stop recording and download an HTML report

## Development

### File Structure

```
dragon/
├── manifest.json              # Chrome manifest
├── background.js              # Background service worker
├── content.js                 # Content script for action recording
├── popup.html/css/js          # Extension popup UI
├── offscreen.html/js          # Offscreen document for recording
└── modules/
    ├── dragon_controller.js   # Main controller logic
    ├── report_generator.js    # HTML report generator
    └── report_template.html   # Report HTML template
```

### Technical Details

- Uses Chrome's offscreen documents for screen recording
- Service worker background script for Manifest V3
- Chrome DevTools Protocol for console and network capture
- Fully self-contained HTML reports with embedded video recordings

## License

[Your License Here]

## Contributing

Contributions are welcome!
