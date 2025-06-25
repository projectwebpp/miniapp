// utils.js - ไฟล์ Utilities (Optimized Version)

// ==================== Basic Formatting Functions ====================

// Format number to 2 decimal places
function formatNumber(num) {
    return parseFloat(num || 0).toFixed(2);
}

// Format currency with Thai locale
function formatCurrency(num) {
    return parseFloat(num || 0).toLocaleString('th-TH', { 
        minimumFractionDigits: 2, 
        maximumFractionDigits: 2 
    });
}

// ==================== Gold Functions ====================

// Convert gold unit to text (optimized with lookup table)
const GOLD_UNITS = [
    { grams: 76, text: "5 บาท" },
    { grams: 60.8, text: "4 บาท" },
    { grams: 45.6, text: "3 บาท" },
    { grams: 30.4, text: "2 บาท" },
    { grams: 15.2, text: "1 บาท" },
    { grams: 11.25, text: "3 สลึง" },
    { grams: 7.5, text: "2 สลึง" },
    { grams: 3.75, text: "1 สลึง" }
];

function getGoldUnitText(grams) {
    const unit = GOLD_UNITS.find(u => Math.abs(u.grams - grams) < 0.01);
    return unit ? `${unit.text} (${formatNumber(grams)} กรัม)` : `${formatNumber(grams)} กรัม`;
}

// Get gold type text (optimized)
function getGoldTypeText(goldType) {
    return goldType === 'bar' ? 'ทองคำแท่ง 96.5%' : 'ทองรูปพรรณ 96.5%';
}

// ==================== API Functions ====================

// Fetch current gold prices (with caching)
let goldPriceCache = null;
let lastPriceFetch = 0;
const CACHE_DURATION = 30000; // 30 seconds

async function fetchGoldPrices() {
    try {
        // Check cache first
        const now = Date.now();
        if (goldPriceCache && (now - lastPriceFetch) < CACHE_DURATION) {
            console.log('Using cached gold prices');
            Object.assign(currentGoldPrices, goldPriceCache);
            return true;
        }

        console.log('Fetching fresh gold prices from:', GOLD_PRICE_API);
        
        // Use fetch with timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(GOLD_PRICE_API, {
            signal: controller.signal,
            headers: {
                'Accept': 'application/json',
                'Cache-Control': 'no-cache'
            }
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (!data.success || !Array.isArray(data.data)) {
            throw new Error('Invalid API response format');
        }
        
        // Optimized price parsing
        const prices = {
            barBuyPrice: 0,
            barSellPrice: 0,
            ornamentBuyPrice: 0,
            ornamentSellPrice: 0
        };
        
        for (const item of data.data) {
            const sellType = item.sellPriceGoldBar;
            const goldType = item.taxBasePrice;
            const price = parseFloat(item.buyPriceGoldOrnament) || 0;
            
            if (sellType === "ราคาขายออก") {
                if (goldType === "ทองคำแท่ง 96.5%") {
                    prices.barBuyPrice = price;
                } else if (goldType === "ทองรูปพรรณ 96.5%") {
                    prices.ornamentBuyPrice = price;
                }
            } else if (sellType === "รับซื้อ" && price > 0) {
                prices.barSellPrice = price;
                prices.ornamentSellPrice = price;
            }
        }
        
        // Validate required prices
        if (!prices.barBuyPrice || !prices.barSellPrice || !prices.ornamentBuyPrice) {
            throw new Error('Missing required price data');
        }
        
        // Update global prices and cache
        currentGoldPrices.bar.buyPrice = prices.barBuyPrice;
        currentGoldPrices.bar.sellPrice = prices.barSellPrice;
        currentGoldPrices.ornament.buyPrice = prices.ornamentBuyPrice;
        currentGoldPrices.ornament.sellPrice = prices.ornamentSellPrice;
        
        // Cache the results
        goldPriceCache = { ...currentGoldPrices };
        lastPriceFetch = now;
        
        console.log('Gold prices updated successfully');
        return true;
        
    } catch (error) {
        console.error('Error fetching gold prices:', error.message);
        
        // Use cached data if available
        if (goldPriceCache) {
            console.log('Using cached gold prices due to error');
            Object.assign(currentGoldPrices, goldPriceCache);
            return true;
        }
        
        // Show user-friendly error
        if (typeof Swal !== 'undefined') {
            Swal.fire({
                icon: 'warning',
                title: 'แจ้งเตือน',
                text: 'ไม่สามารถดึงราคาทองคำล่าสุดได้ กรุณากรอกราคาด้วยตนเอง',
                timer: 3000,
                showConfirmButton: false,
                toast: true,
                position: 'top-end'
            });
        }
        
        return false;
    }
}

// Fetch bank accounts (with caching)
let bankAccountsCache = null;
let lastBankFetch = 0;
const BANK_CACHE_DURATION = 300000; // 5 minutes

async function fetchBankAccounts() {
    try {
        // Check cache first
        const now = Date.now();
        if (bankAccountsCache && (now - lastBankFetch) < BANK_CACHE_DURATION) {
            console.log('Using cached bank accounts');
            Object.assign(BANK_ACCOUNTS, bankAccountsCache);
            return true;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        const response = await fetch(`${API_URL}?action=getBankAccounts`, {
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.success && Array.isArray(data.bankAccounts)) {
            // Clear existing accounts
            Object.keys(BANK_ACCOUNTS).forEach(key => delete BANK_ACCOUNTS[key]);
            
            // Update with new accounts
            data.bankAccounts.forEach(bank => {
                BANK_ACCOUNTS[bank.bankName] = bank.accountNumber;
            });
            
            // Cache the results
            bankAccountsCache = { ...BANK_ACCOUNTS };
            lastBankFetch = now;
            
            console.log('Bank accounts updated successfully');
            return true;
        } else {
            throw new Error('Invalid bank accounts response');
        }
        
    } catch (error) {
        console.error('Error fetching bank accounts:', error);
        
        // Use cached data if available
        if (bankAccountsCache) {
            console.log('Using cached bank accounts due to error');
            Object.assign(BANK_ACCOUNTS, bankAccountsCache);
            return true;
        }
        
        return false;
    }
}

// ==================== File Handling ====================

// Convert file to Base64 (optimized)
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        // Validate file
        if (!file || !file.type) {
            reject(new Error('Invalid file'));
            return;
        }
        
        // Check file size (limit to 5MB)
        if (file.size > 5 * 1024 * 1024) {
            reject(new Error('File size too large (max 5MB)'));
            return;
        }
        
        const reader = new FileReader();
        
        reader.onload = () => {
            try {
                const result = reader.result;
                if (!result || typeof result !== 'string') {
                    reject(new Error('Failed to read file'));
                    return;
                }
                
                const base64String = result.split(',')[1];
                if (!base64String) {
                    reject(new Error('Invalid base64 data'));
                    return;
                }
                
                resolve(base64String);
            } catch (error) {
                reject(error);
            }
        };
        
        reader.onerror = () => {
            reject(new Error('Failed to read file'));
        };
        
        reader.readAsDataURL(file);
    });
}

// ==================== Utility Functions ====================

// Debounce function for performance optimization
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Throttle function for performance optimization
function throttle(func, limit) {
    let inThrottle;
    return function() {
        const args = arguments;
        const context = this;
        if (!inThrottle) {
            func.apply(context, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    }
}

// Simple loading state manager
const LoadingManager = {
    activeLoaders: new Set(),
    
    show(id = 'default') {
        this.activeLoaders.add(id);
        this.updateUI();
    },
    
    hide(id = 'default') {
        this.activeLoaders.delete(id);
        this.updateUI();
    },
    
    updateUI() {
        const isLoading = this.activeLoaders.size > 0;
        const loadingElements = document.querySelectorAll('.loading-overlay, #loading');
        
        loadingElements.forEach(el => {
            if (isLoading) {
                el.classList.remove('hidden');
            } else {
                el.classList.add('hidden');
            }
        });
    }
};

// Local storage helpers
const Storage = {
    set(key, value) {
        try {
            localStorage.setItem(key, JSON.stringify(value));
            return true;
        } catch (error) {
            console.error('Storage set error:', error);
            return false;
        }
    },
    
    get(key, defaultValue = null) {
        try {
            const item = localStorage.getItem(key);
            return item ? JSON.parse(item) : defaultValue;
        } catch (error) {
            console.error('Storage get error:', error);
            return defaultValue;
        }
    },
    
    remove(key) {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.error('Storage remove error:', error);
            return false;
        }
    }
};

// ==================== Performance Optimizations ====================

// Lazy load images
function lazyLoadImages() {
    const images = document.querySelectorAll('img[data-src]');
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                img.src = img.dataset.src;
                img.classList.remove('lazy');
                imageObserver.unobserve(img);
            }
        });
    });
    
    images.forEach(img => imageObserver.observe(img));
}

// Preload critical resources
function preloadCriticalResources() {
    const criticalResources = [
        // Add critical CSS/JS files here
    ];
    
    criticalResources.forEach(resource => {
        const link = document.createElement('link');
        link.rel = 'preload';
        link.href = resource.href;
        link.as = resource.as;
        document.head.appendChild(link);
    });
}

// Initialize optimizations when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        lazyLoadImages();
        preloadCriticalResources();
    });
} else {
    lazyLoadImages();
    preloadCriticalResources();
}

// ==================== Export for ES6 modules (if needed) ====================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        formatNumber,
        formatCurrency,
        getGoldUnitText,
        getGoldTypeText,
        fetchGoldPrices,
        fetchBankAccounts,
        fileToBase64,
        debounce,
        throttle,
        LoadingManager,
        Storage
    };
}
