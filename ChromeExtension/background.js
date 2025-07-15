// Background script to handle downloads
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'download') {
      chrome.downloads.download({
        url: request.url,
        filename: request.filename,
        saveAs: false // Set to true if you want to show save dialog
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          console.error('Download error:', chrome.runtime.lastError);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('Download started with ID:', downloadId);
          sendResponse({ success: true, downloadId: downloadId, filename: request.filename });
        }
      });
      
      // Return true to indicate we will respond asynchronously
      return true;
    }
  });