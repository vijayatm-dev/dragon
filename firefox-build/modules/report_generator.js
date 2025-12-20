export class ReportGenerator {
    static async generateReport(videoBlob, logs) {
        try {
            console.log('[ReportGenerator] Starting report generation');
            console.log('[ReportGenerator] Video blob size:', videoBlob?.size, 'bytes');
            console.log('[ReportGenerator] Video blob type:', videoBlob?.type);

            // Read the template
            const templateUrl = browser.runtime.getURL('modules/report_template.html');
            const templateResponse = await fetch(templateUrl);
            let template = await templateResponse.text();

            // Convert video blob to base64 data URL
            console.log('[ReportGenerator] Converting video blob to data URL...');
            const videoDataUrl = await this.blobToDataUrl(videoBlob);
            console.log('[ReportGenerator] Video data URL length:', videoDataUrl?.length);
            console.log('[ReportGenerator] Video data URL prefix:', videoDataUrl?.substring(0, 50));

            // Properly escape the logs data to prevent script injection
            // This is critical because network responses may contain <script> tags
            const logsJson = JSON.stringify(logs)
                .replace(/</g, '\\u003c')  // Escape < to prevent </script> from breaking out
                .replace(/>/g, '\\u003e')  // Escape > for consistency
                .replace(/\u2028/g, '\\u2028')  // Escape line separator
                .replace(/\u2029/g, '\\u2029'); // Escape paragraph separator

            // Replace placeholders
            template = template.replace('{{VIDEO_BASE64}}', videoDataUrl);
            template = template.replace('{{ LOGS_DATA }}', logsJson);

            console.log('[ReportGenerator] Report generated successfully');
            return template;
        } catch (error) {
            console.error('[ReportGenerator] Error generating report:', error);
            throw error;
        }
    }

    static blobToDataUrl(blob) {
        return new Promise((resolve, reject) => {
            if (!blob || blob.size === 0) {
                console.warn('[ReportGenerator] Empty or invalid blob, returning empty data URL');
                resolve('data:video/webm;base64,');//No I18N
                return;
            }

            const reader = new FileReader();
            reader.onloadend = () => {
                console.log('[ReportGenerator] Blob converted to data URL, length:', reader.result?.length);
                resolve(reader.result);
            };
            reader.onerror = (error) => {
                console.error('[ReportGenerator] Error reading blob:', error);
                reject(error);
            };
            reader.readAsDataURL(blob);
        });
    }
}
