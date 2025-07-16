// Alternative AJAX-based scraper for Amazon reviews
// This approach uses Amazon's AJAX endpoints directly

async function fetchReviewsViaAjax(asin, pageNumber = 1) {
  console.log(`[AJAX] Fetching reviews for ASIN ${asin}, page ${pageNumber}`);
  
  try {
    // Build the AJAX URL for reviews
    const ajaxUrl = `https://www.amazon.com/hz/reviews-render/ajax/reviews/get/ref=cm_cr_arp_d_paging_btm_next_${pageNumber}`;
    
    // Prepare form data
    const formData = new URLSearchParams({
      'sortBy': 'recent',
      'reviewerType': 'all_reviews',
      'formatType': '',
      'mediaType': '',
      'filterByStar': '',
      'filterByKeyword': '',
      'shouldAppend': 'undefined',
      'deviceType': 'desktop',
      'canShowIntHeader': 'undefined',
      'pageNumber': pageNumber,
      'pageSize': '10',
      'asin': asin,
      'scope': 'reviewsAjax1'
    });
    
    // Get CSRF token from page
    const csrfToken = document.querySelector('input[name="csrf"]')?.value || '';
    if (csrfToken) {
      formData.append('csrf', csrfToken);
    }
    
    console.log('[AJAX] Making request with params:', Object.fromEntries(formData));
    
    // Make the AJAX request
    const response = await fetch(ajaxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'text/html,*/*',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: formData.toString(),
      credentials: 'include' // Include cookies
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const responseText = await response.text();
    console.log('[AJAX] Response received, length:', responseText.length);
    
    // Parse the response
    const parser = new DOMParser();
    const doc = parser.parseFromString(responseText, 'text/html');
    
    // Extract reviews from the response
    const reviewElements = doc.querySelectorAll('[data-hook="review"]');
    console.log('[AJAX] Found reviews in response:', reviewElements.length);
    
    const reviews = [];
    reviewElements.forEach((reviewElement, index) => {
      try {
        const titleElement = reviewElement.querySelector('[data-hook="review-title"] span:not([class])') || 
                            reviewElement.querySelector('[data-hook="review-title"]');
        const ratingElement = reviewElement.querySelector('[data-hook="review-star-rating"] span') ||
                             reviewElement.querySelector('[data-hook="review-star-rating"]');
        const authorElement = reviewElement.querySelector('.a-profile-name');
        const dateElement = reviewElement.querySelector('[data-hook="review-date"]');
        const textElement = reviewElement.querySelector('[data-hook="review-body"] span');
        
        reviews.push({
          title: titleElement?.textContent?.trim() || 'N/A',
          rating: ratingElement?.textContent?.trim() || 'N/A',
          author: authorElement?.textContent?.trim() || 'N/A',
          date: dateElement?.textContent?.trim() || 'N/A',
          text: textElement?.textContent?.trim() || 'N/A',
          page: pageNumber
        });
      } catch (error) {
        console.error(`[AJAX] Error parsing review ${index + 1}:`, error);
      }
    });
    
    return {
      reviews: reviews,
      hasNextPage: doc.querySelector('li.a-last:not(.a-disabled)') !== null
    };
    
  } catch (error) {
    console.error('[AJAX] Error fetching reviews:', error);
    throw error;
  }
}

// Export for use in extension
if (typeof chrome !== 'undefined' && chrome.runtime) {
  window.fetchReviewsViaAjax = fetchReviewsViaAjax;
}