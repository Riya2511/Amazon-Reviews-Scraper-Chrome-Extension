// Debug function to check storage state
async function debugStorage() {
  const result = await chrome.storage.local.get(['scrapedData']);
  console.log('[DEBUG] Current storage state:', result);
  return result.scrapedData;
}

// Log storage state on popup open
debugStorage();

// Function to ensure proper storage structure
function ensureStorageStructure(data) {
  if (!data || typeof data !== 'object') {
    return { products: {}, productInfo: [] };
  }
  
  if (!data.products || typeof data.products !== 'object') {
    data.products = {};
  }
  
  if (!data.productInfo || !Array.isArray(data.productInfo)) {
    data.productInfo = [];
  }
  
  return data;
}

// Function to show status messages (moved outside for global access)
function showStatus(message, type = 'info') {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = `status status-${type}`;
  
  // Auto-clear status after 5 seconds for success messages (longer for completion messages)
  if (type === 'success') {
    const clearTime = message.includes('Complete!') ? 7000 : 3000;
    setTimeout(() => {
      statusDiv.textContent = '';
      statusDiv.className = 'status';
    }, clearTime);
  }
}

function convertProductInfoToCSV(products) {
  const headers = [
    'asin', 'title', 'brand', 'price', 'rating', 'ratings_count', 'availability', 
    'category', 'seller_info', 'upc', 'shop_url', 'is_prime', 
    'main_image_count', 'aplus_image_count', 'total_image_count',
    'main_product_images_json', 'aplus_images_json', 'features_json',
    'variations_json', 'subscribe_save_json', 'item_details_json',
    'measurements_json', 'materials_care_json', 'features_specs_json',
    'safety_info_json', 'directions_json', 'additional_details_json'
  ];
  
  const rows = products.map(p => 
    headers.map(h => {
      let value = p[h] || '';
      // JSON fields should already be stringified
      if (typeof value === 'object' && value !== null) {
        value = JSON.stringify(value);
      }
      // Handle boolean values
      if (typeof value === 'boolean') {
        value = value.toString();
      }
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(',')
  );
  
  return [headers.join(','), ...rows].join('\n');
}

// Function to update stats from storage
async function updateStats() {
  try {
    const result = await chrome.storage.local.get(['scrapedData']);
    const data = ensureStorageStructure(result.scrapedData);
    
    console.log('[STATS] Storage data:', data);
    
    const productCount = Object.keys(data.products || {}).length;
    const productInfoCount = (data.productInfo || []).length;

    const reviewCount = Object.values(data.products || {}).reduce((total, product) => {
      return total + (product.reviews ? product.reviews.length : 0);
    }, 0);
    
    console.log(`[STATS] Products: ${productCount}, Reviews: ${reviewCount}`);
    
    // Update UI elements if they exist
    const productsCountEl = document.getElementById('productsCount');
    const productInfoEl = document.getElementById('productsInfo')
    const reviewsCountEl = document.getElementById('reviewsCount');
    if (productsCountEl) productsCountEl.textContent = productCount;
    if (reviewsCountEl) reviewsCountEl.textContent = reviewCount;
    if (productInfoEl) productInfoEl.textContent = productInfoCount;
    
    // Download button is always visible now
    console.log(`[STATS] Current data: ${productCount} products with ${reviewCount} reviews`);
  } catch (error) {
    console.error('[STATS] Error updating stats:', error);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
    console.log('[POPUP] DOMContentLoaded - Initializing popup...');
    
    const extractBtn = document.getElementById('extractBtn');
    const downloadBtn = document.getElementById('downloadBtn');
    const headerLink = document.getElementById('headerLink');
    const extractProdBtn = document.getElementById('extractProdBtn');
    const productsCountEl = document.getElementById('productsCount');
    const reviewsCountEl = document.getElementById('reviewsCount');
    
    // Load and display current stats immediately
    await updateStats();
    
    // Also update stats after a short delay to ensure UI is ready
    setTimeout(() => updateStats(), 100);
    setTimeout(() => updateStats(), 500);
    
    // Listen for storage changes to update UI in real-time
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName === 'local' && changes.scrapedData) {
        console.log('[POPUP] Storage changed, updating stats...');
        updateStats();
      }
    });
    
    // Add click handler to KPI cards to refresh stats
    const kpiSection = document.querySelector('.kpi-section');
    if (kpiSection) {
      kpiSection.addEventListener('click', () => {
        console.log('[DEBUG] Manual stats refresh triggered');
        updateStats();
      });
    }

    extractProdBtn.addEventListener('click', async () => {
      extractProdBtn.disabled = true;
      showStatus('Extracting product info...', 'info');
    
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const url = tab.url;
    
      if (!url.includes('amazon.com')) {
        showStatus('Please navigate to an Amazon product page', 'warning');
        extractProdBtn.disabled = false;
        return;
      }
    
      // Get ASIN
      let asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/i) ||
                      url.match(/\/gp\/product\/([A-Z0-9]{10})/i);
      if (!asinMatch) {
        showStatus('Could not find ASIN in URL', 'error');
        extractProdBtn.disabled = false;
        return;
      }
    
      const asin = asinMatch[1];
    
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractCompleteProductData,
        args: [asin, url]
      }, async (results) => {
        if (chrome.runtime.lastError || !results[0]) {
          console.error('Script error:', chrome.runtime.lastError);
          showStatus('Failed to extract product info', 'error');
          extractProdBtn.disabled = false;
          return;
        }
    
        const productData = results[0].result;
    
        try {
          const result = await chrome.storage.local.get(['scrapedData']);
          const data = ensureStorageStructure(result.scrapedData);
          data.productInfo.push(productData);
    
          await chrome.storage.local.set({ scrapedData: data });
    
          showStatus(`Product extracted successfully`, 'success');
          extractProdBtn.disabled = false;
    
          await updateStats();
        } catch (error) {
          console.error('Error saving product info:', error);
          showStatus('Failed to save product info', 'error');
          extractProdBtn.disabled = false;
        }
      });
    });

    // Header click to open website
    if (headerLink) {
      headerLink.addEventListener('click', () => {
        chrome.tabs.create({ url: 'https://www.Ecompulse.ai' });
      });
    }

    // Download button click handler - FIXED VERSION
    downloadBtn.addEventListener('click', async () => {
      // Prevent multiple clicks
      if (downloadBtn.disabled) return;
      
      try {
        downloadBtn.disabled = true;
        showStatus('Preparing download...', 'info');
        
        // Generate timestamp FIRST (move this to the top)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        
        // Get all stored data with proper structure
        const result = await chrome.storage.local.get(['scrapedData']);
        const data = ensureStorageStructure(result.scrapedData);
        
        // Check if we have any data to download
        const hasProducts = Object.keys(data.products || {}).length > 0;
        const hasProductInfo = (data.productInfo || []).length > 0;
        
        if (!hasProducts && !hasProductInfo) {
          showStatus('No data to download', 'warning');
          downloadBtn.disabled = false;
          return;
        }

        // Download product info if available
        if (hasProductInfo) {
          const productInfoCSV = convertProductInfoToCSV(data.productInfo);
          const blob = new Blob([productInfoCSV], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const filename = `Ecompulse_amz_productInfo_${timestamp}.csv`;

          chrome.runtime.sendMessage({
            action: 'download',
            url: url,
            filename: filename
          }, (response) => {
            if (response && response.success) {
              console.log(`Download started for ${filename}`);
            } else {
              console.error('Download failed:', response?.error);
            }
            URL.revokeObjectURL(url);
          });          
        }

        // Download reviews if available
        if (hasProducts) {
          // Combine all products' data
          const combinedData = {
            metadata: {
              totalProducts: Object.keys(data.products).length,
              totalReviews: 0,
              exportDate: new Date().toISOString(),
              products: []
            },
            reviews: []
          };
          
          // Merge all reviews with product metadata
          Object.values(data.products).forEach(product => {
            if (product && product.metadata && product.reviews) {
              combinedData.metadata.products.push({
                asin: product.metadata.asin,
                productName: product.metadata.productName,
                reviewCount: product.reviews.length
              });
              combinedData.metadata.totalReviews += product.reviews.length;
              
              // Add product metadata to each review
              const enrichedReviews = product.reviews.map(review => ({
                ...review,
                productAsin: product.metadata.asin,
                productName: product.metadata.productName,
                productUrl: product.metadata.originalUrl
              }));
              
              combinedData.reviews = combinedData.reviews.concat(enrichedReviews);
            }
          });
          
          // Generate filename with timestamp
          const reviewsFilename = `Ecompulse_amz_reviews_${timestamp}.csv`;
          
          // Save to downloads
          saveToDownloads(combinedData, 'multi-product');
          
          showStatus(`Downloaded ${combinedData.metadata.totalReviews} reviews from ${combinedData.metadata.totalProducts} products`, 'success');
        }
        
        // Clear storage after successful download
        await chrome.storage.local.remove(['scrapedData']);
        
        // Reset UI
        await updateStats();
        downloadBtn.disabled = false;
        
      } catch (error) {
        console.error('Download error:', error);
        showStatus('Download failed: ' + error.message, 'error');
        downloadBtn.disabled = false;
      }
    });
    
    extractBtn.addEventListener('click', async () => {
      try {
        extractBtn.disabled = true;
        showStatus('Getting current tab...', 'info');
        
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        const url = tab.url;
        
        // Check if URL contains amazon
        if (!url.includes('amazon.com')) {
          showStatus('Please navigate to an Amazon product or reviews page', 'warning');
          extractBtn.disabled = false;
          return;
        }
        
        let asin, reviewsUrl;
        
        // Try multiple ASIN extraction patterns
        let asinMatch = url.match(/\/dp\/([A-Z0-9]{10})/i) || 
                       url.match(/\/product-reviews\/([A-Z0-9]{10})/i) ||
                       url.match(/\/gp\/product\/([A-Z0-9]{10})/i) ||
                       url.match(/\/([A-Z0-9]{10})(?:\/|$|\?)/i);
        
        if (!asinMatch) {
          showStatus('Could not find product ASIN in URL', 'error');
          extractBtn.disabled = false;
          return;
        }
        
        asin = asinMatch[1];
        
        // Always construct the reviews URL, regardless of current page
        reviewsUrl = `https://www.amazon.com/product-reviews/${asin}/ref=cm_cr_dp_d_show_all_btm?ie=UTF8&reviewerType=all_reviews`;
        
        // Check if we need to navigate to reviews page
        if (!url.includes('/product-reviews/')) {
          showStatus('Navigating to reviews page...', 'info');
          
          // Navigate to reviews page first
          chrome.tabs.update(tab.id, { url: reviewsUrl }, () => {
            // Wait for page to load
            chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
              if (tabId === tab.id && changeInfo.status === 'complete') {
                chrome.tabs.onUpdated.removeListener(listener);
                
                // Small delay to ensure page is ready
                setTimeout(() => {
                  startScraping(tab, asin, reviewsUrl);
                }, 1000);
              }
            });
          });
        } else {
          // Already on reviews page, start scraping
          startScraping(tab, asin, reviewsUrl);
        }
        
        
      } catch (error) {
        console.error('Error:', error);
        showStatus('An error occurred', 'error');
        extractBtn.disabled = false;
      }
    });
  });

// NEW FUNCTION: Complete product data extraction using Python script logic
function extractCompleteProductData(asin, url) {
  console.log('🚀 Starting complete product extraction...');

  // Helper: strip any HTML tags & collapse whitespace
  function sanitizeText(text) {
    return text
      .replace(/<[^>]*>/g, '')
      .replace(/[\n\r\t]+/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  // Helper: normalize Amazon thumbnail URLs to full‑size JPG
  function convertToFullSizeImage(src) {
    if (!src) return src;
    let fullSrc = src.replace(/\._[A-Z]+\d+[^.]*_\./, '.');
    fullSrc = fullSrc.replace(/\._SS\d+_\./, '.');
    fullSrc = fullSrc.replace(/\._SX\d+_\./, '.');
    fullSrc = fullSrc.replace(/\._AC_[^.]*_\./, '.');
    if (fullSrc.endsWith('.')) {
      fullSrc = fullSrc.slice(0, -1) + '.jpg';
    }
    return fullSrc;
  }

  // Expand all “see more” sections
  async function expandProductSections() {
    console.log('🔍 Expanding product information sections...');
    const expandableSelectors = [
      'button[aria-expanded="false"]',
      '[data-action="showMore"]',
      '[data-action="expand"]',
      'button:has-text("See more")',
      'button:has-text("Show more")',
      'button:has-text("View more")',
      'button:has-text("Read more")',
      'button[aria-controls*="detail"]',
      'button[aria-controls*="spec"]',
      'button[aria-controls*="feature"]',
      'div[data-feature-name*="detail"] button',
      'div[data-feature-name*="spec"] button',
      '#detailBullets_feature_div button',
      '#productDetails_detailBullets_sections1 button',
      '#productDetails_techSpec_sections1 button',
      '.feature-bullets button',
      '.product-facts button'
    ];
    for (const selector of expandableSelectors) {
      try {
        const buttons = document.querySelectorAll(selector);
        for (const button of buttons) {
          if (button.offsetParent !== null) {
            button.click();
            await new Promise(res => setTimeout(res, 500));
          }
        }
      } catch (e) { /* ignore */ }
    }
    const sizeSelectors = [
      'select[name*="size"]',
      'select[aria-label*="size"]',
      'select[data-action*="size"]',
      '#native_dropdown_selected_size_name',
      'select.a-native-dropdown'
    ];
    for (const sel of sizeSelectors) {
      try {
        const dropdown = document.querySelector(sel);
        if (dropdown && dropdown.querySelectorAll('option').length > 1) {
          console.log(`📏 Found size variations: ${dropdown.querySelectorAll('option').length} options`);
          break;
        }
      } catch (e) { /* ignore */ }
    }
    await new Promise(res => setTimeout(res, 2000));
    console.log('✅ Finished expanding sections');
  }

  // Main product images (landing + thumbnails)
  function extractMainProductImages() {
    const mainImages = [];
    const mainImg = document.querySelector('img#landingImage');
    if (mainImg?.src) mainImages.push(convertToFullSizeImage(mainImg.src));
    const thumbArea = document.querySelector('div#altImages');
    if (thumbArea) {
      for (const img of thumbArea.querySelectorAll('img')) {
        const src = img.src || '';
        if (src.includes('images/I/') &&
            !src.includes('360_icon') &&
            !src.includes('grey-pixel') &&
            !src.includes('transparent-pixel')) {
          mainImages.push(convertToFullSizeImage(src));
        }
      }
    }
    return [...new Set(mainImages)];
  }

  // A+ content images
  function extractAplusImages() {
    const aplusImages = [];
    const section = document.querySelector('div#aplus');
    if (section) {
      for (const img of section.querySelectorAll('img')) {
        // Get the real source: prefer data-src if it exists
        const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
        if (
          (src.includes('aplus-media') ||
            (src.includes('media-amazon.com') && src.includes('images/S/'))) &&
          !src.includes('grey-pixel') &&
          !src.includes('transparent-pixel')
        ) {
          aplusImages.push(src);
        }
      }
    }
    return aplusImages;
  }
  
  // Size & color/style variations
  function extractVariations() {
    const variations = {};
  
    // Method 1: Sizes from select dropdown
    const sizeSelects = Array.from(document.querySelectorAll('select')).filter(s =>
      /(size|dropdown)/i.test(s.name)
    );
  
    for (const sel of sizeSelects) {
      const opts = [];
      for (const o of sel.querySelectorAll('option')) {
        const t = o.textContent.trim();
        if (t && !['select','choose','pick'].includes(t.toLowerCase())) opts.push(t);
      }
      if (opts.length) {
        variations.sizes = opts.slice(0, 15);
        break;
      }
    }
  
    // Method 2: Colors/styles from swatches or buttons
    const containers = Array.from(document.querySelectorAll('div, ul')).filter(el =>
      /variation.*(color|style)/i.test(el.id)
    );
  
    for (const cont of containers) {
      const vals = [];
      for (const item of cont.querySelectorAll('li, span, button')) {
        const name = item.title || item.getAttribute('aria-label') || item.textContent.trim();
        if (name && name.length < 100 && !['select','choose'].includes(name.toLowerCase())) {
          vals.push(name);
        }
      }
      if (vals.length) {
        variations.colors = vals.slice(0, 15);
        break;
      }
    }
  
    // Method 3: fallback for style names in class names
    if (!variations.colors) {
      const styleElems = Array.from(document.querySelectorAll('span, div')).filter(el =>
        /(style.*name|color.*name)/i.test(el.className)
      );
  
      const styles = [];
      for (const el of styleElems) {
        const txt = el.textContent.trim();
        if (txt && txt.length < 100) styles.push(txt);
      }
  
      if (styles.length) {
        variations.styles = styles.slice(0, 15);
      }
    }
  
    // Method 4: Extract from page JSON inside scripts
    const scripts = Array.from(document.querySelectorAll('script')).filter(
      s => s.textContent && /(colorImages|dimensionValuesDisplayData|variationValues)/i.test(s.textContent)
    );
  
    for (const script of scripts) {
      try {
        const text = script.textContent;
  
        // colorImages
        const colorMatch = text.match(/"colorImages"\s*:\s*\{([^}]+)\}/i);
        if (colorMatch) {
          const colorPart = colorMatch[1];
          const colorNames = Array.from(colorPart.matchAll(/"([^"]+)"\s*:/g)).map(m => m[1]);
          if (colorNames.length) {
            variations.colors = colorNames.slice(0, 15);
            break;
          }
        }
  
        // dimensionValuesDisplayData for sizes
        if (!variations.sizes) {
          const dimMatch = text.match(/"dimensionValuesDisplayData"\s*:\s*\{([^}]+)\}/i);
          if (dimMatch) {
            const dimPart = dimMatch[1];
            const sizeNames = Array.from(dimPart.matchAll(/"([^"]+)"\s*:/g)).map(m => m[1]);
            if (sizeNames.length) {
              variations.sizes = sizeNames.slice(0, 15);
            }
          }
        }
      } catch (e) {
        continue;
      }
    }
  
    return variations;
  }  

  // Subscribe & Save
  function extractSubscribeSave() {
    const info = { available: false, discount: null };
    const t = document.body.textContent || '';
    if (/subscribe\s*&\s*save/i.test(t)) {
      info.available = true;
      const m = t.match(/(\d+)%.*subscribe\s*&\s*save/i);
      if (m) info.discount = m[1] + '%';
    }
    return info;
  }

  function extractDetailedSpecs() {
    const specs = {
      item_details: {},
      measurements: {},
      materials_care: {},
      features_specs: {},
      additional_details: {},
      safety_info: [],
      directions: []
    };
  
    function categorizeAndStore(key, value) {
      const lk = key.toLowerCase();
      const measurementKeys = ['dimension','weight','height','width','length','size','volume','depth','diameter','thickness','ounce','pound','inch','cm','mm','lbs','oz'];
      const materialKeys = ['material','made','fabric','construction','care','wash','clean','color','finish','coating','surface','ingredients','component'];
      const featureKeys = ['feature','special','design','style','pattern','capacity','performance','function','technology','battery','power','speed','memory'];
      const itemKeys = ['asin','model','brand','manufacturer','age','player','time','language','release','date','rank','review','rating','discontinued'];
      if (measurementKeys.some(w => lk.includes(w))) {
        specs.measurements[key] = value;
      } else if (materialKeys.some(w => lk.includes(w))) {
        specs.materials_care[key] = value;
      } else if (featureKeys.some(w => lk.includes(w))) {
        specs.features_specs[key] = value;
      } else if (itemKeys.some(w => lk.includes(w))) {
        specs.item_details[key] = value;
      } else {
        specs.additional_details[key] = value;
      }
    }
  
    function extractMeasurementsExhaustive(text) {
      const patterns = [
        /(\d+(?:\.\d+)?)\s*(inch|in|cm|mm|foot|ft|meter|m)\b/gi,
        /(\d+(?:\.\d+)?)\s*(pound|lb|ounce|oz|gram|g|kg)\b/gi,
        /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)/gi,
        /weight:?\s*(\d+(?:\.\d+)?\s*(?:pound|lb|ounce|oz|gram|g|kg))/gi,
        /dimensions?:?\s*([\d\.\s×x]+)/gi
      ];
      let found = 0;
      for (const pat of patterns) {
        let match;
        while ((match = pat.exec(text)) && found < 10) {
          specs.measurements[`Measurement_${found+1}`] = match[0];
          found++;
        }
      }
    }
  
    function extractMaterialsExhaustive(text) {
      const matKeys = ['cotton','polyester','wool','silk','leather','plastic','metal','wood','glass','ceramic','rubber','fabric','material','made of','constructed','finish'];
      const sents = text.split(/[.!?]/);
      for (const k of matKeys) {
        for (const s of sents) {
          if (s.toLowerCase().includes(k) && s.length < 200) {
            specs.materials_care[`Material_info_${k}`] = s.trim();
            break;
          }
        }
      }
    }
  
    function extractSafetyDirectionsExhaustive(text) {
      const sents = text.split(/[.!?]/);
      const safetyKeys = ['warning','caution','safety','hazard','danger','not suitable','choking','age restriction'];
      const dirKeys = ['instruction','direction','how to','usage','assembly','setup','installation'];
      for (const s of sents) {
        const t = s.trim();
        const lw = t.toLowerCase();
        if (t.length > 10 && t.length < 300) {
          if (safetyKeys.some(k => lw.includes(k))) specs.safety_info.push(t);
          if (dirKeys.some(k => lw.includes(k))) specs.directions.push(t);
        }
      }
      specs.safety_info = specs.safety_info.slice(0,10);
      specs.directions = specs.directions.slice(0,10);
    }
  
    function extractFromScripts() {
      const scripts = document.querySelectorAll('script');
      const jsonPats = [
        /"productDetails"\s*:\s*\{([^}]+)\}/gi,
        /"specifications"\s*:\s*\{([^}]+)\}/gi,
        /"attributes"\s*:\s*\{([^}]+)\}/gi,
        /"features"\s*:\s*\[([^\]]+)\]/gi,
        /"dimensions"\s*:\s*\{([^}]+)\}/gi,
        /"materials"\s*:\s*\{([^}]+)\}/gi
      ];
      for (const s of scripts) {
        const t = s.textContent;
        if (!t) continue;
        for (const pat of jsonPats) {
          let match;
          while ((match = pat.exec(t))) {
            const blob = match[1];
            const pairs = Array.from(blob.matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g));
            for (const [_, k, v] of pairs) {
              categorizeAndStore(k, v);
            }
          }
        }
      }
    }
  
    // ✅ Method 1: Tables
    for (const table of document.querySelectorAll('table')) {
      for (const row of table.querySelectorAll('tr')) {
        const cells = row.querySelectorAll('td, th');
        if (cells.length >= 2) {
          const k = cells[0].textContent.trim();
          const v = cells[1].textContent.trim();
          if (k && v && k.length < 150) categorizeAndStore(k, v);
        }
      }
    }
  
    // ✅ Method 2: divs with detail/spec/feature
    const keywords = ['detail','spec','feature','bullet','info','attribute','prop'];
    const divs = [];
    for (const k of keywords) {
      divs.push(...document.querySelectorAll(`div[id*="${k}"], div[class*="${k}"]`));
    }
    for (const div of divs) {
      for (const line of div.textContent.split('\n')) {
        if (line.includes(':') && line.length < 300) {
          const [k, ...rest] = line.split(':');
          const v = rest.join(':').trim();
          if (k.trim() && v && k.trim().length < 100) categorizeAndStore(k.trim(), v);
        }
      }
      for (const item of div.querySelectorAll('span, li, p, div')) {
        const txt = item.textContent.trim();
        if (txt.includes(':') && txt.length < 300) {
          const [k, ...rest] = txt.split(':');
          const v = rest.join(':').trim();
          if (k.trim() && v && k.trim().length < 100) categorizeAndStore(k.trim(), v);
        }
      }
    }
  
    // ✅ Method 3: dt/dd pairs
    for (const dt of document.querySelectorAll('dt')) {
      const dd = dt.nextElementSibling;
      if (dd && dd.tagName === 'DD') {
        const k = dt.textContent.trim();
        const v = dd.textContent.trim();
        if (k && v) categorizeAndStore(k, v);
      }
    }
  
    // ✅ Method 4: exhaustive text mining
    const pageText = document.body.textContent || '';
    extractMeasurementsExhaustive(pageText);
    extractMaterialsExhaustive(pageText);
    extractSafetyDirectionsExhaustive(pageText);
    extractFromScripts();
  
    return specs;
  }
  
  // UPC via regex or JSON‑LD
  function extractUPC() {
    const patterns = [
      /UPC[\s:]*(\d{12,13})/i,
      /UPCA?[\s:]*(\d{12,13})/i,
      /Universal Product Code[\s:]*(\d{12,13})/i,
      /Product Code[\s:]*(\d{12,13})/i,
      /Barcode[\s:]*(\d{12,13})/i
    ];
    const checkText = (text) => {
      for (const p of patterns) {
        const m = text.match(p);
        if (m) return m[1];
      }
    };
    const det = document.querySelector('#detailBullets_feature_div')?.textContent;
    if (det) {
      const upc = checkText(det);
      if (upc) return upc;
    }
    const tech = document.querySelector('#technicalSpecifications_feature_div')?.textContent;
    if (tech) {
      const upc = checkText(tech);
      if (upc) return upc;
    }
    const all = document.body.textContent || '';
    const upcAll = checkText(all);
    if (upcAll) return upcAll;
    for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
      try {
        const j = JSON.parse(script.textContent);
        if (j.gtin||j.gtin12||j.gtin13) return j.gtin||j.gtin12||j.gtin13;
      } catch {}
    }
    return null;
  }

  // Core extraction
  async function performExtraction() {
    await expandProductSections();

    const data = {
      asin,
      scrape_timestamp: new Date().toISOString(),
      product_url: url
    };

    // Title & brand
    const tEl = document.querySelector('#productTitle');
    data.title = tEl ? sanitizeText(tEl.textContent) : null;
    const bEl = document.querySelector('#bylineInfo');
    data.brand = bEl
      ? sanitizeText(
          bEl.textContent
            .replace('Visit the','')
            .replace('Store','')
            .replace('Brand:','')
        )
      : null;

    // Price
    let price = null;
    for (const sel of ['span.a-offscreen','span.a-price-whole','.a-price .a-offscreen']) {
      const el = document.querySelector(sel);
      if (el) {
        const m = el.textContent.trim().match(/\$?([,\d]+\.?\d*)/);
        if (m) { price = m[1].replace(',',''); break; }
      }
    }
    data.price = price;

    // Rating & reviews count
    const rEl = document.querySelector('span.a-icon-alt');
    data.rating = rEl
      ? (rEl.textContent.match(/(\d+\.?\d*)/)||[])[1]
      : null;
    const rcEl = document.querySelector('#acrCustomerReviewText');
    data.ratings_count = rcEl
      ? (rcEl.textContent.match(/([\d,]+)/)||[])[1].replace(',','')
      : null;

    // Availability
    const availEl = document.querySelector('#availability span');
    data.availability = availEl ? sanitizeText(availEl.textContent) : null;

    // Category (breadcrumbs)
    const bc = document.querySelectorAll('#wayfinding-breadcrumbs_feature_div a');
    data.category = bc.length
      ? sanitizeText(Array.from(bc).map(a=>a.textContent).join(' > '))
      : null;

    // Seller info
    const shipsFromSpan = Array.from(document.querySelectorAll('span'))
      .find(s => s.textContent.includes('Ships from'));

    if (shipsFromSpan) {
      const featureLabelDiv = shipsFromSpan.closest('div[offer-display-feature-name]');
      const featureTextDiv = featureLabelDiv?.nextElementSibling;
      const sellerSpan = featureTextDiv 
        ? featureTextDiv.querySelector('span')
        : null
      const shipsFromText = shipsFromSpan.textContent.trim();
      const sellerText = sellerSpan ? sellerSpan.textContent.trim() : '';
      data.seller_info = sanitizeText(`${shipsFromText} ${sellerText}`.trim());
    } else {
      data.seller_info = null;
    }

    // UPC
    data.upc = extractUPC();

    // Shop URL
    // First, try to find link with href containing "/stores/"
    let shopA = Array.from(document.querySelectorAll('a')).find(a => {
      const href = a.getAttribute('href');
      return href && /.*\/stores\/.*/.test(href);
    });

    // If not found, try to find link with text matching "visit.*store" (case insensitive)
    if (!shopA) {
      shopA = Array.from(document.querySelectorAll('a')).find(a => {
          return /.*visit.*store.*/i.test(a.textContent || '');
      });
    }

    if (shopA) {
      const href = shopA.getAttribute('href') || '';
      if (href.startsWith('/')) {
          data.shop_url = 'https://www.amazon.com' + href;
      } else if (href.startsWith('http')) {
          data.shop_url = href;
      } else {
          data.shop_url = null;
      }
    } else {
      data.shop_url = null;
    }

    // Prime status as 1/0
    const primeIndicators = [
      document.querySelector('i[class*="prime"]'),
      Array.from(document.querySelectorAll('span'))
        .find(span => span.textContent.includes('Prime')),
      document.querySelector('img[alt*="Prime"]')
    ];
    data.is_prime = primeIndicators.some(i=>i!=null)?1:0;

    // Images
    const mainImgs  = extractMainProductImages();
    const aplusImgs = extractAplusImages();
    data.main_product_images  = mainImgs;
    data.main_image_count     = mainImgs.length;
    data.aplus_images         = aplusImgs;
    data.aplus_image_count    = aplusImgs.length;
    data.total_image_count    = mainImgs.length + aplusImgs.length;

    // Features
    const features = [];
    const featDiv = document.querySelector('#feature-bullets');
    if (featDiv) {
      for (const span of featDiv.querySelectorAll('span.a-list-item')) {
        const txt = span.textContent.trim();
        if (txt && txt.length>10 && !txt.startsWith('Make sure')) {
          features.push(txt);
        }
      }
    }
    data.features = features.slice(0,10);

    // Complex fields
    data.variations     = extractVariations();
    data.subscribe_save = extractSubscribeSave();
    const specs         = extractDetailedSpecs();

    // JSON‑serialize + sanitize
    data.main_product_images_json = JSON.stringify(mainImgs.map(sanitizeText));
    data.aplus_images_json        = JSON.stringify(aplusImgs.map(sanitizeText));
    data.features_json            = JSON.stringify(data.features.map(sanitizeText));

    const cleanVars = {};
    for (const [k, v] of Object.entries(data.variations)) {
      cleanVars[k] = Array.isArray(v) ? v.map(sanitizeText) : sanitizeText(String(v));
    }
    data.variations_json = JSON.stringify(cleanVars);

    data.subscribe_save_json = JSON.stringify({
      available: data.subscribe_save.available ? 1 : 0,
      discount : data.subscribe_save.discount ? sanitizeText(data.subscribe_save.discount) : null
    });

    
    function extractMeaningfulText(input) {
        let items = [];
        
        // Handle array input
        if (Array.isArray(input)) {
            items = input;
        } 
        // Handle object input - extract values
        else if (typeof input === 'object' && input !== null) {
            items = Object.values(input);
        }
        // Handle string input
        else if (typeof input === 'string') {
            items = [input];
        }
        
        const results = [];
        
        items.forEach(item => {
            if (typeof item !== 'string') return;
            
            // Skip CSS rules, JavaScript code, and technical strings
            if (isSkippableContent(item)) return;
            
            // Extract text from various patterns
            const extractedTexts = extractTextFromString(item);
            
            extractedTexts.forEach(text => {
                if (text && text.length > 10 && isMeaningfulText(text)) {
                    results.push(text);
                }
            });
        });
        
        // Remove duplicates and return
        return [...new Set(results)];
    }
    
    function isSkippableContent(str) {
        // Skip CSS properties and rules
        if (str.includes('{') && str.includes('}') && str.includes(':')) return true;
        if (str.includes('webkit') || str.includes('flex') || str.includes('display')) return true;
        if (str.includes('color:#') || str.includes('background-color')) return true;
        if (str.includes('padding:') || str.includes('margin:')) return true;
        
        // Skip JavaScript function calls and technical strings
        if (str.includes('setupMessageChannel') || str.includes('OnloadFallbackSetup')) return true;
        if (str.includes('window.') || str.includes('function')) return true;
        if (str.includes('colorToAsin') || str.includes('spin360')) return true;
        
        // Skip very short strings or single characters
        if (str.length < 5) return true;
        
        return false;
    }
    
    function extractTextFromString(str) {
        const results = [];
        
        // Extract text from quotes
        const quotedTexts = str.match(/"([^"]+)"/g);
        if (quotedTexts) {
            quotedTexts.forEach(quoted => {
                const text = quoted.slice(1, -1); // Remove quotes
                if (!isSkippableContent(text)) {
                    results.push(text);
                }
            });
        }
        
        // Extract text from single quotes
        const singleQuotedTexts = str.match(/'([^']+)'/g);
        if (singleQuotedTexts) {
            singleQuotedTexts.forEach(quoted => {
                const text = quoted.slice(1, -1); // Remove quotes
                if (!isSkippableContent(text)) {
                    results.push(text);
                }
            });
        }
        
        // Extract plain text (not in quotes but meaningful)
        if (!str.includes('{') && !str.includes('(') && !str.includes('function')) {
            const cleanText = str.replace(/[{}()"';:]/g, '').trim();
            if (cleanText && !isSkippableContent(cleanText)) {
                results.push(cleanText);
            }
        }
        
        return results;
    }
    
    function isMeaningfulText(text) {
        // Check if text contains meaningful content
        if (text.includes('video guides') || text.includes('product setup')) return true;
        if (text.includes('ingredients') || text.includes('directions')) return true;
        if (text.includes('information') || text.includes('packaging')) return true;
        if (text.includes('tea') || text.includes('darjeeling')) return true;
        if (text.includes('filtered water') || text.includes('boil')) return true;
        if (text.includes('labels') || text.includes('warnings')) return true;
        if (text.includes('consuming') || text.includes('product')) return true;
        
        // General checks for meaningful content
        if (text.match(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/i)) return true;
        if (text.match(/[A-Z][a-z]+ [A-Z][a-z]+/)) return true; // Proper nouns
        if (text.length > 20 && text.includes(' ')) return true; // Long sentences
        
        return false;
    }
    
    function cleanObj(input) {
      const result = {};
      
      // Handle array input
      if (Array.isArray(input)) {
          input.forEach((item, index) => {
              if (typeof item === 'string') {
                    const meaningfulText = extractMeaningfulText(item);
                    if (meaningfulText.length > 0) {
                        // Use index as key for array items
                        const key = `item_${index}`;
                        result[key] = meaningfulText.join(', ').toLowerCase();
                    }
                }
            });
        }
        // Handle object input
        else if (typeof input === 'object' && input !== null) {
            Object.entries(input).forEach(([key, value]) => {
                if (typeof value === 'string') {
                    const meaningfulText = extractMeaningfulText(value);
                    if (meaningfulText.length > 0) {
                        // Clean up the key
                        const cleanKey = key.replace(/[_"']/g, '').toLowerCase();
                        result[cleanKey] = meaningfulText.join(', ').toLowerCase();
                    }
                }
            });
        }
        // Handle string input
        else if (typeof input === 'string') {
            const meaningfulText = extractMeaningfulText(input);
            if (meaningfulText.length > 0) {
                result['text'] = meaningfulText.join(', ').toLowerCase();
            }
        }
        
        return result;
    }

    data.item_details_json       = JSON.stringify(cleanObj(specs.item_details));
    data.measurements_json       = JSON.stringify(cleanObj(specs.measurements));
    data.materials_care_json     = JSON.stringify(cleanObj(specs.materials_care));
    data.features_specs_json     = JSON.stringify(cleanObj(specs.features_specs));
    data.additional_details_json = JSON.stringify(cleanObj(specs.additional_details));
    data.safety_info_json        = JSON.stringify(specs.safety_info.map(sanitizeText));
    data.directions_json         = JSON.stringify(cleanObj(specs.directions.map(sanitizeText)));

//     /**
//  * Extracts only meaningful human-readable text values.
//  * Ignores anything that looks like CSS, JS, selectors, functions.
//  * Works for arrays or objects.
//  */
    
    
//     data.item_details_json       = cleanExtractedText(data.item_details_json);
//     data.measurements_json       = cleanExtractedText(data.measurements_json);
//     data.materials_care_json     = cleanExtractedText(data.materials_care_json);
//     data.features_specs_json     = cleanExtractedText(data.features_specs_json);
//     data.additional_details_json = cleanExtractedText(data.additional_details_json);
//     data.safety_info_json        = cleanExtractedText(data.safety_info_json);
//     data.directions_json         = cleanExtractedText(data.directions_json);

    // Remove intermediate properties
    delete data.main_product_images;
    delete data.aplus_images;
    delete data.features;
    delete data.variations;
    delete data.subscribe_save;

    console.log('✅ Complete extraction finished!');
    return data;
  }

  // Kick off
  return performExtraction();
}

// Function to start the scraping process
function startScraping(tab, asin, reviewsUrl) {
  showStatus('Starting multi-page scraping...', 'info');
  
  // Use comprehensive multi-page scraping
  console.log('[SCRAPER] Using comprehensive multi-page scraping approach...');
  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: performMultiPageScraping,
    args: [asin, -1] // maxPages = -1 means scrape all available pages
  }, (results) => {
    if (chrome.runtime.lastError) {
      console.error('[SCRAPER] ❌ Script injection error:', chrome.runtime.lastError);
      showStatus('Failed to inject scraping script', 'error');
      document.getElementById('extractBtn').disabled = false;
    } else {
      console.log('[SCRAPER] ✅ Multi-page scraping script injected successfully');
      
      // Listen for results
      chrome.runtime.onMessage.addListener(async function resultListener(request) {
        if (request.action === 'all_pages_complete') {
          console.log(`[SCRAPER] 🎉 Received all ${request.totalReviews} reviews from ${request.pagesScraped} pages`);
          
          // Save to storage with proper structure
          try {
            const result = await chrome.storage.local.get(['scrapedData']);
            const existingData = ensureStorageStructure(result.scrapedData);
            const uniqueKey = `${asin}_${Date.now()}`;
            
            // Add this product's data
            existingData.products[uniqueKey] = {
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
            
            // Save back to storage
            await chrome.storage.local.set({ scrapedData: existingData });
            console.log('[SCRAPER] ✅ Successfully saved to storage:', existingData);
            
            // Verify storage was saved
            const verification = await chrome.storage.local.get(['scrapedData']);
            console.log('[SCRAPER] Storage verification:', verification);
            
            // Show completion message with next steps
            const productCount = Object.keys(existingData.products).length;
            const totalReviews = Object.values(existingData.products).reduce((sum, p) => sum + p.reviews.length, 0);
            
            if (productCount === 1) {
              showStatus(`Complete! Added ${request.totalReviews} reviews. Navigate to next product or download.`, 'success');
            } else {
              showStatus(`Complete! ${totalReviews} total reviews from ${productCount} products. Navigate to next or download.`, 'success');
            }
            document.getElementById('extractBtn').disabled = false;
            
            // Force update stats multiple times to ensure UI updates
            await updateStats();
            setTimeout(async () => await updateStats(), 250);
            setTimeout(async () => await updateStats(), 750);
            setTimeout(async () => await updateStats(), 1500);
            
          } catch (error) {
            console.error('[SCRAPER] ❌ Error saving to storage:', error);
            showStatus('Error saving data', 'error');
            document.getElementById('extractBtn').disabled = false;
          }
          
          chrome.runtime.onMessage.removeListener(resultListener);
        } else if (request.action === 'page_update') {
          showStatus(request.message, 'info');
        } else if (request.action === 'scraping_failed') {
          console.error('[SCRAPER] ❌ Scraping failed:', request.message);
          showStatus(request.message || 'Scraping failed', 'error');
          document.getElementById('extractBtn').disabled = false;
          chrome.runtime.onMessage.removeListener(resultListener);
        }
      });
    }
  });
}

function saveToDownloads(data, asin) {
  // Customizable download path - you can change this
  const downloadPath = `amazon-reviews/`; // Change this path as needed
  
  // Create filename with timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${downloadPath}Ecompulse_amz_reviews_${timestamp}.csv`;
  
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
    'review_images',
    'is_vine_review',
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
      escapeCSV(review.productUrl || 'N/A'),
      escapeCSV(review.productAsin || 'N/A'),
      escapeCSV(review.productName || 'N/A'),
      escapeCSV(review.page || 1),
      escapeCSV(review.author),
      escapeCSV(review.authorProfileLink),
      escapeCSV(review.title),
      escapeCSV(review.rating),
      escapeCSV(review.date),
      escapeCSV(review.productVariation || 'N/A'),
      escapeCSV(review.images || ''),
      escapeCSV(review.isVineReview || false),
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
        
        // Extract review images
        const imageElements = reviewElement.querySelectorAll('img[data-hook="review-image-tile"]');
        let images = '';
        if (imageElements.length > 0) {
          const imageUrls = Array.from(imageElements).map(img => img.src);
          images = imageElements.length === 1 ? imageUrls[0] : JSON.stringify(imageUrls);
        }
        
        // Check if it's a Vine review
        const vineElement = reviewElement.querySelector('span.a-color-success.a-text-bold');
        const isVineReview = vineElement && vineElement.textContent.includes('Amazon Vine') ? true : false;
        
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
          productVariation: variationElement?.textContent?.trim() || 'N/A',
          images: images,
          isVineReview: isVineReview
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
        
        // Extract review images
        const imageElements = reviewElement.querySelectorAll('img[data-hook="review-image-tile"]');
        let images = '';
        if (imageElements.length > 0) {
          const imageUrls = Array.from(imageElements).map(img => img.src);
          images = imageElements.length === 1 ? imageUrls[0] : JSON.stringify(imageUrls);
        }
        
        // Check if it's a Vine review
        const vineElement = reviewElement.querySelector('span.a-color-success.a-text-bold');
        const isVineReview = vineElement && vineElement.textContent.includes('Amazon Vine') ? true : false;
        
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
          helpful: helpfulElement?.textContent?.trim() || 'N/A',
          images: images,
          isVineReview: isVineReview
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
    
    // Store current first review ID to detect when new content loads
    const firstReviewBefore = document.querySelector('[data-hook="review"]');
    const previousFirstReviewId = firstReviewBefore ? firstReviewBefore.getAttribute('id') : null;
    
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
      // First, wait for any loading indicators to appear and disappear
      await new Promise(resolve => setTimeout(resolve, 500));
      
      await waitForCondition(() => {
        const pageIndicator = document.querySelector('.a-pagination .a-selected');
        const currentPageNum = pageIndicator ? parseInt(pageIndicator.textContent) : 0;
        
        // Check if we're on the next page
        if (currentPageNum === currentPage + 1) {
          console.log(`[MULTI-PAGE] Page indicator shows we're on page ${currentPageNum}`);
          return true;
        }
        
        // Alternative: Check if the first review ID changed
        const firstReview = document.querySelector('[data-hook="review"]');
        if (firstReview) {
          const firstReviewId = firstReview.getAttribute('id');
          if (firstReviewId && firstReviewId !== previousFirstReviewId) {
            console.log('[MULTI-PAGE] First review ID changed, new content loaded');
            return true;
          }
        }
        
        return false;
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
      
      // Continue to next pages until no more pages or reached limit
      while (maxPages === -1 || currentPage < maxPages) {
        const navigated = await navigateToNextPageAsync();
        if (!navigated) {
          console.log('[MULTI-PAGE] Cannot navigate further, stopping');
          break;
        }
        
        // Wait a bit more for content to fully render
        await new Promise(resolve => setTimeout(resolve, 1000));
        
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
        
        // Check if there's a next page button
        const nextButtonCheck = document.querySelector('li.a-last:not(.a-disabled) a');
        if (!nextButtonCheck) {
          console.log('[MULTI-PAGE] No more pages available');
          break;
        }
      }
      
      // Send all results back
      console.log(`[MULTI-PAGE] Scraping complete! Total reviews: ${allReviews.length}`);
      
      // Send completion message
      chrome.runtime.sendMessage({
        action: 'page_update',
        message: `Finished! Scraped ${allReviews.length} reviews from ${currentPage} pages.`
      });
      
      // Small delay before sending final results
      setTimeout(() => {
        chrome.runtime.sendMessage({
          action: 'all_pages_complete',
          allReviews: allReviews,
          productName: productName,
          totalReviews: allReviews.length,
          pagesScraped: currentPage,
          asin: asin
        });
      }, 500);
      
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