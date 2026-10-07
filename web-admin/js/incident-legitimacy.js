/**
 * Incident Legitimacy & False Report Detection Engine
 * 
 * Evaluates incident submissions for credibility, spam patterns, 
 * coordinate validity, and emergency context.
 * 
 * Outputs word-based ratings only (NO percentages):
 * - "High Confidence Legit"
 * - "Needs Verification"
 * - "Suspected False / Spam"
 */

// Valenzuela City approximate bounding coordinates
const VAL_BOUNDS = {
    minLat: 14.668,
    maxLat: 14.760,
    minLng: 120.925,
    maxLng: 121.026,
};



// Comprehensive Spam, Prank, Test, Commercial, Scam & Nonsense Patterns
export const SPAM_PATTERNS = [
    // 1. Keyboard Mash, Fillers & Placeholders
    "asdf", "asdfg", "asdfgh", "asdfghjkl", "qwerty", "qwertyuiop", "zxcv", "zxcvbnm",
    "qweqwe", "asdlasd", "poiuyt", "mnbvcxz", "aaaaaaa", "bbbbbbb", "zzzzzzz",
    "12345", "123456", "12345678", "abcdef", "abcdefg",
    "test only", "testing only", "test report", "sample report", "sample only", "sample incident",
    "demo only", "trial only", "testing 123", "test mic", "mic test", "check mic", "mic check",
    "sound check", "check test", "subok lang", "pampasubok", "test run", "just testing", "testing lang",
    "test post", "try lang", "puro test", "testing app",
    "lorem ipsum", "dolor sit amet", "foo bar", "foobar", "hello world",

    // 2. Laughs, Trolling, Pranks, Jokes & Profanity
    "hahaha", "hahahaha", "hehehe", "hehehehe", "jejeje", "hihihi", "jajaja", "lolol", "lololol", "lmao", "rofl",
    "charot", "charing", "char lang", "eme lang", "trip lang", "trip trip lang", "trip ko lang",
    "walang magawa", "bored lang", "bored ako",
    "joke lang", "joke time", "biro lang", "nagbibiro lang", "nagbibiro",
    "prank lang", "prank call", "fake report", "fake news", "kalokohan", "scam lang", "walang kwenta",
    "chikiting", "pabebe", "utot mo", "ulol", "tarantado ka", "gago ka", "tangina mo", "tangina", "ina mo",
    "kupal", "bobo mo", "potaena", "peste ka", "yawa ka", "pakyu", "fuck you",

    // 3. Commercial, Gambling, Loans, Casinos & Color Games
    "casino", "online casino", "slot machine", "slot game", "scatter", "super ace", "mega ace",
    "jili", "jili slot", "jili casino", "fa chai", "pg soft", "fc slot",
    "sabong", "e-sabong", "online sabong", "tari", "color game", "baccarat", "roulette",
    "free spin", "free credits", "welcome bonus", "cashback", "vip bonus", "max win", "jackpot slot",
    "taya na", "magregister na", "betting site", "poker online",
    "bingo plus", "arena plus", "tongits go", "tongits plus", "lucky cola", "phlwin", "tmtplay", "okbet", "winzir", "mwplay", "mega ball",

    // 4. Financial Scams, Online Loans & Ponzi Schemes
    "pautang", "pautang online", "online pautang", "online loan", "quick cash", "quick loan", "easy loan",
    "mabilis na pera", "mabilis na pautang", "fast approval", "zero interest loan", "no collateral loan",
    "cash advance online", "pera agad", "kumita ng pera", "kumita online", "earn money online",
    "work from home typing", "passive income", "investment scam", "double your money", "gcash money multiplier",
    "instant cash", "daily income", "part time job offer", "payout guarantee",
    "crypto", "cryptocurrency", "bitcoin", "bitcoin mining", "ethereum", "usdt", "usdt giveaway",
    "crypto investment", "crypto trading", "forex trading signal", "pyramid scheme", "networking referral",

    // 5. Advertising Links, Vouchers, Social Spams & Blacklisted Endpoints
    "click here", "click this link", "visit link", "visit website", "visit our website",
    "buy now", "order now", "discount code", "promo code", "voucher code", "discount voucher", "flash sale",
    "shopee link", "lazada link", "tiktok shop",
    "telegram link", "chat on telegram", "chat me on telegram", "t.me/", "wa.me/", "viber me", "whatsapp me",
    "bit.ly", "tinyurl", "http://", "https://", "www.", ".xyz", ".top", ".vip", ".click", ".buzz", ".online", ".club",
    "viagra", "cialis", "online pharmacy", "adult video", "dating site", "hookup",
];

// Standalone casual greetings and non-reports (flagged only if the ENTIRE message is just a greeting)
export const ISOLATED_GREETINGS = new Set([
    "hi", "hi po", "hello", "hello po", "kamusta", "kamusta po", "kumusta", "kumusta po",
    "good morning", "good morning po", "good afternoon", "good afternoon po",
    "good evening", "good evening po", "good night po", "ok na to", "ok na po",
    "wala lang", "wala po", "wala naman", "wrong send", "kamali", "napindot lang", "namali ng pindot"
]);

// Common Tagalog & English structural vocabulary used to check natural language presence
const COMMON_LANGUAGE_WORDS = new Set([
    "ang", "ng", "sa", "mga", "at", "na", "po", "ito", "dito", "doon", "may", "kami", "sila", "ako",
    "ikaw", "niyo", "ko", "mo", "ba", "naman", "pala", "kasi", "dahil", "kung", "pero", "kaya", "para",
    "opo", "hindi", "di", "oo", "tao", "bahay", "kalsada", "motor", "kotse", "labas", "loob", "tapat", "kanto",
    "the", "a", "an", "in", "on", "at", "to", "for", "of", "with", "is", "are", "was", "were", "there",
    "here", "this", "that", "and", "but", "or", "so", "we", "they", "i", "you", "he", "she", "it",
    "help", "emergency", "car", "man", "person", "road", "street", "fire", "accident", "medical", "police",
    "flood", "injured", "injury", "danger", "hazard", "assistance", "traffic", "reported", "progress"
]);

function isGibberishText(text) {
    if (!text || typeof text !== "string") return { isGibberish: false };
    const trimmed = text.trim();
    if (trimmed.length < 4) return { isGibberish: false };

    // 0. Zero alphabetic letters (pure numbers or symbols like "123456789", "99999999")
    const alphaCount = trimmed.replace(/[^a-zA-Z]/g, "").length;
    if (alphaCount === 0) {
        return { isGibberish: true, reason: "Description contains no words or letters" };
    }

    const digitsCount = trimmed.replace(/[^0-9]/g, "").length;

    // 1. Overwhelmingly numbers with 1-2 stray letters (e.g. "a1231231231415142", "1234567a")
    if (digitsCount >= 6 && alphaCount <= 2) {
        return { isGibberish: true, reason: "Random numeric string without incident details" };
    }

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
        const isUrl = token.startsWith("http://") || token.startsWith("https://") || token.startsWith("www.");
        if (isUrl) continue;

        const lettersOnly = token.replace(/[^a-zA-Z]/g, "");

        // 2. Single unbroken token of 16+ letters without spaces
        if (lettersOnly.length >= 16) {
            return { isGibberish: true, reason: "Single unbroken word exceeds normal language length" };
        }

        // 3. Single token mixing letters and 4+ digits (e.g. "a1231231231415142", "asdf123456")
        if (tokens.length === 1 && token.length >= 8 && digitsCount >= 4) {
            return { isGibberish: true, reason: "Alphanumeric keyboard mash token" };
        }

        // 4. Keyboard rolling pattern on letters (low unique character variety)
        if (lettersOnly.length >= 10) {
            const uniqueChars = new Set(lettersOnly.toLowerCase()).size;
            if (uniqueChars / lettersOnly.length < 0.35) {
                return { isGibberish: true, reason: "Keyboard rolling pattern / low character variety" };
            }
        }

        // 5. 6 or more consecutive consonants (treating y as semi-vowel)
        if (/[bcdfghjklmnpqrstvwxz]{6,}/i.test(lettersOnly)) {
            return { isGibberish: true, reason: "Impossible consonant cluster" };
        }
    }

    // 6. Repeated identical characters (e.g. "aaaaa", "11111", ".....")
    if (/(.)\1{4,}/.test(trimmed)) {
        return { isGibberish: true, reason: "Repetitive character repetition" };
    }

    // 7. Repeating pattern loops (e.g. "123123123", "asdasdasd", "qweqweqwe")
    if (/(.{2,4})\1{2,}/i.test(trimmed.replace(/\s+/g, ""))) {
        return { isGibberish: true, reason: "Repetitive pattern looping" };
    }

    // 8. 8+ letters with 0 vowels
    if (alphaCount >= 8 && !/[aeiouAEIOU]/.test(trimmed)) {
        return { isGibberish: true, reason: "No vowels detected in long text" };
    }

    return { isGibberish: false };
}

function lacksRecognizableLanguage(text) {
    const trimmed = String(text || "").trim().toLowerCase();
    const words = trimmed.split(/\s+/).map((w) => w.replace(/[^a-z]/g, "")).filter((w) => w.length > 0);
    if (words.length === 0) return true;
    if (words.length === 1) {
        const singleWord = words[0];
        if (singleWord.length >= 6 && !COMMON_LANGUAGE_WORDS.has(singleWord)) {
            return true;
        }
        return false;
    }
    return !words.some((w) => COMMON_LANGUAGE_WORDS.has(w));
}

export function evaluateIncidentLegitimacy(data = {}) {
    // 0. Priority: If backend Cloud Function evaluated this with Gemini AI or backend rule engine, use it directly
    if (data.legitimacyRating) {
        const rating = String(data.legitimacyRating);
        let level = "moderate";
        let badgeClass = "legit-badge--moderate";

        if (rating.toLowerCase().includes("high") || rating.toLowerCase().includes("legit")) {
            level = "high";
            badgeClass = "legit-badge--high";
        } else if (rating.toLowerCase().includes("spam") || rating.toLowerCase().includes("false")) {
            level = "low";
            badgeClass = "legit-badge--spam";
        }

        const isAi = data.legitimacySource === "gemini_ai" || data.legitimacySource === "gemini_rag";
        const defaultReasons = isAi ? ["AI check confirmed"] : ["Verified report details"];

        return {
            rating: data.legitimacyRating,
            level,
            badgeClass,
            summary: data.legitimacySummary || "Evaluated incident report.",
            reasons: Array.isArray(data.legitimacyReasons) && data.legitimacyReasons.length > 0
                ? data.legitimacyReasons
                : defaultReasons,
            flags: Array.isArray(data.legitimacyFlags) ? data.legitimacyFlags : [],
            source: data.legitimacySource || "cloud_triage",
        };
    }

    const loc = data.location || {};
    const lat = Number(loc.latitude);
    const lng = Number(loc.longitude);
    const desc = String(data.description || "").trim();
    const lowerDesc = desc.toLowerCase();
    const isSos = Boolean(data.isSOSReport);

    const reasons = [];
    const flags = [];

    // =========================================================================
    // HARD GATE 0: STANDALONE CASUAL CHAT (e.g. resident just typed "hello po" with no report)
    // =========================================================================
    if (ISOLATED_GREETINGS.has(lowerDesc) && !isSos) {
        flags.push("Non-incident casual greeting or accidental send");
        return {
            rating: "Suspected False / Spam",
            level: "low",
            badgeClass: "legit-badge--spam",
            summary: "Casual non-incident greeting or accidental message. No emergency details provided.",
            reasons: [],
            flags,
            source: "hard_gate_casual_chat",
        };
    }

    // =========================================================================
    // HARD GATE 1: SPAM & PRANK PHRASES
    // Positive metadata (GPS, registered account) MUST NEVER override spam!
    // =========================================================================
    const matchedSpam = SPAM_PATTERNS.filter((pattern) => lowerDesc.includes(pattern));
    if (matchedSpam.length > 0) {
        flags.push(`Spam/prank phrase detected (${matchedSpam.slice(0, 2).join(", ")})`);
        return {
            rating: "Suspected False / Spam",
            level: "low",
            badgeClass: "legit-badge--spam",
            summary: "Potential false alarm or spam description. Dispatcher inspection required.",
            reasons: [],
            flags,
            source: "hard_gate_spam",
        };
    }

    // =========================================================================
    // HARD GATE 2: GIBBERISH / KEYBOARD MASH
    // Unbroken strings, rolling keys, and consonant clusters are immediately flagged!
    // =========================================================================
    const gibberishCheck = isGibberishText(desc);
    if (gibberishCheck.isGibberish) {
        flags.push(`Gibberish/keyboard mash (${gibberishCheck.reason})`);
        return {
            rating: "Suspected False / Spam",
            level: "low",
            badgeClass: "legit-badge--spam",
            summary: "Unintelligible or random keyboard mash description. Flagged as invalid report.",
            reasons: [],
            flags,
            source: "hard_gate_gibberish",
        };
    }

    // =========================================================================
    // HARD GATE 3: MULTI-WORD NONSENSE (LACKS HUMAN LANGUAGE STRUCTURE)
    // =========================================================================
    if (lacksRecognizableLanguage(desc) && !isSos) {
        flags.push("Description contains no recognizable language or emergency words");
        return {
            rating: "Suspected False / Spam",
            level: "low",
            badgeClass: "legit-badge--spam",
            summary: "Unrecognized sentence structure without clear details or emergency context.",
            reasons: [],
            flags,
            source: "hard_gate_unrecognized",
        };
    }

    // 4. Description Completeness
    if (desc.length === 0) {
        if (!isSos) {
            flags.push("No description provided");
            return {
                rating: "Needs Verification",
                level: "moderate",
                badgeClass: "legit-badge--moderate",
                summary: "Empty report description. Dispatcher confirmation needed.",
                reasons: [],
                flags,
            };
        }
    } else if (desc.length < 8 && !isSos) {
        flags.push("Description too brief to evaluate");
        return {
            rating: "Needs Verification",
            level: "moderate",
            badgeClass: "legit-badge--moderate",
            summary: "Very brief description. Dispatcher review recommended.",
            reasons: [],
            flags,
        };
    }

    // 5. GPS & Location Verification
    const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
    const insideValenzuela = hasValidCoords &&
        (lat >= VAL_BOUNDS.minLat && lat <= VAL_BOUNDS.maxLat && lng >= VAL_BOUNDS.minLng && lng <= VAL_BOUNDS.maxLng);

    if (insideValenzuela) {
        reasons.push("GPS verified inside Valenzuela");
    } else if (hasValidCoords) {
        flags.push("Coordinates outside Valenzuela coverage");
    } else {
        flags.push("Missing or invalid GPS coordinates");
    }

    if (loc.address && String(loc.address).length > 6) {
        reasons.push("Specific street or landmark address attached");
    }

    // 6. SOS & Device Signals
    if (isSos) {
        reasons.push("Direct emergency SOS distress signal");
        if (data.liveStreamingActive || data.lastDistressPingAt) {
            reasons.push("Active device GPS signal / live alert");
        }
    }

    // 7. Evidence & Reporter Authenticity
    const hasMedia = Boolean(data.mediaUrl || data.imageUrl || (Array.isArray(data.images) && data.images.length > 0));
    if (hasMedia) {
        reasons.push("Photographic / media evidence attached");
    }

    if (data.reporterId || data.userId) {
        reasons.push("Authenticated resident account");
    } else if (data.reporterContact || data.contactNumber) {
        reasons.push("Contact phone number provided");
    }

    // =========================================================================
    // STRICT VERDICT ENFORCEMENT
    // If backend Cloud Function evaluated with Gemini AI, it was already handled above.
    // Client-side fallback:
    // - Valid Valenzuela GPS + (SOS or photo evidence) -> "High Confidence Legit"
    // - Valid Valenzuela GPS + clean description -> "Needs Verification" (awaiting AI triage or dispatcher)
    // =========================================================================
    const isLocationValid = insideValenzuela && flags.length === 0;

    if (isLocationValid && (isSos || hasMedia)) {
        return {
            rating: "High Confidence Legit",
            level: "high",
            badgeClass: "legit-badge--high",
            summary: "Verified report location with matching device GPS or photo evidence.",
            reasons,
            flags,
        };
    }

    // Clean report without spam, awaiting automated check or dispatcher review
    return {
        rating: "Needs Verification",
        level: "moderate",
        badgeClass: "legit-badge--moderate",
        summary: "Waiting for automated check or dispatcher review.",
        reasons,
        flags,
    };
}

export function renderLegitimacyBanner(assessment) {
    const isHigh = assessment.level === "high";
    const isSpam = assessment.level === "low";

    const bg = isHigh ? "#f0fdf4" : isSpam ? "#fef2f2" : "#fffbeb";
    const border = isHigh ? "#bbf7d0" : isSpam ? "#fecaca" : "#fef3c7";
    const text = isHigh ? "#166534" : isSpam ? "#991b1b" : "#92400e";
    const badgeBg = isHigh ? "#22c55e" : isSpam ? "#ef4444" : "#f59e0b";
    const icon = isHigh ? "verified" : isSpam ? "gpp_bad" : "help_outline";

    const items = isSpam
        ? assessment.flags.map((f) => `<span style="display:inline-flex;align-items:center;background:#fee2e2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">⚠ ${escapeHtml(f)}</span>`).join(" ")
        : assessment.reasons.slice(0, 3).map((r) => `<span style="display:inline-flex;align-items:center;background:#dcfce7;color:#166534;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">✓ ${escapeHtml(r)}</span>`).join(" ");

    return `
      <div style="background:${bg};border:1px solid ${border};border-radius:8px;padding:10px 14px;margin:10px 0 14px 0;display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="material-symbols-outlined" style="font-size:20px;color:${text};">${icon}</span>
            <span style="font-size:0.78rem;font-weight:700;color:${text};text-transform:uppercase;letter-spacing:0.5px;">Legitimacy Rating</span>
            ${(assessment.source === "gemini_ai" || assessment.source === "gemini_rag") ? `<span style="background:#e0e7ff;color:#3730a3;font-size:0.68rem;font-weight:700;padding:2px 6px;border-radius:4px;display:inline-flex;align-items:center;gap:3px;"><span class="material-symbols-outlined" style="font-size:12px;">psychology</span>AI Verified</span>` : ""}
          </div>
          <span style="background:${badgeBg};color:#ffffff;font-size:0.8rem;font-weight:800;padding:3px 10px;border-radius:999px;letter-spacing:0.3px;">
            ${escapeHtml(assessment.rating)}
          </span>
        </div>
        <p style="margin:0;font-size:0.825rem;color:${text};line-height:1.4;">
          ${escapeHtml(assessment.summary)}
        </p>
        ${items ? `<div style="display:flex;flex-wrap:wrap;gap:4px;margin-top:2px;">${items}</div>` : ""}
      </div>
    `;
}

export function renderLegitimacyBadge(assessment) {
    const isHigh = assessment.level === "high";
    const isSpam = assessment.level === "low";

    const badgeBg = isHigh ? "#ecfdf5" : isSpam ? "#fef2f2" : "#fffbeb";
    const badgeBorder = isHigh ? "#a7f3d0" : isSpam ? "#fecaca" : "#fde68a";
    const badgeColor = isHigh ? "#065f46" : isSpam ? "#991b1b" : "#92400e";
    const icon = isHigh ? "verified" : isSpam ? "gpp_bad" : "help_outline";
    const isAi = assessment.source === "gemini_ai" || assessment.source === "gemini_rag";
    const sourceLabel = isAi ? " (AI Evaluated)" : "";

    return `<span style="display:inline-flex;align-items:center;gap:4px;background:${badgeBg};color:${badgeColor};border:1px solid ${badgeBorder};padding:3px 8px;border-radius:6px;font-size:0.78rem;font-weight:700;" title="${escapeAttr(assessment.summary + sourceLabel)}">
      <span class="material-symbols-outlined" style="font-size:14px;">${icon}</span>
      ${escapeHtml(assessment.rating)}
      ${isAi ? `<span class="material-symbols-outlined" style="font-size:13px;opacity:0.8;" title="Evaluated by Gemini AI">psychology</span>` : ""}
    </span>`;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text == null ? "" : text)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;");
}

// Expose interactive helper for easy manual browser console testing
if (typeof window !== "undefined") {
    window.testLegitimacy = function(description, overrides = {}) {
        const assessment = evaluateIncidentLegitimacy({
            description: String(description || ""),
            location: { latitude: 14.698, longitude: 120.975, address: "MacArthur Hwy, Karuhatan, Valenzuela" },
            reporterId: "demo_resident_123",
            ...overrides,
        });
        console.group(`🔍 Legitimacy Test: "${String(description || "").substring(0, 45)}..."`);
        console.log("%cRating: " + assessment.rating, "font-size:14px;font-weight:bold;color:" + (assessment.level === "high" ? "#16a34a" : assessment.level === "low" ? "#dc2626" : "#d97706"));
        console.log("Summary:", assessment.summary);
        console.log("Flags:", assessment.flags.length ? assessment.flags : "None");
        console.log("Reasons:", assessment.reasons.length ? assessment.reasons : "None");
        console.groupEnd();
        return assessment;
    };
}
