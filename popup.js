document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('shareBtn').addEventListener('click', async () => {
      try {
        // Get current tab
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab.url;
        
        // Get domain from URL
        const domain = new URL(url).hostname;
        
        // Get cookies for the domain
        const cookies = await chrome.cookies.getAll({ domain: domain });
        
        // Call the function with URL and cookies
        myScraperFunction(url, cookies);
        
      } catch (error) {
        console.error('Error:', error);
      }
    });
  });
  
  function myScraperFunction(url, cookies) {
    // Log to the popup console (visible in DevTools when inspecting the popup)
    console.log("URL:", url);
    console.log("Cookies:", cookies);
    
    // Also log to the current tab's console
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: (url, cookies) => {
          console.log("URL:", url);
          console.log("Cookies:", cookies);
        },
        args: [url, cookies]
      });
    });
  }