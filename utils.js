// utils.js - ไฟล์ Utilities

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

// Fetch current gold prices
async function fetchGoldPrices() {
    try {
        console.log('Fetching gold prices from:', GOLD_PRICE_API);
        const response = await fetch(GOLD_PRICE_API);
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        const data = await response.json();
        //console.log('API Response:', JSON.stringify(data, null, 2));
        if (!data.success || !Array.isArray(data.data)) {
            throw new Error('Invalid API response format: success is false or data is not an array');
        }
        
        let barBuyPrice = 0, barSellPrice = 0, ornamentBuyPrice = 0, ornamentSellPrice = 0;
        for (const item of data.data) {
            console.log('Processing item:', item);
            if (item.sellPriceGoldBar === "ราคาขายออก" && item.taxBasePrice === "ทองคำแท่ง 96.5%") {
                barBuyPrice = parseFloat(item.buyPriceGoldOrnament) || 0;
                console.log(`Found bar buy price (ราคาขายออก): ${barBuyPrice}`);
            } else if (item.sellPriceGoldBar === "ราคาขายออก" && item.taxBasePrice === "ทองรูปพรรณ 96.5%") {
                ornamentBuyPrice = parseFloat(item.buyPriceGoldOrnament) || 0;
                console.log(`Found ornament buy price (ราคาขายออก): ${ornamentBuyPrice}`);
            } else if (item.sellPriceGoldBar === "รับซื้อ" && item.buyPriceGoldOrnament) {
                const price = parseFloat(item.buyPriceGoldOrnament) || 0;
                barSellPrice = price;
                ornamentSellPrice = price;
                console.log(`Found sell price (รับซื้อ) for both types: ${price}`);
            }
        }
        
        console.log('Parsed Prices:', { barBuyPrice, barSellPrice, ornamentBuyPrice, ornamentSellPrice });
        
        if (!barBuyPrice || !barSellPrice || !ornamentBuyPrice) {
            throw new Error('Missing required price data: barBuyPrice, barSellPrice, or ornamentBuyPrice');
        }
        
        currentGoldPrices.bar.buyPrice = barBuyPrice;
        currentGoldPrices.bar.sellPrice = barSellPrice;
        currentGoldPrices.ornament.buyPrice = ornamentBuyPrice;
        currentGoldPrices.ornament.sellPrice = ornamentSellPrice;
        
        console.log('Stored Prices:', currentGoldPrices);
        return true;
    } catch (error) {
        console.error('Error fetching gold prices:', error.message);
        Swal.fire('ข้อผิดพลาด', 'ไม่สามารถดึงราคาทองคำล่าสุดได้ กรุณากรอกราคาด้วยตนเอง', 'error');
        return false;
    }
}

// Fetch bank accounts from Google Sheets
async function fetchBankAccounts() {
    try {
        const response = await fetch(`${API_URL}?action=getBankAccounts`);
        const data = await response.json();
        if (data.success) {
            BANK_ACCOUNTS = data.bankAccounts.reduce((acc, bank) => {
                acc[bank.bankName] = bank.accountNumber;
                return acc;
            }, {});
            //console.log('Fetched bank accounts:', BANK_ACCOUNTS);
        } else {
            console.error('Failed to fetch bank accounts:', data.message);
        }
    } catch (error) {
        //console.error('Error fetching bank accounts:', error);
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

// Send Flex Message
async function sendFlexMessage(transactionType, amount, price, total, newBalance, goldType) {
    const flexMessage = {
        type: "flex",
        altText: `${transactionType}ทอง ${getGoldUnitText(amount)} (${getGoldTypeText(goldType)})`,
        contents: {
            type: "bubble",
            hero: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "box",
                        layout: "vertical",
                        contents: [
                            {
                                type: "text",
                                text: transactionType === "ซื้อ" ? "✅ ซื้อทองสำเร็จ" : "✅ ขายทองสำเร็จ",
                                size: "xl",
                                color: "#ffffff",
                                weight: "bold",
                                align: "center"
                            }
                        ],
                        backgroundColor: transactionType === "ซื้อ" ? "#10b981" : "#ef4444",
                        paddingAll: "20px"
                    }
                ],
                paddingAll: "0px"
            },
            body: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "ผู้ทำรายการ",
                                size: "sm",
                                color: "#666666",
                                flex: 4
                            },
                            {
                                type: "text",
                                text: window.userData ? window.userData.name : 'ผู้ใช้',
                                size: "sm",
                                color: "#111111",
                                align: "end",
                                flex: 6,
                                wrap: true
                            }
                        ],
                        margin: "md"
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "ประเภททอง",
                                size: "sm",
                                color: "#666666",
                                flex: 4
                            },
                            {
                                type: "text",
                                text: getGoldTypeText(goldType),
                                size: "sm",
                                color: "#111111",
                                align: "end",
                                flex: 6
                            }
                        ],
                        margin: "md"
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "จำนวนทอง",
                                size: "sm",
                                color: "#666666",
                                flex: 4
                            },
                            {
                                type: "text",
                                text: getGoldUnitText(amount),
                                size: "sm",
                                color: "#111111",
                                align: "end",
                                flex: 6
                            }
                        ],
                        margin: "md"
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "ราคาทอง",
                                size: "sm",
                                color: "#666666",
                                flex: 4
                            },
                            {
                                type: "text",
                                text: `฿${formatCurrency(price)}/บาท`,
                                size: "sm",
                                color: "#111111",
                                align: "end",
                                flex: 6
                            }
                        ],
                        margin: "md"
                    },
                    {
                        type: "separator",
                        margin: "lg"
                    },
                    {
                        type: "box",
                        layout: "horizontal",
                        contents: [
                            {
                                type: "text",
                                text: "ยอดเงินรวม",
                                size: "md",
                                color: "#111111",
                                weight: "bold",
                                flex: 4
                            },
                            {
                                type: "text",
                                text: `฿${formatCurrency(total)}`,
                                size: "md",
                                color: transactionType === "ซื้อ" ? "#10b981" : "#ef4444",
                                align: "end",
                                weight: "bold",
                                flex: 6
                            }
                        ],
                        margin: "lg"
                    },
                    {
                        type: "box",
                        layout: "vertical",
                        contents: [
                            {
                                type: "box",
                                layout: "horizontal",
                                contents: [
                                    {
                                        type: "text",
                                        text: "💰 ทองคงเหลือ",
                                        size: "sm",
                                        color: "#ffffff",
                                        flex: 5
                                    },
                                    {
                                        type: "text",
                                        text: `${formatNumber(newBalance)} กรัม`,
                                        size: "sm",
                                        color: "#ffffff",
                                        align: "end",
                                        weight: "bold",
                                        flex: 5
                                    }
                                ]
                            }
                        ],
                        backgroundColor: "#fbbf24",
                        paddingAll: "15px",
                        cornerRadius: "8px",
                        margin: "lg"
                    }
                ],
                paddingAll: "20px"
            },
            footer: {
                type: "box",
                layout: "vertical",
                contents: [
                    {
                        type: "text",
                        text: new Date().toLocaleString('th-TH'),
                        size: "xs",
                        color: "#aaaaaa",
                        align: "center"
                    }
                ],
                paddingAll: "10px"
            }
        }
    };

    try {
        if (liff.isInClient()) {
            await liff.sendMessages([flexMessage]);
            //console.log('Flex Message sent successfully');
        } else {
            console.warn('Cannot send Flex Message: Not in LINE client');
        }
    } catch (error) {
        //console.error('Error sending flex message:', error);
    }
}
