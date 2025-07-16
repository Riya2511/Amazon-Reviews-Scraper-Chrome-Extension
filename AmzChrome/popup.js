// Function to show status messages (moved outside for global access)
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status status-${type}`;
  
  // Auto-clear status after 3 seconds for success messages
  if (type === 'success') {
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, 3000);
  }
}

document.addEventListener('DOMContentLoaded', () => {
    const extractBtn = document.getElementById('extractBtn');
    const headerLink = document.getElementById('headerLink');
    
    // Header click to open website
    headerLink.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://www.Ecompulse.ai' });
    });

    extractBtn.addEventListener('click', async () => {
      try {
        extractBtn.disabled = true;
        showStatus('Getting current tab...', 'info');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab.url;
        
        // Check if URL contains amazon
        if (!url.includes('amazon.com')) {
          showStatus('Please navigate to an Amazon reviews page', 'warning');
          extractBtn.disabled = false;
          return;
        }
        
        let asin, reviewsUrl;
        
        // Check if already on reviews page
        if (url.includes('/product-reviews/')) {
          const asinMatch = url.match(/\/product-reviews\/([A-Z0-9]{10})/);
          if (asinMatch) {
            asin = asinMatch[1];
            reviewsUrl = url; // Use current URL as starting point
          } else {
            showStatus('Could not find product ASIN in reviews URL', 'error');
            extractBtn.disabled = false;
            return;
          }
        } else {
          // Extract ASIN from product page URL
          const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
          if (!asinMatch) {
            showStatus('Could not find product ASIN in URL', 'error');
            extractBtn.disabled = false;
            return;
          }
          
          asin = asinMatch[1];
          // Construct the reviews URL
          reviewsUrl = `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews`;
        }
        
        showStatus('Starting multi-page scraping...', 'info');
        
        // Use comprehensive multi-page scraping
        console.log('[SCRAPER] Using comprehensive multi-page scraping approach...');
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: performMultiPageScraping,
          args: [asin, 2] // maxPages = 2
        }, (results) => {
          if (chrome.runtime.lastError) {
            console.error('[SCRAPER] ❌ Script injection error:', chrome.runtime.lastError);
            showStatus('Failed to inject scraping script', 'error');
            extractBtn.disabled = false;
          } else {
            console.log('[SCRAPER] ✅ Multi-page scraping script injected successfully');
            
            // Listen for results
            chrome.runtime.onMessage.addListener(function resultListener(request) {
              if (request.action === 'all_pages_complete') {
                console.log(`[SCRAPER] 🎉 Received all ${request.totalReviews} reviews from ${request.pagesScraped} pages`);
                
                const scrapedData = {
                  metadata: {
                    asin: asin,
                    originalUrl: reviewsUrl,
                    reviewsUrl: reviewsUrl,
                    scrapeDate: new Date().toISOString(),
                    totalReviews: request.allReviews.length,
                    pagesScraped: request.pagesScraped,
                    productName: request.productName
                  },
                  reviews: request.allReviews
                };
                
                showStatus(`${request.totalReviews} reviews from ${request.pagesScraped} pages saved to Downloads!`, 'success');
                saveToDownloads(scrapedData, asin);
                extractBtn.disabled = false;
                chrome.runtime.onMessage.removeListener(resultListener);
              } else if (request.action === 'page_update') {
                showStatus(request.message, 'info');
              } else if (request.action === 'scraping_failed') {
                console.error('[SCRAPER] ❌ Scraping failed:', request.message);
                showStatus(request.message || 'Scraping failed', 'error');
                extractBtn.disabled = false;
                chrome.runtime.onMessage.removeListener(resultListener);
              }
            });
          }
        });
        
      } catch (error) {
        console.error('Error:', error);
        showStatus('An error occurred', 'error');
        extractBtn.disabled = false;
      }
    });
  });

  function saveToDownloads(data, asin) {
    // Customizable download path - you can change this
    const downloadPath = `amazon-reviews/`; // Change this path as needed
    
    // Create filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${downloadPath}amazon-reviews-${asin}-${timestamp}.csv`;
    
    // Convert data to CSV string
    const csvString = convertToCSV(data);
    
    // Create blob and download
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    
    // Use Chrome downloads API
    chrome.runtime.sendMessage({
      action: 'download',
      url: url,
      filename: filename,
      data: data
    }, (response) => {
      if (response && response.success) {
        console.log(`Reviews saved to Downloads/${filename}`);
        console.log(`📁 File location: ${response.filename}`);
      } else {
        console.error('Failed to save file:', response?.error || 'Unknown error');
      }
    });
  }
  
  function convertToCSV(data) {
    // CSV Headers
    const headers = [
      'product_url',
      'asin',
      'product_name',
      'page_number',
      'reviewer_name',
      'reviewer_profile_link',
      'review_title',
      'review_star_rating',
      'review_date',
      'review_product_variation',
      'actual_review'
    ];
    
    // Helper function to escape CSV values
    function escapeCSV(value) {
      if (value === null || value === undefined) return '';
      const str = String(value);
      // If value contains comma, newline, or quote, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    }
    
    // Create CSV rows
    const rows = [headers.join(',')];
    
    data.reviews.forEach(review => {
      const row = [
        escapeCSV(data.metadata.originalUrl),
        escapeCSV(data.metadata.asin),
        escapeCSV(data.metadata.productName || 'N/A'),
        escapeCSV(review.page || 1),
        escapeCSV(review.author),
        escapeCSV(review.authorProfileLink),
        escapeCSV(review.title),
        escapeCSV(review.rating),
        escapeCSV(review.date),
        escapeCSV(review.productVariation || 'N/A'),
        escapeCSV(review.text)
      ];
      rows.push(row.join(','));
    });
    
    return rows.join('\n');
  }
  
  // Multi-page scraping controller
  async function startMultiPageScraping(tab, asin, baseUrl) {
    const extractBtn = document.getElementById('extractBtn');
    const maxPages = 2;
    let allReviews = [];
    let productName = '';
    let currentPageNumber = 1;
    const DELAY_BETWEEN_PAGES = 3000; // 3 seconds between page requests
    
    console.log(`[SCRAPER] Starting multi-page scraping for ASIN: ${asin}`);
    console.log(`[SCRAPER] Base URL: ${baseUrl}`);
    
    // Message listener for scraping results
    const messageListener = (request, sender, sendResponse) => {
      if (request.action === 'page_scraped') {
        console.log(`[SCRAPER] ✅ Received ${request.reviews.length} reviews from page ${request.pageNumber}`);
        console.log(`[SCRAPER] Review IDs from page ${request.pageNumber}:`, request.reviews.map(r => `Review ${r.index}: ${r.title.substring(0, 30)}...`));
        
        // Store reviews from this page
        allReviews = allReviews.concat(request.reviews);
        if (!productName && request.productName) {
          productName = request.productName;
        }
        
        console.log(`[SCRAPER] Total reviews collected so far: ${allReviews.length}`);
        currentPageNumber = request.pageNumber;
        
        // Check if we need to scrape more pages
        if (request.pageNumber < maxPages && request.hasNextPage) {
          // Use DOM-based navigation instead of URL navigation
          console.log(`[SCRAPER] 🔄 Attempting to navigate to page ${request.pageNumber + 1} using DOM...`);
          showStatus(`Navigating to page ${request.pageNumber + 1}...`, 'info');
          
          // Inject navigation script to click next page button
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: navigateToNextPage,
            args: [request.pageNumber + 1]
          }, (results) => {
            if (chrome.runtime.lastError) {
              console.error('[SCRAPER] ❌ Navigation script injection error:', chrome.runtime.lastError);
              finishScraping();
            } else {
              console.log('[SCRAPER] ✅ Navigation script injected, waiting for page to load...');
              // Wait for the page to load and then scrape
              setTimeout(() => {
                console.log(`[SCRAPER] 💉 Injecting scraping script for page ${request.pageNumber + 1}`);
                showStatus(`Scraping page ${request.pageNumber + 1}...`, 'info');
                
                chrome.scripting.executeScript({
                  target: { tabId: tab.id },
                  func: scrapeSinglePage,
                  args: [asin, request.pageNumber + 1]
                }, (results) => {
                  if (chrome.runtime.lastError) {
                    console.error('[SCRAPER] ❌ Script injection error:', chrome.runtime.lastError);
                    finishScraping();
                  } else {
                    console.log('[SCRAPER] ✅ Script injected successfully for page', request.pageNumber + 1);
                  }
                });
              }, DELAY_BETWEEN_PAGES); // Wait for content to load
            }
          });
        } else {
          finishScraping();
        }
      } else if (request.action === 'scraping_error') {
        console.error('[SCRAPER] ❌ Scraping error:', request.message);
        showStatus(request.message, 'error');
        chrome.runtime.onMessage.removeListener(messageListener);
        extractBtn.disabled = false;
      } else if (request.action === 'navigation_failed') {
        console.error('[SCRAPER] ❌ Navigation failed:', request.message);
        console.log('[SCRAPER] Finishing with current results...');
        finishScraping();
      }
    };
    
    function finishScraping() {
      // All pages scraped or navigation failed - prepare final data
      console.log(`[SCRAPER] 🎉 Scraping complete! Pages scraped: ${currentPageNumber}`);
      console.log(`[SCRAPER] Total unique reviews: ${allReviews.length}`);
      chrome.runtime.onMessage.removeListener(messageListener);
      
      const scrapedData = {
        metadata: {
          asin: asin,
          originalUrl: baseUrl,
          reviewsUrl: baseUrl,
          scrapeDate: new Date().toISOString(),
          totalReviews: allReviews.length,
          pagesScraped: currentPageNumber,
          productName: productName
        },
        reviews: allReviews
      };
      
      console.log(`[SCRAPER] 💾 Saving ${allReviews.length} reviews to CSV...`);
      showStatus(`${allReviews.length} reviews from ${currentPageNumber} pages saved to Downloads!`, 'success');
      saveToDownloads(scrapedData, asin);
      extractBtn.disabled = false;
    }
    
    chrome.runtime.onMessage.addListener(messageListener);
    
    // Check if we should navigate to page 1 first
    chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const pageIndicator = document.querySelector('.a-pagination .a-selected');
        return pageIndicator ? parseInt(pageIndicator.textContent) : 1;
      }
    }, (results) => {
      const currentPage = results && results[0] && results[0].result ? results[0].result : 1;
      
      if (currentPage !== 1) {
        console.log('[SCRAPER] Currently on page ' + currentPage + ', navigating to page 1 first...');
        showStatus('Navigating to page 1...', 'info');
        
        // Navigate to page 1 first
        const page1Url = buildPageUrl(asin, 1);
        chrome.tabs.update(tab.id, { url: page1Url }, () => {
          // Wait for page to load
          setTimeout(() => {
            startScrapingFromPage1();
          }, 3000);
        });
      } else {
        startScrapingFromPage1();
      }
    });
    
    function startScrapingFromPage1() {
      // Start by scraping current page (page 1)
      console.log('[SCRAPER] 🚀 Starting with page 1...');
      showStatus('Scraping page 1...', 'info');
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: scrapeSinglePage,
        args: [asin, 1]
      }, (results) => {
        if (chrome.runtime.lastError) {
          console.error('[SCRAPER] ❌ Script injection error:', chrome.runtime.lastError);
          showStatus('Failed to inject scraping script', 'error');
          extractBtn.disabled = false;
          chrome.runtime.onMessage.removeListener(messageListener);
        } else {
          console.log('[SCRAPER] ✅ Script injected successfully for page 1');
        }
      });
    }
  }
  
  // Function to build page URL
  function buildPageUrl(asin, pageNumber) {
    if (pageNumber === 1) {
      return `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews`;
    } else {
      return `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_arp_d_paging_btm_next_${pageNumber}?ie=UTF8&reviewerType=all_reviews&pageNumber=${pageNumber}`;
    }
  }
  
  // This function will be injected into the current tab to scrape a single page
  function scrapeSinglePage(asin, pageNumber) {
    console.log(`[CONTENT] 🔍 Starting to scrape page ${pageNumber} for ASIN: ${asin}`);
    console.log(`[CONTENT] Current URL: ${window.location.href}`);
    
    try {
      // Extract product name
      let productName = '';
      if (pageNumber === 1) {
        const productNameElement = document.querySelector('#cm_cr_dp_d_product_info h1 a') || 
                                   document.querySelector('#cm_cr_dp_d_product_info h1') ||
                                   document.querySelector('[data-hook="product-link"]');
        productName = productNameElement?.textContent?.trim() || 'Product Name Not Found';
        console.log(`[CONTENT] Product name: ${productName}`);
      }
      
      // Find all review elements
      const reviewElements = document.querySelectorAll('[data-hook="review"]');
      console.log(`[CONTENT] Found ${reviewElements.length} review elements on page ${pageNumber}`);
      
      // Check page indicators and actual page number
      const pageIndicator = document.querySelector('.a-pagination .a-selected');
      const actualPageNumber = pageIndicator ? parseInt(pageIndicator.textContent) : pageNumber;
      if (pageIndicator) {
        console.log(`[CONTENT] Page indicator shows: ${pageIndicator.textContent}`);
        if (actualPageNumber !== pageNumber) {
          console.warn(`[CONTENT] ⚠️ Expected page ${pageNumber} but actually on page ${actualPageNumber}`);
        }
      }
      
      // Check if there's a next page button
      const nextPageButton = document.querySelector('li.a-last:not(.a-disabled) a') || 
                            document.querySelector('.a-pagination .a-last:not(.a-disabled)');
      const hasNextPage = !!nextPageButton;
      console.log(`[CONTENT] Has next page: ${hasNextPage}`);
      
      const reviews = [];
      const reviewIds = new Set();
      
      reviewElements.forEach((reviewElement, index) => {
        try {
          // Extract review ID to check for duplicates
          const reviewId = reviewElement.getAttribute('id') || reviewElement.getAttribute('data-hook');
          
          // Extract review data
          const titleElement = reviewElement.querySelector('[data-hook="review-title"] span:not([class])') || 
                              reviewElement.querySelector('[data-hook="review-title"]');
          const ratingElement = reviewElement.querySelector('[data-hook="review-star-rating"] span') ||
                               reviewElement.querySelector('[data-hook="review-star-rating"]');
          
          const authorLinkElement = reviewElement.querySelector('div:nth-child(3) > a');
          const authorNameElement = reviewElement.querySelector('div:nth-child(3) > a > div.a-profile-content > span');
          
          const dateElement = reviewElement.querySelector('[data-hook="review-date"]');
          const textElement = reviewElement.querySelector('[data-hook="review-body"] span') ||
                             reviewElement.querySelector('[data-hook="review-body"]');
          const helpfulElement = reviewElement.querySelector('[data-hook="helpful-vote-statement"]');
          const verifiedElement = reviewElement.querySelector('[data-hook="avp-badge"]');
          const variationElement = reviewElement.querySelector('[data-hook="format-strip"]') ||
                                  reviewElement.querySelector('[data-hook="review-format-strip"]');
          
          const reviewData = {
            id: reviewId,
            index: (actualPageNumber - 1) * 10 + index + 1,
            page: actualPageNumber,
            title: titleElement?.textContent?.trim() || 'N/A',
            rating: ratingElement?.textContent?.trim() || 'N/A',
            author: authorNameElement?.textContent?.trim() || 'N/A',
            authorProfileLink: authorLinkElement?.href || 'N/A',
            date: dateElement?.textContent?.trim() || 'N/A',
            text: textElement?.textContent?.trim() || 'N/A',
            helpful: helpfulElement?.textContent?.trim() || 'N/A',
            verified: verifiedElement ? 'Verified Purchase' : 'Not Verified',
            productVariation: variationElement?.textContent?.trim() || 'N/A'
          };
          
          console.log(`[CONTENT] Review ${index + 1}: "${reviewData.title.substring(0, 40)}..." by ${reviewData.author}`);
          reviews.push(reviewData);
          
          if (reviewId) {
            reviewIds.add(reviewId);
          }
          
        } catch (error) {
          console.error(`[CONTENT] Error parsing review ${index + 1}:`, error);
        }
      });
      
      console.log(`[CONTENT] ✅ Successfully scraped ${reviews.length} reviews from page ${actualPageNumber}`);
      console.log(`[CONTENT] Unique review IDs: ${reviewIds.size}`);
      console.log(`[CONTENT] Sending results back to popup...`);
      
      // Send results back to popup
      chrome.runtime.sendMessage({
        action: 'page_scraped',
        pageNumber: actualPageNumber,
        reviews: reviews,
        productName: productName,
        asin: asin,
        hasNextPage: hasNextPage
      });
      
    } catch (error) {
      console.error('[CONTENT] ❌ Error scraping page:', error);
      chrome.runtime.sendMessage({
        action: 'scraping_error',
        message: error.message
      });
    }
  }
  
  // Function to navigate to next page using DOM interaction
  function navigateToNextPage(targetPageNumber) {
    console.log(`[NAV] Attempting to navigate to page ${targetPageNumber}`);
    
    try {
      // Method 1: Try to find and click the "Next" button
      const nextButton = document.querySelector('li.a-last:not(.a-disabled) a');
      if (nextButton) {
        console.log('[NAV] Found Next button, clicking...');
        nextButton.click();
        return;
      }
      
      // Method 2: Try to find and click the specific page number
      const pageLinks = document.querySelectorAll('.a-pagination li:not(.a-selected) a');
      for (const link of pageLinks) {
        if (link.textContent.trim() === String(targetPageNumber)) {
          console.log(`[NAV] Found page ${targetPageNumber} link, clicking...`);
          link.click();
          return;
        }
      }
      
      // Method 3: Try using the pagination form if available
      const paginationForm = document.querySelector('form[action*="product-reviews"]');
      if (paginationForm) {
        const pageInput = paginationForm.querySelector('input[name="pageNumber"]');
        if (pageInput) {
          console.log(`[NAV] Found pagination form, setting page to ${targetPageNumber}`);
          pageInput.value = targetPageNumber;
          paginationForm.submit();
          return;
        }
      }
      
      // If all methods fail, send error
      console.error('[NAV] Could not find any pagination controls');
      chrome.runtime.sendMessage({
        action: 'navigation_failed',
        message: 'No pagination controls found'
      });
      
    } catch (error) {
      console.error('[NAV] Navigation error:', error);
      chrome.runtime.sendMessage({
        action: 'navigation_failed',
        message: error.message
      });
    }
  }
  
  // Comprehensive multi-page scraping function that runs entirely in content script
  function performMultiPageScraping(asin, maxPages) {
    console.log(`[MULTI-PAGE] Starting comprehensive multi-page scraping for ASIN: ${asin}`);
    
    let allReviews = [];
    let productName = '';
    let currentPage = 1;
    let reviewIdsSeen = new Set();
    
    // Helper function to wait for condition
    function waitForCondition(condition, timeout = 10000) {
      return new Promise((resolve, reject) => {
        const startTime = Date.now();
        const checkInterval = setInterval(() => {
          if (condition()) {
            clearInterval(checkInterval);
            resolve();
          } else if (Date.now() - startTime > timeout) {
            clearInterval(checkInterval);
            reject(new Error('Timeout waiting for condition'));
          }
        }, 100);
      });
    }
    
    // Helper function to scrape current page
    function scrapeCurrentPage() {
      console.log(`[MULTI-PAGE] Scraping page ${currentPage}...`);
      
      // Get product name on first page
      if (currentPage === 1) {
        const productNameElement = document.querySelector('#cm_cr_dp_d_product_info h1 a') || 
                                   document.querySelector('#cm_cr_dp_d_product_info h1') ||
                                   document.querySelector('[data-hook="product-link"]');
        productName = productNameElement?.textContent?.trim() || 'Product Name Not Found';
      }
      
      // Get all reviews
      const reviewElements = document.querySelectorAll('[data-hook="review"]');
      console.log(`[MULTI-PAGE] Found ${reviewElements.length} reviews on page ${currentPage}`);
      
      const pageReviews = [];
      reviewElements.forEach((reviewElement, index) => {
        try {
          const reviewId = reviewElement.getAttribute('id') || `review-${currentPage}-${index}`;
          
          // Skip if we've seen this review before
          if (reviewIdsSeen.has(reviewId)) {
            console.log(`[MULTI-PAGE] Skipping duplicate review: ${reviewId}`);
            return;
          }
          
          reviewIdsSeen.add(reviewId);
          
          const titleElement = reviewElement.querySelector('[data-hook="review-title"] span:not([class])') || 
                              reviewElement.querySelector('[data-hook="review-title"]');
          const textElement = reviewElement.querySelector('[data-hook="review-body"] span') ||
                             reviewElement.querySelector('[data-hook="review-body"]');
          const authorElement = reviewElement.querySelector('.a-profile-name');
          const authorLinkElement = reviewElement.querySelector('a.a-profile') || 
                                   reviewElement.querySelector('div.a-profile-content')?.closest('a');
          const ratingElement = reviewElement.querySelector('[data-hook="review-star-rating"] span') ||
                               reviewElement.querySelector('[data-hook="review-star-rating"]');
          const dateElement = reviewElement.querySelector('[data-hook="review-date"]');
          const verifiedElement = reviewElement.querySelector('[data-hook="avp-badge"]');
          const variationElement = reviewElement.querySelector('[data-hook="format-strip"]') ||
                                  reviewElement.querySelector('.review-format-strip');
          const helpfulElement = reviewElement.querySelector('[data-hook="helpful-vote-statement"]');
          
          const review = {
            id: reviewId,
            index: allReviews.length + pageReviews.length + 1,
            page: currentPage,
            title: titleElement?.textContent?.trim() || 'N/A',
            text: textElement?.textContent?.trim() || 'N/A',
            author: authorElement?.textContent?.trim() || 'N/A',
            authorProfileLink: authorLinkElement?.href || 'N/A',
            rating: ratingElement?.textContent?.trim() || 'N/A',
            date: dateElement?.textContent?.trim() || 'N/A',
            verified: verifiedElement ? 'Verified Purchase' : 'Not Verified',
            productVariation: variationElement?.textContent?.trim() || 'N/A',
            helpful: helpfulElement?.textContent?.trim() || 'N/A'
          };
          
          console.log(`[MULTI-PAGE] Review ${index + 1}: "${review.title.substring(0, 30)}..." by ${review.author}`);
          pageReviews.push(review);
        } catch (error) {
          console.error(`[MULTI-PAGE] Error parsing review ${index}:`, error);
        }
      });
      
      return pageReviews;
    }
    
    // Helper function to navigate to next page
    async function navigateToNextPageAsync() {
      console.log(`[MULTI-PAGE] Navigating to page ${currentPage + 1}...`);
      
      // Store current review count to detect when new content loads
      const currentReviewCount = document.querySelectorAll('[data-hook="review"]').length;
      
      // Click next button
      const nextButton = document.querySelector('li.a-last:not(.a-disabled) a');
      if (!nextButton) {
        console.log('[MULTI-PAGE] No next button found');
        return false;
      }
      
      nextButton.click();
      chrome.runtime.sendMessage({
        action: 'page_update',
        message: `Navigating to page ${currentPage + 1}...`
      });
      
      // Wait for new content to load
      try {
        await waitForCondition(() => {
          const newReviewCount = document.querySelectorAll('[data-hook="review"]').length;
          const pageIndicator = document.querySelector('.a-pagination .a-selected');
          const currentPageNum = pageIndicator ? parseInt(pageIndicator.textContent) : 0;
          
          // Check if page number changed or content changed
          return currentPageNum === currentPage + 1 || newReviewCount !== currentReviewCount;
        }, 10000);
        
        // Additional wait for content to stabilize
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        currentPage++;
        return true;
      } catch (error) {
        console.error('[MULTI-PAGE] Failed to load next page:', error);
        return false;
      }
    }
    
    // Main scraping loop
    async function performScraping() {
      try {
        // Scrape page 1
        chrome.runtime.sendMessage({
          action: 'page_update',
          message: 'Scraping page 1...'
        });
        
        const page1Reviews = scrapeCurrentPage();
        allReviews = allReviews.concat(page1Reviews);
        console.log(`[MULTI-PAGE] Page 1 complete: ${page1Reviews.length} reviews`);
        
        // Continue to next pages
        while (currentPage < maxPages) {
          const navigated = await navigateToNextPageAsync();
          if (!navigated) {
            console.log('[MULTI-PAGE] Cannot navigate further, stopping');
            break;
          }
          
          chrome.runtime.sendMessage({
            action: 'page_update',
            message: `Scraping page ${currentPage}...`
          });
          
          const pageReviews = scrapeCurrentPage();
          if (pageReviews.length === 0) {
            console.log('[MULTI-PAGE] No reviews found on page, stopping');
            break;
          }
          
          allReviews = allReviews.concat(pageReviews);
          console.log(`[MULTI-PAGE] Page ${currentPage} complete: ${pageReviews.length} reviews, total: ${allReviews.length}`);
        }
        
        // Send all results back
        console.log(`[MULTI-PAGE] Scraping complete! Total reviews: ${allReviews.length}`);
        chrome.runtime.sendMessage({
          action: 'all_pages_complete',
          allReviews: allReviews,
          productName: productName,
          totalReviews: allReviews.length,
          pagesScraped: currentPage,
          asin: asin
        });
        
      } catch (error) {
        console.error('[MULTI-PAGE] Scraping failed:', error);
        chrome.runtime.sendMessage({
          action: 'scraping_failed',
          message: error.message
        });
      }
    }
    
    // Start scraping
    performScraping();
  }