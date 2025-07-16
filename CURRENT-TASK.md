# CURRENT TASK: Implement Browser Tab Navigation for Multi-Page Scraping

## Problem Confirmed:
- Extension is scraping the same page twice (reviews 11-20 are identical to 1-10)
- Background fetch() requests aren't working with Amazon
- Need to actually navigate the browser tab to get different pages

## New Approach: Browser Tab Navigation

### Implementation Plan:
1. **Scrape current page** (page 1)
2. **Navigate browser tab to page 2** using chrome.tabs API
3. **Wait for page 2 to load**
4. **Scrape page 2**
5. **Combine results and download CSV**

### Technical Details:
- Use `chrome.tabs.update()` to navigate to page 2
- Use `chrome.tabs.onUpdated` listener to detect when page loads
- Re-inject scraping script after navigation
- Show user status: "Navigating to page 2..."

### ✅ Implementation Complete
- [x] Remove fetch-based scraping approach
- [x] Implement chrome.tabs navigation
- [x] Add page load detection
- [x] Update status messages for navigation
- [x] Complete rewrite to use browser tab navigation

### How It Works Now:
1. **Page 1**: Scrapes current page directly from DOM
2. **Navigate**: Uses `chrome.tabs.update()` to go to page 2
3. **Wait**: Detects page load with `chrome.tabs.onUpdated`
4. **Page 2**: Injects script again to scrape new page
5. **Combine**: Collects all reviews and downloads CSV

### Benefits:
- ✅ Will definitely get different page content
- ✅ Uses real browser session with cookies
- ✅ Amazon sees normal user navigation
- ✅ More reliable than background requests

### User Experience:
- User will see their browser navigate to page 2
- Clear status messages about what's happening
- All reviews collected in single CSV at the end