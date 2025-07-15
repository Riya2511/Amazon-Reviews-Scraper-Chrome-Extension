document.addEventListener('DOMContentLoaded', () => {
    const shareBtn = document.getElementById('shareBtn');
    const statusDiv = document.getElementById('status');
    
    // Function to show status messages
    function showStatus(message, type = 'info') {
      statusDiv.textContent = message;
      statusDiv.className = `status-${type}`;
      
      // Auto-clear status after 3 seconds for success messages
      if (type === 'success') {
        setTimeout(() => {
          statusDiv.textContent = '';
          statusDiv.className = '';
        }, 3000);
      }
    }
    
    shareBtn.addEventListener('click', async () => {
      try {
        shareBtn.disabled = true;
        showStatus('Getting current tab...', 'info');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab.url;
        
        // Check if URL contains amazon
        if (!url.includes('amazon.com')) {
          showStatus('Please navigate to an Amazon product page', 'warning');
          shareBtn.disabled = false;
          return;
        }
        
        // Extract ASIN from the URL
        const asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/);
        if (!asinMatch) {
          showStatus('Could not find product ASIN in URL', 'error');
          shareBtn.disabled = false;
          return;
        }
        
        const asin = asinMatch[1];
        showStatus('Scraping reviews...', 'info');
        
        // Construct the reviews URL
        const reviewsUrl = `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews`;
        
        // Inject content script to handle the scraping
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrapeReviews,
          args: [reviewsUrl, asin, url]
        }, (results) => {
          if (chrome.runtime.lastError) {
            showStatus('Script injection failed', 'error');
            shareBtn.disabled = false;
            return;
          }
          
          // Listen for messages from the content script
          chrome.runtime.onMessage.addListener(function messageListener(request, sender, sendResponse) {
            if (request.action === 'scraping_status') {
              showStatus(request.message, request.type);
              
              if (request.type === 'success' || request.type === 'error') {
                shareBtn.disabled = false;
                // Remove this listener after receiving final status
                chrome.runtime.onMessage.removeListener(messageListener);
              }
              
              // Handle download request
              if (request.data && request.asin) {
                saveToDownloads(request.data, request.asin);
              }
            }
          });
        });
        
      } catch (error) {
        console.error('Error:', error);
        showStatus('An error occurred', 'error');
        shareBtn.disabled = false;
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
        console.log(`✅ Reviews saved to Downloads/${filename}`);
        console.log(`📁 File location: ${response.filename}`);
      } else {
        console.error('❌ Failed to save file:', response?.error || 'Unknown error');
      }
    });
  }
  
  function convertToCSV(data) {
    // CSV Headers
    const headers = [
      'product_url',
      'asin',
      'product_name',
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
  
  // This function will be injected into the current tab
  function scrapeReviews(reviewsUrl, asin, originalUrl) {
    console.log("Starting review scraping...");
    console.log("ASIN:", asin);
    console.log("Reviews URL:", reviewsUrl);
    
    // Function to send status updates to popup
    function sendStatus(message, type, data = null) {
      chrome.runtime.sendMessage({
        action: 'scraping_status',
        message: message,
        type: type,
        data: data,
        asin: asin
      });
    }
    
    sendStatus('Fetching reviews page...', 'info');
    
    // Navigate to reviews page and scrape
    fetch(reviewsUrl)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.text();
      })
      .then(htmlContent => {
        console.log("Reviews page fetched successfully");
        sendStatus('Parsing reviews...', 'info');
        
        // Parse the HTML content to extract reviews
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, 'text/html');
        
        // Extract product name from the page
        const productNameElement = doc.querySelector('#cm_cr_dp_d_product_info h1 a') || 
                                   doc.querySelector('#cm_cr_dp_d_product_info h1') ||
                                   doc.querySelector('[data-hook="product-link"]');
        const productName = productNameElement?.textContent?.trim() || 'Product Name Not Found';
        
        // Find all review elements
        const reviewElements = doc.querySelectorAll('[data-hook="review"]');
        
        if (reviewElements.length === 0) {
          console.log("No reviews found on the page");
          sendStatus('No reviews found on page', 'warning');
          return;
        }
        
        console.log(`Found ${reviewElements.length} reviews`);
        sendStatus(`Processing ${reviewElements.length} reviews...`, 'info');
        
        const reviews = [];
        
        reviewElements.forEach((reviewElement, index) => {
          try {
            // Extract review data with improved selectors
            const titleElement = reviewElement.querySelector('[data-hook="review-title"] span:not([class])') || 
                                reviewElement.querySelector('[data-hook="review-title"]');
            const ratingElement = reviewElement.querySelector('[data-hook="review-star-rating"] span') ||
                                 reviewElement.querySelector('[data-hook="review-star-rating"]');
            
            // Extract author name and profile link using the specified selectors
            const authorLinkElement = reviewElement.querySelector('div:nth-child(3) > a');
            const authorNameElement = reviewElement.querySelector('div:nth-child(3) > a > div.a-profile-content > span');
            
            const dateElement = reviewElement.querySelector('[data-hook="review-date"]');
            const textElement = reviewElement.querySelector('[data-hook="review-body"] span') ||
                               reviewElement.querySelector('[data-hook="review-body"]');
            const helpfulElement = reviewElement.querySelector('[data-hook="helpful-vote-statement"]');
            const verifiedElement = reviewElement.querySelector('[data-hook="avp-badge"]');
            
            // Extract product variation (size, color, etc.)
            const variationElement = reviewElement.querySelector('[data-hook="format-strip"]') ||
                                    reviewElement.querySelector('[data-hook="review-format-strip"]');
            
            const reviewData = {
              index: index + 1,
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
            
            reviews.push(reviewData);
            
          } catch (error) {
            console.error(`Error parsing review ${index + 1}:`, error);
          }
        });
        
        // Create comprehensive data object
        const scrapedData = {
          metadata: {
            asin: asin,
            originalUrl: originalUrl,
            reviewsUrl: reviewsUrl,
            scrapeDate: new Date().toISOString(),
            totalReviews: reviews.length,
            productName: productName
          },
          reviews: reviews
        };
        
        // Log all reviews data to current tab console
        console.log("All Reviews Data:", scrapedData);
        
        // Display summary
        console.log(`\n=== REVIEWS SUMMARY ===`);
        console.log(`Total reviews found: ${reviews.length}`);
        
        reviews.forEach(review => {
          console.log(`\n--- Review ${review.index} ---`);
          console.log(`Title: ${review.title}`);
          console.log(`Rating: ${review.rating}`);
          console.log(`Author: ${review.author}`);
          console.log(`Author Profile: ${review.authorProfileLink}`);
          console.log(`Date: ${review.date}`);
          console.log(`Verified: ${review.verified}`);
          console.log(`Product Variation: ${review.productVariation}`);
          console.log(`Helpful: ${review.helpful}`);
          console.log(`Text: ${review.text.substring(0, 100)}...`);
        });
        
        // Store reviews in a global variable for easy access
        window.scrapedReviews = scrapedData;
        console.log("Reviews stored in window.scrapedReviews for easy access");
        
        // Send success status with data to trigger download
        sendStatus(`✅ ${reviews.length} reviews saved to Downloads!`, 'success', scrapedData);
        
      })
      .catch(error => {
        console.error('Error fetching reviews page:', error);
        console.log('Error details:', error.message);
        sendStatus(`Error: ${error.message}`, 'error');
      });
  }