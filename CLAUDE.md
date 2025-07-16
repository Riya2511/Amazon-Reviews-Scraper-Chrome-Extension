# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## IMPORTANT: Working Guidelines

**READ YOUR-GUIDELINES.md FIRST** - This file contains critical working principles that must be followed for all tasks:
- Be Conservative, Conscientious, and Fearful of Failure
- Never proceed without explicit permission
- Use CURRENT-TASK.md for task tracking
- Follow conservative file reading strategy
- Include human testing checkpoints
- Maintain project hygiene with Testing_And_Archived_Screenshots/ directory

Commit once after completing each task list—only one commit per update.

## Project Overview

This repository contains Chrome extensions for Amazon product review scraping. There are two main extension implementations:

- **AmzChrome/**: "AMZ Competitive Intelligence" - Main extension for scraping Amazon reviews
- **ChromeExtension/**: "EcomPulse Amazon Toolkit" - Alternative implementation with same core functionality

Both extensions extract Amazon product reviews and export them to CSV format for analysis.

## Development Commands

Since this is a Chrome extension project, there are no traditional build/test commands. Development workflow involves:

### Loading Extension for Testing
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked" and select either `AmzChrome/` or `ChromeExtension/` directory
4. The extension will appear in Chrome's extension bar

### Testing the Extension
1. Navigate to any Amazon product page (e.g., `https://amazon.com/dp/ASIN123456`)
2. Click the extension icon in the browser toolbar
3. Click "Share URL & Cookies" button to start review scraping
4. Reviews will be saved as CSV files to the Downloads folder

### Extension Permissions
Both extensions require these Chrome permissions:
- `activeTab`: Access current tab URL
- `cookies`: Read tab cookies
- `tabs`: Query active tabs
- `scripting`: Inject content scripts for scraping
- `downloads`: Save CSV files to Downloads folder
- `<all_urls>`: Access any website (required for Amazon domains)

## Code Architecture

### Core Components

**Manifest (manifest.json)**
- Defines extension metadata, permissions, and entry points
- Specifies Manifest V3 format
- Configures popup and background script

**Popup Interface (popup.html + popup.js)**
- Provides user interface with single action button
- Handles Amazon URL validation and ASIN extraction
- Manages status messages and user feedback
- Coordinates between content script injection and background downloads

**Background Script (background.js)**
- Service worker that handles file downloads via Chrome Downloads API
- Listens for download requests from popup script
- Manages asynchronous file saving operations

**Content Script Injection (scrapeReviews function in popup.js)**
- Dynamically injected into Amazon pages via `chrome.scripting.executeScript`
- Fetches Amazon review pages and parses DOM for review data
- Extracts comprehensive review metadata (author, rating, date, text, etc.)
- Sends scraped data back to popup for CSV conversion and download

### Data Flow

1. User clicks extension button on Amazon product page
2. Popup validates Amazon URL and extracts ASIN (Amazon product ID)
3. Popup injects content script into current tab
4. Content script fetches and parses Amazon reviews page
5. Parsed review data sent back to popup via `chrome.runtime.sendMessage`
6. Popup converts data to CSV format with proper escaping
7. Popup sends download request to background script
8. Background script saves CSV file to Downloads folder

### Key Technical Details

**ASIN Extraction**: Uses regex `/\/dp\/([A-Z0-9]{10})/` to find Amazon product identifiers

**Review Parsing**: Uses specific DOM selectors like `[data-hook="review"]` to extract Amazon's review structure

**CSV Export**: Includes comprehensive fields: product_url, asin, product_name, reviewer_name, reviewer_profile_link, review_title, review_star_rating, review_date, review_product_variation, actual_review

**Error Handling**: Comprehensive status reporting for URL validation, scraping progress, and download completion

### File Structure Differences

- **AmzChrome/**: Simpler implementation focused on core functionality
- **ChromeExtension/**: Includes logo assets and enhanced branding

Both implementations share identical core functionality and architecture patterns.