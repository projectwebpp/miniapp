// utils.js - Advanced Caching System with Multiple Storage Methods

// Cache configuration
const CACHE_CONFIG = {
    goldPrices: {
        key: 'goldPricesCache',
        duration: 5 * 60 * 1000, // 5 นาที
        endpoint: 'goldPrices',
        priority: 'high' // high priority = เก็บใน Cache Storage
    },
    bankAccounts: {
        key: 'bankAccountsCache', 
        duration: 60 * 60 * 1000, // 1 ชั่วโมง
        endpoint: 'bankAccounts',
        priority: 'medium'
    }
};

// Multi-layer cache system
const cacheSystem = {
    // Layer 1: Memory Cache (fastest)
    memory: {
        goldPrices: null,
        bankAccounts: null,
        timestamps: {}
    },
    
    // Layer 2: Cache Storage name
    cacheName: 'gold-app-cache-v1',
    
    // Layer 3: IndexedDB for large data
    dbName: 'GoldAppDB',
    dbVersion: 1
};

// Format functions (unchanged)
function formatNumber(num) {
    return parseFloat(num).toFixed(2);
}

function formatCurrency(num) {
    return parseFloat(num).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

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

function getGoldTypeText(goldType) {
    return goldType === 'bar' ? 'ทองคำแท่ง 96.5%' : 'ทองรูปพรรณ 96.5%';
}

// =================================================================================
// ADVANCED CACHING SYSTEM
// =================================================================================

// 1. Cache Storage API (สำหรับข้อมูลสำคัญ)
class CacheStorageManager {
    static async set(key, data, config) {
        try {
            if (!('caches' in window)) {
                console.warn('Cache API not supported');
                return false;
            }

            const cache = await caches.open(cacheSystem.cacheName);
            const cacheData = {
                data: data,
                timestamp: Date.now(),
                expiresAt: Date.now() + config.duration,
                version: '1.0'
            };

            const response = new Response(JSON.stringify(cacheData), {
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': `max-age=${Math.floor(config.duration / 1000)}`
                }
            });

            await cache.put(key, response);
            console.log(`✅ Cached in Cache Storage: ${key}`);
            return true;
        } catch (error) {
            console.error('Cache Storage error:', error);
            return false;
        }
    }

    static async get(key, config) {
        try {
            if (!('caches' in window)) return null;

            const cache = await caches.open(cacheSystem.cacheName);
            const response = await cache.match(key);
            
            if (!response) return null;

            const cacheData = await response.json();
            
            // ตรวจสอบว่าหมดอายุหรือยัง
            if (Date.now() > cacheData.expiresAt) {
                await cache.delete(key);
                return null;
            }

            console.log(`✅ Retrieved from Cache Storage: ${key}`);
            return cacheData.data;
        } catch (error) {
            console.error('Cache Storage retrieval error:', error);
            return null;
        }
    }

    static async clear(key) {
        try {
            if (!('caches' in window)) return;
            const cache = await caches.open(cacheSystem.cacheName);
            await cache.delete(key);
        } catch (error) {
            console.error('Cache Storage clear error:', error);
        }
    }

    static async clearAll() {
        try {
            if (!('caches' in window)) return;
            await caches.delete(cacheSystem.cacheName);
        } catch (error) {
            console.error('Cache Storage clear all error:', error);
        }
    }
}

// 2. IndexedDB Manager (สำหรับข้อมูลขนาดใหญ่)
class IndexedDBManager {
    static async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(cacheSystem.dbName, cacheSystem.dbVersion);
            
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('cache')) {
                    const store = db.createObjectStore('cache', { keyPath: 'key' });
                    store.createIndex('timestamp', 'timestamp', { unique: false });
                }
            };
        });
    }

    static async set(key, data, config) {
        try {
            const db = await this.init();
            const transaction = db.transaction(['cache'], 'readwrite');
            const store = transaction.objectStore('cache');
            
            const cacheData = {
                key: key,
                data: data,
                timestamp: Date.now(),
                expiresAt: Date.now() + config.duration
            };
            
            await store.put(cacheData);
            console.log(`✅ Cached in IndexedDB: ${key}`);
            return true;
        } catch (error) {
            console.error('IndexedDB set error:', error);
            return false;
        }
    }

    static async get(key) {
        try {
            const db = await this.init();
            const transaction = db.transaction(['cache'], 'readonly');
            const store = transaction.objectStore('cache');
            
            return new Promise((resolve) => {
                const request = store.get(key);
                request.onsuccess = () => {
                    const result = request.result;
                    if (!result || Date.now() > result.expiresAt) {
                        resolve(null);
                        return;
                    }
                    console.log(`✅ Retrieved from IndexedDB: ${key}`);
                    resolve(result.data);
                };
                request.onerror = () => resolve(null);
            });
        } catch (error) {
            console.error('IndexedDB get error:', error);
            return null;
        }
    }
}

// 3. Smart Cache Manager - เลือกใช้ storage ที่เหมาะสม
class SmartCacheManager {
    static async set(cacheType, data) {
        const config = CACHE_CONFIG[cacheType];
        
        // Layer 1: Memory Cache (ทุกกรณี)
        cacheSystem.memory[cacheType] = data;
        cacheSystem.memory.timestamps[cacheType] = Date.now();
        
        // Layer 2 & 3: เลือกตาม priority และขนาดข้อมูล
        const dataSize = JSON.stringify(data).length;
        
        if (config.priority === 'high' || dataSize < 50000) { // < 50KB
            // ใช้ Cache Storage สำหรับข้อมูลสำคัญหรือขนาดเล็ก
            await CacheStorageManager.set(config.key, data, config);
        } else {
            // ใช้ IndexedDB สำหรับข้อมูลขนาดใหญ่
            await IndexedDBManager.set(config.key, data, config);
        }
        
        // Fallback: localStorage/sessionStorage
        try {
            const fallbackData = {
                data: data,
                timestamp: Date.now(),
                expiresAt: Date.now() + config.duration
            };
            
            if (dataSize < 5000000) { // < 5MB limit for localStorage
                localStorage.setItem(config.key, JSON.stringify(fallbackData));
            }
        } catch (error) {
            console.warn('localStorage fallback failed:', error);
        }
    }

    static async get(cacheType) {
        const config = CACHE_CONFIG[cacheType];
        
        // Layer 1: Memory Cache (เร็วที่สุด)
        if (this.isMemoryCacheValid(cacheType)) {
            console.log(`✅ Retrieved from Memory: ${cacheType}`);
            return cacheSystem.memory[cacheType];
        }
        
        // Layer 2: Cache Storage หรือ IndexedDB
        let data = null;
        if (config.priority === 'high') {
            data = await CacheStorageManager.get(config.key, config);
        } else {
            data = await IndexedDBManager.get(config.key);
        }
        
        if (data) {
            // เอากลับไปเก็บใน memory cache
            cacheSystem.memory[cacheType] = data;
            cacheSystem.memory.timestamps[cacheType] = Date.now();
            return data;
        }
        
        // Layer 3: Fallback to localStorage
        try {
            const cached = localStorage.getItem(config.key);
            if (cached) {
                const cacheData = JSON.parse(cached);
                if (Date.now() < cacheData.expiresAt) {
                    console.log(`✅ Retrieved from localStorage: ${cacheType}`);
                    // เอากลับไปเก็บใน memory cache
                    cacheSystem.memory[cacheType] = cacheData.data;
                    cacheSystem.memory.timestamps[cacheType] = Date.now();
                    return cacheData.data;
                }
            }
        } catch (error) {
            console.warn('localStorage retrieval failed:', error);
        }
        
        return null;
    }

    static isMemoryCacheValid(cacheType) {
        const config = CACHE_CONFIG[cacheType];
        const timestamp = cacheSystem.memory.timestamps[cacheType];
        const data = cacheSystem.memory[cacheType];
        
        return data && timestamp && (Date.now() - timestamp) < config.duration;
    }

    static async clear(cacheType) {
        const config = CACHE_CONFIG[cacheType];
        
        // Clear memory
        cacheSystem.memory[cacheType] = null;
        cacheSystem.memory.timestamps[cacheType] = null;
        
        // Clear persistent storage
        await CacheStorageManager.clear(config.key);
        
        try {
            localStorage.removeItem(config.key);
        } catch (error) {
            console.warn('localStorage clear failed:', error);
        }
    }

    static async clearAll() {
        // Clear memory
        Object.keys(CACHE_CONFIG).forEach(cacheType => {
            cacheSystem.memory[cacheType] = null;
            cacheSystem.memory.timestamps[cacheType] = null;
        });
        
        // Clear persistent storage
        await CacheStorageManager.clearAll();
        
        try {
            Object.keys(CACHE_CONFIG).forEach(cacheType => {
                localStorage.removeItem(CACHE_CONFIG[cacheType].key);
            });
        } catch (error) {
            console.warn('localStorage clear all failed:', error);
        }
    }
}

// =================================================================================
// API FUNCTIONS WITH ADVANCED CACHING
// =================================================================================

// Fetch current gold prices with advanced caching
async function fetchGoldPrices(forceRefresh = false) {
    try {
        // ตรวจสอบ cache ก่อน (ยกเว้นถ้า force refresh)
        if (!forceRefresh) {
            const cachedPrices = await SmartCacheManager.get('goldPrices');
            if (cachedPrices) {
                // อัปเดตราคาใน currentGoldPrices object
                Object.assign(currentGoldPrices, cachedPrices);
                return true;
            }
        }
        
        console.log('🔄 Fetching fresh gold prices from API...');
        const response = await fetch(GOLD_PRICE_API);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        
        if (!data.success || !Array.isArray(data.data)) {
            throw new Error('Invalid API response format');
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
            throw new Error('Missing required price data');
        }
        
        const pricesData = {
            bar: { buyPrice: barBuyPrice, sellPrice: barSellPrice },
            ornament: { buyPrice: ornamentBuyPrice, sellPrice: ornamentSellPrice },
            lastUpdated: new Date().toISOString()
        };
        
        // เก็บราคาใน currentGoldPrices object
        Object.assign(currentGoldPrices, pricesData);
        
        // เก็บใน advanced cache
        await SmartCacheManager.set('goldPrices', pricesData);
        
        console.log('✅ Gold prices cached successfully');
        return true;
    } catch (error) {
        console.error('❌ Error fetching gold prices:', error.message);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงราคาทองคำล่าสุดได้ กรุณากรอกราคาด้วยตนเอง', 'error');
        return false;
    }
}

// Fetch bank accounts with advanced caching
async function fetchBankAccounts(forceRefresh = false) {
    try {
        if (!forceRefresh) {
            const cachedBankAccounts = await SmartCacheManager.get('bankAccounts');
            if (cachedBankAccounts) {
                BANK_ACCOUNTS = cachedBankAccounts;
                return true;
            }
        }
        
        console.log('🔄 Fetching fresh bank accounts from API...');
        const response = await fetch(`${API_URL}?action=getBankAccounts`);
        const data = await response.json();
        
        if (data.success) {
            const bankAccountsData = data.bankAccounts.reduce((acc, bank) => {
                acc[bank.bankName] = bank.accountNumber;
                return acc;
            }, {});
            
            BANK_ACCOUNTS = bankAccountsData;
            
            // เก็บใน advanced cache
            await SmartCacheManager.set('bankAccounts', bankAccountsData);
            
            console.log('✅ Bank accounts cached successfully');
            return true;
        } else {
            console.error('❌ Failed to fetch bank accounts:', data.message);
            return false;
        }
    } catch (error) {
        console.error('❌ Error fetching bank accounts:', error);
        return false;
    }
}

// Background cache refresh (ไม่บล็อก UI)
async function backgroundCacheRefresh() {
    console.log('🔄 Background cache refresh started...');
    
    try {
        // ใช้ Promise.allSettled เพื่อไม่ให้ error ของ API หนึ่งตัวทำให้อีกตัวล้มเหลว
        const results = await Promise.allSettled([
            fetchGoldPrices(true),
            fetchBankAccounts(true)
        ]);
        
        results.forEach((result, index) => {
            const apiName = index === 0 ? 'Gold Prices' : 'Bank Accounts';
            if (result.status === 'fulfilled') {
                console.log(`✅ ${apiName} refreshed successfully`);
            } else {
                console.error(`❌ ${apiName} refresh failed:`, result.reason);
            }
        });
        
        console.log('✅ Background cache refresh completed');
    } catch (error) {
        console.error('❌ Background cache refresh error:', error);
    }
}

// Preload critical data
async function preloadCriticalData() {
    console.log('🚀 Preloading critical data...');
    
    // เริ่มโหลดข้อมูลทั้งหมดพร้อมกัน (non-blocking)
    const promises = [
        fetchGoldPrices(),
        fetchBankAccounts()
    ];
    
    // รอให้อย่างน้อย gold prices โหลดเสร็จ (critical)
    try {
        await promises[0];
        console.log('✅ Critical data (gold prices) loaded');
        
        // Bank accounts อาจโหลดช้ากว่าได้ (non-critical)
        promises[1].catch(error => {
            console.warn('Bank accounts preload failed:', error);
        });
        
    } catch (error) {
        console.error('Critical data preload failed:', error);
    }
}

// Cache health check
async function getCacheHealth() {
    const health = {
        memory: {},
        storage: {},
        performance: {
            memoryUsage: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + ' MB' : 'N/A',
            timestamp: new Date().toISOString()
        }
    };
    
    // Check memory cache
    Object.keys(CACHE_CONFIG).forEach(cacheType => {
        const isValid = SmartCacheManager.isMemoryCacheValid(cacheType);
        const timestamp = cacheSystem.memory.timestamps[cacheType];
        health.memory[cacheType] = {
            cached: !!cacheSystem.memory[cacheType],
            valid: isValid,
            age: timestamp ? Date.now() - timestamp : null,
            expiresIn: timestamp ? Math.max(0, CACHE_CONFIG[cacheType].duration - (Date.now() - timestamp)) : 0
        };
    });
    
    // Check storage availability
    health.storage = {
        cacheAPI: 'caches' in window,
        indexedDB: 'indexedDB' in window,
        localStorage: 'localStorage' in window && localStorage !== null,
        sessionStorage: 'sessionStorage' in window && sessionStorage !== null
    };
    
    return health;
}

// Initialize advanced caching system
async function initializeAdvancedCaching() {
    console.log('🚀 Initializing advanced caching system...');
    
    try {
        // Preload critical data first
        await preloadCriticalData();
        
        // Set up background refresh (ทุก 4 นาที)
        setInterval(backgroundCacheRefresh, 4 * 60 * 1000);
        
        // Set up cache health monitoring (ทุก 30 วินาที)
        if (window.DEBUG_MODE) {
            setInterval(async () => {
                const health = await getCacheHealth();
                console.log('📊 Cache Health:', health);
            }, 30 * 1000);
        }
        
        console.log('✅ Advanced caching system initialized');
    } catch (error) {
        console.error('❌ Advanced caching initialization failed:', error);
    }
}

// Function to convert file to Base64 (unchanged)
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

// Global cache utilities
window.advancedCache = {
    clear: (cacheType) => SmartCacheManager.clear(cacheType),
    clearAll: () => SmartCacheManager.clearAll(),
    getHealth: getCacheHealth,
    forceRefresh: backgroundCacheRefresh,
    preload: preloadCriticalData
};

// Auto-initialize when script loads
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeAdvancedCaching);
} else {
    initializeAdvancedCaching();
}
