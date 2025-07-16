// Debug script for Amazon pagination
// This can be pasted into the browser console while on an Amazon reviews page

function debugPagination() {
  console.log('=== Amazon Pagination Debug ===');
  
  // Check current page
  const currentPageIndicator = document.querySelector('.a-pagination .a-selected');
  console.log('Current page:', currentPageIndicator ? currentPageIndicator.textContent : 'Not found');
  
  // Check for pagination controls
  const paginationSection = document.querySelector('.a-pagination');
  console.log('Pagination section found:', !!paginationSection);
  
  // Check for next button
  const nextButton = document.querySelector('li.a-last:not(.a-disabled) a');
  console.log('Next button available:', !!nextButton);
  if (nextButton) {
    console.log('Next button href:', nextButton.href);
  }
  
  // Check for page links
  const pageLinks = document.querySelectorAll('.a-pagination li a');
  console.log('Page links found:', pageLinks.length);
  pageLinks.forEach((link, i) => {
    console.log(`  Page link ${i + 1}: ${link.textContent.trim()} - ${link.href}`);
  });
  
  // Check cookies
  console.log('\n=== Cookies ===');
  const cookies = document.cookie.split(';').map(c => c.trim());
  const importantCookies = ['session-id', 'ubid-main', 'x-main'];
  importantCookies.forEach(cookieName => {
    const found = cookies.find(c => c.startsWith(cookieName));
    console.log(`${cookieName}:`, found ? 'Present' : 'Missing');
  });
  
  // Check review count
  const reviewElements = document.querySelectorAll('[data-hook="review"]');
  console.log('\n=== Reviews ===');
  console.log('Reviews on current page:', reviewElements.length);
  
  // Check if reviews have unique IDs
  const reviewIds = new Set();
  reviewElements.forEach(review => {
    const id = review.getAttribute('id');
    if (id) reviewIds.add(id);
  });
  console.log('Unique review IDs:', reviewIds.size);
  
  // Test clicking next page
  console.log('\n=== Navigation Test ===');
  if (nextButton) {
    console.log('To test navigation, run: document.querySelector(\'li.a-last:not(.a-disabled) a\').click()');
  } else {
    console.log('No next button available for navigation');
  }
}

// Run the debug function
debugPagination();