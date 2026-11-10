/**
 * Hotspot decision plan draft.
 *
 * Code owns every fact, the evidence level, the list of allowed recommendations
 * and the citations. Gemini only explains a recommendation in plain language
 * and picks sources by ID from what was retrieved. A recommendation with no
 * retrieved source is never shown. Plans hold both languages, so switching
 * language never calls the AI again.
 */

import { dpPeriodLabel, dpSourceLabel, dpText, dpTypeLabel } from "./decision-plan-text.js";

const MAX_RECOMMENDATIONS = 3;
const MAX_BADGES = 3;
const MAX_REPORT_LINKS = 8;
const MIN_SECOND_TYPE_REPORTS = 2;
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash", "gemini-flash-latest"];
const GEMINI_TIMEOUT_MS = 30000;

const NOT_COUNTED_STATUSES = new Set(["rejected", "spam", "cancelled", "deleted"]);
const NOT_COUNTED_DISMISSALS = /false alarm|accidental|duplicate|system test/i;
const CONFIRMED_STATUSES = new Set(["verified", "responding", "done", "completed", "resolved"]);
const TERMINAL_STATUSES = new Set(["done", "completed", "resolved", "closed", "rejected", "spam", "cancelled", "deleted"]);
const LIVE_SOS_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Statutes that define each offense, and words that tie a local ordinance to it. */
const OFFENSE_SOURCES = {
    theft_snatching: { law: /Art\. 308/, words: /\b(theft|snatch\w*)\b/i },
    robbery_holdup: { law: /Art\. 293/, words: /\b(robbery|hold-?up)\b/i },
    physical_assault_injury: { law: /Art\. 262/, words: /\b(assault|physical injur\w*)\b/i },
    domestic_violence: { law: /No\. 9262/, words: /\b(domestic violence|vawc?)\b/i },
    traffic_accident: { law: /No\. 4136/, words: /\b(traffic|road safety)\b/i },
    illegal_weapons: { law: /No\. 10591|Blg\. 6\b/, words: /\b(firearms?|deadly weapons?|bladed)\b/i },
    drug_related_activity: { law: /No\. 9165/, words: /\b(dangerous drugs?|illegal drugs?|badac)\b/i },
    public_disturbance: { law: /Art\. 15[35]/, words: /\b(public disturbance|alarms and scandals|nuisance)\b/i },
    suspicious_activity: { law: /POP Rule 10/, words: /\b(loiter\w*|suspicious)\b/i },
    vandalism_property_damage: { law: /Art\. 327/, words: /\b(vandalism|graffiti|malicious mischief)\b/i },
};

/** The city-wide mandate may support a recommendation for any incident type. */
const GENERAL_AUTHORITY = /No\. 7160/;

const RECOMMENDATIONS = {
    patrol_visibility: {
        basis: "terms",
        terms: /\bpatrols?\b(?! group)/i,
        base: 2,
        peakHelps: true,
        title: {
            en: (c) => `Consider having more patrols that people can see near ${c.area}${c.when}.`,
            fil: (c) => `Pag-isipang magdagdag ng mga patrol na nakikita ng mga tao malapit sa ${c.area}${c.when}.`,
        },
        explain: {
            en: (c) => [
                c.peakSentence || c.countSentence,
                c.peakSentence
                    ? "That is the time when patrols may help the most."
                    : "There is no clear time yet when these happen, so patrols at different times may help more.",
                "When people can see patrols nearby, someone planning to do this may think twice.",
                c.sosSentence,
                "It may also help residents feel safer and make it easier for them to ask for help.",
                c.detailNote,
            ],
            fil: (c) => [
                c.peakSentence || c.countSentence,
                c.peakSentence
                    ? "Ito ang oras na pinakamakakatulong ang mga patrol."
                    : "Wala pang malinaw na oras kung kailan ito nangyayari, kaya maaaring mas makatulong ang patrol sa iba't ibang oras.",
                "Kapag may nakikitang patrol, maaaring mag-isip muna nang dalawang beses ang may balak gumawa nito.",
                c.sosSentence,
                "Maaari rin itong makatulong para mas maging panatag ang mga residente at mas madali silang makahingi ng tulong.",
                c.detailNote,
            ],
        },
    },
    cctv_check: {
        basis: "terms",
        terms: /\bcctv\b/i,
        base: 1,
        needsProof: true,
        title: {
            en: (c) => `Consider checking if there are CCTV cameras near ${c.area}.`,
            fil: (c) => `Pag-isipang alamin kung may mga CCTV camera malapit sa ${c.area}.`,
        },
        explain: {
            en: (c) => [
                c.countSentence,
                c.proofSentence,
                "Camera footage from the days of these reports could show what happened and who was there.",
                "It could also help show if the same people were part of more than one report.",
                c.peakText && `A good place to start is the footage from ${c.peakText}, since that is when many reports happened.`,
                "Some cameras only keep footage for a short time, so it may help to check soon.",
            ],
            fil: (c) => [
                c.countSentence,
                c.proofSentence,
                "Makikita sa footage ng camera mula sa mga araw ng ulat kung ano ang nangyari at kung sino ang naroon.",
                "Makakatulong din ito para malaman kung iisang tao ang sangkot sa higit sa isang ulat.",
                c.peakText && `Magandang simulan ang footage ${c.peakText}, dahil maraming ulat ang nangyari sa oras na iyon.`,
                "May mga camera na saglit lang nagtatago ng footage, kaya maaaring makatulong kung masusuri agad.",
            ],
        },
    },
    lighting_cctv: {
        basis: "terms",
        terms: /\b(cctv|street ?lights?|lighting)\b/i,
        base: 2,
        title: {
            en: (c) => `Consider checking the lights and CCTV cameras near ${c.area}.`,
            fil: (c) => `Pag-isipang suriin ang mga ilaw at CCTV camera malapit sa ${c.area}.`,
        },
        explain: {
            en: (c) => [
                c.countSentence,
                "Dark places or places with no cameras can make it easier to damage things without being seen.",
                "Checking these spots can show if something simple, like a broken light, needs to be fixed.",
                c.peakSentence,
                "Camera footage could also help show who was there.",
            ],
            fil: (c) => [
                c.countSentence,
                "Mas madaling makasira ng gamit nang hindi nakikita sa madidilim na lugar o sa lugar na walang camera.",
                "Makikita sa pagsusuri kung may simpleng dapat ayusin, tulad ng sirang ilaw.",
                c.peakSentence,
                "Makakatulong din ang footage ng camera para malaman kung sino ang naroon.",
            ],
        },
    },
    community_awareness: {
        basis: "terms",
        terms: /\b(community awareness|public advisor\w*)\b/i,
        base: 0,
        peakHelps: true,
        title: {
            en: (c) => `Consider telling residents near ${c.area} about these reports.`,
            fil: (c) => `Pag-isipang ipaalam sa mga residente malapit sa ${c.area} ang mga ulat na ito.`,
        },
        explain: {
            en: (c) => [
                c.countSentence,
                "When residents know what has been happening nearby, they can be more careful.",
                c.peakText && `It may help to tell them that many reports happened ${c.peakText}.`,
                "The message should stay calm so that people do not panic.",
            ],
            fil: (c) => [
                c.countSentence,
                "Kapag alam ng mga residente ang nangyayari sa paligid, mas makakapag-ingat sila.",
                c.peakText && `Maaaring makatulong na sabihin sa kanila na maraming ulat ang nangyari ${c.peakText}.`,
                "Dapat manatiling mahinahon ang mensahe para hindi mag-panic ang mga tao.",
            ],
        },
    },
    barangay_mediation: {
        basis: "terms",
        terms: /\b(lupon|katarungang pambarangay|barangay mediation)\b/i,
        base: 1,
        title: {
            en: (c) => `Consider having the barangay help the people involved settle this near ${c.area}, if it is safe to do so.`,
            fil: (c) => `Pag-isipang tulungan ng barangay ang mga sangkot na ayusin ito malapit sa ${c.area}, kung ligtas itong gawin.`,
        },
        explain: {
            en: (c) => [
                c.countSentence,
                "Some problems between people who know each other can be settled by talking with help from the barangay.",
                "This may stop the same problem from happening again.",
                "This is not right for cases where someone may get hurt. Those cases should go to the police.",
            ],
            fil: (c) => [
                c.countSentence,
                "May mga problema sa pagitan ng magkakakilala na naaayos sa pag-uusap, sa tulong ng barangay.",
                "Maaari nitong mapigilan na maulit ang parehong problema.",
                "Hindi ito angkop kung may posibilidad na may masaktan. Dapat sa pulis dalhin ang mga kasong iyon.",
            ],
        },
    },
    signage_lighting: {
        basis: "terms",
        terms: /\b(signage|street ?lights?|lighting)\b/i,
        base: 1,
        peakHelps: true,
        title: {
            en: (c) => `Consider checking the road signs and lights near ${c.area}.`,
            fil: (c) => `Pag-isipang suriin ang mga karatula sa daan at mga ilaw malapit sa ${c.area}.`,
        },
        explain: {
            en: (c) => [
                c.countSentence,
                "Missing signs or poor lighting can make a road harder to use safely.",
                c.peakText && `It may help to check this spot ${c.peakText}, since many accidents happened then.`,
            ],
            fil: (c) => [
                c.countSentence,
                "Mas mahirap gamitin nang ligtas ang daan kung kulang ang karatula o madilim ang ilaw.",
                c.peakText && `Maaaring makatulong na suriin ang lugar na ito ${c.peakText}, dahil maraming aksidente ang nangyari sa oras na iyon.`,
            ],
        },
    },
    police_review: {
        basis: "offense",
        atVerify: true,
        usesDetail: true,
        base: 3,
        title: {
            en: (c) => `Consider asking the police to look into the reports near ${c.area}.`,
            fil: (c) => `Pag-isipang ipasuri sa pulisya ang mga ulat malapit sa ${c.area}.`,
        },
        explain: {
            en: (c) => [
                c.countSentence,
                c.proofSentence,
                "These cases can involve force or threats, so they may be more serious than other reports.",
                "The police can check if the reports are connected and if the same people may be involved.",
                c.sosSentence,
                c.detailNote,
            ],
            fil: (c) => [
                c.countSentence,
                c.proofSentence,
                "Maaaring may kasamang dahas o pananakot ang mga kasong ito, kaya maaaring mas seryoso ang mga ito kaysa sa ibang ulat.",
                "Masusuri ng pulisya kung magkakaugnay ang mga ulat at kung iisang tao ang maaaring sangkot.",
                c.sosSentence,
                c.detailNote,
            ],
        },
    },
    police_assessment: {
        basis: "offense",
        atVerify: true,
        usesDetail: true,
        base: 3,
        safetyNote: {
            en: "Residents and barangay tanods should not go near or try to stop anyone said to have a weapon.",
            fil: "Hindi dapat lumapit o subukang pigilan ng mga residente at tanod ang sinumang sinasabing may armas.",
        },
        title: {
            en: (c) => `Consider asking the police to check the weapons reports near ${c.area}.`,
            fil: (c) => `Pag-isipang ipasuri sa pulisya ang mga ulat tungkol sa armas malapit sa ${c.area}.`,
        },
        explain: {
            en: (c) => [
                c.countSentence,
                c.proofSentence,
                "Weapons can put people in serious danger, so the police are the right people to check these reports.",
                c.peakSentence,
                c.detailNote,
            ],
            fil: (c) => [
                c.countSentence,
                c.proofSentence,
                "Maaaring malagay sa matinding panganib ang mga tao dahil sa armas, kaya pulisya ang dapat magsuri ng mga ulat na ito.",
                c.peakSentence,
                c.detailNote,
            ],
        },
    },
    police_validation: {
        basis: "offense",
        atVerify: true,
        base: 3,
        safetyNote: {
            en: "To keep people safe, no person or place should be named in public while the reports are still being checked.",
            fil: "Para sa kaligtasan ng lahat, walang tao o lugar na dapat pangalanan sa publiko habang sinusuri pa ang mga ulat.",
        },
        title: {
            en: (c) => `Consider asking the police to check the reports near ${c.area}.`,
            fil: (c) => `Pag-isipang ipasuri sa pulisya ang mga ulat malapit sa ${c.area}.`,
        },
        explain: {
            en: (c) => [
                c.countSentence,
                c.proofSentence,
                "What people think they saw may not always be correct, so these reports need to be checked first.",
                "The police can find out what is really happening without putting residents at risk.",
            ],
            fil: (c) => [
                c.countSentence,
                c.proofSentence,
                "Maaaring hindi laging tama ang inaakalang nakita ng mga tao, kaya kailangan munang suriin ang mga ulat na ito.",
                "Maaaring alamin ng pulisya ang totoong nangyayari nang hindi nalalagay sa panganib ang mga residente.",
            ],
        },
    },
    vaw_referral: {
        basis: "offense",
        atVerify: true,
        base: 3,
        title: {
            en: () => "Consider sending these cases to the Barangay VAW Desk or the women's desk of the police.",
            fil: () => "Pag-isipang idulog ang mga kasong ito sa Barangay VAW Desk o sa women's desk ng pulisya.",
        },
        explain: {
            en: (c) => [
                c.countSentence,
                c.sosSentence,
                "These cases are private and can be dangerous for the person who asked for help.",
                "The people at these desks can help the person and keep the case private.",
                "This should not be shared with the public.",
            ],
            fil: (c) => [
                c.countSentence,
                c.sosSentence,
                "Pribado ang mga kasong ito at maaaring mapanganib para sa taong humingi ng tulong.",
                "Matutulungan ng mga tao sa mga desk na ito ang biktima at mapananatiling pribado ang kaso.",
                "Hindi ito dapat ibahagi sa publiko.",
            ],
        },
    },
    road_safety_review: {
        basis: "offense",
        atVerify: true,
        base: 2,
        title: {
            en: (c) => `Consider checking if the road near ${c.area} is safe.`,
            fil: (c) => `Pag-isipang suriin kung ligtas ang daan malapit sa ${c.area}.`,
        },
        explain: {
            en: (c) => [
                c.countSentence,
                "Many accidents in one place may mean something about the road is not safe, like a sharp turn or a blocked view.",
                c.peakSentence,
                c.detailNote,
                "Looking at the road can show if a simple fix may help.",
            ],
            fil: (c) => [
                c.countSentence,
                "Kapag maraming aksidente sa iisang lugar, maaaring may hindi ligtas sa daan, tulad ng matalim na kurba o natatakpang tanaw.",
                c.peakSentence,
                c.detailNote,
                "Makikita sa pagsusuri ng daan kung may simpleng ayos na makakatulong.",
            ],
        },
    },
    traffic_enforcement_review: {
        basis: "offense",
        base: 1,
        peakHelps: true,
        title: {
            en: (c) => `Consider checking if traffic enforcers are around near ${c.area}${c.when}.`,
            fil: (c) => `Pag-isipang alamin kung may traffic enforcer malapit sa ${c.area}${c.when}.`,
        },
        explain: {
            en: (c) => [
                c.peakSentence || c.countSentence,
                "If enforcers are not around when most accidents happen, they may not be able to help or guide drivers.",
                "Checking their usual hours can show if a change may help.",
            ],
            fil: (c) => [
                c.peakSentence || c.countSentence,
                "Kung wala ang mga enforcer kapag maraming aksidente, maaaring hindi sila makatulong o makagabay sa mga motorista.",
                "Makikita sa pagsusuri ng kanilang karaniwang oras kung may pagbabagong makakatulong.",
            ],
        },
    },
    peace_order_review: {
        basis: "offense",
        atVerify: true,
        base: 3,
        title: {
            en: (c) => `Consider having the barangay look into the repeated disturbances near ${c.area}.`,
            fil: (c) => `Pag-isipang ipasuri sa barangay ang paulit-ulit na gulo malapit sa ${c.area}.`,
        },
        explain: {
            en: (c) => [
                c.countSentence,
                c.proofSentence,
                "The barangay knows the area and the people, so it may be able to find out why this keeps happening.",
                c.peakSentence,
                "Stopping the cause early may keep it from getting worse.",
            ],
            fil: (c) => [
                c.countSentence,
                c.proofSentence,
                "Kilala ng barangay ang lugar at ang mga tao, kaya maaari nitong malaman kung bakit paulit-ulit itong nangyayari.",
                c.peakSentence,
                "Kapag naagapan ang pinagmulan, maaaring hindi na ito lumala.",
            ],
        },
    },
    verify_first: {
        basis: "offense",
        atVerify: true,
        base: 3,
        needsProof: true,
        title: {
            en: () => "Consider checking if these reports are true before doing anything else.",
            fil: () => "Pag-isipang alamin muna kung totoo ang mga ulat na ito bago gumawa ng ibang hakbang.",
        },
        explain: {
            en: (c) => [
                c.countSentence,
                c.proofSentence,
                "Something that looks suspicious can sometimes have a simple explanation.",
                "Talking to the people who reported it can help show what really happened.",
                "This can help avoid blaming someone who did nothing wrong.",
            ],
            fil: (c) => [
                c.countSentence,
                c.proofSentence,
                "Minsan may simpleng paliwanag ang isang bagay na mukhang kahina-hinala.",
                "Makakatulong ang pakikipag-usap sa mga nag-ulat para malaman ang totoong nangyari.",
                "Makakaiwas din ito sa paninisi sa taong walang ginawang masama.",
            ],
        },
    },
};

const RECOMMENDATIONS_BY_TYPE = {
    theft_snatching: ["patrol_visibility", "cctv_check", "community_awareness"],
    robbery_holdup: ["police_review", "patrol_visibility", "cctv_check"],
    physical_assault_injury: ["patrol_visibility", "barangay_mediation"],
    domestic_violence: ["vaw_referral"],
    illegal_weapons: ["police_assessment"],
    drug_related_activity: ["police_validation"],
    traffic_accident: ["road_safety_review", "signage_lighting", "traffic_enforcement_review"],
    public_disturbance: ["peace_order_review", "patrol_visibility"],
    suspicious_activity: ["verify_first", "community_awareness"],
    vandalism_property_damage: ["lighting_cctv", "barangay_mediation"],
};

const REPORT_DETAILS = [
    {
        term: /\b(motor|motorcycles?|motorsiklo|tandem)\b/i,
        en: "a motorcycle",
        fil: "motorsiklo",
        noteEn: "so the person may be able to get away quickly",
        noteFil: "kaya maaaring mabilis makatakas ang tao",
    },
    {
        term: /\b(guns?|baril|firearms?)\b/i,
        en: "a gun",
        fil: "baril",
        noteEn: "so extra care may be needed",
        noteFil: "kaya maaaring kailangan ng dagdag na pag-iingat",
    },
    {
        term: /\b(knife|kutsilyo|patalim)\b/i,
        en: "a knife",
        fil: "kutsilyo",
        noteEn: "so extra care may be needed",
        noteFil: "kaya maaaring kailangan ng dagdag na pag-iingat",
    },
    {
        term: /\b(masks?)\b/i,
        en: "a mask",
        fil: "maskara",
        noteEn: "so it may be harder to know who the person is",
        noteFil: "kaya maaaring mas mahirap makilala ang tao",
    },
];

const LEVEL_KEYS = { live: "levelLive", monitor: "levelMonitor", verify: "levelVerify", act: "levelAct" };
const CERTAINTY_KEYS = { high: "certaintyHigh", moderate: "certaintyModerate", low: "certaintyLow" };

function escapeHtml(value) {
    return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

export function formatIncidentCode(docId) {
    let hash = 0;
    const s = String(docId || "");
    for (let i = 0; i < s.length; i += 1) {
        hash = (hash * 31 + s.charCodeAt(i)) % 10000;
    }
    return `TR-${String(hash).padStart(4, "0")}`;
}

/** Whether a report should count toward hotspot facts at all. */
export function isCountableReport(data = {}) {
    const status = String(data.status || "").toLowerCase().trim();
    if (NOT_COUNTED_STATUSES.has(status)) return false;
    if (data.isDeleted === true || data.deletedAt || data.archivedAt) return false;
    if (data.adminDismissed === true && NOT_COUNTED_DISMISSALS.test(String(data.adminDismissalCategory || ""))) {
        return false;
    }
    return true;
}

function isConfirmedByAdmin(data = {}) {
    if (data.resolutionReason === "user_marked_safe") return false;
    return CONFIRMED_STATUSES.has(String(data.status || "").toLowerCase().trim());
}

function isLiveSos(row, now) {
    const d = row.data || {};
    if (d.isSOSReport !== true || d.liveStreamingActive === false || d.distressResolvedAt) return false;
    if (d.adminDismissed === true) return false;
    if (TERMINAL_STATUSES.has(String(d.status || "").toLowerCase().trim())) return false;
    const time = row.date?.getTime?.() || 0;
    return time > 0 && now - time <= LIVE_SOS_WINDOW_MS;
}

function hasExactGps(data = {}) {
    const lat = Number(data.location?.latitude ?? data.latitude);
    const lng = Number(data.location?.longitude ?? data.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0) && data.location?.isApproximate !== true;
}

function manilaHour(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
    const hour = Number(new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        hour: "numeric",
        hour12: false,
    }).format(date));
    return Number.isFinite(hour) ? hour % 24 : null;
}

function clockNumber(hour) {
    const h = ((hour % 24) + 24) % 24;
    return h % 12 === 0 ? 12 : h % 12;
}

function meridiem(hour) {
    return ((hour % 24) + 24) % 24 < 12 ? "AM" : "PM";
}

function filipinoDayPart(hour) {
    const h = ((hour % 24) + 24) % 24;
    if (h >= 1 && h < 5) return "ng madaling-araw";
    if (h >= 5 && h < 12) return "ng umaga";
    if (h === 12) return "ng tanghali";
    if (h > 12 && h < 18) return "ng hapon";
    return "ng gabi";
}

function findPeakWindow(rows) {
    const counts = Array.from({ length: 24 }, () => 0);
    let timed = 0;
    rows.forEach((row) => {
        const hour = manilaHour(row.date);
        if (hour == null) return;
        counts[hour] += 1;
        timed += 1;
    });

    let bestStart = 0;
    let best = 0;
    for (let start = 0; start < 24; start += 1) {
        const total = counts[start] + counts[(start + 1) % 24] + counts[(start + 2) % 24];
        if (total > best) {
            best = total;
            bestStart = start;
        }
    }

    const isClear = timed >= 3 && best >= 2 && best / timed >= 0.5;
    if (!isClear) return { timed, count: best, isClear: false };

    const inWindow = [0, 1, 2].filter((offset) => counts[(bestStart + offset) % 24] > 0);
    const startHour = (bestStart + inWindow[0]) % 24;
    const endHour = bestStart + inWindow[inWindow.length - 1] + 1;
    return { timed, count: best, isClear: true, startHour, endHour, from: clockNumber(startHour), to: clockNumber(endHour) };
}

function peakText(peak, lang) {
    if (!peak.isClear) return "";
    if (lang === "fil") {
        const fromPart = filipinoDayPart(peak.startHour);
        const toPart = filipinoDayPart(peak.endHour);
        return fromPart === toPart
            ? `sa pagitan ng ${peak.from} at ${peak.to} ${toPart}`
            : `sa pagitan ng ${peak.from} ${fromPart} at ${peak.to} ${toPart}`;
    }
    const fromMeridiem = meridiem(peak.startHour);
    const toMeridiem = meridiem(peak.endHour);
    return fromMeridiem === toMeridiem
        ? `between ${peak.from} and ${peak.to} ${toMeridiem}`
        : `between ${peak.from} ${fromMeridiem} and ${peak.to} ${toMeridiem}`;
}

function whenPhrase(peak, lang) {
    if (!peak.isClear) return "";
    const h = peak.startHour;
    const part = h >= 5 && h < 12 ? 0 : h >= 12 && h < 17 ? 1 : h >= 17 && h < 21 ? 2 : h >= 21 ? 3 : 4;
    return (lang === "fil"
        ? [" sa umaga", " sa hapon", " sa maagang gabi", " sa gabi", " sa madaling-araw"]
        : [" in the morning", " in the afternoon", " in the early evening", " at night", " late at night"])[part];
}

function shortArea(area) {
    const first = String(area || "").split(",").map((part) => part.trim()).filter(Boolean)[0];
    return first || "this area";
}

function findEvidenceLevel(facts) {
    if (facts.liveSosCount > 0) return "live";
    if (facts.total <= 2) return "monitor";
    if (facts.total >= 5 && facts.confirmed >= 2 && facts.peak.isClear) return "act";
    return "verify";
}

function findCertainty(facts) {
    const gpsShare = facts.total ? facts.withGps / facts.total : 0;
    if (facts.total >= 8 && facts.confirmed >= facts.total / 2 && gpsShare >= 0.8) return "high";
    if (facts.total >= 5 && facts.confirmed >= 2) return "moderate";
    if (facts.total >= 3 && facts.confirmed >= 1) return "moderate";
    return "low";
}

function findReportDetails(rows) {
    return REPORT_DETAILS
        .map((detail) => ({
            ...detail,
            count: rows.filter((row) => detail.term.test(String(row.data?.description || ""))).length,
        }))
        .filter((detail) => detail.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 2);
}

function buildTypeFacts(type, count, rows, prior) {
    return {
        type,
        count,
        prior,
        confirmed: rows.filter((row) => isConfirmedByAdmin(row.data)).length,
        sos: rows.filter((row) => row.data?.isSOSReport === true).length,
        peak: findPeakWindow(rows),
        details: findReportDetails(rows),
    };
}

function collectAllowedNumbers(facts) {
    const numbers = [
        1,
        facts.total,
        facts.confirmed,
        facts.unconfirmed,
        facts.withGps,
        facts.peak.count,
        facts.peak.timed,
        facts.peak.from,
        facts.peak.to,
        ...facts.details.map((detail) => detail.count),
        ...facts.typeFacts.flatMap((item) => [
            item.count,
            item.prior,
            item.confirmed,
            item.sos,
            item.peak.count,
            item.peak.timed,
            item.peak.from,
            item.peak.to,
            ...item.details.map((detail) => detail.count),
        ]),
        ...(String(facts.periodLabel).match(/\d+/g) || []),
    ];
    return new Set(numbers.filter((n) => n != null).map(Number));
}

/** Facts come only from report data. `hotspot` needs `area`, `typeCounts` and `hotspotRows`. */
export function buildHotspotFacts(hotspot, { periodLabel = "Selected Range", priorTypeCounts = null, now = Date.now() } = {}) {
    const rows = hotspot.hotspotRows || hotspot.rows || [];
    const sortedTypes = Object.entries(hotspot.typeCounts || {}).sort((a, b) => b[1] - a[1]);
    const typeFacts = sortedTypes.map(([type, count]) => buildTypeFacts(
        type,
        count,
        rows.filter((row) => String(row.data?.type || "other").toLowerCase() === type),
        priorTypeCounts ? (priorTypeCounts[type] || 0) : null,
    ));
    const dominant = typeFacts[0] || buildTypeFacts("other", 0, [], null);
    const total = rows.length;
    const confirmed = rows.filter((row) => isConfirmedByAdmin(row.data)).length;

    const facts = {
        area: hotspot.area,
        shortArea: shortArea(hotspot.area),
        dominantType: dominant.type,
        dominantCount: dominant.count,
        priorDominantCount: dominant.prior,
        typeFacts,
        periodLabel,
        total,
        confirmed,
        unconfirmed: total - confirmed,
        withGps: rows.filter((row) => hasExactGps(row.data)).length,
        highSeverity: hotspot.severityBreakdown?.high || 0,
        liveSosCount: rows.filter((row) => isLiveSos(row, now)).length,
        peak: findPeakWindow(rows),
        details: findReportDetails(rows),
        reportIds: rows.map((row) => row.id).filter(Boolean),
    };

    facts.level = findEvidenceLevel(facts);
    facts.certainty = findCertainty(facts);
    facts.allowedNumbers = collectAllowedNumbers(facts);
    return facts;
}

function trendPhrase(count, prior, lang) {
    if (prior == null) return "";
    if (lang === "fil") {
        if (count > prior) return `, tumaas mula ${prior} noong nakaraang panahon`;
        if (count < prior) return `, bumaba mula ${prior} noong nakaraang panahon`;
        return ", kapareho noong nakaraang panahon";
    }
    if (count > prior) return `, up from ${prior} in the previous period`;
    if (count < prior) return `, down from ${prior} in the previous period`;
    return ", the same as the previous period";
}

function buildReportBullets(facts, lang) {
    const type = dpTypeLabel(lang, facts.dominantType).toLowerCase();
    const trend = trendPhrase(facts.dominantCount, facts.priorDominantCount, lang);
    const isFil = lang === "fil";
    const others = facts.typeFacts.slice(1, 3).map((item) => `${item.count} ${dpTypeLabel(lang, item.type).toLowerCase()}`);

    const first = facts.dominantCount === facts.total
        ? (isFil ? `${facts.total} ulat ng ${type}${trend}` : `${facts.total} ${type} report${facts.total === 1 ? "" : "s"}${trend}`)
        : (isFil
            ? `${facts.total} ulat sa lugar na ito, kasama ang ${facts.dominantCount} na ${type}${trend}`
            : `${facts.total} reports in this area, including ${facts.dominantCount} ${type}${trend}`);

    const bullets = [first];
    if (others.length) {
        bullets.push(isFil ? `Mayroon ding ${others.join(" at ")}` : `Also ${others.join(" and ")}`);
    }
    bullets.push(facts.peak.isClear
        ? (isFil
            ? `${facts.peak.count} sa ${facts.peak.timed} ang nangyari ${peakText(facts.peak, lang)}`
            : `${facts.peak.count} of ${facts.peak.timed} happened ${peakText(facts.peak, lang)}`)
        : (isFil ? "Wala pang malinaw na oras kung kailan ito nangyayari" : "No clear time pattern yet"));
    facts.details.forEach((detail) => {
        bullets.push(isFil ? `${detail.count} ulat ang nagbanggit ng ${detail.fil}` : `${detail.count} reports mention ${detail.en}`);
    });
    return bullets;
}

function buildUnknowns(facts, lang) {
    const isFil = lang === "fil";
    const unknowns = [];
    if (facts.total >= 2) {
        unknowns.push(isFil ? "Kung iisang tao o grupo ang sangkot sa mga insidente" : "Whether the incidents involve the same people");
    }
    if (facts.unconfirmed > 0) {
        unknowns.push(isFil
            ? `${facts.unconfirmed} sa ${facts.total} ulat ang hindi pa nakukumpirma`
            : `${facts.unconfirmed} of the ${facts.total} reports are still unconfirmed`);
    }
    if (facts.withGps < facts.total) {
        const missing = facts.total - facts.withGps;
        unknowns.push(isFil
            ? `${missing} sa ${facts.total} ulat ang walang eksaktong GPS na lokasyon`
            : `${missing} of the ${facts.total} reports have no exact GPS location`);
    }
    if (!facts.peak.isClear) {
        unknowns.push(isFil ? "Kung may regular na oras ng pangyayari dito" : "Whether incidents here follow a consistent time pattern");
    }
    if (facts.total <= 2) {
        unknowns.push(isFil ? "Kung paulit-ulit ito, dahil kakaunti pa lang ang ulat" : "Whether this is a repeating pattern, with so few reports");
    }
    return unknowns;
}

function shortCitation(reference) {
    return String(reference || "")
        .replace(/^Act No\. 3815,?\s*/i, "RPC ")
        .replace(/^Republic Act No\.\s*/i, "RA ")
        .replace(/^Presidential Decree No\.\s*/i, "PD ")
        .replace(/^Batas Pambansa Blg\.\s*/i, "BP ")
        .replace(/^Executive Order No\.\s*/i, "EO ")
        .replace(/,\s*Sec\s+/i, ", Sec. ")
        .trim();
}

/** Merges the three knowledge collections into citable sources with stable IDs. */
export function normalizeSources({ knowledge = [], nationalLaws = [], rules = [] }, facts) {
    const seen = new Set();
    const sources = [];
    const typesHere = new Set(facts.typeFacts.map((item) => item.type));

    const add = (source) => {
        const key = `${source.code}|${source.title}`.toLowerCase();
        if (!source.text || seen.has(key)) return;
        seen.add(key);
        sources.push({ ...source, id: `SRC-${sources.length + 1}` });
    };

    [...knowledge, ...nationalLaws].forEach((doc) => {
        add({
            kind: String(doc.type || "reference").toLowerCase(),
            code: String(doc.referenceNumber || doc.code || doc.title || ""),
            title: String(doc.title || doc.referenceNumber || ""),
            text: String(doc.content || doc.provision || ""),
            crimeType: doc.crimeType ? String(doc.crimeType).toLowerCase() : null,
        });
    });

    rules.forEach((rule) => {
        const crimeType = String(rule.crimeType || "all").toLowerCase();
        if (crimeType !== "all" && !typesHere.has(crimeType)) return;
        if (rule.minReports && facts.total < Number(rule.minReports)) return;
        if (rule.minHighSeverity && facts.highSeverity < Number(rule.minHighSeverity)) return;
        add({
            kind: "rule",
            code: String(rule.name || "Operational rule"),
            title: String(rule.name || "Operational rule"),
            text: String(rule.recommendedAction || rule.guidance || rule.description || ""),
            crimeType: crimeType === "all" ? null : crimeType,
        });
    });

    return sources;
}

function sourceStrength(source) {
    if (source.kind === "ordinance") return 0;
    if (source.kind === "rule") return 1;
    if (source.kind === "reference" || source.kind === "national_law") return 3;
    return 2;
}

function strongestFirst(sources) {
    return [...sources].sort((a, b) => sourceStrength(a) - sourceStrength(b));
}

function isInScope(source, type) {
    return !source.crimeType || source.crimeType === type || GENERAL_AUTHORITY.test(source.code);
}

function findOffenseSources(sources, type) {
    const offense = OFFENSE_SOURCES[type];
    if (!offense) return [];
    return strongestFirst(sources.filter((source) => {
        if (offense.law.test(source.code) && source.crimeType === type) return true;
        if (source.kind === "rule") return source.crimeType === type;
        return !source.crimeType && offense.words.test(`${source.title} ${source.text}`);
    }));
}

function findTermSources(sources, type, terms) {
    return strongestFirst(sources.filter((source) =>
        isInScope(source, type) && terms.test(`${source.title} ${source.text}`),
    ));
}

function scoreRecommendation(rec, typeFacts, isDominant) {
    return rec.base +
        (isDominant ? 4 : 0) +
        (rec.peakHelps && typeFacts.peak.isClear ? 2 : 0) +
        (rec.usesDetail && typeFacts.details.length ? 2 : 0) +
        (rec.needsProof && typeFacts.confirmed < typeFacts.count ? 2 : 0) +
        (typeFacts.sos > 0 && rec.basis === "offense" ? 1 : 0);
}

function typesToRecommendFor(facts) {
    return facts.typeFacts
        .filter((item, index) => index === 0 || item.count >= MIN_SECOND_TYPE_REPORTS)
        .slice(0, 2);
}

/** Recommendations that this hotspot's evidence allows and a retrieved source supports. */
export function buildCandidates(facts, sources) {
    if (facts.level === "live" || facts.level === "monitor") return [];

    const seen = new Set();
    const candidates = [];

    typesToRecommendFor(facts).forEach((typeFacts, typeIndex) => {
        const offenseSources = findOffenseSources(sources, typeFacts.type);

        (RECOMMENDATIONS_BY_TYPE[typeFacts.type] || []).forEach((id) => {
            const rec = RECOMMENDATIONS[id];
            if (seen.has(id) || (facts.level !== "act" && !rec.atVerify)) return;

            const support = rec.basis === "terms" ? findTermSources(sources, typeFacts.type, rec.terms) : offenseSources;
            if (!support.length) return;

            seen.add(id);
            candidates.push({
                id,
                typeFacts,
                score: scoreRecommendation(rec, typeFacts, typeIndex === 0),
                supportIds: support.map((source) => source.id),
                sources: [...new Map(
                    [...support.slice(0, 3), ...offenseSources.slice(0, 2)].map((source) => [source.id, source]),
                ).values()],
            });
        });
    });

    return candidates.sort((a, b) => b.score - a.score);
}

const STAFFING_OR_ORDERS = new RegExp(
    "\\b(\\d+|one|two|three|four|five|six|seven|eight|nine|ten)\\s+" +
    "(officers?|tanods?|personnel|policem[ae]n|patrol cars?|cars?|units?|teams?|pairs?|cruisers?|vehicles?|people to|pulis|opisyal|sasakyan)\\b" +
    "|\\b(assign\\w*|deploy\\w*|dispatch\\w*|must|shall|directives?|tactical|interdict\\w*|checkpoints?)\\b",
    "i",
);
const HARD_WORDS = /\b(modus|perpetrators?|utili[sz]\w*|mitigat\w*|facilitat\w*|deter(?:s|red|ring|rence|rent)?|surveillance|intimidation|concentrated|corroborat\w*)\b/i;
const LEGAL_REFERENCE = /\b(R\.?A\.?|P\.?D\.?|B\.?P\.?)\s*(No\.?\s*)?\d|\bArt(icle)?\.?\s*\d|\bSec(tion)?\.?\s*\d|\bOrd(inance)?\.?\s*(No|\d)/i;
const NUMBER_WORDS = {
    two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    dalawa: 2, tatlo: 3, apat: 4, lima: 5, anim: 6, pito: 7, walo: 8, siyam: 9, sampu: 10,
};

function usesOnlyKnownNumbers(text, allowed) {
    const digits = (text.match(/\d+(?:\.\d+)?/g) || []).map(Number);
    const words = (text.toLowerCase().match(/[a-z]+/g) || [])
        .filter((word) => word in NUMBER_WORDS)
        .map((word) => NUMBER_WORDS[word]);
    return [...digits, ...words].every((n) => allowed.has(n));
}

function isSafeGeneratedText(text, facts, maxLength) {
    if (typeof text !== "string") return false;
    const trimmed = text.trim();
    if (!trimmed || trimmed.length > maxLength) return false;
    if (STAFFING_OR_ORDERS.test(trimmed) || LEGAL_REFERENCE.test(trimmed) || HARD_WORDS.test(trimmed)) return false;
    return usesOnlyKnownNumbers(trimmed, facts.allowedNumbers);
}

function countSentence(typeFacts, lang) {
    const type = dpTypeLabel(lang, typeFacts.type).toLowerCase();
    const { count, prior } = typeFacts;
    if (lang === "fil") {
        const trend = prior == null ? "" : prior === 0 && count > 0
            ? " Wala nito noong nakaraang panahon."
            : count > prior
                ? ` Mas marami ito kaysa sa ${prior} noong nakaraang panahon.`
                : count < prior
                    ? ` Mas kaunti ito kaysa sa ${prior} noong nakaraang panahon.`
                    : " Kapareho ito ng bilang noong nakaraang panahon.";
        return `May ${count} ulat ng ${type} dito sa panahong ito.${trend}`;
    }
    const trend = prior == null ? "" : prior === 0 && count > 0
        ? " There were none in the period before."
        : count > prior
            ? ` That is more than the ${prior} in the period before.`
            : count < prior
                ? ` That is fewer than the ${prior} in the period before.`
                : " That is the same as the period before.";
    return `${count} ${type} report${count === 1 ? " was" : "s were"} made here in this period.${trend}`;
}

function proofSentence({ count, confirmed }, lang) {
    if (lang === "fil") {
        if (count === 1) return confirmed ? "Nakumpirma na ng admin ang ulat na ito." : "Hindi pa nakukumpirma ng admin ang ulat na ito.";
        if (confirmed === count) return "Lahat ng ito ay nakumpirma na ng admin.";
        if (confirmed === 0) return "Wala pa sa mga ito ang nakumpirma ng admin, kaya kailangan pa itong suriin.";
        return `${confirmed} sa mga ito ang nakumpirma na ng admin.`;
    }
    if (count === 1) return confirmed ? "This report has been confirmed by an admin." : "This report has not been confirmed by an admin yet.";
    if (confirmed === count) return "All of them have been confirmed by an admin.";
    if (confirmed === 0) return "None of them have been confirmed by an admin yet, so they still need to be checked.";
    return `${confirmed} of them have been confirmed by an admin.`;
}

function sosSentence({ sos }, lang) {
    if (!sos) return "";
    return lang === "fil"
        ? `${sos} sa mga ito ay ipinadala bilang SOS, kaya kailangan agad ng tulong ng nag-ulat.`
        : `${sos} of these came in as an SOS, so the person needed help right away.`;
}

function detailNote(typeFacts, rec, lang) {
    const detail = rec.usesDetail ? typeFacts.details[0] : null;
    if (!detail) return "";
    return lang === "fil"
        ? `${detail.count} ulat ang nagbanggit ng ${detail.fil}, ${detail.noteFil}.`
        : `${detail.count} reports mention ${detail.en}, ${detail.noteEn}.`;
}

function explainContext(facts, typeFacts, rec, lang) {
    const text = peakText(typeFacts.peak, lang);
    return {
        area: facts.shortArea,
        when: whenPhrase(typeFacts.peak, lang),
        peakText: text,
        peakSentence: text
            ? (lang === "fil"
                ? `${typeFacts.peak.count} sa ${typeFacts.peak.timed} ulat dito ang nangyari ${text}.`
                : `${typeFacts.peak.count} of the ${typeFacts.peak.timed} reports here happened ${text}.`)
            : "",
        countSentence: countSentence(typeFacts, lang),
        proofSentence: proofSentence(typeFacts, lang),
        sosSentence: sosSentence(typeFacts, lang),
        detailNote: detailNote(typeFacts, rec, lang),
    };
}

function writeCodeReasoning(rec, facts, typeFacts, lang) {
    return rec.explain[lang](explainContext(facts, typeFacts, rec, lang)).filter(Boolean).join(" ");
}

function withSafetyNote(reasoning, rec, lang) {
    return rec.safetyNote ? `${reasoning} ${rec.safetyNote[lang]}` : reasoning;
}

function toBadge(source) {
    return {
        kind: source.kind,
        code: source.kind === "rule" ? source.code : shortCitation(source.code),
        title: source.title,
    };
}

function chooseCitations(candidate, citedIds) {
    const byId = new Map(candidate.sources.map((source) => [source.id, source]));
    const cited = citedIds.filter((id) => byId.has(id));
    if (!cited.length) return [];
    if (!cited.some((id) => candidate.supportIds.includes(id))) {
        const firstSupport = candidate.supportIds.find((id) => byId.has(id));
        if (firstSupport) cited.unshift(firstSupport);
    }
    return [...new Set(cited)].slice(0, MAX_BADGES).map((id) => byId.get(id));
}

function defaultCitations(candidate) {
    const support = candidate.sources.find((source) => candidate.supportIds.includes(source.id));
    const other = candidate.sources.find((source) => source.id !== support?.id);
    return [support, other].filter(Boolean);
}

function titlesFor(rec, facts, typeFacts) {
    return {
        en: rec.title.en(explainContext(facts, typeFacts, rec, "en")),
        fil: rec.title.fil(explainContext(facts, typeFacts, rec, "fil")),
    };
}

function buildRecommendations(facts, candidates, aiOutput) {
    const codeReasoning = (rec, typeFacts) => ({
        en: withSafetyNote(writeCodeReasoning(rec, facts, typeFacts, "en"), rec, "en"),
        fil: withSafetyNote(writeCodeReasoning(rec, facts, typeFacts, "fil"), rec, "fil"),
    });

    const fromCode = (candidate) => {
        const rec = RECOMMENDATIONS[candidate.id];
        return {
            id: candidate.id,
            title: titlesFor(rec, facts, candidate.typeFacts),
            reasoning: codeReasoning(rec, candidate.typeFacts),
            badges: defaultCitations(candidate).map(toBadge),
        };
    };

    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const usedIds = new Set();
    const fromAi = (Array.isArray(aiOutput?.recommendations) ? aiOutput.recommendations : [])
        .map((item) => {
            const candidate = byId.get(item?.recommendationId);
            if (!candidate || usedIds.has(candidate.id)) return null;
            const citations = chooseCitations(candidate, Array.isArray(item.citedSourceIds) ? item.citedSourceIds : []);
            if (!citations.length) return null;
            usedIds.add(candidate.id);

            const rec = RECOMMENDATIONS[candidate.id];
            const code = codeReasoning(rec, candidate.typeFacts);
            const englishIsSafe = isSafeGeneratedText(item.reasoning, facts, 900);
            const filipinoIsSafe = isSafeGeneratedText(item.reasoningFilipino, facts, 1100);
            return {
                id: candidate.id,
                title: titlesFor(rec, facts, candidate.typeFacts),
                reasoning: {
                    en: englishIsSafe ? withSafetyNote(item.reasoning.trim(), rec, "en") : code.en,
                    fil: englishIsSafe && filipinoIsSafe ? withSafetyNote(item.reasoningFilipino.trim(), rec, "fil") : code.fil,
                },
                badges: citations.map(toBadge),
                aiWritten: englishIsSafe,
            };
        })
        .filter(Boolean)
        .slice(0, MAX_RECOMMENDATIONS);

    return fromAi.length ? fromAi : candidates.slice(0, MAX_RECOMMENDATIONS).map(fromCode);
}

/** Combines facts, retrieved sources and optional Gemini output into the final draft. */
export function assembleDecisionPlan(facts, candidates, aiOutput = null) {
    const recommendations = buildRecommendations(facts, candidates, aiOutput);
    return {
        facts,
        recommendations,
        source: recommendations.some((rec) => rec.aiWritten) ? "gemini" : "knowledge_rules",
    };
}

export function needsGemini(candidates) {
    return candidates.length > 0;
}

function redact(text) {
    return String(text || "")
        .replace(/\b09\d{9}\b|\+639\d{9}\b/g, "[phone removed]")
        .replace(/\S+@\S+\.\S+/g, "[email removed]")
        .slice(0, 280);
}

function buildGeminiRequest(facts, candidates, hotspotRows, feedback) {
    const systemInstruction = [
        "You help write a decision plan draft for Valenzuela City police and barangay administrators.",
        "Use only the facts, report narratives and sources in the input. Do not add outside knowledge.",
        "Make each explanation specific to this hotspot. Mention what is different about these reports, such as where, when, or what people described.",
        "For each recommendation you include, write 3 to 5 short sentences. Say what the reports show, why this may help, and anything people should be careful about. Also list the IDs of the provided sources that support it.",
        "Put the English explanation in reasoning and the same explanation in everyday Filipino (Tagalog) in reasoningFilipino.",
        "Never mention a law, ordinance or section by name or number in your sentences. Citations are shown separately from the IDs.",
        "Never state a number that is not in the facts. Never state how many people, officers or vehicles to use.",
        "Never tell anyone what to do, assign anyone, or set a schedule. Authorities decide. Use tentative wording such as 'may'.",
        "Never identify a person. Do not say an incident is proven.",
        "Write in everyday language that a child or a barangay worker can understand right away. Use short sentences and common words. Say 'stop' instead of 'deter', 'many' instead of 'concentrated', and 'threats' instead of 'intimidation'.",
    ].join("\n");

    const userPrompt = JSON.stringify({
        location: facts.shortArea,
        period: facts.periodLabel,
        facts: buildReportBullets(facts, "en"),
        evidence: {
            reports: facts.total,
            withExactGps: facts.withGps,
            confirmedByAdmin: facts.confirmed,
        },
        reportNarratives: hotspotRows.slice(0, 15).map((row) => ({
            type: row.data?.type || "unknown",
            narrative: redact(row.data?.description),
        })),
        recommendationsToConsider: candidates.map((candidate) => ({
            recommendationId: candidate.id,
            recommendation: RECOMMENDATIONS[candidate.id].title.en(
                explainContext(facts, candidate.typeFacts, RECOMMENDATIONS[candidate.id], "en"),
            ),
            forIncidentType: dpTypeLabel("en", candidate.typeFacts.type),
            reportsOfThisType: candidate.typeFacts.count,
            availableSources: candidate.sources.map((source) => ({
                sourceId: source.id,
                title: source.title,
                text: source.text.slice(0, 700),
            })),
        })),
        pastAdminFeedbackForContextOnly: (feedback || [])
            .filter((item) => item?.comment)
            .slice(0, 5)
            .map((item) => ({ rating: item.rating, comment: item.comment })),
    });

    return {
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
        generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
            responseSchema: {
                type: "OBJECT",
                required: ["recommendations"],
                properties: {
                    recommendations: {
                        type: "ARRAY",
                        items: {
                            type: "OBJECT",
                            required: ["recommendationId", "reasoning", "reasoningFilipino", "citedSourceIds"],
                            properties: {
                                recommendationId: { type: "STRING", enum: candidates.map((candidate) => candidate.id) },
                                reasoning: { type: "STRING" },
                                reasoningFilipino: { type: "STRING" },
                                citedSourceIds: { type: "ARRAY", items: { type: "STRING" } },
                            },
                        },
                    },
                },
            },
        },
    };
}

/** Returns parsed Gemini output, or throws if every model fails. */
export async function requestGeminiDraft(apiKey, facts, candidates, hotspotRows, feedback, fetchImpl = fetch, onAttempt = () => {}) {
    const body = JSON.stringify(buildGeminiRequest(facts, candidates, hotspotRows, feedback));
    let lastError = "No model responded";

    for (const [index, model] of GEMINI_MODELS.entries()) {
        onAttempt({ model, attempt: index + 1, total: GEMINI_MODELS.length, failedModel: index > 0 ? GEMINI_MODELS[index - 1] : null });
        try {
            const response = await fetchImpl(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
                body,
                signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
            });
            if (!response.ok) {
                lastError = `${model}: HTTP ${response.status}`;
                continue;
            }
            const json = await response.json();
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (!text) {
                lastError = `${model}: empty response`;
                continue;
            }
            return { ...JSON.parse(text), modelUsed: model };
        } catch (error) {
            lastError = `${model}: ${error?.message || "request failed"}`;
        }
    }
    throw new Error(lastError);
}

function icon(name) {
    return `<span class="material-symbols-outlined" aria-hidden="true">${name}</span>`;
}

function renderSectionHeader(iconName, title) {
    return `
        <div class="analytics-action-plan-header">
            <div class="analytics-action-plan-header__left">
                <div class="analytics-action-plan-header__icon">${icon(iconName)}</div>
                <h4 class="analytics-action-plan-title">${escapeHtml(title)}</h4>
            </div>
        </div>
    `;
}

function renderBadge(badge, lang) {
    const style = badge.kind === "ordinance"
        ? { tone: "local", iconName: "account_balance" }
        : badge.kind === "rule"
            ? { tone: "rule", iconName: "rule" }
            : { tone: "statute", iconName: "menu_book" };
    return `<span class="analytics-ai-ref-badge analytics-ai-ref-badge--${style.tone} dp-badge" title="${escapeHtml(badge.title)}">${icon(style.iconName)}<span>${escapeHtml(dpSourceLabel(lang, badge.kind))} · ${escapeHtml(badge.code)}</span></span>`;
}

function renderRecommendations(recommendations, lang) {
    if (!recommendations.length) return "";
    return `
        <section class="analytics-action-plan-section">
            ${renderSectionHeader("checklist", dpText(lang, "sectionRecs"))}
            <ol class="dp-recs">
                ${recommendations.map((rec, index) => `
                    <li class="analytics-tactical-card dp-rec">
                        <h5 class="analytics-tactical-card__title dp-rec__title">
                            <span class="analytics-tactical-step-pill">${index + 1}</span>
                            <span>${escapeHtml(rec.title[lang])}</span>
                        </h5>
                        <p class="analytics-tactical-card__text">${escapeHtml(rec.reasoning[lang])}</p>
                        <div class="dp-badges"><span class="dp-badges__label">${escapeHtml(dpText(lang, "basedOn"))}</span>${rec.badges.map((badge) => renderBadge(badge, lang)).join("")}</div>
                    </li>
                `).join("")}
            </ol>
        </section>
    `;
}

function renderStat(value, label) {
    return `<div class="analytics-factor-card dp-stat"><strong>${value}</strong><span>${escapeHtml(label)}</span></div>`;
}

function renderReportLinks(ids, lang) {
    const shown = ids.slice(0, MAX_REPORT_LINKS);
    const links = shown.map((id) =>
        `<a class="analytics-geo-pill dp-report" href="incidents.html?incidentId=${encodeURIComponent(id)}">${formatIncidentCode(id)}</a>`,
    ).join("");
    const more = ids.length > shown.length
        ? `<span class="dp-more">${escapeHtml(dpText(lang, "more", { count: ids.length - shown.length }))}</span>`
        : "";
    return `<div class="dp-reports"><span class="dp-reports__label">${escapeHtml(dpText(lang, "reports"))}</span>${links}${more}</div>`;
}

const PROGRESS_STEPS = ["reports", "sources", "match", "ai", "check"];
const PROGRESS_ICONS = {
    done: "check_circle",
    active: "progress_activity",
    pending: "radio_button_unchecked",
    skipped: "remove_circle",
    fallback: "info",
};

function topTypesText(typeCounts, lang) {
    return Object.entries(typeCounts || {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => `${count} ${dpTypeLabel(lang, type).toLowerCase()}`)
        .join(", ");
}

/** Live checklist shown while a plan is being drafted. Every line reflects a step that is really running. */
export function renderPlanProgress(progress, lang = "en", now = Date.now()) {
    const steps = PROGRESS_STEPS.map((id) => {
        const step = progress.steps[id];
        const vars = id === "reports" ? { total: progress.total, types: topTypesText(progress.typeCounts, lang) } : step.vars;
        return { id, state: step.state, text: dpText(lang, step.key, vars) };
    });
    const finished = steps.filter((step) => step.state !== "pending" && step.state !== "active").length;
    const current = steps.find((step) => step.state === "active");
    const seconds = Math.max(0, Math.floor((now - progress.startedAt) / 1000));

    return `
        <p class="dp-progress__now">${escapeHtml(current ? current.text : dpText(lang, "draftingPlan"))}</p>
        <div class="dp-progress__track" role="progressbar" aria-valuemin="0" aria-valuemax="${steps.length}" aria-valuenow="${finished}">
            <div class="dp-progress__fill" style="width:${Math.round((finished / steps.length) * 100)}%;"></div>
        </div>
        <ul class="dp-progress__steps">
            ${steps.map((step) => `
                <li class="dp-progress__step dp-progress__step--${step.state}">
                    <span class="material-symbols-outlined${step.state === "active" ? " analytics-ai-spinner" : ""}" aria-hidden="true">${PROGRESS_ICONS[step.state]}</span>
                    <span>${escapeHtml(step.text)}</span>
                </li>
            `).join("")}
        </ul>
        <p class="dp-progress__elapsed">${escapeHtml(dpText(lang, "elapsed", { seconds }))}</p>
    `;
}

/** Page accent for the card, matching the other hotspot cards. */
export function decisionPlanTone(plan) {
    return { live: "critical", act: "high", verify: "medium", monitor: "low" }[plan.facts.level];
}

/** The brief itself, shared by the on-screen card and the PDF export. */
export function renderDecisionBrief(plan, lang = "en") {
    const { facts, recommendations } = plan;
    const generatedBy = dpText(lang, plan.source === "gemini" ? "withGemini" : "withRules");
    const tone = decisionPlanTone(plan);

    return `
        <div class="dp-head">
            <div class="dp-head__main">
                <h3 class="dp-doc-title" title="${escapeHtml(generatedBy)}">${escapeHtml(dpText(lang, "docTitle"))}</h3>
                <h4 class="analytics-solution-card__title dp-area">${escapeHtml(facts.shortArea)}</h4>
                <p class="analytics-solution-card__pattern">${escapeHtml(dpTypeLabel(lang, facts.dominantType))} · ${escapeHtml(dpPeriodLabel(lang, facts.periodLabel))}</p>
            </div>
            <span class="analytics-solution-card__priority analytics-solution-card__priority--${tone}">${escapeHtml(dpText(lang, LEVEL_KEYS[facts.level]))}</span>
        </div>

        ${facts.level === "live" ? `<div class="analytics-operational-mode-banner analytics-operational-mode-banner--emergency dp-live">${icon("emergency")}<strong>${escapeHtml(dpText(lang, "liveBanner"))}</strong></div>` : ""}

        <section class="analytics-action-plan-section">
            ${renderSectionHeader("query_stats", dpText(lang, "sectionShow"))}
            <div class="analytics-priority-factors-grid">
                ${buildReportBullets(facts, lang).map((item) => `<div class="analytics-factor-card dp-fact">${escapeHtml(item)}</div>`).join("")}
            </div>
        </section>

        <section class="analytics-priority-calc-panel dp-panel">
            <div class="analytics-priority-calc-header">
                <div class="analytics-action-plan-header__left">
                    <div class="analytics-action-plan-header__icon">${icon("fact_check")}</div>
                    <h4 class="analytics-action-plan-title">${escapeHtml(dpText(lang, "sectionSure"))}</h4>
                </div>
                <div class="analytics-priority-score-badge"><strong>${escapeHtml(dpText(lang, CERTAINTY_KEYS[facts.certainty]))}</strong></div>
            </div>
            <div class="analytics-priority-factors-grid">
                ${renderStat(facts.total, dpText(lang, "statReports", { count: facts.total }))}
                ${renderStat(facts.withGps, dpText(lang, "statGps"))}
                ${renderStat(facts.confirmed, dpText(lang, "statConfirmed"))}
            </div>
        </section>

        ${renderRecommendations(recommendations, lang)}

        <section class="dp-unknowns">
            <h4 class="dp-unknowns__title">${icon("help")}<span>${escapeHtml(dpText(lang, "sectionUnknown"))}</span></h4>
            <ul class="dp-unknowns__list">${buildUnknowns(facts, lang).map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </section>

        <p class="dp-disclaimer">${icon("gavel")}<span>${escapeHtml(dpText(lang, "disclaimer"))}</span></p>
        ${renderReportLinks(facts.reportIds, lang)}
    `;
}
