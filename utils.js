// utils.js - ไฟล์ Utilities พร้อม Memory Caching

// Cache configuration
const CACHE_CONFIG = {
    goldPrices: {
        key: 'goldPricesCache',
        duration: 5 * 60 * 1000, // 5 นาที
    },
    bankAccounts: {
        key: 'bankAccountsCache', 
        duration: 60 * 60 * 1000, // 1 ชั่วโมง
    }
};

// Memory cache object
const memoryCache = {
    goldPrices: null,
    bankAccounts: null,
    timestamps: {}
};

// Format number to 2 decimal places
function formatNumber(num) {
    return parseFloat(num).toFixed(2);
}

// Format currency
function formatCurrency(num) {
    return parseFloat(num).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Convert gold unit to text
function getGoldUnitText(grams) {
    const units = [
        { grams: 76, text: "5 บาท" },
        { grams: 60.8, text: "4 บาท" },
        { grams: 45.6, text: "3 บาท" },
        { grams: 30.4, text: "2 บาท" },
        { grams: 15.2, text: "1 บาท" },
        { grams: 11.25, text: "3 สลึง" },
        { grams: 7.5, text: "2 สลึง" },
        { grams: 3.75, text: "1 สลึง" }
    ];
    const unit = units.find(u => Math.abs(u.grams - grams) < 0.01);
    return unit ? `${unit.text} (${formatNumber(grams)} กรัม)` : `${formatNumber(grams)} กรัม`;
}

// Get gold type text
function getGoldTypeText(goldType) {
    return goldType === 'bar' ? 'ทองคำแท่ง 96.5%' : 'ทองรูปพรรณ 96.5%';
}

// Check if cache is valid
function isCacheValid(cacheType) {
    const config = CACHE_CONFIG[cacheType];
    const timestamp = memoryCache.timestamps[cacheType];
    
    if (!timestamp || !memoryCache[cacheType]) {
        return false;
    }
    
    return (Date.now() - timestamp) < config.duration;
}

// Set cache data
function setCacheData(cacheType, data) {
    memoryCache[cacheType] = data;
    memoryCache.timestamps[cacheType] = Date.now();
    
    // Optional: เก็บไว้ใน sessionStorage เป็น backup
    try {
        const cacheItem = {
            data: data,
            timestamp: Date.now()
        };
        sessionStorage.setItem(CACHE_CONFIG[cacheType].key, JSON.stringify(cacheItem));
    } catch (error) {
        console.warn('Could not save to sessionStorage:', error);
    }
}

// Get cache data with fallback to sessionStorage
function getCacheData(cacheType) {
    // ลองจาก memory cache ก่อน
    if (isCacheValid(cacheType)) {
        return memoryCache[cacheType];
    }
    
    // ถ้าไม่มีใน memory ลองจาก sessionStorage
    try {
        const cached = sessionStorage.getItem(CACHE_CONFIG[cacheType].key);
        if (cached) {
            const cacheItem = JSON.parse(cached);
            const isValid = (Date.now() - cacheItem.timestamp) < CACHE_CONFIG[cacheType].duration;
            
            if (isValid) {
                // เอากลับมาเก็บใน memory cache
                memoryCache[cacheType] = cacheItem.data;
                memoryCache.timestamps[cacheType] = cacheItem.timestamp;
                return cacheItem.data;
            }
        }
    } catch (error) {
        console.warn('Could not read from sessionStorage:', error);
    }
    
    return null;
}

// Clear specific cache
function clearCache(cacheType) {
    memoryCache[cacheType] = null;
    memoryCache.timestamps[cacheType] = null;
    
    try {
        sessionStorage.removeItem(CACHE_CONFIG[cacheType].key);
    } catch (error) {
        console.warn('Could not clear sessionStorage:', error);
    }
}

// Clear all caches
function clearAllCaches() {
    Object.keys(CACHE_CONFIG).forEach(cacheType => {
        clearCache(cacheType);
    });
}

// Fetch current gold prices with caching
async function fetchGoldPrices(forceRefresh = false) {
    try {
        // ตรวจสอบ cache ก่อน (ยกเว้นถ้า force refresh)
        if (!forceRefresh) {
            const cachedPrices = getCacheData('goldPrices');
            if (cachedPrices) {
                console.log('Using cached gold prices');
                
                // อัปเดตราคาใน currentGoldPrices object
                currentGoldPrices.bar.buyPrice = cachedPrices.bar.buyPrice;
                currentGoldPrices.bar.sellPrice = cachedPrices.bar.sellPrice;
                currentGoldPrices.ornament.buyPrice = cachedPrices.ornament.buyPrice;
                currentGoldPrices.ornament.sellPrice = cachedPrices.ornament.sellPrice;
                
                return true;
            }
        }
        
        console.log('Fetching fresh gold prices from API');
        const response = await fetch(GOLD_PRICE_API);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        
        if (!data.success || !Array.isArray(data.data)) {
            throw new Error('Invalid API response format: success is false or data is not an array');
        }
        
        let barBuyPrice = 0, barSellPrice = 0, ornamentBuyPrice = 0, ornamentSellPrice = 0;
        for (const item of data.data) {
            if (item.sellPriceGoldBar === "ราคาขายออก" && item.taxBasePrice === "ทองคำแท่ง 96.5%") {
                barBuyPrice = parseFloat(item.buyPriceGoldOrnament) || 0;
            } else if (item.sellPriceGoldBar === "ราคาขายออก" && item.taxBasePrice === "ทองรูปพรรณ 96.5%") {
                ornamentBuyPrice = parseFloat(item.buyPriceGoldOrnament) || 0;
            } else if (item.sellPriceGoldBar === "รับซื้อ" && item.buyPriceGoldOrnament) {
                const price = parseFloat(item.buyPriceGoldOrnament) || 0;
                barSellPrice = price;
                ornamentSellPrice = price;
            }
        }
        
        if (!barBuyPrice || !barSellPrice || !ornamentBuyPrice) {
            throw new Error('Missing required price data: barBuyPrice, barSellPrice, or ornamentBuyPrice');
        }
        
        // เก็บราคาใน currentGoldPrices object
        currentGoldPrices.bar.buyPrice = barBuyPrice;
        currentGoldPrices.bar.sellPrice = barSellPrice;
        currentGoldPrices.ornament.buyPrice = ornamentBuyPrice;
        currentGoldPrices.ornament.sellPrice = ornamentSellPrice;
        
        // เก็บใน cache
        const pricesData = {
            bar: {
                buyPrice: barBuyPrice,
                sellPrice: barSellPrice
            },
            ornament: {
                buyPrice: ornamentBuyPrice,
                sellPrice: ornamentSellPrice
            }
        };
        setCacheData('goldPrices', pricesData);
        
        console.log('Gold prices cached successfully');
        return true;
    } catch (error) {
        console.error('Error fetching gold prices:', error.message);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงราคาทองคำล่าสุดได้ กรุณากรอกราคาด้วยตนเอง', 'error');
        return false;
    }
}

// Fetch bank accounts from Google Sheets with caching
async function fetchBankAccounts(forceRefresh = false) {
    try {
        // ตรวจสอบ cache ก่อน (ยกเว้นถ้า force refresh)
        if (!forceRefresh) {
            const cachedBankAccounts = getCacheData('bankAccounts');
            if (cachedBankAccounts) {
                console.log('Using cached bank accounts');
                BANK_ACCOUNTS = cachedBankAccounts;
                return true;
            }
        }
        
        console.log('Fetching fresh bank accounts from API');
        const response = await fetch(`${API_URL}?action=getBankAccounts`);
        const data = await response.json();
        
        if (data.success) {
            const bankAccountsData = data.bankAccounts.reduce((acc, bank) => {
                acc[bank.bankName] = bank.accountNumber;
                return acc;
            }, {});
            
            BANK_ACCOUNTS = bankAccountsData;
            
            // เก็บใน cache
            setCacheData('bankAccounts', bankAccountsData);
            
            console.log('Bank accounts cached successfully');
            return true;
        } else {
            console.error('Failed to fetch bank accounts:', data.message);
            return false;
        }
    } catch (error) {
        console.error('Error fetching bank accounts:', error);
        return false;
    }
}

// Function to convert file to Base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const base64String = reader.result.split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });
}

// Utility function to get cache info (for debugging)
function getCacheInfo() {
    return {
        goldPrices: {
            cached: !!memoryCache.goldPrices,
            timestamp: memoryCache.timestamps.goldPrices,
            valid: isCacheValid('goldPrices'),
            expiresIn: memoryCache.timestamps.goldPrices ? 
                Math.max(0, CACHE_CONFIG.goldPrices.duration - (Date.now() - memoryCache.timestamps.goldPrices)) : 0
        },
        bankAccounts: {
            cached: !!memoryCache.bankAccounts,
            timestamp: memoryCache.timestamps.bankAccounts,
            valid: isCacheValid('bankAccounts'),
            expiresIn: memoryCache.timestamps.bankAccounts ? 
                Math.max(0, CACHE_CONFIG.bankAccounts.duration - (Date.now() - memoryCache.timestamps.bankAccounts)) : 0
        }
    };
}

// Initialize caches on page load
async function initializeCaches() {
    console.log('Initializing caches...');
    
    const promises = [];
    
    // โหลดราคาทองคำ
    promises.push(fetchGoldPrices());
    
    // โหลดบัญชีธนาคาร
    promises.push(fetchBankAccounts());
    
    try {
        await Promise.all(promises);
        console.log('All caches initialized successfully');
    } catch (error) {
        console.error('Error initializing caches:', error);
    }
}

// Export functions for global use (if needed)
window.cacheUtils = {
    clearCache,
    clearAllCaches,
    getCacheInfo,
    forceRefreshGoldPrices: () => fetchGoldPrices(true),
    forceRefreshBankAccounts: () => fetchBankAccounts(true)
};
