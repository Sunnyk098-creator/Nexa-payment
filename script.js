// ==========================================
// 1. FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
    apiKey: "AIzaSyD9USJllayyRWHq2FZr7sH6sEPyaXhu_Ek",
    authDomain: "nexa-payments.firebaseapp.com",
    databaseURL: "https://nexa-payments-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "nexa-payments",
    storageBucket: "nexa-payments.firebasestorage.app",
    messagingSenderId: "94538088085",
    appId: "1:94538088085:web:8befa95fd1d9424c8ea59c"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ==========================================
// 2. DOM ELEMENTS & BOT DETAILS
// ==========================================
const TELEGRAM_BOT_TOKEN = "8832657466:AAE_O-t4bDOOF_t_kW5MV2K-3BoX7mBASvw";
const TELEGRAM_CHAT_ID = "8522410574";

const blockedScreen = document.getElementById("blockedScreen");
const amountEntryCard = document.getElementById("amountEntryCard");
const loadingCard = document.getElementById("loadingCard");
const mainCard = document.getElementById("mainCard");
const verifyCard = document.getElementById("verifyCard");
const statusOverlay = document.getElementById("statusOverlay");

const customAmountInput = document.getElementById("customAmountInput");
const proceedToPayBtn = document.getElementById("proceedToPayBtn");
const noAmountBtn = document.getElementById("noAmountBtn");
const amountDisplay = document.getElementById("amountDisplay");
const qrcodeDiv = document.getElementById("qrcode");
const payBtn = document.getElementById("payBtn");
const paidBtn = document.getElementById("paidBtn");
const timerBox = document.getElementById("timerBox");

const cancelVerifyBtn = document.getElementById("cancelVerifyBtn");
const submitProofBtn = document.getElementById("submitProofBtn");
const retryBtn = document.getElementById("retryBtn");
const utrInput = document.getElementById("utrInput");

const timeRemainingEl = document.getElementById("timeRemaining");
const failMsgEl = document.getElementById("failMsg");

const processingContent = document.getElementById("processingContent");
const successContent = document.getElementById("successContent");
const failureContent = document.getElementById("failureContent");
const expiredContent = document.getElementById("expiredContent");
const alreadyPaidContent = document.getElementById("alreadyPaidContent");

const upiId = "sunnypro@fam"; 
const upiName = "Nexa Payments";
let currentTxnId = null;
let currentTxnData = null;
let timerInterval = null;

// ==========================================
// 3. ROUTING, IP LOCK, & INITIALIZATION
// ==========================================
document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentTxnId = urlParams.get('TXN');

    if (currentTxnId === 'no') {
        currentTxnData = { status: 'pending', amount: 0, isFlexible: true };
        timerBox.style.display = "none";
        setupQR();
    } else if (currentTxnId) {
        loadTransaction(currentTxnId);
    } else {
        blockedScreen.style.display = "flex";
        amountEntryCard.style.display = "none";
        checkAdminStatus();
    }
});

async function checkAdminStatus() {
    try {
        const ipResponse = await fetch('https://api.ipify.org?format=json');
        if (!ipResponse.ok) throw new Error("Could not fetch IP");
        const ipData = await ipResponse.json();
        const userIp = ipData.ip;

        const adminLockRef = db.ref('admin/locked_ip');
        const result = await adminLockRef.transaction((currentIpInDb) => {
            if (currentIpInDb === null) return userIp;
            else return; 
        });

        if (result.committed || (result.snapshot.exists() && result.snapshot.val() === userIp)) {
            amountEntryCard.style.display = "flex";
            blockedScreen.style.display = "none";
        } else {
            blockedScreen.style.display = "flex";
            amountEntryCard.style.display = "none";
        }
    } catch (error) {
        console.error("Admin check failed:", error);
        blockedScreen.style.display = "flex"; 
    }
}

// ==========================================
// 4. CREATE TRANSACTIONS
// ==========================================
proceedToPayBtn.addEventListener("click", () => {
    let amt = Number(customAmountInput.value);

    if (!amt || amt < 1 || amt > 10000000) {
        alert("⚠️ Please enter a valid amount between ₹1 and ₹1,00,00,000");
        return;
    }

    amountEntryCard.style.display = "none";
    loadingCard.style.display = "flex";

    setTimeout(() => {
        const newTxnId = "NPSK" + Math.random().toString(36).substr(2, 10).toUpperCase();
        db.ref('transactions/' + newTxnId).set({
            amount: amt,
            isFlexible: false,
            createdAt: Date.now(),
            status: "pending"
        }).then(() => {
            window.location.href = `/?TXN=${newTxnId}`;
        });
    }, 1500); 
});

noAmountBtn.addEventListener("click", () => {
    amountEntryCard.style.display = "none";
    loadingCard.style.display = "flex";

    setTimeout(() => {
        window.location.href = `/?TXN=no`;
    }, 1500);
});

// ==========================================
// 5. LOAD & VALIDATE LINK
// ==========================================
function loadTransaction(txnId) {
    db.ref('transactions/' + txnId).once('value', (snapshot) => {
        if (!snapshot.exists()) {
            alert("Invalid Link");
            window.location.href = "/";
            return;
        }

        currentTxnData = snapshot.val();

        if (currentTxnData.status === "paid") {
            showOverlayContent(alreadyPaidContent);
            return;
        }

        if (currentTxnData.status === "expired") {
            showOverlayContent(expiredContent);
            return;
        }

        const timePassed = Date.now() - currentTxnData.createdAt;
        if (timePassed > 600000) {
            db.ref('transactions/' + txnId).update({ status: "expired" });
            showOverlayContent(expiredContent);
            return;
        }

        setupQR();
        startTimer(600000 - timePassed);
    });
}

function setupQR() {
    mainCard.style.display = "flex";

    let upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&cu=INR`;

    if (currentTxnId === 'no' || currentTxnData.isFlexible) {
        amountDisplay.innerText = upiId; 
        amountDisplay.style.fontSize = "1.2rem";
        amountDisplay.style.letterSpacing = "1px";
        if(currentTxnId === 'no') payBtn.style.display = "none"; 
    } else {
        amountDisplay.innerText = `₹${currentTxnData.amount}`;
        upiUrl += `&am=${currentTxnData.amount}`;
    }
    
    qrcodeDiv.innerHTML = ""; 
    new QRCode(qrcodeDiv, {
        text: upiUrl,
        width: 220, height: 220,
        colorDark : "#000000", colorLight : "#ffffff",
        correctLevel : QRCode.CorrectLevel.H
    });

    payBtn.addEventListener("click", () => {
        window.location.href = upiUrl;
    });
}

function startTimer(durationMs) {
    let timeLeft = Math.floor(durationMs / 1000);
    
    timerInterval = setInterval(() => {
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
            db.ref('transactions/' + currentTxnId).update({ status: "expired" });
            mainCard.style.display = "none";
            showOverlayContent(expiredContent);
            return;
        }

        let m = Math.floor(timeLeft / 60).toString().padStart(2, '0');
        let s = (timeLeft % 60).toString().padStart(2, '0');
        timeRemainingEl.innerText = `${m}:${s}`;
        timeLeft--;
    }, 1000);
}

// ==========================================
// 6. VERIFICATION UI EVENTS
// ==========================================
paidBtn.addEventListener("click", () => {
    mainCard.style.display = "none";
    verifyCard.style.display = "flex";
});

cancelVerifyBtn.addEventListener("click", () => {
    verifyCard.style.display = "none";
    mainCard.style.display = "flex";
});

retryBtn.addEventListener("click", () => {
    statusOverlay.classList.remove("active");
    verifyCard.style.display = "flex";
});

function showOverlayContent(contentElement) {
    statusOverlay.classList.add("active");
    processingContent.style.display = "none";
    successContent.style.display = "none";
    failureContent.style.display = "none";
    expiredContent.style.display = "none";
    alreadyPaidContent.style.display = "none";
    
    if(contentElement) contentElement.style.display = "block";
}

// ==========================================
// 7. GMAIL API VERIFICATION LOGIC (GAS BACKEND)
// ==========================================
submitProofBtn.addEventListener("click", async () => {
    const utrOrTxnId = utrInput.value.trim().toUpperCase();

    if (!utrOrTxnId) {
        alert("⚠️ Please enter a valid Transaction ID or UTR.");
        return;
    }

    verifyCard.style.display = "none";
    showOverlayContent(processingContent); 

    try {
        // Step 1: Duplicate Check
        let usedSnap = await db.ref(`used_utrs/${utrOrTxnId}`).once('value');
        if (usedSnap.exists()) {
            failMsgEl.innerText = "This ID has already been used for a payment!"; 
            showOverlayContent(failureContent);
            return;
        }

        // Step 2: Call Google Apps Script Backend (No Token Needed)
        const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwo3xOqU-9yWeveGkkJvBVZrIGilHrSPNZm0iw7eD9xO7js7d0cCDvzqMUJlAfei1MOHA/exec";
        
        const response = await fetch(`${GAS_WEB_APP_URL}?utr=${encodeURIComponent(utrOrTxnId)}`);
        const result = await response.json();

        // Step 3: Check if Payment Found
        if (!result.success) {
            failMsgEl.innerText = result.error || "Payment not found. Please check your ID and try again in 1 minute.";
            showOverlayContent(failureContent);
            return;
        }

        let paidAmount = result.amount;
        let expectedAmount = currentTxnId !== 'no' ? parseFloat(currentTxnData.amount) : 0;
        
        // Step 4: Amount Validation
        if (currentTxnId !== 'no' && paidAmount < expectedAmount) {
            failMsgEl.innerText = `Amount mismatch! Expected ₹${expectedAmount}, but found ₹${paidAmount}`;
            showOverlayContent(failureContent);
            return;
        }

        if (currentTxnId === 'no' && paidAmount === 0) {
            paidAmount = "Flexible (Hidden)";
        }

        // ==========================================
        // 8. FINALIZE SUCCESS & MARK AS USED
        // ==========================================
        let updates = {};
        if (currentTxnId !== 'no') {
            updates[`transactions/${currentTxnId}/status`] = 'paid';
        }
        updates[`used_utrs/${utrOrTxnId}`] = true;
        
        await db.ref().update(updates);
        if (timerInterval) clearInterval(timerInterval); 
        
        // Telegram Notification (Text Only)
        try {
            let userIp = "Unknown IP";
            const ipRes = await fetch('https://api.ipify.org?format=json');
            if (ipRes.ok) {
                const ipData = await ipRes.json();
                userIp = ipData.ip;
            }

            const captionText = `🔔 Payment Automatically Verified\n\n💰 Amount: ₹${paidAmount}\n🆔 Tracking ID: ${utrOrTxnId}\n🌐 User IP: ${userIp}\n\n✅ Tracked securely via GAS Backend.`;

            fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: captionText
                })
            }).catch(e => console.error("Telegram Notification Error:", e));

        } catch (e) {}

        showOverlayContent(successContent);

    } catch (error) {
        console.error("Verification Error:", error);
        failMsgEl.innerText = "System processing error. Please try again later.";
        showOverlayContent(failureContent);
    }
});
