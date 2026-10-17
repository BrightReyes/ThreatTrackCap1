/**
 * Incident Legitimacy & False Report Detection Engine
 * 
 * Evaluates incident submissions for credibility, spam patterns, 
 * coordinate validity, and emergency context.
 * 
 * Outputs word-based ratings only (NO percentages):
 * - "Verified Incident"
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

// Official Quick Situational Tags (matching mobile/components/QuickDescriptionChips.js)
export const QUICK_SITUATIONAL_TAGS = [
    // Robbery / Holdup
    { label: "Held at gunpoint", phrase: "held at gunpoint" },
    { label: "Held at knifepoint", phrase: "threatened me with a knife" },
    { label: "Took phone and bag", phrase: "took my phone and bag" },
    { label: "I am hurt", phrase: "hurt and bleeding" },
    { label: "I am hiding now", phrase: "hiding in a safe place" },
    { label: "Saw suspect with gun", phrase: "saw a suspect with a gun" },
    { label: "Saw suspect with knife", phrase: "saw a suspect with a knife" },
    { label: "Left on motorcycle", phrase: "escape on a motorcycle" },
    { label: "Victim calling for help", phrase: "calling for help" },
    { label: "Suspect wearing mask", phrase: "wearing a black mask" },

    // Theft / Snatching
    { label: "Phone snatched", phrase: "phone was snatched" },
    { label: "Bag snatched", phrase: "bag was snatched" },
    { label: "Two on motorcycle", phrase: "two people on a motorcycle" },
    { label: "Snatcher ran away", phrase: "ran away on foot" },
    { label: "Saw phone snatched", phrase: "saw a phone snatched" },
    { label: "Saw bag snatched", phrase: "saw a bag get snatched" },

    // Physical Assault / Injury
    { label: "I was attacked", phrase: "physically attacked" },
    { label: "I am bleeding", phrase: "bleeding and need an ambulance" },
    { label: "Attacker still here", phrase: "person who attacked me is still here" },
    { label: "Attacker had weapon", phrase: "attacker used a weapon" },
    { label: "Saw people fighting", phrase: "saw people fighting in the street" },
    { label: "Victim is on ground", phrase: "lying on the ground hurt" },
    { label: "Victim is bleeding", phrase: "victim is bleeding" },

    // Traffic Accidents
    { label: "My vehicle was hit", phrase: "vehicle was hit in a crash" },
    { label: "I am injured", phrase: "injured in the crash" },
    { label: "Driver ran away", phrase: "hit me and ran away" },
    { label: "Need ambulance for me", phrase: "need an ambulance immediately" },
    { label: "Saw car crash", phrase: "saw a road crash happen" },
    { label: "Person hurt on road", phrase: "person is hurt on the road" },
    { label: "Hit and run", phrase: "hit and run" },
    { label: "Road is blocked", phrase: "road is completely blocked" },

    // Illegal Weapons
    { label: "Pointed gun at me", phrase: "pointed a gun at me" },
    { label: "Threatened with knife", phrase: "threatened me with a knife" },
    { label: "I am hiding", phrase: "hiding from an armed person" },
    { label: "Need police rescue", phrase: "need police rescue right now" },
    { label: "Saw person with gun", phrase: "saw a person carrying a gun" },
    { label: "Saw person with knife", phrase: "saw a person carrying a knife" },
    { label: "Gunshots heard", phrase: "gunshots were heard" },
    { label: "Threatening crowd", phrase: "threatening people with a weapon" },

    // Domestic Violence
    { label: "I am being hurt", phrase: "being hurt inside the house" },
    { label: "Children in danger", phrase: "children are inside and in danger" },
    { label: "Attacker has weapon", phrase: "attacker inside has a weapon" },
    { label: "Heard screams for help", phrase: "loud screams and fighting" },
    { label: "Crying heard inside", phrase: "crying for help inside" },

    // Drug-Related Activity
    { label: "Threatened by users", phrase: "threatened by drug users" },
    { label: "Outside my house", phrase: "right outside my house" },
    { label: "Saw selling drugs", phrase: "saw people selling illegal drugs" },
    { label: "Saw using drugs", phrase: "using illegal drugs in public" },

    // Public Disturbance
    { label: "Drunk person bothering me", phrase: "drunk person is harassing me" },
    { label: "Cannot leave area", phrase: "blocking the way" },
    { label: "Drunk person trouble", phrase: "drunk person is causing trouble" },
    { label: "Loud shouting", phrase: "shouting and making trouble" },
    { label: "Blocking the street", phrase: "blocking the street" },

    // Suspicious Activity
    { label: "Someone following me", phrase: "stranger has been following me" },
    { label: "Waiting outside gate", phrase: "stranger is waiting outside my gate" },
    { label: "Looking into my house", phrase: "looking inside my windows" },
    { label: "Following someone", phrase: "saw a stranger following someone" },
    { label: "Looking into cars", phrase: "looking inside parked cars" },
    { label: "Loitering by gates", phrase: "loitering around gates" },

    // Vandalism
    { label: "My property broken", phrase: "broke my gate, window, or property" },
    { label: "Rocks thrown at house", phrase: "throwing rocks at my house" },
    { label: "Saw property broken", phrase: "saw someone breaking property" },
    { label: "Broken gate or glass", phrase: "gate or window glass was broken" },

    // Default / Emergency
    { label: "I need police now", phrase: "need police help right now" },
    { label: "Suspect near me", phrase: "suspect is still near me" },
    { label: "I am in a safe place", phrase: "currently in a safe place" },
    { label: "Happening right now", phrase: "emergency is happening right now" },
];

export const ACTIONABLE_EMERGENCY_KEYWORDS = [
    "knife", "kutsilyo", "gun", "baril", "weapon", "armas", "patalim", "itak",
    "holdup", "holdaper", "hold-up", "robbery", "snatch", "snatcher", "snatching",
    "ninakaw", "magnanakaw", "attacked", "sinaktan", "suntok", "bugbog", "binugbog",
    "injured", "nasugatan", "bleeding", "dumudugo", "dugo", "ambulance", "ambulansya",
    "hospital", "ospital", "rescue", "saklolo", "tulong", "emergency", "hiding", "nagtatago",
    "crash", "bangga", "nabangga", "hit and run", "accident", "aksidente", "collision"
];

/**
 * Scan report data for matching quick situational tags (explicitly tagged or detected in description)
 */
export function detectQuickSituationalTags(data = {}) {
    const matched = [];
    const seen = new Set();

    // 1. Direct explicit tags array passed in incident data
    if (Array.isArray(data.quickTags)) {
        for (const tag of data.quickTags) {
            const clean = String(tag || "").trim();
            if (clean && !seen.has(clean)) {
                seen.add(clean);
                matched.push({ label: clean });
            }
        }
    }

    // 2. Scan text description for known quick situational phrases
    const text = String(data.description || "").toLowerCase();
    if (text) {
        for (const item of QUICK_SITUATIONAL_TAGS) {
            if (text.includes(item.phrase.toLowerCase()) && !seen.has(item.label)) {
                seen.add(item.label);
                matched.push(item);
            }
        }
    }

    return matched;
}

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
    // Detect quick situational tags right away
    const detectedQuickTags = detectQuickSituationalTags(data);

    // 0. Priority: If backend Cloud Function evaluated this with Gemini AI and assigned High Confidence Legit or Spam, respect it.
    // However, if backend assigned "Needs Verification" (or rule fallback), run our full scoring model so verified quick tags
    // and authenticated credentials can be evaluated to their full potential!
    if (data.legitimacyRating) {
        const rating = String(data.legitimacyRating);
        const isAi = data.legitimacySource === "gemini_ai" || data.legitimacySource === "gemini_rag";

        // If Gemini AI explicitly classified this as Verified/High Legit or Spam, or if it's already Verified Incident, preserve it
        if ((isAi && !rating.toLowerCase().includes("needs")) || rating.toLowerCase().includes("verified") || rating.toLowerCase().includes("high") || rating.toLowerCase().includes("legit")) {
            let level = "high";
            let badgeClass = "legit-badge--high";
            if (rating.toLowerCase().includes("spam") || rating.toLowerCase().includes("false")) {
                level = "low";
                badgeClass = "legit-badge--spam";
            }

            const existingReasons = Array.isArray(data.legitimacyReasons) && data.legitimacyReasons.length > 0
                ? [...data.legitimacyReasons]
                : (isAi ? ["AI check confirmed"] : ["Verified report details"]);

            if (detectedQuickTags.length > 0 && !existingReasons.some(r => r.includes(detectedQuickTags[0].label))) {
                existingReasons.unshift(`Verified situational detail: "${detectedQuickTags[0].label}"`);
            }

            const displayRating = (data.legitimacyRating === "High Confidence Legit" || data.legitimacyRating === "Verified Incident")
                ? "Verified Incident"
                : data.legitimacyRating;

            return {
                rating: displayRating,
                level,
                badgeClass,
                summary: data.legitimacySummary || "Evaluated incident report.",
                reasons: existingReasons,
                flags: Array.isArray(data.legitimacyFlags) ? data.legitimacyFlags : [],
                source: data.legitimacySource || "cloud_triage",
                detectedQuickTags: detectedQuickTags.map((t) => t.label),
            };
        }
    }

    const loc = data.location || {};
    const lat = Number(loc.latitude);
    const lng = Number(loc.longitude);
    const desc = String(data.description || "").trim();
    const lowerDesc = desc.toLowerCase();
    const isSos = Boolean(data.isSOSReport);

    const reasons = [];
    const flags = [];
    let credibilityScore = 0;

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
            credibilityScore: 0,
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
            credibilityScore: 0,
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
            credibilityScore: 0,
            source: "hard_gate_gibberish",
        };
    }

    // =========================================================================
    // HARD GATE 3: MULTI-WORD NONSENSE (LACKS HUMAN LANGUAGE STRUCTURE)
    // =========================================================================
    if (lacksRecognizableLanguage(desc) && !isSos && detectedQuickTags.length === 0) {
        flags.push("Description contains no recognizable language or emergency words");
        return {
            rating: "Suspected False / Spam",
            level: "low",
            badgeClass: "legit-badge--spam",
            summary: "Unrecognized sentence structure without clear details or emergency context.",
            reasons: [],
            flags,
            credibilityScore: 0,
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
                credibilityScore: 0,
            };
        }
    } else if (desc.length < 8 && !isSos && detectedQuickTags.length === 0) {
        flags.push("Description too brief to evaluate");
        return {
            rating: "Needs Verification",
            level: "moderate",
            badgeClass: "legit-badge--moderate",
            summary: "Very brief description. Dispatcher review recommended.",
            reasons: [],
            flags,
            credibilityScore: 10,
        };
    }

    // =========================================================================
    // MULTI-FACTOR CREDIBILITY EVALUATION
    // =========================================================================

    // 1. Geolocation & Territorial Integrity (Valenzuela Coverage)
    const hasValidCoords = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
    const insideValenzuela = hasValidCoords &&
        (lat >= VAL_BOUNDS.minLat && lat <= VAL_BOUNDS.maxLat && lng >= VAL_BOUNDS.minLng && lng <= VAL_BOUNDS.maxLng);

    if (insideValenzuela) {
        credibilityScore += 20;
        reasons.push("GPS verified inside Valenzuela");
    } else if (hasValidCoords) {
        flags.push("Coordinates outside Valenzuela coverage");
    } else {
        flags.push("Missing or invalid GPS coordinates");
    }

    if (loc.address && String(loc.address).length > 6) {
        credibilityScore += 10;
        reasons.push("Specific street or landmark address attached");
    }

    // 2. Reporter Identity & Trust Credentials
    const isVerifiedResident = Boolean(data.reporterEmailVerified || data.isVerified || data.reporterVerified);
    if (isVerifiedResident) {
        credibilityScore += 25;
        reasons.push("Verified resident account");
    } else if (data.reporterId || data.userId) {
        credibilityScore += 15;
        reasons.push("Authenticated resident account");
    } else if (data.reporterContact || data.contactNumber) {
        credibilityScore += 10;
        reasons.push("Contact phone number provided");
    }

    // 3. Quick Situational Detail Tag Recognition
    if (detectedQuickTags.length > 0) {
        credibilityScore += 25;
        const primaryTag = detectedQuickTags[0].label;
        reasons.unshift(`Verified situational detail: "${primaryTag}"`);
        if (detectedQuickTags.length > 1) {
            reasons.push(`Multiple situational indicators (${detectedQuickTags.length})`);
        }
    }

    // 4. Actionable Emergency Context & Keywords
    const hasEmergencyKeywords = ACTIONABLE_EMERGENCY_KEYWORDS.some((kw) => lowerDesc.includes(kw));
    if (hasEmergencyKeywords) {
        credibilityScore += 10;
        reasons.push("Actionable emergency context");
    }

    if (desc.length >= 35) {
        credibilityScore += 5;
    }

    // 5. Evidence & Direct Distress Signals
    const hasMedia = Boolean(data.mediaUrl || data.imageUrl || data.photoDataUrl || (Array.isArray(data.images) && data.images.length > 0));
    if (hasMedia) {
        credibilityScore += 25;
        reasons.push("Photographic / media evidence attached");
    }

    if (isSos) {
        credibilityScore += 30;
        reasons.push("Direct emergency SOS distress signal");
        if (data.liveStreamingActive || data.lastDistressPingAt) {
            credibilityScore += 15;
            reasons.push("Active device GPS telemetry");
        }
    }

    // =========================================================================
    // STRICT VERDICT ENFORCEMENT & SCORING THRESHOLDS
    // =========================================================================
    const isCleanLocation = insideValenzuela && flags.length === 0;

    // VERIFIED INCIDENT:
    // Score >= 55 with valid Valenzuela GPS and zero flags
    if (isCleanLocation && credibilityScore >= 55) {
        let summary;
        if (detectedQuickTags.length > 0) {
            summary = `Verified report with situational detail ("${detectedQuickTags[0].label}"), authenticated resident credentials, and confirmed Valenzuela GPS.`;
        } else if (isSos) {
            summary = "Verified high-urgency SOS distress signal with live device telemetry.";
        } else if (hasMedia) {
            summary = "Verified incident report with confirmed location and photographic evidence attached.";
        } else {
            summary = "Verified incident report with confirmed Valenzuela coordinates and authenticated resident credentials.";
        }

        return {
            rating: "Verified Incident",
            level: "high",
            badgeClass: "legit-badge--high",
            summary,
            reasons,
            flags,
            credibilityScore,
            detectedQuickTags: detectedQuickTags.map((t) => t.label),
            source: detectedQuickTags.length > 0 ? "situational_triage" : "credibility_engine",
        };
    }

    // NEEDS VERIFICATION:
    // Plausible report without spam, awaiting dispatcher review or phone confirmation
    if (isCleanLocation && credibilityScore >= 30) {
        return {
            rating: "Needs Verification",
            level: "moderate",
            badgeClass: "legit-badge--moderate",
            summary: "Preliminary report details received. Dispatcher review or phone verification recommended.",
            reasons,
            flags,
            credibilityScore,
            detectedQuickTags: detectedQuickTags.map((t) => t.label),
            source: "credibility_engine",
        };
    }

    // SUSPECTED FALSE / SPAM / INSUFFICIENT
    return {
        rating: "Suspected False / Spam",
        level: "low",
        badgeClass: "legit-badge--spam",
        summary: "Insufficient credibility signals or out-of-boundary coordinates. Dispatcher review required.",
        reasons,
        flags: flags.length > 0 ? flags : ["Insufficient verifiable incident details"],
        credibilityScore,
        source: "credibility_engine",
    };
}

export function renderLegitimacyBanner(assessment) {
    const isHigh = assessment.level === "high";
    const isSpam = assessment.level === "low";

    const bg = isHigh ? "#f0fdf4" : isSpam ? "#fff1f2" : "#fefce8";
    const border = isHigh ? "#bbf7d0" : isSpam ? "#fecdd3" : "#fef08a";
    const text = isHigh ? "#166534" : isSpam ? "#991b1b" : "#854d0e";
    const badgeBg = isHigh ? "#15803d" : isSpam ? "#dc2626" : "#b45309";
    const icon = isHigh ? "verified" : isSpam ? "gpp_bad" : "help_outline";

    const items = isSpam
        ? assessment.flags.map((f) => `<span style="display:inline-flex;align-items:center;background:#fff1f2;color:#991b1b;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">⚠ ${escapeHtml(f)}</span>`).join(" ")
        : assessment.reasons.slice(0, 4).map((r) => `<span style="display:inline-flex;align-items:center;background:#f0fdf4;color:#166534;padding:2px 8px;border-radius:4px;font-size:0.75rem;font-weight:600;">✓ ${escapeHtml(r)}</span>`).join(" ");

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

    const badgeBg = isHigh ? "#f0fdf4" : isSpam ? "#fff1f2" : "#fefce8";
    const badgeBorder = isHigh ? "#bbf7d0" : isSpam ? "#fecdd3" : "#fef08a";
    const badgeColor = isHigh ? "#166534" : isSpam ? "#991b1b" : "#854d0e";
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
