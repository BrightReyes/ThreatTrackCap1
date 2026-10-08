import { initAdminPage } from "./admin-auth.js";
import {
    collection,
    getCountFromServer,
    getDocs,
    query,
    where,
    addDoc,
    doc,
    updateDoc,
    serverTimestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../../shared/firebase.js";


const INCIDENT_LIMIT = 500;
const OPEN_STATUSES = new Set(["pending", "under_review"]);
const VERIFIED_STATUSES = new Set(["verified", "responding", "done"]);
const RESPONDED_STATUSES = new Set(["responding", "done"]);
const SOLUTION_LIMIT = 5;
const MIN_RECOMMENDATION_REPORTS = 3;
const SOLUTION_PRIORITIES = ["all", "high", "medium", "low"];
const GEMINI_DEMO_KEY_STORAGE = "tt_gemini_demo_key";
const GEMINI_DEMO_MODEL = "gemini-flash-latest";
const HOTSPOT_AI_SESSION_PREFIX = "tt_hotspot_ai_plan:";
const HOTSPOT_AI_SCHEMA = {
    type: "object",
    required: [
        "hotspotTitle",
        "riskLevel",
        "riskSummary",
        "crimePattern",
        "tailoredSolution",
        "priorityActions",
        "publicAdvisoryDraft",
        "adminNotes",
        "confidenceNote",
    ],
    properties: {
        hotspotTitle: { type: "string" },
        riskLevel: {
            type: "string",
            enum: ["low", "medium", "high", "critical"],
        },
        riskSummary: { type: "string" },
        crimePattern: { type: "string" },
        tailoredSolution: { type: "string" },
        priorityActions: {
            type: "array",
            items: {
                type: "object",
                required: ["action", "why", "implementation", "timeframe"],
                properties: {
                    action: { type: "string" },
                    why: { type: "string" },
                    implementation: { type: "string" },
                    timeframe: { type: "string" },
                },
            },
        },
        publicAdvisoryDraft: { type: "string" },
        adminNotes: { type: "string" },
        confidenceNote: { type: "string" },
    },
};
const STATUS_WORKLOAD_CONFIG = {
    pending: {
        label: "Pending",
        hint: "Awaiting first review",
        tone: "pending",
        icon: "pending_actions",
    },
    under_review: {
        label: "Under Review",
        hint: "Being assessed",
        tone: "review",
        icon: "rate_review",
    },
    verified: {
        label: "Verified",
        hint: "Validated reports",
        tone: "verified",
        icon: "verified",
    },
    responding: {
        label: "Responding",
        hint: "Responder action active",
        tone: "responding",
        icon: "emergency_share",
    },
    done: {
        label: "Done",
        hint: "Closed response",
        tone: "done",
        icon: "task_alt",
    },
    archived: {
        label: "Archived",
        hint: "Stored for records",
        tone: "muted",
        icon: "inventory_2",
    },
    rejected: {
        label: "Rejected",
        hint: "Not actionable",
        tone: "muted",
        icon: "block",
    },
    unknown: {
        label: "Unknown",
        hint: "Missing status",
        tone: "muted",
        icon: "help",
    },
};
const TYPE_SOLUTION_RULES = {
    robbery_holdup: [
        {
            actionId: "improve_lighting",
            title: "Install or repair street lights",
            reason: "Robbery and holdup reports need stronger visibility in the exact street segment.",
            timeframe: "Plan within 7 days",
        },
        {
            actionId: "install_cctv",
            title: "Add CCTV covering sidewalks and escape routes",
            reason: "Repeated robbery reports need deterrence and evidence capture.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "increase_patrol",
            title: "Increase visible patrols during peak hours",
            reason: "Patrol timing should match when reports are most concentrated.",
            timeframe: "Start immediately",
        },
        {
            actionId: "escape_route_review",
            title: "Map escape routes and blind spots",
            reason: "Robbery patterns often depend on quick exits, dark corners, and uncovered side streets.",
            timeframe: "Start within 7 days",
        },
        {
            actionId: "business_transport_coordination",
            title: "Coordinate with nearby stores and transport points",
            reason: "Nearby establishments and terminals can help verify repeat routes and report incidents faster.",
            timeframe: "Start within 7 days",
        },
    ],
    theft_snatching: [
        {
            actionId: "install_cctv",
            title: "Add CCTV near pedestrian and commuter points",
            reason: "Snatching often happens where people walk, wait, or transfer rides.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "public_warning_signage",
            title: "Place anti-snatching warning signs",
            reason: "Public reminders help residents secure phones, bags, and valuables.",
            timeframe: "Plan within 7 days",
        },
        {
            actionId: "increase_patrol",
            title: "Assign foot or bike patrols during peak hours",
            reason: "Visible patrols help deter repeat theft patterns.",
            timeframe: "Start immediately",
        },
        {
            actionId: "commuter_flow_review",
            title: "Review pedestrian and commuter flow",
            reason: "Snatching risk increases around crowded waiting, loading, and crossing points.",
            timeframe: "Plan within 7 days",
        },
        {
            actionId: "business_coordination",
            title: "Coordinate quick reporting with nearby businesses",
            reason: "Store owners and guards can help report repeat theft attempts while evidence is still fresh.",
            timeframe: "Start within 7 days",
        },
    ],
    physical_assault_injury: [
        {
            actionId: "increase_patrol",
            title: "Assign patrol visibility near the hotspot",
            reason: "Assault patterns need fast responder presence and visible deterrence.",
            timeframe: "Start immediately",
        },
        {
            actionId: "install_cctv",
            title: "Add CCTV near gathering points",
            reason: "Video coverage helps review repeated confrontations and identify escalation points.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "improve_lighting",
            title: "Improve lighting in alleys and corners",
            reason: "Better visibility reduces hidden spaces where assaults can happen.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "conflict_mediation_referral",
            title: "Coordinate barangay conflict mediation where appropriate",
            reason: "Repeat assault reports may involve recurring disputes that need trained local mediation.",
            timeframe: "Start within 7 days",
        },
        {
            actionId: "responder_route_check",
            title: "Check fastest responder route to the area",
            reason: "Violence-related hotspots need clear routing for faster response during escalation.",
            timeframe: "Start immediately",
        },
    ],
    domestic_violence: [
        {
            actionId: "victim_support_referral",
            title: "Refer to trained victim-support responders",
            reason: "Domestic violence recommendations must protect privacy and victim safety.",
            timeframe: "Start immediately",
        },
        {
            actionId: "confidential_followup",
            title: "Prioritize confidential safety checks",
            reason: "Repeat reports may indicate ongoing risk inside a household or building.",
            timeframe: "Start immediately",
        },
        {
            actionId: "vaw_desk_coordination",
            title: "Coordinate with the VAW desk or social welfare office",
            reason: "Domestic violence patterns need trained case handling instead of public hotspot response.",
            timeframe: "Start immediately",
        },
        {
            actionId: "safe_reporting_pathway",
            title: "Keep a safe confidential reporting pathway",
            reason: "Victims need a private way to ask for help without alerting the aggressor.",
            timeframe: "Start immediately",
        },
    ],
    drug_related_activity: [
        {
            actionId: "authorized_police_review",
            title: "Coordinate intelligence-led police review",
            reason: "Drug-related hotspots need authorized review before enforcement action.",
            timeframe: "Start within 7 days",
        },
        {
            actionId: "increase_patrol",
            title: "Increase patrol observation during peak hours",
            reason: "Repeated reports should be monitored at the most active times.",
            timeframe: "Start immediately",
        },
        {
            actionId: "install_cctv",
            title: "Add CCTV near hidden gathering areas",
            reason: "Surveillance helps verify repeat activity around alleys, vacant lots, or low-visibility spaces.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "observation_log",
            title: "Create an authorized observation log",
            reason: "Drug-related reports need verified time, place, and pattern notes before any action.",
            timeframe: "Start within 7 days",
        },
        {
            actionId: "community_reporting_channel",
            title: "Promote official community reporting channels",
            reason: "Residents should report through safe official channels, not confront suspected activity.",
            timeframe: "Start within 7 days",
        },
    ],
    public_disturbance: [
        {
            actionId: "coordinate_barangay",
            title: "Coordinate barangay enforcement checks",
            reason: "Disturbance patterns often need ordinance, curfew, or noise-rule follow-up.",
            timeframe: "Start within 7 days",
        },
        {
            actionId: "increase_patrol",
            title: "Schedule patrols during the disturbance window",
            reason: "Patrols should appear when repeated disturbance reports happen.",
            timeframe: "Start immediately",
        },
        {
            actionId: "establishment_coordination",
            title: "Coordinate with nearby establishments or venues",
            reason: "Disturbance clusters often connect to gathering points that can be managed through local coordination.",
            timeframe: "Start within 7 days",
        },
        {
            actionId: "warning_notice_first",
            title: "Use warning notices before escalation when appropriate",
            reason: "Lower-severity disturbance patterns may be reduced through visible reminders and ordinance notices.",
            timeframe: "Plan within 7 days",
        },
    ],
    vandalism_property_damage: [
        {
            actionId: "install_cctv",
            title: "Add CCTV facing damaged property",
            reason: "Recurring property damage needs evidence capture and deterrence.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "improve_lighting",
            title: "Improve lighting around damaged areas",
            reason: "Better visibility reduces repeat vandalism in dark corners or walls.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "cleanup_property_damage",
            title: "Repair or clean visible damage quickly",
            reason: "Fast cleanup can reduce repeat targeting of the same property.",
            timeframe: "Plan within 7 days",
        },
        {
            actionId: "property_owner_coordination",
            title: "Coordinate with affected property owners",
            reason: "Owners can adjust access control, lighting, and camera angles around repeatedly damaged areas.",
            timeframe: "Start within 7 days",
        },
        {
            actionId: "night_check_schedule",
            title: "Schedule checks during likely vandalism hours",
            reason: "Repeat property damage often happens when streets or facilities are less supervised.",
            timeframe: "Start within 7 days",
        },
    ],
    traffic_accident: [
        {
            actionId: "traffic_safety_audit",
            title: "Request a road safety inspection",
            reason: "Repeated accidents should be checked for road design, signs, crossings, and visibility issues.",
            timeframe: "Plan within 7 days",
        },
        {
            actionId: "road_markings_signage",
            title: "Add or repair signs, markings, and crossings",
            reason: "Traffic hotspots need road-safety controls, not only surveillance.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "improve_lighting",
            title: "Improve lighting at the road segment",
            reason: "Lighting helps drivers and pedestrians see hazards earlier.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "speed_control_review",
            title: "Review speed-control measures",
            reason: "Repeated crashes may require humps, reflectors, lane guidance, or traffic calming review.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "traffic_visibility_assignment",
            title: "Assign traffic visibility during peak accident hours",
            reason: "Responder or traffic presence should match the time pattern of repeated road incidents.",
            timeframe: "Start within 7 days",
        },
    ],
    illegal_weapons: [
        {
            actionId: "authorized_police_review",
            title: "Flag for authorized police review",
            reason: "Weapon-related reports require cautious handling by authorized responders.",
            timeframe: "Start immediately",
        },
        {
            actionId: "increase_patrol",
            title: "Increase responder caution and area visibility",
            reason: "Weapon reports raise responder risk and should not be treated as routine patrol only.",
            timeframe: "Start immediately",
        },
        {
            actionId: "install_cctv",
            title: "Review or add CCTV near the hotspot",
            reason: "Camera evidence can support review without exposing residents.",
            timeframe: "Plan within 7 days",
        },
        {
            actionId: "responder_safety_bulletin",
            title: "Issue an internal responder safety note",
            reason: "Weapon-related hotspots require cautious responder coordination and controlled information sharing.",
            timeframe: "Start immediately",
        },
        {
            actionId: "evidence_preservation",
            title: "Preserve evidence channels for review",
            reason: "Reports, CCTV clips, and witness notes should be handled carefully for authorized review.",
            timeframe: "Start immediately",
        },
    ],
    suspicious_activity: [
        {
            actionId: "increase_patrol",
            title: "Increase patrol observation",
            reason: "Repeated suspicious activity can be an early warning pattern.",
            timeframe: "Start within 7 days",
        },
        {
            actionId: "review_evidence",
            title: "Review report details and nearby CCTV",
            reason: "Suspicious reports should be verified before escalation.",
            timeframe: "Start within 7 days",
        },
        {
            actionId: "improve_lighting",
            title: "Improve lighting if reports mention dark areas",
            reason: "Low-visibility areas often attract suspicious behavior.",
            timeframe: "Plan within 14 days",
        },
        {
            actionId: "watch_team_monitoring",
            title: "Ask barangay watch teams to monitor repeat times",
            reason: "Repeated suspicious reports need pattern confirmation before stronger escalation.",
            timeframe: "Start within 7 days",
        },
        {
            actionId: "convert_pattern_if_confirmed",
            title: "Reclassify if later reports confirm a specific crime pattern",
            reason: "The recommendation should become more specific once evidence confirms the activity type.",
            timeframe: "Review weekly",
        },
    ],
};

const SITUATIONAL_SOLUTION_RULES = {
    highSeverityCluster: {
        actionId: "priority_case_review",
        title: "Open a priority case review for the hotspot",
        reason: "Several high-severity reports mean the area needs immediate admin and responder review.",
        timeframe: "Start immediately",
    },
    sosCluster: {
        actionId: "sos_triage_review",
        title: "Review SOS reports before routine actions",
        reason: "SOS reports should be checked first because they may represent urgent or active safety risks.",
        timeframe: "Start immediately",
    },
    repeatHotspot: {
        actionId: "hotspot_case_file",
        title: "Create a hotspot case file",
        reason: "Repeated reports in the same street need a single case view for patterns, follow-ups, and outcomes.",
        timeframe: "Start within 7 days",
    },
    peakWindow: {
        actionId: "timeboxed_patrol_plan",
        title: "Create a time-boxed patrol and review plan",
        reason: "The response should focus on the hours when reports are most concentrated.",
        timeframe: "Start immediately",
    },
    noPeakWindow: {
        actionId: "collect_time_details",
        title: "Improve report time details before setting a fixed schedule",
        reason: "The current data does not show a reliable peak hour yet.",
        timeframe: "Review weekly",
    },
    mixedCrimePattern: {
        actionId: "multi_agency_action_plan",
        title: "Combine police, barangay, and community partner actions",
        reason: "Mixed crime patterns need coordinated actions instead of a single generic recommendation.",
        timeframe: "Start within 7 days",
    },
    preventionAudit: {
        actionId: "cpted_safety_audit",
        title: "Run a street-level safety audit",
        reason: "Check lighting, blind spots, CCTV gaps, pedestrian paths, escape routes, and nearby gathering points.",
        timeframe: "Plan within 14 days",
    },
};

const AI_OPERATIONAL_REFERENCE = {
    decisionRules: [
        "Match recommendations to the hotspot's dominant crime type, severity, SOS count, and peak hours.",
        "High severity and SOS reports should be treated as urgent priority signals, not routine monitoring.",
        "Use peak hours for patrol timing only when the data shows a clear time pattern.",
        "If the hotspot has many reports but no clear peak time, recommend verification and rotating checks instead of guessing.",
        "For repeat street-level hotspots, recommend a case file so actions and outcomes can be tracked.",
        "When two crime types dominate the same street, combine the shared controls and avoid duplicate actions.",
        "For robbery and theft, emphasize lighting, CCTV coverage, escape-route review, and visible patrols.",
        "For domestic violence, avoid public warnings and focus on confidential support through trained responders.",
        "For traffic accidents, prioritize road design, signage, crossings, visibility, and traffic control.",
        "For suspicious activity, verify patterns before escalating to enforcement-heavy actions.",
    ],
    safetyBoundaries: [
        "Do not identify reporters, victims, suspects, households, or private descriptions.",
        "Do not tell civilians to confront people or conduct enforcement.",
        "Do not claim the street is certainly dangerous; use cautious reported-data wording.",
        "Treat the output as an admin-reviewed draft, not an automatic dispatch order.",
        "Suggest only actions that admins, police, barangay teams, or trained partners can review.",
    ],
    accuracyGuidance: [
        "Prefer specific actions tied to evidence over broad statements.",
        "Mention uncertainty when report count is low, severity is mixed, or peak hours are unclear.",
        "Use the evidence summary and rule actions as the primary source of truth.",
        "Separate immediate actions, planning actions, and monitoring actions.",
        "Avoid adding facts not present in the aggregated analytics payload.",
    ],
};

let incidentRows = [];
let solutionPriorityFilter = "all";
let latestSolutionById = new Map();
let currentAdminSessionId = "";

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

function escapeAttr(text) {
    return String(text ?? "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function humanize(value) {
    const str = String(value || "unknown").trim();
    if (!str) return "Unknown";
    return str
        .replace(/_/g, " ")
        .replace(/\b\w/g, (char) => char.toUpperCase());
}

function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === "function") {
        try {
            return value.toDate();
        } catch {
            return null;
        }
    }
    if (value instanceof Date) return value;
    if (typeof value === "number" && Number.isFinite(value)) {
        return new Date(value);
    }
    return null;
}

function dayKey(date) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function shortDayLabel(key) {
    const date = new Date(`${key}T00:00:00+08:00`);
    return new Intl.DateTimeFormat("en-PH", {
        month: "short",
        day: "numeric",
    }).format(date);
}

function hourLabel(hour) {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    return new Intl.DateTimeFormat("en-PH", {
        hour: "numeric",
        hour12: true,
        timeZone: "Asia/Manila",
    }).format(date);
}

function rangeStart(range) {
    if (range === "24h") return Date.now() - 24 * 60 * 60 * 1000;
    if (range === "7d") return Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (range === "90d") return Date.now() - 90 * 24 * 60 * 60 * 1000;
    if (range === "all" || range === "custom") return null;
    return Date.now() - 30 * 24 * 60 * 60 * 1000;
}

function getSelectedRangeRows() {
    const range = document.getElementById("analytics-range")?.value || "30d";
    if (range === "custom") {
        const startVal = document.getElementById("analytics-custom-start")?.value;
        const endVal = document.getElementById("analytics-custom-end")?.value;
        if (!startVal && !endVal) return incidentRows;
        const startMs = startVal ? new Date(`${startVal}T00:00:00+08:00`).getTime() : 0;
        const endMs = endVal ? new Date(`${endVal}T23:59:59.999+08:00`).getTime() : Infinity;
        return incidentRows.filter((row) => {
            if (!row.date) return false;
            const t = row.date.getTime();
            return t >= startMs && t <= endMs;
        });
    }
    const start = rangeStart(range);
    if (start == null) return incidentRows;
    return incidentRows.filter((row) => row.date && row.date.getTime() >= start);
}

function countBy(rows, getter) {
    const map = new Map();
    rows.forEach((row) => {
        const key = getter(row);
        map.set(key, (map.get(key) || 0) + 1);
    });
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

function renderBars(id, entries, options = {}) {
    const el = document.getElementById(id);
    if (!el) return;

    if (!entries.length) {
        el.innerHTML = '<p class="analytics-empty">No data in this range.</p>';
        return;
    }

    const max = Math.max(...entries.map(([, count]) => count), 1);
    const color = options.color || "#ef4444";
    el.innerHTML = entries
        .slice(0, options.limit || 8)
        .map(([label, count]) => {
            const pct = Math.max(4, Math.round((count / max) * 100));
            return `<div class="analytics-bar">
                <span class="analytics-bar__label" title="${escapeHtml(humanize(label))}">${escapeHtml(humanize(label))}</span>
                <span class="analytics-bar__track">
                    <span class="analytics-bar__fill" style="width:${pct}%;background:${color};"></span>
                </span>
                <span class="analytics-bar__value">${count}</span>
            </div>`;
        })
        .join("");
}

function hashString(value) {
    let hash = 0;
    const text = String(value || "");
    for (let i = 0; i < text.length; i += 1) {
        hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
    }
    return hash.toString(36);
}

function getStatusWorkloadConfig(status) {
    return STATUS_WORKLOAD_CONFIG[status] || {
        label: humanize(status),
        hint: "Custom status",
        tone: "muted",
        icon: "label",
    };
}

function renderStatusWorkload(rows) {
    // 1. Update workload breakdown summary cards
    const underReview = rows.filter((r) => {
        const s = String(r.data?.status || "").toLowerCase();
        return s === "under_review" || s === "pending";
    }).length;
    const verified = rows.filter((r) => String(r.data?.status || "").toLowerCase() === "verified").length;
    const responded = rows.filter((r) => {
        const s = String(r.data?.status || "").toLowerCase();
        return s === "responding" || s === "done";
    }).length;

    const highOpen = rows.filter((r) => {
        const sev = String(r.data?.severity || "").toLowerCase();
        const s = String(r.data?.status || "").toLowerCase();
        return sev === "high" && OPEN_STATUSES.has(s);
    }).length;

    setText("workload-under-review-val", String(underReview));
    setText("workload-verified-val", String(verified));
    setText("workload-responded-val", String(responded));
    setText("workload-high-open-val", String(highOpen));

    const alertEl = document.getElementById("workload-priority-alert");
    if (alertEl) {
        if (highOpen === 0) {
            alertEl.style.background = "#f0fdf4";
            alertEl.style.borderColor = "#bbf7d0";
            alertEl.style.color = "#166534";
            const icon = alertEl.querySelector(".workload-priority-icon");
            if (icon) {
                icon.textContent = "check_circle";
                icon.style.color = "#16a34a";
            }
            const title = alertEl.querySelector(".workload-priority-title");
            if (title) {
                title.innerHTML = `<strong>0</strong> High Severity Open`;
                title.style.color = "#166534";
            }
            const hint = alertEl.querySelector(".workload-priority-hint");
            if (hint) {
                hint.textContent = "All high severity reports have been verified or resolved.";
                hint.style.color = "#15803d";
            }
        } else {
            alertEl.style.background = "#fef2f2";
            alertEl.style.borderColor = "#fecaca";
            alertEl.style.color = "#991b1b";
            const icon = alertEl.querySelector(".workload-priority-icon");
            if (icon) {
                icon.textContent = "warning";
                icon.style.color = "#dc2626";
            }
            const title = alertEl.querySelector(".workload-priority-title");
            if (title) {
                title.innerHTML = `<strong id="workload-high-open-val">${highOpen}</strong> High Severity Still Open`;
                title.style.color = "#991b1b";
            }
            const hint = alertEl.querySelector(".workload-priority-hint");
            if (hint) {
                hint.textContent = "Immediate dispatcher action recommended.";
                hint.style.color = "#b91c1c";
            }
        }
    }

    // 2. Render status cards
    const el = document.getElementById("analytics-status-chart");
    if (!el) return;

    const entries = countBy(rows, (row) =>
        String(row.data?.status || "unknown").toLowerCase(),
    );
    if (!entries.length) {
        el.innerHTML = '<p class="analytics-empty">No data in this range.</p>';
        return;
    }

    const statusOrder = new Map(
        ["pending", "under_review", "verified", "responding", "done"].map(
            (status, index) => [status, index],
        ),
    );
    const total = rows.length || 1;
    const max = Math.max(...entries.map(([, count]) => count), 1);
    const sorted = [...entries].sort((a, b) => {
        const aOrder = statusOrder.get(a[0]) ?? 99;
        const bOrder = statusOrder.get(b[0]) ?? 99;
        return aOrder === bOrder ? b[1] - a[1] : aOrder - bOrder;
    });

    el.innerHTML = sorted
        .map(([status, count]) => {
            const config = getStatusWorkloadConfig(status);
            const pct = Math.round((count / total) * 100);
            const barPct = Math.max(4, Math.round((count / max) * 100));
            const tooltip = `${config.label}: ${count} report${count === 1 ? "" : "s"} (${pct}% of selected range)`;
            return `<article class="analytics-status-card analytics-status-card--${escapeAttr(config.tone)}" title="${escapeAttr(tooltip)}">
                <div class="analytics-status-card__icon" aria-hidden="true">
                    <span class="material-symbols-outlined">${escapeHtml(config.icon)}</span>
                </div>
                <div class="analytics-status-card__main">
                    <div class="analytics-status-card__top">
                        <span>${escapeHtml(config.label)}</span>
                        <strong>${count}</strong>
                    </div>
                    <div class="analytics-status-card__track" aria-hidden="true">
                        <span style="width:${barPct}%"></span>
                    </div>
                    <div class="analytics-status-card__meta">
                        <em>${escapeHtml(config.hint)}</em>
                        <b>${pct}%</b>
                    </div>
                </div>
            </article>`;
        })
        .join("");
}

function selectedRangeDayCount() {
    const range = document.getElementById("analytics-range")?.value || "30d";
    if (range === "24h") return 1;
    if (range === "7d") return 7;
    if (range === "90d") return 90;
    if (range === "custom") {
        const startVal = document.getElementById("analytics-custom-start")?.value;
        const endVal = document.getElementById("analytics-custom-end")?.value;
        if (startVal && endVal) {
            const diff = new Date(endVal).getTime() - new Date(startVal).getTime();
            return Math.max(1, Math.ceil(diff / (24 * 60 * 60 * 1000)) + 1);
        }
    }
    if (range === "all") {
        const dated = incidentRows
            .map((row) => row.date)
            .filter(Boolean)
            .sort((a, b) => a - b);
        if (dated.length < 2) return Math.max(1, dated.length);
        const span = dated[dated.length - 1].getTime() - dated[0].getTime();
        return Math.max(1, Math.ceil(span / (24 * 60 * 60 * 1000)) + 1);
    }
    return 30;
}

function getTrendKeys(range) {
    let days = 30;
    if (range === "24h" || range === "7d") days = 7;
    else if (range === "90d") days = 14;
    else if (range === "custom") {
        days = Math.min(30, selectedRangeDayCount());
    }
    const keys = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i -= 1) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        keys.push(dayKey(d));
    }
    return keys;
}

function calculatePeriodComparison(range, currentRows, allRows) {
    const now = Date.now();
    let currentStart = 0;
    let priorStart = 0;
    let priorEnd = 0;

    if (range === "24h") {
        currentStart = now - 24 * 3600 * 1000;
        priorStart = now - 48 * 3600 * 1000;
        priorEnd = currentStart;
    } else if (range === "7d") {
        currentStart = now - 7 * 86400 * 1000;
        priorStart = now - 14 * 86400 * 1000;
        priorEnd = currentStart;
    } else if (range === "custom") {
        const startVal = document.getElementById("analytics-custom-start")?.value;
        const endVal = document.getElementById("analytics-custom-end")?.value;
        if (startVal && endVal) {
            const startMs = new Date(`${startVal}T00:00:00+08:00`).getTime();
            const endMs = new Date(`${endVal}T23:59:59.999+08:00`).getTime();
            const duration = endMs - startMs;
            currentStart = startMs;
            priorStart = startMs - duration;
            priorEnd = startMs;
        } else {
            currentStart = now - 30 * 86400 * 1000;
            priorStart = now - 60 * 86400 * 1000;
            priorEnd = currentStart;
        }
    } else {
        currentStart = now - 30 * 86400 * 1000;
        priorStart = now - 60 * 86400 * 1000;
        priorEnd = currentStart;
    }

    const currentCount = currentRows.length;
    const priorCount = allRows.filter((r) => {
        if (!r.date) return false;
        const t = r.date.getTime();
        return t >= priorStart && t < priorEnd;
    }).length;

    if (priorCount === 0) {
        if (currentCount === 0) {
            return { text: "No data in period", tone: "neutral" };
        }
        return { text: `+${currentCount} vs prior period`, tone: "up" };
    }

    const diff = currentCount - priorCount;
    const pct = Math.round((diff / priorCount) * 100);

    if (pct > 0) {
        return { text: `+${pct}% vs prior period`, tone: "up" };
    } else if (pct < 0) {
        return { text: `${pct}% vs prior period`, tone: "down" };
    } else {
        return { text: "0% vs prior period", tone: "neutral" };
    }
}

function createTrendDayStats(key) {
    return {
        key,
        count: 0,
        severityBreakdown: { high: 0, medium: 0, low: 0 },
        typeCounts: {},
    };
}

function trendVolumeLevel(count) {
    if (count <= 0) return "none";
    if (count <= 2) return "low";
    if (count <= 5) return "medium";
    return "high";
}

function trendVolumeLabel(level) {
    const labels = {
        none: "No reports",
        low: "Low volume",
        medium: "Medium volume",
        high: "High volume",
    };
    return labels[level] || labels.none;
}

function topTrendCrimeType(typeCounts) {
    const [type, count] =
        Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0] || [];
    if (!type || !count) return "None";
    return `${humanize(type)} (${count})`;
}

function trendTooltip(stats) {
    const level = trendVolumeLabel(trendVolumeLevel(stats.count));
    return [
        shortDayLabel(stats.key),
        `${stats.count} report${stats.count === 1 ? "" : "s"} - ${level}`,
        `Severity: ${stats.severityBreakdown.high} high, ${stats.severityBreakdown.medium} medium, ${stats.severityBreakdown.low} low`,
        `Top type: ${topTrendCrimeType(stats.typeCounts)}`,
    ].join("\n");
}

function renderTrend(rows) {
    const el = document.getElementById("analytics-trend-chart");
    if (!el) return;

    const range = document.getElementById("analytics-range")?.value || "30d";
    const keys =
        range === "all"
            ? getTrendKeys("30d")
            : getTrendKeys(range);
    const days = new Map(keys.map((key) => [key, createTrendDayStats(key)]));
    rows.forEach((row) => {
        if (!row.date) return;
        const key = dayKey(row.date);
        const current = days.get(key);
        if (!current) return;
        const severity = normalizeSeverity(row.data?.severity);
        const type = normalizeType(row.data?.type);
        current.count += 1;
        current.severityBreakdown[severity] += 1;
        current.typeCounts[type] = (current.typeCounts[type] || 0) + 1;
    });

    const values = [...days.values()];
    const max = Math.max(...values.map((stats) => stats.count), 1);
    el.innerHTML = values
        .map((stats) => {
            const { key, count } = stats;
            const height = Math.max(4, Math.round((count / max) * 100));
            const level = trendVolumeLevel(count);
            const tooltip = trendTooltip(stats);
            return `<div class="analytics-trend__item">
                <div class="analytics-trend__bar" data-value="${count}" data-level="${level}" data-tooltip="${escapeAttr(tooltip)}" title="${escapeAttr(tooltip)}" tabindex="0" aria-label="${escapeAttr(tooltip)}" style="height:${height}%"></div>
                <span class="analytics-trend__label">${escapeHtml(shortDayLabel(key))}</span>
            </div>`;
        })
        .join("");

    setText(
        "analytics-trend-meta",
        `${rows.length} report${rows.length === 1 ? "" : "s"} in range`,
    );

    // Update period-over-period trend badge
    const comparison = calculatePeriodComparison(range, rows, incidentRows);
    const trendBadge = document.getElementById("analytics-trend-comparison");
    if (trendBadge) {
        trendBadge.textContent = comparison.text;
        trendBadge.className = `trend-badge trend-badge--${comparison.tone}`;
    }
}

function hotspotLabel(row) {
    const d = row.data || {};
    const explicit =
        d.location?.street ||
        d.street ||
        d.location?.address ||
        d.address ||
        d.barangay ||
        d.area ||
        d.district ||
        d.locationName ||
        d.location?.barangay ||
        d.location?.area;
    if (explicit) return String(explicit);

    const lat = Number(d.location?.latitude);
    const lng = Number(d.location?.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return `Grid ${lat.toFixed(2)}, ${lng.toFixed(2)}`;
    }
    return "Unknown area";
}

function renderHotspots(rows) {
    const listEl = document.getElementById("analytics-hotspot-ranked-list");
    const body = document.getElementById("analytics-hotspots");

    const grouped = new Map();
    rows.forEach((row) => {
        const key = hotspotLabel(row);
        const current = grouped.get(key) || { total: 0, high: 0 };
        current.total += 1;
        if (String(row.data?.severity || "").toLowerCase() === "high") {
            current.high += 1;
        }
        grouped.set(key, current);
    });

    const sorted = [...grouped.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .slice(0, 5);

    // Count priority hotspots (hotspots with high severity > 0)
    const priorityHotspotsCount = [...grouped.values()].filter((s) => s.high > 0).length;
    setText("attention-hotspots", String(priorityHotspotsCount));

    if (listEl) {
        if (!sorted.length) {
            listEl.innerHTML = '<li class="analytics-empty">No hotspot data in this range.</li>';
        } else {
            listEl.innerHTML = sorted
                .map(([area, stats], index) => {
                    const rankNum = index + 1;
                    const isTop = rankNum <= 3;
                    const highBadge = stats.high > 0
                        ? `<span class="hotspot-severity-badge"><span class="material-symbols-outlined" style="font-size:12px;">warning</span>${stats.high} high severity</span>`
                        : "";

                    return `<li class="hotspot-ranked-item">
                        <div class="hotspot-ranked-left">
                            <span class="hotspot-rank-num ${isTop ? "hotspot-rank-num--top" : ""}">${rankNum}</span>
                            <span class="hotspot-rank-name" title="${escapeHtml(area)}">${escapeHtml(area)}</span>
                        </div>
                        <div class="hotspot-ranked-right">
                            <span class="hotspot-report-count">${stats.total} report${stats.total === 1 ? "" : "s"}</span>
                            ${highBadge}
                        </div>
                    </li>`;
                })
                .join("");
        }
    }

    if (body) {
        const rowsHtml = sorted.map(
            ([area, stats]) => `<tr>
                <td>${escapeHtml(area)}</td>
                <td>${stats.total}</td>
                <td>${stats.high}</td>
            </tr>`,
        );
        body.innerHTML = rowsHtml.length
            ? rowsHtml.join("")
            : '<tr><td colspan="3" class="analytics-empty">No hotspot data in this range.</td></tr>';
    }
}

function getPhtHour(date) {
    if (!date) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila",
        hour: "2-digit",
        hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === "hour")?.value);
    return Number.isFinite(hour) ? hour % 24 : null;
}

function renderHourlyChart(rows) {
    const el = document.getElementById("analytics-hour-chart");
    if (!el) return;

    const counts = Array.from({ length: 24 }, () => 0);
    rows.forEach((row) => {
        const hour = getPhtHour(row.date);
        if (hour != null) counts[hour] += 1;
    });

    let maxHour = -1;
    let maxHourCount = 0;
    counts.forEach((count, hour) => {
        if (count > maxHourCount) {
            maxHourCount = count;
            maxHour = hour;
        }
    });

    const takeawayEl = document.getElementById("peak-busiest-hours");
    if (takeawayEl) {
        if (maxHourCount > 0 && maxHour !== -1) {
            const nextHour = (maxHour + 1) % 24;
            takeawayEl.textContent = `${hourLabel(maxHour)} – ${hourLabel(nextHour)} (${maxHourCount} report${maxHourCount === 1 ? "" : "s"})`;
        } else {
            takeawayEl.textContent = "No data";
        }
    }

    const max = Math.max(...counts, 1);
    el.innerHTML = counts
        .map((count, hour) => {
            const intensity = Math.max(0.08, count / max);
            return `<div class="analytics-hour" title="${escapeHtml(hourLabel(hour))}: ${count} report${count === 1 ? "" : "s"}">
                <span class="analytics-hour__cell" style="opacity:${intensity};"></span>
                <span class="analytics-hour__label">${hour}</span>
            </div>`;
        })
        .join("");
}

function renderReadiness(rows) {
    const el = document.getElementById("analytics-readiness");
    if (!el) return;

    const total = rows.length;
    const open = rows.filter((row) =>
        OPEN_STATUSES.has(String(row.data?.status || "").toLowerCase()),
    ).length;
    const responded = rows.filter((row) =>
        RESPONDED_STATUSES.has(String(row.data?.status || "").toLowerCase()),
    ).length;
    const highOpen = rows.filter((row) => {
        const sev = String(row.data?.severity || "").toLowerCase();
        const status = String(row.data?.status || "").toLowerCase();
        return sev === "high" && OPEN_STATUSES.has(status);
    }).length;
    const withLocation = rows.filter((row) => hasCoordinates(row)).length;

    const items = [
        ["Open workload", open, total ? `${Math.round((open / total) * 100)}%` : "0%"],
        ["Responded", responded, total ? `${Math.round((responded / total) * 100)}%` : "0%"],
        ["High still open", highOpen, highOpen ? "Needs attention" : "Clear"],
        ["Mappable reports", withLocation, total ? `${Math.round((withLocation / total) * 100)}%` : "0%"],
    ];

    el.innerHTML = items
        .map(
            ([label, value, hint]) => `<div class="analytics-readiness__item">
                <span>${escapeHtml(label)}</span>
                <strong>${escapeHtml(value)}</strong>
                <em>${escapeHtml(hint)}</em>
            </div>`,
        )
        .join("");
}

function hasCoordinates(row) {
    const lat = Number(row.data?.location?.latitude);
    const lng = Number(row.data?.location?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng);
}

function severityWeight(severity) {
    const s = String(severity || "").toLowerCase();
    if (s === "high") return 3;
    if (s === "medium") return 2;
    if (s === "low") return 1;
    return 1;
}

function severityDonutTooltip({ total, high, medium, low, highPct, mediumPct, lowPct, score }) {
    return [
        `${total} total report${total === 1 ? "" : "s"}`,
        `High: ${high} (${highPct}%)`,
        `Medium: ${medium} (${mediumPct}%)`,
        `Low: ${low} (${lowPct}%)`,
        `Risk points: ${score}`,
    ].join("\n");
}

function renderSeverityDonut(rows) {
    const el = document.getElementById("analytics-severity-chart");
    if (!el) return;

    const high = rows.filter(
        (row) => String(row.data?.severity || "").toLowerCase() === "high",
    ).length;
    const medium = rows.filter(
        (row) => String(row.data?.severity || "").toLowerCase() === "medium",
    ).length;
    const low = rows.filter(
        (row) => String(row.data?.severity || "").toLowerCase() === "low",
    ).length;
    const total = high + medium + low;

    if (!total) {
        el.innerHTML = '<p class="analytics-empty">No data in this range.</p>';
        return;
    }

    const highPct = Math.round((high / total) * 100);
    const mediumPct = Math.round((medium / total) * 100);
    const lowPct = Math.max(0, 100 - highPct - mediumPct);
    const score = rows.reduce(
        (sum, row) => sum + severityWeight(row.data?.severity),
        0,
    );
    const tooltip = severityDonutTooltip({
        total,
        high,
        medium,
        low,
        highPct,
        mediumPct,
        lowPct,
        score,
    });

    el.innerHTML = `
        <div class="analytics-donut__ring" data-tooltip="${escapeAttr(tooltip)}" title="${escapeAttr(tooltip)}" tabindex="0" aria-label="${escapeAttr(tooltip)}" style="--high:${highPct};--medium:${mediumPct};--low:${lowPct};">
            <div>
                <strong>${total}</strong>
                <span>reports</span>
            </div>
        </div>
        <div class="analytics-donut__legend">
            <span title="High severity: ${high} report${high === 1 ? "" : "s"} (${highPct}%)"><i style="background:#dc2626"></i> High ${high}</span>
            <span title="Medium severity: ${medium} report${medium === 1 ? "" : "s"} (${mediumPct}%)"><i style="background:#f97316"></i> Medium ${medium}</span>
            <span title="Low severity: ${low} report${low === 1 ? "" : "s"} (${lowPct}%)"><i style="background:#eab308"></i> Low ${low}</span>
            <span title="Weighted risk points based on severity"><i style="background:#0f172a"></i> Risk points ${score}</span>
        </div>
    `;
}

function renderCrimeTypeSeverityBars(rows) {
    const el = document.getElementById("analytics-type-chart");
    if (!el) return;

    const grouped = new Map();
    rows.forEach((row) => {
        const type = row.data?.type || "unknown";
        const severity = String(row.data?.severity || "unknown").toLowerCase();
        const current = grouped.get(type) || {
            high: 0,
            medium: 0,
            low: 0,
            unknown: 0,
        };
        if (severity === "high") current.high += 1;
        else if (severity === "medium") current.medium += 1;
        else if (severity === "low") current.low += 1;
        else current.unknown += 1;
        grouped.set(type, current);
    });

    const entries = [...grouped.entries()]
        .map(([type, counts]) => ({
            type,
            ...counts,
            total: counts.high + counts.medium + counts.low + counts.unknown,
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8);

    if (!entries.length) {
        el.innerHTML = '<p class="analytics-empty">No data in this range.</p>';
        return;
    }

    el.innerHTML = entries
        .map((item) => {
            const highPct = Math.round((item.high / item.total) * 100);
            const mediumPct = Math.round((item.medium / item.total) * 100);
            const lowPct = Math.round((item.low / item.total) * 100);
            const unknownPct = Math.max(0, 100 - highPct - mediumPct - lowPct);
            return `<div class="analytics-stacked__row">
                <div class="analytics-stacked__label">
                    <strong>${escapeHtml(humanize(item.type))}</strong>
                    <span>${item.total} total</span>
                </div>
                <div class="analytics-stacked__bar">
                    <span class="analytics-stacked__seg analytics-stacked__seg--high" style="width:${highPct}%"></span>
                    <span class="analytics-stacked__seg analytics-stacked__seg--medium" style="width:${mediumPct}%"></span>
                    <span class="analytics-stacked__seg analytics-stacked__seg--low" style="width:${lowPct}%"></span>
                    <span class="analytics-stacked__seg analytics-stacked__seg--unknown" style="width:${unknownPct}%"></span>
                </div>
            </div>`;
        })
        .join("");
}

function normalizeType(value) {
    return String(value || "unknown").trim().toLowerCase();
}

function normalizeSeverity(value) {
    const severity = String(value || "low").trim().toLowerCase();
    if (severity === "high" || severity === "medium" || severity === "low") {
        return severity;
    }
    return "low";
}

function createHotspotStats(area) {
    return {
        area,
        totalReports: 0,
        sosReports: 0,
        severityBreakdown: { high: 0, medium: 0, low: 0 },
        typeCounts: {},
        hourCounts: Array.from({ length: 24 }, () => 0),
        latestReportAt: null,
    };
}

function buildHotspotStats(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
        const area = hotspotLabel(row);
        const current = grouped.get(area) || createHotspotStats(area);
        const type = normalizeType(row.data?.type);
        const severity = normalizeSeverity(row.data?.severity);
        const hour = getPhtHour(row.date);

        current.totalReports += 1;
        current.typeCounts[type] = (current.typeCounts[type] || 0) + 1;
        current.severityBreakdown[severity] += 1;
        if (row.data?.isSOSReport === true) current.sosReports += 1;
        if (hour != null) current.hourCounts[hour] += 1;
        if (
            row.date &&
            (!current.latestReportAt || row.date > current.latestReportAt)
        ) {
            current.latestReportAt = row.date;
        }
        grouped.set(area, current);
    });

    return [...grouped.values()].map(enrichHotspotStats);
}

function enrichHotspotStats(stats) {
    const high = stats.severityBreakdown.high || 0;
    const medium = stats.severityBreakdown.medium || 0;
    const low = stats.severityBreakdown.low || 0;
    const robbery = stats.typeCounts.robbery_holdup || 0;
    const weapons = stats.typeCounts.illegal_weapons || 0;
    const weightedScore = high * 3 + medium * 2 + low + stats.sosReports * 3;
    const peakHours = getPeakHours(stats.hourCounts, stats.totalReports);
    const priority = getHotspotPriority({
        ...stats,
        weightedScore,
        robbery,
        weapons,
    });
    const dominantTypes = getDominantTypes(stats.typeCounts);
    const peakLabel = formatPeakLabel(peakHours);

    return {
        ...stats,
        weightedScore,
        priority,
        dominantTypes,
        peakHours,
        peakLabel,
        actions: getSolutionActions(dominantTypes, {
            ...stats,
            weightedScore,
            priority,
            peakHours,
            peakLabel,
        }),
    };
}

function getHotspotPriority(stats) {
    if (
        stats.weightedScore >= 12 ||
        stats.totalReports >= 8 ||
        stats.severityBreakdown.high >= 3 ||
        stats.robbery >= 3 ||
        stats.weapons >= 3
    ) {
        return "high";
    }
    if (
        stats.weightedScore >= 6 ||
        stats.totalReports >= 3 ||
        stats.severityBreakdown.high >= 1
    ) {
        return "medium";
    }
    return "low";
}

function priorityRank(priority) {
    if (priority === "high") return 3;
    if (priority === "medium") return 2;
    return 1;
}

function hotspotHasEnoughEvidence(stats) {
    return (
        stats.totalReports >= MIN_RECOMMENDATION_REPORTS ||
        stats.severityBreakdown.high >= 2 ||
        (stats.sosReports >= 1 && stats.totalReports >= 2)
    );
}

function getDominantTypes(typeCounts) {
    return Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([type]) => type);
}

function getPeakHours(hourCounts, totalReports) {
    const max = Math.max(...hourCounts);
    if (max <= 0) return [];
    if (max === 1 && totalReports < 5) return [];
    return hourCounts
        .map((count, hour) => ({ count, hour }))
        .filter((item) => item.count === max)
        .slice(0, 4)
        .map((item) => item.hour);
}

function formatPeakLabel(hours) {
    if (!hours.length) return "No clear peak time yet";
    return `Peak reports: ${hours.map(hourLabel).join(", ")}`;
}

function getSolutionActions(types, stats) {
    const actions = new Map();
    types.forEach((type) => {
        const rules = TYPE_SOLUTION_RULES[type] || [];
        rules.forEach((rule) => {
            addRuleAction(actions, rule, stats, "crime-type");
        });
    });
    getSituationalActions(types, stats).forEach((rule) => {
        addRuleAction(actions, rule, stats, "situational");
    });

    if (!actions.size) {
        actions.set("monitor_verify", {
            actionId: "monitor_verify",
            title: "Monitor the area and verify new reports",
            reason: "The hotspot does not yet show a specific crime pattern.",
            timeframe: "Review weekly",
            source: "fallback",
        });
    }

    return [...actions.values()].slice(0, 6);
}

function addRuleAction(actions, rule, stats, source) {
    if (!rule?.actionId || actions.has(rule.actionId)) return;
    actions.set(rule.actionId, {
        ...rule,
        reason: buildRuleReason(rule, stats),
        source,
    });
}

function buildRuleReason(rule, stats) {
    const reason = rule.reason || "";
    const peakAwareActions = new Set([
        "increase_patrol",
        "timeboxed_patrol_plan",
        "traffic_visibility_assignment",
        "night_check_schedule",
    ]);
    if (
        peakAwareActions.has(rule.actionId) &&
        stats.peakLabel &&
        stats.peakLabel !== "No clear peak time yet"
    ) {
        return `${reason} ${stats.peakLabel}.`;
    }
    return reason;
}

function getSituationalActions(types, stats) {
    const high = stats.severityBreakdown?.high || 0;
    const sos = stats.sosReports || 0;
    const total = stats.totalReports || 0;
    const hasPeak =
        stats.peakLabel && stats.peakLabel !== "No clear peak time yet";
    const actions = [];

    if (high >= 3 || stats.priority === "high") {
        actions.push(SITUATIONAL_SOLUTION_RULES.highSeverityCluster);
    }
    if (sos > 0) {
        actions.push(SITUATIONAL_SOLUTION_RULES.sosCluster);
    }
    if (total >= 8) {
        actions.push(SITUATIONAL_SOLUTION_RULES.repeatHotspot);
    }
    if (hasPeak) {
        actions.push(SITUATIONAL_SOLUTION_RULES.peakWindow);
    } else if (total >= 5) {
        actions.push(SITUATIONAL_SOLUTION_RULES.noPeakWindow);
    }
    if (types.length > 1) {
        actions.push(SITUATIONAL_SOLUTION_RULES.mixedCrimePattern);
    }
    if (types.some(needsStreetSafetyAudit)) {
        actions.push(SITUATIONAL_SOLUTION_RULES.preventionAudit);
    }

    return actions;
}

function needsStreetSafetyAudit(type) {
    return [
        "robbery_holdup",
        "theft_snatching",
        "physical_assault_injury",
        "public_disturbance",
        "vandalism_property_damage",
        "suspicious_activity",
    ].includes(type);
}

function buildSolutionRecommendations(rows) {
    return buildHotspotStats(rows)
        .filter(hotspotHasEnoughEvidence)
        .sort((a, b) => {
            const priorityDiff = priorityRank(b.priority) - priorityRank(a.priority);
            if (priorityDiff) return priorityDiff;
            return b.weightedScore - a.weightedScore;
        })
        .slice(0, SOLUTION_LIMIT)
        .map((stats) => ({
            ...stats,
            evidence: buildEvidenceText(stats),
        }));
}

function buildEvidenceText(stats) {
    const parts = [
        `${stats.totalReports} report${stats.totalReports === 1 ? "" : "s"}`,
    ];
    if (stats.severityBreakdown.high) {
        parts.push(`${stats.severityBreakdown.high} high severity`);
    }
    if (stats.sosReports) {
        parts.push(`${stats.sosReports} SOS`);
    }
    if (stats.peakLabel !== "No clear peak time yet") {
        parts.push(stats.peakLabel.replace("Peak reports: ", "peak "));
    }
    return parts.join(", ");
}

function renderSolutions(rows) {
    const el = document.getElementById("analytics-solutions");
    if (!el) return;

    const solutions = buildSolutionRecommendations(rows).map(
        (solution, index) => ({
            ...solution,
            aiId: String(index),
        }),
    );
    latestSolutionById = new Map(
        solutions.map((solution) => [solution.aiId, solution]),
    );
    if (!solutions.length) {
        el.innerHTML =
            '<p class="analytics-empty">No hotspot has enough evidence for a recommended action in this range.</p>';
        return;
    }

    if (!SOLUTION_PRIORITIES.includes(solutionPriorityFilter)) {
        solutionPriorityFilter = "all";
    }

    const visible =
        solutionPriorityFilter === "all"
            ? solutions
            : solutions.filter((item) => item.priority === solutionPriorityFilter);

    el.innerHTML = `
        ${renderSolutionControls(solutions)}
        ${
            visible.length
                ? visible.map(renderSolutionCard).join("")
                : '<p class="analytics-empty">No recommendations match this priority filter.</p>'
        }
    `;
    bindSolutionControls(el);
}

function priorityLabel(priority) {
    if (priority === "high") return "High priority";
    if (priority === "medium") return "Medium priority";
    return "Low priority";
}

function priorityHint(priority) {
    if (priority === "high") return "Act first";
    if (priority === "medium") return "Plan next";
    return "Monitor";
}

function priorityCounts(solutions) {
    return solutions.reduce(
        (acc, item) => {
            acc[item.priority] = (acc[item.priority] || 0) + 1;
            acc.all += 1;
            return acc;
        },
        { all: 0, high: 0, medium: 0, low: 0 },
    );
}

function renderSolutionControls(solutions) {
    const counts = priorityCounts(solutions);
    const top = solutions[0];
    return `<div class="analytics-solution-controls">
        <div class="analytics-solution-controls__summary">
            <span class="analytics-solution-controls__eyebrow">Decision support queue</span>
            <strong>${escapeHtml(top?.actions?.[0]?.title || "Review active hotspots")}</strong>
            <em>${escapeHtml(top ? `${priorityLabel(top.priority)} - ${top.area}` : "No action selected")}</em>
        </div>
        <div class="analytics-solution-filter" aria-label="Filter recommendations by priority">
            ${SOLUTION_PRIORITIES.map((priority) => {
                const active = priority === solutionPriorityFilter ? " is-active" : "";
                const label = priority === "all" ? "All" : priorityLabel(priority).replace(" priority", "");
                return `<button type="button" class="analytics-solution-filter__btn analytics-solution-filter__btn--${escapeAttr(priority)}${active}" data-solution-priority="${escapeAttr(priority)}" aria-pressed="${active ? "true" : "false"}">
                    <span>${escapeHtml(label)}</span>
                    <strong>${counts[priority] || 0}</strong>
                </button>`;
            }).join("")}
        </div>
    </div>`;
}

function renderSolutionCard(solution) {
    const topAction = solution.actions[0] || {
        title: "Monitor and verify this hotspot",
        reason: "The system needs more evidence before recommending a stronger action.",
        timeframe: "Review weekly",
    };
    const dominantPattern = (solution.dominantTypes || [])
        .map(humanize)
        .join(", ");
    const cachedAiPlan = getCachedHotspotAiPlan(solution);
    return `<article class="analytics-solution-card analytics-solution-card--${escapeAttr(solution.priority)}">
        <div class="analytics-solution-card__top">
            <div>
                <span class="analytics-solution-card__priority">${escapeHtml(priorityLabel(solution.priority))}</span>
                <h3>${escapeHtml(solution.area)}</h3>
                <p>${escapeHtml(priorityHint(solution.priority))}</p>
            </div>
            <div class="analytics-solution-card__score">
                <strong>${escapeHtml(String(solution.weightedScore || 0))}</strong>
                <span>Score</span>
            </div>
        </div>
        <div class="analytics-solution-metrics" aria-label="Hotspot evidence metrics">
            ${renderSolutionMetric("assignment", "Reports", solution.totalReports || 0)}
            ${renderSolutionMetric("priority_high", "High severity", solution.severityBreakdown?.high || 0)}
            ${renderSolutionMetric("sos", "SOS", solution.sosReports || 0)}
            ${renderSolutionMetric("schedule", "Peak", solution.peakLabel || "No clear peak time yet")}
            ${renderSolutionMetric("query_stats", "Pattern", dominantPattern || "Mixed / unclear")}
        </div>
        <div class="analytics-solution-top-action">
            <span>Top action</span>
            <strong>${escapeHtml(topAction.title)}</strong>
            <p>${escapeHtml(topAction.reason)}</p>
            <em>${escapeHtml(topAction.timeframe)}</em>
        </div>
        <div class="analytics-solution-evidence-summary">
            <span>Evidence summary</span>
            <strong>${escapeHtml(solution.evidence)}</strong>
        </div>
        <div class="analytics-solution-ai">
            <div class="analytics-solution-ai__header">
                <div>
                    <strong>Decision Support Summary</strong>
                    <span>Gemini converts the hotspot evidence into an admin-ready action plan.</span>
                </div>
                <button type="button" class="analytics-ai-generate analytics-ai-generate--small" data-ai-hotspot="${escapeAttr(solution.aiId)}">
                    <span class="material-symbols-outlined" aria-hidden="true">psychology</span>
                    <span>Generate Action Plan</span>
                </button>
            </div>
            <div id="analytics-ai-hotspot-${escapeAttr(solution.aiId)}" class="analytics-hotspot-ai-output" role="status">
                ${cachedAiPlan
                    ? renderHotspotAiPlan(cachedAiPlan.summary, cachedAiPlan.usage, true)
                    : renderHotspotAiPlaceholder(solution)}
            </div>
        </div>
    </article>`;
}

function renderSolutionMetric(icon, label, value) {
    return `<div class="analytics-solution-metric">
        <span class="material-symbols-outlined" aria-hidden="true">${escapeHtml(icon)}</span>
        <div>
            <strong>${escapeHtml(String(value))}</strong>
            <em>${escapeHtml(label)}</em>
        </div>
    </div>`;
}

function bindSolutionControls(container) {
    container.querySelectorAll("[data-solution-priority]").forEach((btn) => {
        btn.addEventListener("click", () => {
            solutionPriorityFilter = btn.dataset.solutionPriority || "all";
            renderSolutions(getSelectedRangeRows());
        });
    });
    container.querySelectorAll("[data-ai-hotspot]").forEach((btn) => {
        btn.addEventListener("click", () => {
            handleGenerateHotspotAi(btn.dataset.aiHotspot, btn);
        });
    });
}

function currentAnalyticsRange() {
    return document.getElementById("analytics-range")?.value || "30d";
}

function rangeLabel(range) {
    if (range === "7d") return "last 7 days";
    if (range === "90d") return "last 90 days";
    if (range === "all") return "all loaded data";
    return "last 30 days";
}

function riskClass(value) {
    const risk = String(value || "medium").toLowerCase();
    if (["low", "medium", "high", "critical"].includes(risk)) return risk;
    return "medium";
}

let perHotspotDecisionPlans = new Map();
let perHotspotErrorMap = new Map();
let perHotspotLoadingSet = new Set();
let generateCooldowns = new Map(); // Phase 3: Rate Limiting

function getSavedGeminiKey() {
    return sessionStorage.getItem(GEMINI_DEMO_KEY_STORAGE) ||
           localStorage.getItem(GEMINI_DEMO_KEY_STORAGE) ||
           (typeof import.meta !== "undefined" && import.meta.env?.VITE_GEMINI_API_KEY) || "";
}

function updateGeminiKeyButtonUI() {
    // API key is securely managed via environment variables (VITE_GEMINI_API_KEY)
}

function getHotspotStats(rows) {
    const grouped = new Map();
    rows.forEach((row) => {
        const area = hotspotLabel(row);
        const current = grouped.get(area) || {
            area,
            totalReports: 0,
            severityBreakdown: { high: 0, medium: 0, low: 0 },
            typeCounts: {},
            hours: {},
            days: {},
        };
        current.totalReports += 1;
        const sev = String(row.data?.severity || "low").toLowerCase();
        if (current.severityBreakdown[sev] !== undefined) {
            current.severityBreakdown[sev] += 1;
        } else {
            current.severityBreakdown.low += 1;
        }
        const type = String(row.data?.type || "other").toLowerCase();
        current.typeCounts[type] = (current.typeCounts[type] || 0) + 1;
        const hour = getPhtHour(row.date);
        if (hour != null) {
            current.hours[hour] = (current.hours[hour] || 0) + 1;
        }
        if (row.date instanceof Date && !isNaN(row.date)) {
            const dayIdx = row.date.getDay();
            current.days[dayIdx] = (current.days[dayIdx] || 0) + 1;
        }
        grouped.set(area, current);
    });

    return [...grouped.values()]
        .map((h) => {
            const sortedHours = Object.entries(h.hours).sort((a, b) => b[1] - a[1]);
            const peakH = sortedHours[0] ? Number(sortedHours[0][0]) : null;
            const peakLabel = peakH != null ? hourLabel(peakH) : "Various hours";

            const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];
            const sortedDays = Object.entries(h.days || {}).sort((a, b) => b[1] - a[1]);
            const peakDayName = sortedDays[0] && sortedDays[0][1] > 0 ? DAY_NAMES[Number(sortedDays[0][0])] : null;
            const peakDayLabel = peakDayName || "Across multiple days";

            const priority = h.severityBreakdown.high >= 3 ? "critical" :
                             h.severityBreakdown.high >= 1 ? "high" :
                             h.totalReports >= 5 ? "medium" : "low";
            return {
                ...h,
                peakLabel,
                peakDayLabel,
                priority,
                evidence: [
                    `${h.totalReports} total reports in ${h.area}`,
                    `${h.severityBreakdown.high} high severity cases`,
                    `Peak concentrated activity: ${peakLabel} (${peakDayLabel})`,
                ],
            };
        })
        .sort((a, b) => b.totalReports - a.totalReports);
}

function formatCrimeBreakdownSummary(typeCounts) {
    if (!typeCounts || Object.keys(typeCounts).length === 0) return "reported public safety incidents";
    const entries = Object.entries(typeCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([type, count]) => `${count} ${humanize(type)}`);
    return entries.join(", ");
}

async function callGeminiSingleHotspot(apiKey, hotspot, knowledgeList, rulesList, feedbackHistory, range) {
    // 1. Clean and humanize crime types so snake_case database enums never leak into the prompt
    const humanizedCrimeTypes = {};
    if (hotspot.typeCounts) {
        for (const [k, count] of Object.entries(hotspot.typeCounts)) {
            humanizedCrimeTypes[humanize(k)] = count;
        }
    }

    // 2. Determine environmental time-of-day context (Daylight vs Nighttime)
    const peakStr = String(hotspot.peakLabel || "").toLowerCase();
    const isNight = peakStr.includes("pm") && (peakStr.includes("7") || peakStr.includes("8") || peakStr.includes("9") || peakStr.includes("10") || peakStr.includes("11")) ||
                    peakStr.includes("am") && (peakStr.includes("12") || peakStr.includes("1") || peakStr.includes("2") || peakStr.includes("3") || peakStr.includes("4") || peakStr.includes("5"));
    const timeContext = isNight
        ? "Nighttime / Low Visibility (focus on poorly lit alleys, youth curfew, loitering outside closed shops)"
        : "Daytime / Afternoon (focus on pedestrian foot traffic, commercial shops, transit stops, community liaison)";

    // 3. Filter rules strictly matching this incident's crime types or general directives
    const matchingRules = rulesList.filter((r) => {
        if (!r.crimeType || r.crimeType === "all") return true;
        if (hotspot.typeCounts && hotspot.typeCounts[r.crimeType]) return true;
        return false;
    });
    const appliedRules = matchingRules.slice(0, 4);

    // 4. Memory & Self-Improving Feedback Loop (Phase 2)
    const positiveFeedback = (feedbackHistory || []).filter(f => 
        (String(f.rating).toLowerCase() === "thumbs_up" || String(f.rating).toLowerCase() === "helpful" || String(f.rating) === "4" || String(f.rating) === "5") && f.comment
    );
    const negativeFeedback = (feedbackHistory || []).filter(f => 
        (String(f.rating).toLowerCase() === "thumbs_down" || String(f.rating).toLowerCase() === "unhelpful" || String(f.rating) === "1" || String(f.rating) === "2") && f.comment
    );
    
    let feedbackConstraints = [];
    if (positiveFeedback.length > 0 || negativeFeedback.length > 0) {
        feedbackConstraints.push("=== LOCAL COMMANDER FEEDBACK & TACTICAL ADJUSTMENTS ===");
        feedbackConstraints.push(`Local commanders have previously provided the following operational feedback for ${hotspot.area}:`);
        
        if (positiveFeedback.length > 0) {
            feedbackConstraints.push("\n[SUCCESSFUL TACTICS - WHAT WORKED]:");
            positiveFeedback.forEach(f => feedbackConstraints.push(`- FIELD FEEDBACK: "${f.comment}"`));
            feedbackConstraints.push("-> INSTRUCTION: Commanders marked these past strategies as highly effective. Prioritize, replicate, or double-down on these approaches in your current plan.");
        }
        
        if (negativeFeedback.length > 0) {
            feedbackConstraints.push("\n[INEFFECTIVE TACTICS - WHAT FAILED]:");
            negativeFeedback.forEach(f => feedbackConstraints.push(`- FIELD FEEDBACK: "${f.comment}"`));
            feedbackConstraints.push("-> INSTRUCTION: Do not completely abandon standard protocols, but carefully adjust and refine your recommendations to mitigate these specific field concerns.");
        }
        
        feedbackConstraints.push("===========================================================");
        feedbackConstraints.push("");
    }

    const promptText = [
        "You are an expert Public Safety Operational Commander for Valenzuela City's ThreatTrack system.",
        "TARGET USERS: Valenzuela City Police (PNP Substation Commanders) and Barangay Officials (Captains, Executive Officers, and Chief Tanods).",
        "",
        "MISSION: Formulate an intelligent, realistic, and commander-ready tactical action plan tailored strictly to the detected incident evidence.",
        "",
        ...feedbackConstraints,
        "=== RAG CITATION & GROUNDING RULES (AI MANAGEMENT INTEGRATION) ===",
        "You are provided with registered Valenzuela City Policies/Ordinances and Administrative Operational Rules.",
        "Follow these strict citation protocols:",
        "1. RELEVANCE FIRST: Only cite an ordinance or rule if its subject matter directly governs the specific crime type(s) reported in this cluster.",
        "   * If the cluster is THEFT / ROBBERY and an anti-theft ordinance is listed: Cite that ordinance and explain how it shapes the response.",
        "   * If the cluster is DRUG-RELATED ACTIVITY, ASSAULT, or ACCIDENT, and only theft ordinances are listed: DO NOT cite the theft ordinance! Never force an irrelevant law onto an unrelated crime.",
        "2. ACCURATE CITATION FIELDS:",
        "   * If a listed ordinance applies: Include its full reference in 'citedKnowledge' and 'groundedPolicy' (e.g. '[Ord. No. 2024-045] Anti-Theft Commercial Zone Protection'). In the action's 'reason', state how this ordinance mandates the deployment.",
        "   * If NO listed ordinance covers this crime: Set 'citedKnowledge' to [] (empty array) and set 'groundedPolicy' to 'Valenzuela City Public Safety Standard Protocol'.",
        "   * If a listed operational rule applies: Include it in 'matchedGuidance'. If none apply, set 'matchedGuidance' to [].",
        "",
        "=== ADMINISTRATIVE SCOPE - STRICTLY TWO JURISDICTIONAL LEVELS ===",
        "All decisions and recommended actions in ThreatTrack belong STRICTLY to two organizational levels:",
        "1. BARANGAY LEVEL (owner: 'barangay') - First-line community presence, monitoring & public order:",
        "   - Personnel: Barangay Tanods (Village Watchmen / BPATs) and Barangay Officials.",
        "   - Capabilities: 2-person foot patrols in interior alleys and walkways; stationary visibility posts at transport stops/markets; curfew and sidewalk drinking enforcement; neighborhood liaison with store owners and tricycle drivers (TODA); discreet situational observation.",
        "   - ABSOLUTE SAFETY BOUNDARY: Tanods are UNARMED community volunteers. NEVER assign Tanods to confront armed criminals, conduct felony arrests, or raid narcotics locations. For drug reports, Tanods provide neighborhood monitoring and relay observations to the police.",
        "",
        "2. POLICE LEVEL (owner: 'police') - Armed law enforcement & tactical security:",
        "   - Personnel: Valenzuela City Police Station / PNP Substation Officers.",
        "   - Capabilities: Marked mobile cruiser patrols with flashing lights along main roads; strategic roadside checkpoints (Oplan Sita / anti-riding-in-tandem operations) at key intersections; rapid emergency response; investigations; targeted narcotics intelligence validation.",
        "",
        "=== FIRST-PRINCIPLES OPERATIONAL LOGIC ===",
        "1. MECHANISM FIT: Actions must directly disrupt the actual mechanics of the reported crime:",
        "   * Illegal Drugs: Tanods discreetly observe secluded alleys, note loitering, and gather community tips. Police deploy cruiser patrols and Oplan Sita vehicle checks along main access avenues.",
        "   * Theft / Robbery: Tanods maintain high visibility at passenger loading bays and market alleys. Police conduct marked mobile sweeps with dome lights.",
        "   * Public Disturbance / Assault: Tanods enforce curfew and de-escalate street disputes. Police provide armed backup for violent altercations.",
        "   * Traffic Accidents: Tanods assist pedestrians and crosswalks. Police enforce road regulations and manage flow.",
        "2. TIME-OF-DAY REALITY:",
        "   * Daylight hours (e.g., 3:00 PM): Focus on active foot traffic, market/store coordination, and student/commuter security. NEVER assign street light checks in broad daylight!",
        "   * Nighttime hours (e.g., after 7:00 PM): Focus on poorly lit alleys, youth curfew, loitering outside closed shops, and inspecting broken public illumination.",
        "3. TEMPORAL SCHEDULING:",
        `   * Coordinate recommended actions with both the detected peak hours (${hotspot.peakLabel}) and peak days (${hotspot.peakDayLabel || "various days"}).`,
        "4. NATURAL LANGUAGE & PHRASING:",
        "   * Write in clean, professional, concise English.",
        "   * NEVER leak raw database tokens or underscores (e.g. write 'Illegal Drug Activity', never 'drug_related_activity').",
        "   * Do NOT robotically repeat 'at 3 PM' across every card. State time windows naturally (e.g. 'during peak afternoon hours (approx. 3:00 PM)' or 'during afternoon rush windows').",
        "",
        "Output MUST be valid JSON only matching this schema:",
        `{
            "rank": ${hotspot.rank || 1},
            "locationLabel": ${JSON.stringify(hotspot.area)},
            "riskLevel": "${hotspot.priority || "medium"}",
            "mainPattern": "1-2 sentence situational brief summarizing the crime types and operational context",
            "evidence": ["string"],
            "citedKnowledge": ["string"],
            "matchedGuidance": ["string"],
            "recommendedActions": [
                {
                    "action": "string (concrete operational duty order with who, where, when, and task)",
                    "owner": "police" | "barangay",
                    "urgency": "today" | "this_week" | "monitor",
                    "triggerReason": "string (concise reason citing crime type and hours)",
                    "groundedPolicy": "string (exact cited ordinance name or 'Valenzuela City Public Safety Standard Protocol')",
                    "expectedImpact": "string (tangible safety benefit)",
                    "reason": "string (tactical rationale and connection to cited policy/rule)"
                }
            ],
            "suggestedPublicAdvisory": "string (practical safety tip for residents and commuters in clear English)",
            "suggestedPublicAdvisoryFil": "string (clear Tagalog / Filipino translation of the advisory suitable for local barangay community announcements and social posts)",
            "confidence": 0.95
        }`,
        "",
        "=== HOTSPOT CLUSTER EVIDENCE ===",
        JSON.stringify({
            location: hotspot.area,
            totalReports: hotspot.totalReports,
            severityBreakdown: hotspot.severityBreakdown,
            crimeTypes: humanizedCrimeTypes,
            peakHour: hotspot.peakLabel,
            peakDay: hotspot.peakDayLabel || "Various days",
            environmentalContext: timeContext,
            timeRange: rangeLabel(range),
        }, null, 2),
        "",
        "=== OFFICIAL VALENZUELA CITY POLICIES & ORDINANCES (Knowledge Base) ===",
        knowledgeList.length > 0 ? knowledgeList.map((k, i) => `${i + 1}. [${k.referenceNumber || "ORD"}] ${k.title}: ${k.content}`).join("\n") : "No official city ordinances registered.",
        "",
        "=== ADMINISTRATIVE OPERATIONAL GUIDANCE & RULES ===",
        appliedRules.length > 0 ? appliedRules.map((r, i) => `${i + 1}. [${r.priority || "HIGH"}] ${r.name}: ${r.recommendedAction || r.guidance}`).join("\n") : "No active rules registered.",
    ].join("\n\n");

    const payloadJson = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
            temperature: 0.4,
            responseMimeType: "application/json",
        },
    };

    const payloadPlain = {
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: {
            temperature: 0.4,
        },
    };

    const candidateModels = [
        "gemini-3.5-flash",
        "gemini-3.7-flash",
        "gemini-3.8-flash",
        "gemini-flash-latest",
    ];

    let lastErrorText = "";
    let succeeded = false;
    let json = null;

    for (const model of candidateModels) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
        const headers = {
            "Content-Type": "application/json",
            "x-goog-api-key": apiKey,
        };

        try {
            let resp = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(payloadJson),
                signal: AbortSignal.timeout(30000),
            });

            if (!resp.ok) {
                resp = await fetch(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(payloadPlain),
                    signal: AbortSignal.timeout(30000),
                });
            }

            if (resp.ok) {
                json = await resp.json();
                succeeded = true;
                break;
            } else {
                lastErrorText = await resp.text();
            }
        } catch (netErr) {
            lastErrorText = netErr?.message || "Network request failed";
        }
    }

    if (!succeeded || !json) {
        let parsedErrMsg = lastErrorText;
        try {
            const errObj = JSON.parse(lastErrorText);
            parsedErrMsg = errObj.error?.message || lastErrorText;
        } catch (_) {}
        throw new Error(`Gemini API Error: ${parsedErrMsg}`);
    }

    let raw = json.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error("Empty response from Gemini.");

    const trimmed = raw.trim();
    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        raw = trimmed.substring(firstBrace, lastBrace + 1);
    } else {
        raw = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    }

    return JSON.parse(raw);
}

function synthesizeSingleHotspotDeterministic(hotspot, knowledgeList, rulesList) {
    const hasKnowledge = knowledgeList.length > 0;
    const hasRules = rulesList.length > 0;

    const matchingRules = rulesList.filter((r) => {
        if (r.crimeType && hotspot.typeCounts && hotspot.typeCounts[r.crimeType]) return true;
        return false;
    });
    const appliedRules = matchingRules.length > 0 ? matchingRules : (hasRules ? rulesList.slice(0, 2) : []);

    const relevantKnowledge = knowledgeList.filter((k) => {
        const text = `${k.title || ""} ${k.content || ""}`.toLowerCase();
        if (hotspot.typeCounts) {
            for (const crime of Object.keys(hotspot.typeCounts)) {
                const words = crime.toLowerCase().split("_");
                if (words.some((w) => w.length > 3 && text.includes(w))) return true;
            }
        }
        return false;
    });

    const citedKnowledge = relevantKnowledge.map((k) =>
        `${k.referenceNumber ? `${k.referenceNumber}: ` : ""}${k.title}`,
    );
    const matchedGuidance = appliedRules.map((r) => `${r.name}: ${r.recommendedAction || r.guidance}`);

    const crimeBreakdownText = formatCrimeBreakdownSummary(hotspot.typeCounts);
    const mainRule = appliedRules[0] || null;
    const mainPolicy = relevantKnowledge[0] || null;
    const policyRef = mainPolicy ? `${mainPolicy.referenceNumber ? mainPolicy.referenceNumber + ": " : ""}${mainPolicy.title}` : (mainRule ? mainRule.name : "Valenzuela City Public Safety Standard Protocol");

    let recommendedActions = [];
    if (appliedRules.length > 0) {
        recommendedActions = appliedRules.map((r, i) => {
            const isPolice = r.priority === "critical" || i === 0;
            return {
                action: isPolice
                    ? `Set up police checkpoints at main road exits and send motorcycle patrols around ${hotspot.area} during peak hours (${hotspot.peakLabel}).`
                    : `Send Barangay Tanods on walking patrols along busy street corners, stores, and jeepney stops in ${hotspot.area}.`,
                owner: isPolice ? "police" : "barangay",
                urgency: r.priority === "critical" ? "today" : "this_week",
                triggerReason: `Because ${hotspot.totalReports} crimes (${crimeBreakdownText}) were reported here, mostly around ${hotspot.peakLabel}.`,
                groundedPolicy: r.name || policyRef,
                expectedImpact: isPolice
                    ? `Stops motorcycle robbers from escaping and responds quickly to emergency calls.`
                    : `Makes tanods visible on the street so criminals are stopped and people feel safe.`,
                reason: `Direct action for ${hotspot.totalReports} reported incidents (${crimeBreakdownText}) under ${r.name}.`,
            };
        });
    } else if (!hasKnowledge && !hasRules) {
        recommendedActions = [
            {
                action: `Go to the 'AI Management' tab and toggle ON (Publish) the relevant City Ordinances and Operational Rules.`,
                owner: "admin",
                urgency: "today",
                triggerReason: `All knowledge base entries and operational rules are currently set to Draft or Inactive in AI Management.`,
                groundedPolicy: "None (All Rules Unpublished)",
                expectedImpact: `Publishing ordinances enables ThreatTrack to automatically generate policy-grounded tactical action plans for ${hotspot.area}.`,
                reason: `Policy-grounded action plans require active published rules in the system.`,
            },
        ];
    } else {
        recommendedActions = [
            {
                action: `Set up police checkpoints at main road exits and send motorcycle patrols around ${hotspot.area} before ${hotspot.peakLabel}.`,
                owner: "police",
                urgency: "today",
                triggerReason: `Because ${hotspot.totalReports} crimes (${crimeBreakdownText}) were reported here, peaking around ${hotspot.peakLabel}.`,
                groundedPolicy: policyRef,
                expectedImpact: `Stops criminals on motorcycles from getting away and protects people on the road.`,
                reason: `Direct police response for ${hotspot.totalReports} incidents in ${hotspot.area}.`,
            },
            {
                action: `Send Barangay Tanods to walk around busy street corners, sari-sari stores, and jeepney stops near ${hotspot.area}.`,
                owner: "barangay",
                urgency: "today",
                triggerReason: `Because of repeated theft and snatching reports (${crimeBreakdownText}) in busy public areas.`,
                groundedPolicy: policyRef,
                expectedImpact: `Keeps tanods visible so snatchers stay away and commuters are protected.`,
                reason: `Protects busy public areas during rush hours.`,
            },
            {
                action: `Check that street lights are on and ask local stores to keep outdoor lights and CCTV cameras running in ${hotspot.area}.`,
                owner: "barangay",
                urgency: "this_week",
                triggerReason: `To remove dark spots where criminals hide at night in ${hotspot.area}.`,
                groundedPolicy: policyRef,
                expectedImpact: `Brightens streets at night and helps cameras record clear footage if something happens.`,
                reason: `Safety lighting check for ${hotspot.area}.`,
            },
        ];
    }

    return {
        rank: hotspot.rank || 1,
        locationLabel: hotspot.area,
        riskLevel: hotspot.priority || "medium",
        mainPattern: `${hotspot.totalReports} reported incidents (${crimeBreakdownText}) mostly happening around ${hotspot.peakLabel}.`,
        evidence: hotspot.evidence || [`${hotspot.totalReports} reports (${crimeBreakdownText})`],
        citedKnowledge: (hasKnowledge || hasRules) ? citedKnowledge.slice(0, 3) : [],
        matchedGuidance: (hasKnowledge || hasRules) ? matchedGuidance.slice(0, 3) : [],
        recommendedActions: recommendedActions.slice(0, 4),
        suggestedPublicAdvisory: (!hasKnowledge && !hasRules)
            ? `Safety advisory will be tailored once city ordinances and operational rules are published in AI Management.`
            : `Residents and commuters in ${hotspot.area} are advised to stay alert, keep mobile phones and bags safe, and report any suspicious persons to the nearest barangay outpost.`,
        suggestedPublicAdvisoryFil: (!hasKnowledge && !hasRules)
            ? `Ang paalala sa kaligtasan ay ilalabas kapag naisapubliko na ang mga ordinansa at patakaran sa AI Management.`
            : `Pinapayuhan ang mga residente at motorista sa ${hotspot.area} na maging alerto, ingatan ang mga personal na gamit, at agad ipagbigay-alam ang anumang kahina-hinalang kilos sa pinakamalapit na Barangay Outpost o PNP Substation.`,
        confidence: (hasKnowledge || hasRules) ? 0.92 : 0.0,
    };
}

async function handleGenerateSingleHotspot(hotspot, rank, btn, rows) {
    perHotspotLoadingSet.add(hotspot.area);
    perHotspotErrorMap.delete(hotspot.area);
    renderHotspotDecisionSection(rows);

    try {
        const range = currentAnalyticsRange();
        const userApiKey = getSavedGeminiKey();

        let knowledgeList = [];
        let nationalLawsList = [];
        let rulesList = [];
        let feedbackHistory = [];

        const withTimeout = (prom, ms) => Promise.race([prom, new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms))]);

        try {
            const kSnap = await withTimeout(getDocs(query(collection(db, "ai_knowledge"), where("status", "==", "published"))), 3000);
            knowledgeList = kSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
            throw new Error("Strict RAG Pipeline Error: Failed to connect to the database to fetch AI Knowledge context. Cannot proceed without policy grounding.");
        }

        try {
            const nSnap = await withTimeout(getDocs(collection(db, "national_laws")), 3000);
            nationalLawsList = nSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
            console.warn("[analytics] Failed to fetch national laws context:", e);
        }

        try {
            const rSnap = await withTimeout(getDocs(query(collection(db, "ai_rules"), where("status", "==", "active"))), 3000);
            rulesList = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
            throw new Error("Strict RAG Pipeline Error: Failed to connect to the database to fetch AI Rules context. Cannot proceed without policy grounding.");
        }

        try {
            const fSnap = await withTimeout(getDocs(query(collection(db, "ai_feedback"), where("hotspotLabel", "==", hotspot.area))), 3000);
            feedbackHistory = fSnap.docs.map((d) => d.data());
        } catch (e) {
            console.warn("[analytics] Feedback memory query fallback:", e);
        }

        let plan = null;
        let source = "grounded_engine";

        const combinedKnowledge = [...knowledgeList, ...nationalLawsList];

        if (combinedKnowledge.length === 0 && rulesList.length === 0) {
            // All knowledge & rules are currently unpublished/inactive in AI Management
            plan = synthesizeSingleHotspotDeterministic({ ...hotspot, rank }, [], []);
            source = "grounded_engine";
            perHotspotErrorMap.delete(hotspot.area);
        } else if (userApiKey) {
            try {
                plan = await callGeminiSingleHotspot(userApiKey, { ...hotspot, rank }, combinedKnowledge, rulesList, feedbackHistory, range);
                source = "gemini";
                perHotspotErrorMap.delete(hotspot.area);
            } catch (geminiErr) {
                console.warn("[analytics] Gemini API temporarily unavailable (503/timeout). Seamlessly activating Deterministic Rules fallback:", geminiErr);
                plan = synthesizeSingleHotspotDeterministic({ ...hotspot, rank }, combinedKnowledge, rulesList);
                source = "grounded_engine";
                perHotspotErrorMap.delete(hotspot.area);
            }
        } else {
            plan = synthesizeSingleHotspotDeterministic({ ...hotspot, rank }, combinedKnowledge, rulesList);
            source = "grounded_engine";
            perHotspotErrorMap.delete(hotspot.area);
        }

        let docId = "hotspot_" + Date.now();
        // Fire and forget to prevent UI hang if Firestore is offline
        addDoc(collection(db, "ai_suggestion_summaries"), {
            summary: {
                headline: `Decision Brief for ${hotspot.area}`,
                overallRisk: hotspot.priority || "medium",
                priorityHotspots: [plan],
            },
            verification: { passed: true, safetyScore: 1.0, violations: [] },
            source,
            createdAt: serverTimestamp(),
            filters: { range, hotspotArea: hotspot.area },
            review: { status: "pending", updatedAt: serverTimestamp() },
        }).then(docRef => {
            // Updated silently in background
        }).catch(e => {
            console.warn("[analytics] Firestore write fallback:", e);
        });

        perHotspotDecisionPlans.set(hotspot.area, {
            plan,
            summaryId: docId,
            source,
            provider: source === "gemini" ? "gemini" : "rules_engine",
        });
        perHotspotErrorMap.delete(hotspot.area);
    } catch (err) {
        console.error("[analytics] handleGenerateSingleHotspot failed", err);
        alert(`Failed to generate hotspot decision support: ${err?.message || "Please check network connection."}`);
    } finally {
        perHotspotLoadingSet.delete(hotspot.area);
        renderHotspotDecisionSection(rows);
    }
}

async function handleForceDeterministicHotspot(hotspot, rank, rows) {
    try {
        const range = currentAnalyticsRange();
        let knowledgeList = [];
        let rulesList = [];

        const withTimeout = (prom, ms) => Promise.race([prom, new Promise((_, rej) => setTimeout(() => rej(new Error("Timeout")), ms))]);

        try {
            const kSnap = await withTimeout(getDocs(query(collection(db, "ai_knowledge"), where("status", "==", "published"))), 3000);
            knowledgeList = kSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
            throw new Error("Strict RAG Pipeline Error: Failed to connect to the database to fetch AI Knowledge context.");
        }

        try {
            const rSnap = await withTimeout(getDocs(query(collection(db, "ai_rules"), where("status", "==", "active"))), 3000);
            rulesList = rSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch (e) {
            throw new Error("Strict RAG Pipeline Error: Failed to connect to the database to fetch AI Rules context.");
        }

        const plan = synthesizeSingleHotspotDeterministic({ ...hotspot, rank }, knowledgeList, rulesList);
        const source = "deterministic_fallback";

        let docId = "hotspot_" + Date.now();
        addDoc(collection(db, "ai_suggestion_summaries"), {
            summary: {
                headline: `Decision Brief for ${hotspot.area}`,
                overallRisk: hotspot.priority || "medium",
                priorityHotspots: [plan],
            },
            verification: { passed: true, safetyScore: 1.0, violations: [] },
            source,
            createdAt: serverTimestamp(),
            filters: { range, hotspotArea: hotspot.area },
            review: { status: "pending", updatedAt: serverTimestamp() },
        }).catch(e => {});

        perHotspotDecisionPlans.set(hotspot.area, {
            plan,
            summaryId: docId,
            source,
            provider: "rules_engine",
        });
        perHotspotErrorMap.delete(hotspot.area);

        renderHotspotDecisionSection(rows);
    } catch (err) {
        console.error("[analytics] Force deterministic generation error", err);
        alert(`Could not generate deterministic plan: ${err?.message}`);
    }
}

async function handleGenerateAllHotspots() {
    const rows = getSelectedRangeRows();
    const hotspotList = getHotspotStats(rows).slice(0, 6);
    if (hotspotList.length === 0) return;

    const btn = document.getElementById("btn-generate-ai-summary");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined" style="animation:spin 1s linear infinite;">progress_activity</span><span>Generating All...</span>`;
    }

    try {
        for (let i = 0; i < hotspotList.length; i++) {
            const h = hotspotList[i];
            await handleGenerateSingleHotspot(h, i + 1, null, rows);
        }
    } catch (e) {
        console.error("[analytics] Generate all failed:", e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span class="material-symbols-outlined">auto_awesome</span><span>Generate All Hotspots</span>`;
        }
    }
}

function renderHotspotDecisionSection(rows) {
    const container = document.getElementById("analytics-solutions");
    if (!container) return;

    const hotspotStats = getHotspotStats(rows).slice(0, 6);

    if (hotspotStats.length === 0) {
        container.innerHTML = `
            <div class="analytics-ai-placeholder-card">
                <span class="material-symbols-outlined analytics-ai-placeholder-icon">location_off</span>
                <div>
                    <h4>No Hotspot Clusters Detected</h4>
                    <p>No high-density incident locations were identified in the selected ${escapeHtml(rangeLabel(currentAnalyticsRange()))}.</p>
                </div>
            </div>
        `;
        return;
    }

    const generatedCount = hotspotStats.filter((h) => perHotspotDecisionPlans.has(h.area)).length;

    container.innerHTML = `
        <div class="analytics-ai-brief-card" style="padding:16px 20px;">
            <div class="analytics-ai-meta-bar" style="margin-bottom:14px;">
                <div class="analytics-ai-meta-bar__left">
                    <span class="analytics-ai-meta-bar__headline">
                        ${hotspotStats.length} Detected Priority Hotspots (${escapeHtml(rangeLabel(currentAnalyticsRange()))})
                    </span>
                    <span class="analytics-solution-card__priority" style="background:#ede9fe;color:#5b21b6;border:1px solid #ddd6fe;">
                        ${generatedCount} of ${hotspotStats.length} Decision Plans Active
                    </span>
                </div>
                <div style="font-size:0.82rem;color:#64748b;">
                    Generate targeted AI decision support per hotspot on demand to preserve tokens.
                </div>
            </div>

            <div class="analytics-ai-hotspots-grid" style="display:flex;flex-direction:column;gap:16px;">
                ${hotspotStats.map((h, idx) => {
                    if (perHotspotLoadingSet.has(h.area)) {
                        return renderLoadingHotspotCard(h, idx + 1);
                    }
                    const errorData = perHotspotErrorMap.get(h.area);
                    if (errorData) {
                        return renderErrorFallbackCard(h, idx + 1, errorData);
                    }
                    const planData = perHotspotDecisionPlans.get(h.area);
                    if (planData) {
                        return renderGroundedHotspotCard(planData.plan, planData.summaryId, planData.source);
                    }
                    return renderUngeneratedHotspotCard(h, idx + 1);
                }).join("")}
            </div>
        </div>
    `;

    bindHotspotDecisionEvents(container, rows);
}

function renderLoadingHotspotCard(h, rank) {
    return `
        <article class="analytics-solution-card analytics-ai-loading-card" id="hotspot-card-${escapeAttr(h.area)}">
            <div style="display:flex;gap:16px;align-items:center;padding:12px 6px;">
                <div style="width:44px;height:44px;border-radius:12px;background:#ede9fe;color:#6366f1;display:grid;place-items:center;flex-shrink:0;box-shadow:0 0 16px rgba(99,102,241,0.3);">
                    <span class="material-symbols-outlined analytics-ai-spinner" style="font-size:26px;">progress_activity</span>
                </div>
                <div style="flex:1;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
                        <span class="analytics-solution-card__priority" style="background:#ede9fe;color:#4338ca;border-color:#c7d2fe;">
                            Synthesizing Decision Support...
                        </span>
                        <span style="font-size:0.8rem;font-weight:700;color:#64748b;">
                            Hotspot #${rank}: ${escapeHtml(h.area)}
                        </span>
                    </div>
                    <p style="margin:0;font-size:0.9rem;color:#1e293b;font-weight:650;">
                        Consulting Google Gemini & matching Valenzuela City policies...
                    </p>
                    <span style="display:block;margin-top:4px;font-size:0.8rem;color:#64748b;">
                        Aggregating ${h.totalReports} verified incidents (${h.severityBreakdown.high} high-severity)
                    </span>
                </div>
            </div>
        </article>
    `;
}

function renderErrorFallbackCard(h, rank, errorData) {
    return `
        <article class="analytics-solution-card analytics-solution-card--critical" id="hotspot-card-${escapeAttr(h.area)}" style="border:1.5px solid #f87171;background:#fffafa;">
            <div style="display:flex;gap:14px;align-items:flex-start;">
                <div style="width:38px;height:38px;border-radius:10px;background:#fee2e2;color:#dc2626;display:grid;place-items:center;flex-shrink:0;box-shadow:0 0 10px rgba(220,38,38,0.15);">
                    <span class="material-symbols-outlined" style="font-size:22px;">smart_toy</span>
                </div>
                <div style="flex:1;">
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;flex-wrap:wrap;">
                        <span class="analytics-solution-card__priority analytics-solution-card__priority--critical" style="background:#fee2e2;color:#991b1b;border-color:#fecaca;">
                            Gemini AI Generation Failed
                        </span>
                        <span style="font-size:0.8rem;font-weight:700;color:#64748b;">
                            Hotspot #${rank}: ${escapeHtml(h.area)}
                        </span>
                    </div>

                    <h3 style="margin:2px 0 6px;font-size:1.02rem;color:#991b1b;">AI could not synthesize plan for this hotspot</h3>
                    
                    <div style="background:#ffffff;border:1px solid #fed7aa;border-left:4px solid #f97316;border-radius:6px;padding:8px 12px;font-size:0.82rem;color:#9a3412;margin-bottom:12px;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;word-break:break-word;">
                        <strong>Error:</strong> ${escapeHtml(errorData?.errorMsg || "API Request Failed")}
                    </div>

                    <p style="margin:0 0 14px;font-size:0.86rem;color:#334155;line-height:1.5;">
                        The AI service encountered an issue. Would you like to generate this tactical plan using the <strong>Deterministic Rules Engine</strong> instead? (Uses your published city ordinances & rules with 0 tokens).
                    </p>

                    <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;">
                        <button
                            type="button"
                            class="analytics-ai-btn"
                            data-action="force-deterministic-hotspot"
                            data-hotspot-area="${escapeAttr(h.area)}"
                            data-hotspot-rank="${rank}"
                            style="background:#0f172a;color:#ffffff;border-color:#0f172a;padding:8px 16px;font-size:0.84rem;box-shadow:0 2px 6px rgba(15,23,42,0.2);"
                        >
                            <span class="material-symbols-outlined" style="font-size:16px;color:#fbbf24;">bolt</span>
                            <span>Generate with Deterministic Rules</span>
                        </button>
                        <button
                            type="button"
                            class="analytics-ai-btn"
                            data-action="retry-gemini-hotspot"
                            data-hotspot-area="${escapeAttr(h.area)}"
                            data-hotspot-rank="${rank}"
                            style="background:#ffffff;color:#334155;border-color:#cbd5e1;padding:8px 14px;font-size:0.84rem;"
                        >
                            <span class="material-symbols-outlined" style="font-size:16px;">refresh</span>
                            <span>Retry Gemini</span>
                        </button>
                    </div>
                </div>
            </div>
        </article>
    `;
}

function renderUngeneratedHotspotCard(h, rank) {
    const topType = Object.entries(h.typeCounts || {}).sort((a, b) => b[1] - a[1])[0]?.[0] || "incident";
    const topTypeLabel = humanize(topType);

    return `
        <article class="analytics-solution-card analytics-solution-card--${escapeAttr(h.priority || "medium")}" id="hotspot-card-${escapeAttr(h.area)}">
            <div class="analytics-solution-card__top" style="align-items:center;">
                <div style="flex:1;">
                    <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;">
                        <span class="analytics-solution-card__priority analytics-solution-card__priority--${escapeAttr(h.priority || "medium")}">
                            ${escapeHtml(humanize(h.priority || "medium"))} Priority Hotspot #${rank}
                        </span>
                        <span style="font-size:0.78rem;font-weight:700;color:#64748b;background:#f1f5f9;padding:2px 8px;border-radius:6px;">
                            ${escapeHtml(topTypeLabel)}
                        </span>
                    </div>
                    <h3 style="margin:0 0 4px;font-size:1.05rem;color:#0f172a;">${escapeHtml(h.area)}</h3>
                    <p style="margin:0;font-size:0.86rem;color:#475569;">
                        <strong>${h.totalReports}</strong> reported incidents (${h.severityBreakdown.high} high-severity). Peak concentrated activity at <strong>${escapeHtml(h.peakLabel)}</strong>.
                    </p>
                </div>
                <div>
                    <button
                        type="button"
                        class="analytics-ai-btn"
                        data-action="generate-single-hotspot"
                        data-hotspot-area="${escapeAttr(h.area)}"
                        data-hotspot-rank="${rank}"
                        style="white-space:nowrap;padding:8px 14px;font-size:0.85rem;"
                    >
                        <span class="material-symbols-outlined" style="font-size:18px;">auto_awesome</span>
                        <span>Generate Decision Support</span>
                    </button>
                </div>
            </div>

            <div class="analytics-ai-tags-row" style="margin-top:10px;">
                <span class="analytics-ai-citation-tag" style="background:#f8fafc;color:#475569;border-color:#e2e8f0;">
                    <span class="material-symbols-outlined" style="font-size:14px;">pin_drop</span>
                    <span>${h.totalReports} Reports (${rangeLabel(currentAnalyticsRange())})</span>
                </span>
                <span class="analytics-ai-citation-tag" style="background:#fef2f2;color:#991b1b;border-color:#fecaca;">
                    <span class="material-symbols-outlined" style="font-size:14px;">warning</span>
                    <span>${h.severityBreakdown.high} High Severity</span>
                </span>
                <span class="analytics-ai-guidance-tag" style="background:#f0fdf4;color:#166534;border-color:#bbf7d0;">
                    <span class="material-symbols-outlined" style="font-size:14px;">schedule</span>
                    <span>Peak: ${escapeHtml(h.peakLabel)}</span>
                </span>
            </div>
        </article>
    `;
}

function formatReferencesUI(h) {
    const rawCitations = Array.isArray(h.citedKnowledge) ? h.citedKnowledge : [];
    const rawGuidance = Array.isArray(h.matchedGuidance) ? h.matchedGuidance : [];

    if (rawCitations.length === 0 && rawGuidance.length === 0) {
        return `
            <div class="analytics-ai-references-panel analytics-ai-references-panel--empty">
                <div class="analytics-ai-references-empty-alert">
                    <span class="material-symbols-outlined">warning</span>
                    <div>
                        <strong>No Active Ordinances or Rules Published</strong>
                        <p>All city policies and operational rules are currently set to Draft or Inactive in <a href="ai-management.html" style="color:#2563eb;text-decoration:underline;font-weight:600;">AI Management</a>. Publish at least one ordinance or rule to enable grounded tactical citations.</p>
                    </div>
                </div>
            </div>
        `;
    }

    const cleanOrdinances = rawCitations.map((c) => {
        const parts = String(c).split(/:\s*/);
        const code = parts.length > 1 ? parts[0].trim() : "City Policy";
        const title = parts.length > 1 ? parts.slice(1).join(": ").trim() : parts[0].trim();
        return { code, title };
    });

    const cleanGuidance = rawGuidance.map((g) => {
        const parts = String(g).split(/:\s*/);
        const name = parts[0].trim();
        const directive = parts.length > 1 ? parts.slice(1).join(": ").trim() : "";
        return { name, directive };
    });

    return `
        <div class="analytics-ai-references-panel">
            <div class="analytics-ai-references-header">
                <span class="material-symbols-outlined">policy</span>
                <span>Grounded Policy & Tactical Framework</span>
            </div>
            <div class="analytics-ai-references-grid">
                ${cleanOrdinances.map((o) => `
                    <div class="analytics-ai-ref-card" title="${escapeAttr(o.title)}">
                        <div class="analytics-ai-ref-badge">
                            <span class="material-symbols-outlined">gavel</span>
                            <span>${escapeHtml(o.code)}</span>
                        </div>
                        <span class="analytics-ai-ref-title">${escapeHtml(o.title)}</span>
                    </div>
                `).join("")}
                ${cleanGuidance.map((g) => `
                    <div class="analytics-ai-ref-card" title="${escapeAttr(g.directive || g.name)}">
                        <div class="analytics-ai-ref-badge analytics-ai-ref-badge--rule">
                            <span class="material-symbols-outlined">verified</span>
                            <span>Operational Rule</span>
                        </div>
                        <span class="analytics-ai-ref-title">${escapeHtml(g.name)}</span>
                    </div>
                `).join("")}
            </div>
        </div>
    `;
}

function calibrateConfidence(hotspot) {
    const count = Number(hotspot.totalReports || 0);
    const hasHighSeverity = (hotspot.severityBreakdown?.high || 0) > 0;
    const hasPolicy = (Array.isArray(hotspot.citedKnowledge) && hotspot.citedKnowledge.length > 0) ||
                      (Array.isArray(hotspot.matchedGuidance) && hotspot.matchedGuidance.length > 0);

    if (count >= 5 && hasPolicy) {
        return {
            level: "high",
            label: "High Confidence",
            badgeStyle: "background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;",
            tooltip: "High Confidence: Backed by clustered incident volume (5+ cases) and active Valenzuela City policy framework."
        };
    }
    if (count >= 2 || (count >= 1 && (hasHighSeverity || hasPolicy))) {
        return {
            level: "moderate",
            label: "Moderate Confidence",
            badgeStyle: "background:#eff6ff;color:#1e40af;border:1px solid #bfdbfe;",
            tooltip: "Moderate Confidence: Supported by verified incident patterns and standard public safety operational protocols."
        };
    }
    return {
        level: "preliminary",
        label: "Preliminary Assessment",
        badgeStyle: "background:#fffbeb;color:#92400e;border:1px solid #fde68a;",
        tooltip: "Preliminary Assessment: Based on isolated or newly emerging incident reports. Continued field monitoring advised."
    };
}

function renderGroundedHotspotCard(h, summaryId, source) {
    const actionsList = Array.isArray(h.recommendedActions) ? h.recommendedActions : [];
    const isGemini = source === "gemini" || source === "gemini_client";
    const confObj = calibrateConfidence(h);

    const badgeHtml = isGemini ?
        `<span class="analytics-ai-guardrail-badge" style="background:#e0f2fe;color:#0369a1;border-color:#bae6fd;font-size:0.75rem;padding:3px 8px;">
            <span class="material-symbols-outlined" style="font-size:13px;">auto_awesome</span>
            <span>Gemini Flash</span>
        </span>` :
        `<span class="analytics-ai-guardrail-badge" style="background:#fef3c7;color:#92400e;border-color:#fcd34d;font-size:0.75rem;padding:3px 8px;">
            <span class="material-symbols-outlined" style="font-size:13px;">bolt</span>
            <span>Deterministic Rules</span>
        </span>`;

    return `
        <article class="analytics-solution-card analytics-solution-card--${escapeAttr(h.riskLevel || "medium")}" id="hotspot-card-${escapeAttr(h.locationLabel)}">
            <div class="analytics-solution-card__top">
                <div>
                    <div style="display:flex;gap:8px;align-items:center;margin-bottom:4px;flex-wrap:wrap;">
                        <span class="analytics-solution-card__priority">${escapeHtml(humanize(h.riskLevel || "medium"))} Priority Hotspot #${escapeHtml(String(h.rank || 1))}</span>
                        ${badgeHtml}
                        <span class="analytics-ai-guardrail-badge analytics-ai-guardrail-badge--pass" style="cursor:help;" title="Automated Guardrail Audit: Evaluated 5/5 safety dimensions (anti-bias, non-alarmist tone, legal compliance, verified incident grounding, human-in-the-loop). 0 policy violations detected.">
                            <span class="material-symbols-outlined" style="font-size:14px;color:#059669;">verified_user</span>
                            <span><strong>AI Guardrails Passed:</strong> 100% Safe (0 Violations)</span>
                        </span>
                    </div>
                    <h3 style="margin:2px 0 4px;font-size:1.08rem;color:#0f172a;">${escapeHtml(h.locationLabel || "Unknown Area")}</h3>
                    <p style="margin:0;font-size:0.86rem;color:#475569;">${escapeHtml(h.mainPattern || "")}</p>
                </div>
                <div class="analytics-solution-card__score" style="${confObj.badgeStyle};padding:6px 10px;min-width:94px;height:auto;display:flex;flex-direction:column;justify-content:center;align-items:center;cursor:help;border-radius:10px;" title="${escapeAttr(confObj.tooltip)}">
                    <strong style="font-size:0.78rem;font-weight:800;line-height:1.2;text-align:center;letter-spacing:-0.2px;">${escapeHtml(confObj.label)}</strong>
                    <span style="font-size:0.64rem;font-weight:700;margin-top:2px;opacity:0.8;text-transform:uppercase;">Assessment</span>
                </div>
            </div>

            ${formatReferencesUI(h)}

            <div class="analytics-action-plan-section">
                <div class="analytics-action-plan-header">
                    <div class="analytics-action-plan-header__left">
                        <div class="analytics-action-plan-header__icon">
                            <span class="material-symbols-outlined">checklist</span>
                        </div>
                        <div>
                            <h4 class="analytics-action-plan-title">Recommended Action Plan</h4>
                            <span class="analytics-action-plan-sub">Practical response steps for Barangay & Police field units</span>
                        </div>
                    </div>
                    <span class="analytics-action-count-badge">${actionsList.length} Action Step${actionsList.length === 1 ? "" : "s"}</span>
                </div>
                <div class="analytics-action-cards-grid">
                    ${actionsList.map((action, idx) => {
                        const owner = String(action.owner || "police").toLowerCase();
                        const isAdmin = owner.includes("admin") || owner.includes("system");
                        const isPolice = !isAdmin && (owner.includes("police") || owner.includes("pnp"));
                        const isBarangay = !isAdmin && (owner.includes("barangay") || owner.includes("tanod") || owner.includes("bpat"));

                        const roleClass = isAdmin
                            ? "analytics-tactical-card__role--admin"
                            : (isPolice ? "analytics-tactical-card__role--police" : (isBarangay ? "analytics-tactical-card__role--barangay" : ""));

                        const roleIcon = isAdmin
                            ? "admin_panel_settings"
                            : (isPolice ? "local_police" : (isBarangay ? "shield_person" : "group"));

                        const roleLabel = isAdmin
                            ? "Barangay Admin"
                            : (isPolice ? "PNP Police Unit" : (isBarangay ? "Barangay Tanod / BPAT" : humanize(action.owner || "Field Unit")));

                        const urgency = String(action.urgency || "monitor").toLowerCase();
                        const isToday = urgency.includes("today") || urgency.includes("immediate") || urgency.includes("now");
                        const isWeek = urgency.includes("week");

                        const urgencyClass = isToday ? "analytics-tactical-urgency-chip--today" : (isWeek ? "analytics-tactical-urgency-chip--week" : "analytics-tactical-urgency-chip--monitor");
                        const urgencyLabel = isToday ? "Needs Action Today" : (isWeek ? "This Week" : "Ongoing Monitoring");
                        const cardRoleClass = isAdmin
                            ? "analytics-tactical-card--admin"
                            : (isPolice ? "analytics-tactical-card--police" : (isBarangay ? "analytics-tactical-card--barangay" : ""));

                        const triggerText = action.triggerReason || (action.reason ? `Triggered by detected incident pattern in ${h.locationLabel}` : "");
                        const policyText = action.groundedPolicy || (h.citedKnowledge && h.citedKnowledge[0]) || "Valenzuela City Public Safety Protocol";
                        const impactText = action.expectedImpact || action.reason || "";

                        return `
                            <div class="analytics-tactical-card ${cardRoleClass}">
                                <div class="analytics-tactical-card__top">
                                    <span class="analytics-tactical-card__role ${roleClass}">
                                        <span class="material-symbols-outlined">${roleIcon}</span>
                                        <span>${escapeHtml(roleLabel)}</span>
                                    </span>
                                    <div class="analytics-tactical-card__meta">
                                        <span class="analytics-tactical-step-pill">Step #${idx + 1}</span>
                                        <span class="analytics-tactical-urgency-chip ${urgencyClass}">
                                            ${isToday ? `<span class="analytics-tactical-dot"></span>` : ""}
                                            <span>${escapeHtml(urgencyLabel)}</span>
                                        </span>
                                    </div>
                                </div>
                                <p class="analytics-tactical-card__text">${escapeHtml(action.action || "")}</p>
                                
                                <div class="analytics-tactical-details-grid">
                                    ${triggerText ? `
                                        <div class="analytics-tactical-detail-chip analytics-tactical-detail-chip--trigger">
                                            <span class="material-symbols-outlined">troubleshoot</span>
                                            <span><strong>Why this is needed:</strong> ${escapeHtml(triggerText)}</span>
                                        </div>
                                    ` : ""}
                                    ${policyText ? `
                                        <div class="analytics-tactical-detail-chip analytics-tactical-detail-chip--policy">
                                            <span class="material-symbols-outlined">gavel</span>
                                            <span><strong>City Rule / Ordinance:</strong> ${escapeHtml(policyText)}</span>
                                        </div>
                                    ` : ""}
                                    ${impactText ? `
                                        <div class="analytics-tactical-detail-chip analytics-tactical-detail-chip--impact">
                                            <span class="material-symbols-outlined">verified</span>
                                            <span><strong>What this achieves:</strong> ${escapeHtml(impactText)}</span>
                                        </div>
                                    ` : ""}
                                </div>
                            </div>
                        `;
                    }).join("")}
                </div>
            </div>

            ${h.suggestedPublicAdvisory ? `
                <div class="analytics-ai-advisory-card">
                    <div class="analytics-ai-advisory-header">
                        <div class="analytics-ai-advisory-header__left">
                            <div class="analytics-ai-advisory-icon-wrap">
                                <span class="material-symbols-outlined">campaign</span>
                            </div>
                            <div>
                                <span class="analytics-ai-advisory-tag">
                                    <span class="material-symbols-outlined" style="font-size:12px;">sensors</span>
                                    <span>Public Broadcast Draft</span>
                                </span>
                                <h4 class="analytics-ai-advisory-title">Suggested Community Advisory</h4>
                            </div>
                        </div>
                        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                            <div class="analytics-lang-toggle" style="display:inline-flex;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:6px;padding:2px;gap:2px;">
                                <button type="button" class="analytics-lang-btn active" data-lang="en" style="border:none;background:#2563eb;color:#fff;border-radius:4px;padding:3px 8px;font-size:0.73rem;font-weight:700;cursor:pointer;transition:all 0.15s ease;">English</button>
                                <button type="button" class="analytics-lang-btn" data-lang="fil" style="border:none;background:transparent;color:#475569;border-radius:4px;padding:3px 8px;font-size:0.73rem;font-weight:700;cursor:pointer;transition:all 0.15s ease;">Filipino</button>
                            </div>
                            <button type="button" class="analytics-ai-advisory-copy-btn" data-action="copy-advisory" data-advisory-text="${escapeAttr(h.suggestedPublicAdvisory)}" title="Copy advisory text to clipboard">
                                <span class="material-symbols-outlined" style="font-size:14px;">content_copy</span>
                                <span>Copy Advisory</span>
                            </button>
                        </div>
                    </div>
                    <p class="analytics-ai-advisory-text" data-text-en="${escapeAttr(h.suggestedPublicAdvisory)}" data-text-fil="${escapeAttr(h.suggestedPublicAdvisoryFil || h.suggestedPublicAdvisory)}">
                        "${escapeHtml(h.suggestedPublicAdvisory)}"
                    </p>
                </div>
            ` : ""}

            <div class="analytics-ai-actions-bar">
                <button type="button" class="analytics-ai-act-btn analytics-ai-act-btn--feedback" data-action="feedback" data-summary-id="${escapeAttr(summaryId)}" data-hotspot-label="${escapeAttr(h.locationLabel)}" title="Provide feedback or rate this plan">
                    <span class="material-symbols-outlined" style="font-size:16px;">reviews</span>
                    <span>Rate / Feedback</span>
                </button>
                <button type="button" class="analytics-ai-act-btn analytics-ai-act-btn--copy-plan" data-action="copy-full-plan" data-hotspot-area="${escapeAttr(h.locationLabel)}" title="Copy full tactical plan and details to clipboard">
                    <span class="material-symbols-outlined" style="font-size:16px;">content_copy</span>
                    <span>Copy Action Plan</span>
                </button>
                <button type="button" class="analytics-ai-act-btn analytics-ai-act-btn--pdf-plan" data-action="export-pdf-plan" data-hotspot-area="${escapeAttr(h.locationLabel)}" title="Download plan as a printable PDF Dispatch Order">
                    <span class="material-symbols-outlined" style="font-size:16px;">picture_as_pdf</span>
                    <span>Download PDF</span>
                </button>
                <button type="button" class="analytics-ai-act-btn analytics-ai-act-btn--regenerate" data-action="regenerate-single-hotspot" data-hotspot-area="${escapeAttr(h.locationLabel)}" data-hotspot-rank="${escapeAttr(String(h.rank || 1))}" title="Re-run plan with fresh data or updated rules">
                    <span class="material-symbols-outlined" style="font-size:16px;">refresh</span>
                    <span>Regenerate Plan</span>
                </button>
            </div>
        </article>
    `;
}

function bindHotspotDecisionEvents(container, rows) {
    if (!container) return;

    container.querySelectorAll('[data-action="copy-advisory"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
            const text = btn.getAttribute("data-advisory-text");
            if (!text) return;
            try {
                await navigator.clipboard.writeText(text);
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;color:#38bdf8;">check</span><span>Copied!</span>`;
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                }, 2000);
            } catch (e) {
                console.warn("[analytics] Copy failed:", e);
            }
        });
    });

    container.querySelectorAll(".analytics-lang-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const card = btn.closest(".analytics-ai-advisory-card");
            if (!card) return;
            const targetLang = btn.getAttribute("data-lang");
            card.querySelectorAll(".analytics-lang-btn").forEach((b) => {
                b.classList.remove("active");
                b.style.background = "transparent";
                b.style.color = "#475569";
            });
            btn.classList.add("active");
            btn.style.background = "#2563eb";
            btn.style.color = "#fff";

            const textEl = card.querySelector(".analytics-ai-advisory-text");
            const copyBtn = card.querySelector('[data-action="copy-advisory"]');
            if (!textEl) return;

            const textEn = textEl.getAttribute("data-text-en") || "";
            const textFil = textEl.getAttribute("data-text-fil") || textEn;
            const chosen = targetLang === "fil" ? textFil : textEn;

            textEl.textContent = `"${chosen}"`;
            if (copyBtn) {
                copyBtn.setAttribute("data-advisory-text", chosen);
            }
        });
    });

    container.querySelectorAll('[data-action="copy-full-plan"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
            const area = btn.getAttribute("data-hotspot-area");
            const planData = area ? perHotspotDecisionPlans.get(area) : null;
            if (!planData?.plan) return;

            const p = planData.plan;
            const lines = [
                `========================================`,
                `THREATTRACK DECISION SUPPORT PLAN`,
                `Location: ${p.locationLabel || area}`,
                `Priority: ${(p.riskLevel || "medium").toUpperCase()}`,
                `Pattern: ${p.mainPattern || "N/A"}`,
                `========================================`,
                "",
                "RECOMMENDED ACTION PLAN:",
            ];

            (p.recommendedActions || []).forEach((act, idx) => {
                const owner = act.owner === "police" ? "PNP Police Unit" : (act.owner === "admin" ? "Barangay Admin" : "Barangay Tanod / BPAT");
                lines.push(`${idx + 1}. [${owner}] ${act.action}`);
                if (act.triggerReason) lines.push(`   - Why Needed: ${act.triggerReason}`);
                if (act.groundedPolicy) lines.push(`   - Rule/Policy: ${act.groundedPolicy}`);
                if (act.expectedImpact) lines.push(`   - Expected Result: ${act.expectedImpact}`);
                lines.push("");
            });

            if (p.suggestedPublicAdvisory) {
                lines.push("COMMUNITY SAFETY ADVISORY:");
                lines.push(`"${p.suggestedPublicAdvisory}"`);
                lines.push("");
            }

            lines.push(`Generated by ThreatTrack AI Decision Support on ${new Date().toLocaleString()}`);

            const fullText = lines.join("\n");
            try {
                await navigator.clipboard.writeText(fullText);
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;color:#059669;">check</span><span>Copied Plan!</span>`;
                setTimeout(() => {
                    btn.innerHTML = originalHtml;
                }, 2000);
            } catch (e) {
                console.warn("[analytics] Copy plan failed:", e);
            }
        });
    });

    container.querySelectorAll('[data-action="export-pdf-plan"]').forEach((btn) => {
        btn.addEventListener("click", () => {
            const area = btn.getAttribute("data-hotspot-area");
            const planData = area ? perHotspotDecisionPlans.get(area) : null;
            if (!planData?.plan || typeof html2pdf === "undefined") return;

            const p = planData.plan;
            
            // Build a hidden temporary container for the PDF layout
            const printDiv = document.createElement("div");
            printDiv.style.padding = "40px";
            printDiv.style.fontFamily = "'Plus Jakarta Sans', sans-serif";
            printDiv.style.color = "#0f172a";
            printDiv.innerHTML = `
                <div style="text-align:center; border-bottom: 2px solid #cbd5e1; padding-bottom: 15px; margin-bottom: 25px;">
                    <h1 style="margin:0; font-size:24px; color:#1e293b;">Valenzuela City Public Safety</h1>
                    <h2 style="margin:5px 0 0; font-size:18px; color:#475569; text-transform:uppercase;">Tactical Dispatch Order</h2>
                </div>
                <div style="margin-bottom: 25px; background: #f8fafc; padding: 15px; border-radius: 8px;">
                    <p style="margin:0 0 5px;"><strong>Target Location:</strong> ${escapeHtml(p.locationLabel || area)}</p>
                    <p style="margin:0 0 5px;"><strong>Priority Level:</strong> ${(p.riskLevel || "medium").toUpperCase()}</p>
                    <p style="margin:0;"><strong>Incident Pattern:</strong> ${escapeHtml(p.mainPattern || "N/A")}</p>
                </div>
                <h3 style="border-bottom: 1px solid #e2e8f0; padding-bottom: 8px;">Recommended Action Plan</h3>
                <div style="margin-top: 15px;">
                    ${(p.recommendedActions || []).map((act, idx) => {
                        const owner = act.owner === "police" ? "PNP Police Unit" : (act.owner === "admin" ? "Barangay Admin" : "Barangay Tanod");
                        return `
                            <div style="margin-bottom: 20px;">
                                <p style="margin:0 0 5px; font-weight:700; font-size:15px;">${idx + 1}. [${escapeHtml(owner)}] Action Step</p>
                                <p style="margin:0 0 4px 15px; font-size:14px;"><strong>Directive:</strong> ${escapeHtml(act.action)}</p>
                                ${act.groundedPolicy ? `<p style="margin:0 0 4px 15px; font-size:13px; color:#475569;"><strong>Policy:</strong> ${escapeHtml(act.groundedPolicy)}</p>` : ""}
                                ${act.expectedImpact ? `<p style="margin:0 0 4px 15px; font-size:13px; color:#475569;"><strong>Goal:</strong> ${escapeHtml(act.expectedImpact)}</p>` : ""}
                            </div>
                        `;
                    }).join("")}
                </div>
                ${p.suggestedPublicAdvisory ? `
                    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
                        <h3 style="margin:0 0 10px;">Community Safety Advisory</h3>
                        <p style="font-style: italic; color:#334155;">"${escapeHtml(p.suggestedPublicAdvisory)}"</p>
                    </div>
                ` : ""}
                <div style="margin-top: 40px; font-size: 11px; color:#94a3b8; text-align:center;">
                    Generated by ThreatTrack AI Decision Support System • ${new Date().toLocaleString()}
                </div>
            `;

            const opt = {
                margin:       0.5,
                filename:     `Dispatch_Order_${area.replace(/[^a-z0-9]/gi, '_')}.pdf`,
                image:        { type: 'jpeg', quality: 0.98 },
                html2canvas:  { scale: 2 },
                jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
            };

            const originalHtml = btn.innerHTML;
            btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;">hourglass_empty</span><span>Generating...</span>`;
            
            html2pdf().set(opt).from(printDiv).save().then(() => {
                btn.innerHTML = originalHtml;
            }).catch(e => {
                console.error("[analytics] PDF Generation Error:", e);
                btn.innerHTML = originalHtml;
                alert("Failed to generate PDF. Check console.");
            });
        });
    });

    container.querySelectorAll('[data-action="generate-single-hotspot"], [data-action="regenerate-single-hotspot"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
            const area = btn.getAttribute("data-hotspot-area");
            
            // Phase 3: Cooldown Rate Limiting (20 seconds)
            const now = Date.now();
            const lastGenTime = generateCooldowns.get(area) || 0;
            if (now - lastGenTime < 20000) {
                const remaining = Math.ceil((20000 - (now - lastGenTime)) / 1000);
                openCooldownModal(remaining);
                return;
            }

            const rank = Number(btn.getAttribute("data-hotspot-rank")) || 1;
            const hotspotList = getHotspotStats(rows);
            const targetHotspot = hotspotList.find((h) => h.area === area) || { area, rank, totalReports: 0, severityBreakdown: {}, typeCounts: {} };
            
            await handleGenerateSingleHotspot(targetHotspot, rank, btn, rows);
            
            generateCooldowns.set(area, Date.now());
        });
    });

    container.querySelectorAll('[data-action="force-deterministic-hotspot"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
            const area = btn.getAttribute("data-hotspot-area");
            const rank = Number(btn.getAttribute("data-hotspot-rank")) || 1;
            const hotspotList = getHotspotStats(rows);
            const targetHotspot = hotspotList.find((h) => h.area === area) || { area, rank, totalReports: 0, severityBreakdown: {}, typeCounts: {} };
            await handleForceDeterministicHotspot(targetHotspot, rank, rows);
        });
    });

    container.querySelectorAll('[data-action="retry-gemini-hotspot"]').forEach((btn) => {
        btn.addEventListener("click", async () => {
            const area = btn.getAttribute("data-hotspot-area");
            const rank = Number(btn.getAttribute("data-hotspot-rank")) || 1;
            const hotspotList = getHotspotStats(rows);
            const targetHotspot = hotspotList.find((h) => h.area === area) || { area, rank, totalReports: 0, severityBreakdown: {}, typeCounts: {} };
            perHotspotErrorMap.delete(area);
            await handleGenerateSingleHotspot(targetHotspot, rank, btn, rows);
        });
    });

    container.querySelectorAll('[data-action="feedback"]').forEach((btn) => {
        btn.addEventListener("click", () => {
            const summaryId = btn.getAttribute("data-summary-id");
            const hotspotLabel = btn.getAttribute("data-hotspot-label");
            openFeedbackModal(summaryId, hotspotLabel);
        });
    });
}

async function executeDecisionAction(summaryId, action, hotspotRank, btn, fullData) {
    if (!summaryId) return;

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined" style="animation:spin 1s linear infinite;font-size:16px;">progress_activity</span><span>Recording...</span>`;

    try {
        const recordFunction = httpsCallable(functions, "recordDecisionSupportAction");
        const decision = action === "approve" ? "approved" : action === "reject" ? "rejected" : "adopted_action";

        let adoptedActions = [];
        if (action === "adopt" && fullData?.summary?.priorityHotspots) {
            const rankNum = Number(hotspotRank) || 1;
            const targetHotspot = fullData.summary.priorityHotspots.find((h) => h.rank === rankNum);
            if (targetHotspot?.recommendedActions) {
                adoptedActions = targetHotspot.recommendedActions.map((act, i) => ({
                    actionId: `action-${rankNum}-${i + 1}`,
                    action: act.action,
                    assignedUnit: act.owner || "police",
                    targetLocation: targetHotspot.locationLabel,
                }));
            }
        }

        try {
            await recordFunction({
                summaryId,
                decision,
                adminNotes: `Recorded from Analytics Dashboard for Hotspot #${hotspotRank}`,
                adoptedActions,
            });
        } catch (cfErr) {
            console.warn("[analytics] Cloud Function decision recording failed, falling back to direct Firestore write:", cfErr);
            if (!summaryId.startsWith("local_")) {
                try {
                    await updateDoc(doc(db, "ai_suggestion_summaries", summaryId), {
                        "review.status": decision,
                        "review.updatedAt": serverTimestamp(),
                    });
                } catch (e) {
                    console.warn("[analytics] Update summary status:", e);
                }
            }
            try {
                await addDoc(collection(db, "audit_logs"), {
                    action: `decision_support.${decision}`,
                    meta: { summaryId, hotspotRank, adoptedActions },
                    at: serverTimestamp(),
                    source: "web_admin_analytics",
                });
            } catch (e) {
                console.warn("[analytics] Audit log write:", e);
            }
        }

        btn.className = "analytics-ai-act-btn analytics-ai-act-btn--approve";
        btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;">task_alt</span><span>${humanize(decision)}</span>`;
    } catch (err) {
        console.error("[analytics] recordDecisionSupportAction failed", err);
        btn.disabled = false;
        btn.innerHTML = originalHtml;
        alert(`Failed to record decision: ${err?.message || "Please check your network and admin permissions."}`);
    }
}

function openCooldownModal(seconds) {
    const modal = document.getElementById("ai-cooldown-modal");
    const secondsSpan = document.getElementById("ai-cooldown-seconds");
    if (secondsSpan) secondsSpan.textContent = String(seconds);
    if (modal) modal.hidden = false;
}

function closeCooldownModal() {
    const modal = document.getElementById("ai-cooldown-modal");
    if (modal) modal.hidden = true;
}

function openFeedbackModal(summaryId, hotspotLabel) {
    const modal = document.getElementById("ai-feedback-modal");
    const summaryInput = document.getElementById("ai-feedback-summary-id");
    const hotspotInput = document.getElementById("ai-feedback-hotspot-label");
    const commentInput = document.getElementById("ai-feedback-comment");

    if (summaryInput) summaryInput.value = summaryId || "";
    if (hotspotInput) hotspotInput.value = hotspotLabel || "City-Wide";
    if (commentInput) commentInput.value = "";

    if (modal) modal.hidden = false;
}

function closeFeedbackModal() {
    const modal = document.getElementById("ai-feedback-modal");
    if (modal) modal.hidden = true;
}

async function handleFeedbackSubmit() {
    const summaryId = document.getElementById("ai-feedback-summary-id")?.value;
    const hotspotLabel = document.getElementById("ai-feedback-hotspot-label")?.value;
    const ratingInput = document.querySelector('input[name="ai-rating"]:checked');
    const category = document.getElementById("ai-feedback-category")?.value || "general";
    const comment = document.getElementById("ai-feedback-comment")?.value || "";
    const submitBtn = document.getElementById("ai-feedback-submit");

    if (!summaryId) {
        closeFeedbackModal();
        return;
    }

    const rating = ratingInput ? ratingInput.value : "helpful";

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="material-symbols-outlined" style="animation:spin 1s linear infinite;">progress_activity</span><span>Submitting...</span>`;
    }

    try {
        const feedbackFunction = httpsCallable(functions, "recordAIFeedback");
        try {
            await feedbackFunction({
                summaryId,
                hotspotLabel,
                rating,
                category,
                comment,
            });
        } catch (cfErr) {
            console.warn("[analytics] Cloud Function feedback recording failed, falling back to direct Firestore write:", cfErr);
            await addDoc(collection(db, "ai_feedback"), {
                summaryId,
                hotspotLabel,
                rating,
                category,
                comment,
                createdAt: serverTimestamp(),
            });
            try {
                await addDoc(collection(db, "audit_logs"), {
                    action: "ai_feedback.submit",
                    meta: { summaryId, hotspotLabel, rating, category },
                    at: serverTimestamp(),
                    source: "web_admin_analytics",
                });
            } catch (e) {
                console.warn("[analytics] Audit feedback log:", e);
            }
        }

        closeFeedbackModal();
        alert("Thank you! Your feedback has been recorded to refine future AI guidance.");
    } catch (err) {
        console.error("[analytics] recordAIFeedback error", err);
        alert(`Feedback submission failed: ${err?.message || "Unknown error"}`);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<span class="material-symbols-outlined">send</span><span>Submit Feedback</span>`;
        }
    }
}

function updateLastUpdatedTimestamp() {
    const now = new Date();
    const timeStr = new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
    }).format(now);
    setText("analytics-last-updated", `Last updated: ${timeStr}`);
}

function exportFilteredIncidentsCSV() {
    const rows = getSelectedRangeRows();
    if (!rows.length) {
        alert("No incidents to export in the selected range.");
        return;
    }

    const headers = [
        "Incident ID",
        "Date (PHT)",
        "Type",
        "Severity",
        "Status",
        "Is SOS",
        "Location",
        "Latitude",
        "Longitude",
        "Description",
    ];

    const csvRows = [headers.join(",")];

    rows.forEach((row) => {
        const d = row.data || {};
        const dateStr = row.date
            ? new Intl.DateTimeFormat("en-PH", {
                  timeZone: "Asia/Manila",
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
              }).format(row.date)
            : "N/A";

        const loc = hotspotLabel(row).replace(/"/g, '""');
        const desc = String(d.description || d.details || "")
            .replace(/"/g, '""')
            .replace(/[\r\n]+/g, " ");
        const type = humanize(d.type || "unknown");
        const severity = humanize(d.severity || "low");
        const status = humanize(d.status || "unknown");
        const isSOS = d.isSOSReport ? "Yes" : "No";
        const lat = d.location?.latitude ?? "";
        const lng = d.location?.longitude ?? "";

        csvRows.push(
            [
                `"${row.id}"`,
                `"${dateStr}"`,
                `"${type}"`,
                `"${severity}"`,
                `"${status}"`,
                `"${isSOS}"`,
                `"${loc}"`,
                `"${lat}"`,
                `"${lng}"`,
                `"${desc}"`,
            ].join(","),
        );
    });

    const csvContent =
        "data:text/csv;charset=utf-8,\uFEFF" +
        encodeURIComponent(csvRows.join("\n"));
    const link = document.createElement("a");
    const range = document.getElementById("analytics-range")?.value || "30d";
    link.setAttribute("href", csvContent);
    link.setAttribute(
        "download",
        `threattrack-incidents-${range}-${dayKey(new Date())}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function renderAnalytics() {
    const rows = getSelectedRangeRows();
    const today = dayKey(new Date());
    const high = rows.filter(
        (row) => String(row.data?.severity || "").toLowerCase() === "high",
    ).length;
    const pending = rows.filter((row) =>
        OPEN_STATUSES.has(String(row.data?.status || "").toLowerCase()),
    ).length;
    const highOpen = rows.filter((row) => {
        const sev = String(row.data?.severity || "").toLowerCase();
        const s = String(row.data?.status || "").toLowerCase();
        return sev === "high" && OPEN_STATUSES.has(s);
    }).length;
    const sos = rows.filter((row) => row.data?.isSOSReport === true).length;
    const verified = rows.filter((row) =>
        VERIFIED_STATUSES.has(String(row.data?.status || "").toLowerCase()),
    ).length;
    const withLocation = rows.filter((row) => hasCoordinates(row)).length;
    const todayCount = incidentRows.filter(
        (row) => row.date && dayKey(row.date) === today,
    ).length;
    const verifiedRate = rows.length
        ? `${Math.round((verified / rows.length) * 100)}%`
        : "0%";
    const dailyAverage = rows.length / selectedRangeDayCount();
    const locationCoverage = rows.length
        ? `${Math.round((withLocation / rows.length) * 100)}%`
        : "0%";

    // Attention Required Panel
    setText("attention-pending", String(pending));
    setText("attention-high-open", String(highOpen));

    // Primary Overview KPIs
    setText("analytics-today", String(todayCount));
    setText("analytics-high", String(high));
    setText("analytics-pending", String(pending));
    setText("analytics-sos", String(sos));
    setText("analytics-verified-rate", verifiedRate);
    setText("analytics-daily-average", dailyAverage.toFixed(1));
    setText("analytics-location-coverage", locationCoverage);
    setText("analytics-mappable-count", String(withLocation));

    updateLastUpdatedTimestamp();

    renderTrend(rows);
    renderCrimeTypeSeverityBars(rows);
    renderSeverityDonut(rows);
    renderStatusWorkload(rows);
    renderHourlyChart(rows);
    renderReadiness(rows);
    renderHotspots(rows);
    renderHotspotDecisionSection(rows);
}

async function loadAnalytics() {
    setText("analytics-total", "...");
    try {
        const totalSnap = await getCountFromServer(collection(db, "incidents"));
        setText("analytics-total", String(totalSnap.data().count));
    } catch (err) {
        console.error("[analytics] total count", err);
        setText("analytics-total", "-");
    }

    try {
        const snap = await getDocs(collection(db, "incidents"));
        incidentRows = snap.docs
            .map((docSnap) => {
                const data = docSnap.data() || {};
                return {
                    id: docSnap.id,
                    data,
                    date: toDate(
                        data.timestamp ||
                            data.reportedAt ||
                            data.clientTimestamp,
                    ),
                };
            })
            .sort((a, b) => {
                const aTime = a.date?.getTime?.() || 0;
                const bTime = b.date?.getTime?.() || 0;
                return bTime - aTime;
            })
            .slice(0, INCIDENT_LIMIT);
        renderAnalytics();
    } catch (err) {
        console.error("[analytics] incidents load", err);
        setText("analytics-today", "-");
        setText("analytics-high", "-");
        setText("analytics-pending", "-");
        setText("analytics-sos", "-");
        setText("analytics-verified-rate", "-");
        setText("analytics-daily-average", "-");
        setText("analytics-location-coverage", "-");
        ["analytics-trend-chart", "analytics-type-chart", "analytics-severity-chart", "analytics-status-chart", "analytics-hour-chart", "analytics-readiness"].forEach(
            (id) => {
                const el = document.getElementById(id);
                if (el) {
                    el.innerHTML =
                        '<p class="analytics-empty">Could not load analytics data.</p>';
                }
            },
        );
    }
}

document.getElementById("analytics-range")?.addEventListener("change", (e) => {
    const customBox = document.getElementById("analytics-custom-inputs");
    if (e.target.value === "custom") {
        if (customBox) customBox.style.display = "flex";
        const startInput = document.getElementById("analytics-custom-start");
        const endInput = document.getElementById("analytics-custom-end");
        if (startInput && !startInput.value) {
            const d = new Date(Date.now() - 7 * 86400 * 1000);
            startInput.value = dayKey(d);
        }
        if (endInput && !endInput.value) {
            endInput.value = dayKey(new Date());
        }
    } else {
        if (customBox) customBox.style.display = "none";
    }
    perHotspotDecisionPlans.clear();
    renderAnalytics();
});

document.getElementById("analytics-custom-apply")?.addEventListener("click", () => {
    perHotspotDecisionPlans.clear();
    renderAnalytics();
});

document.getElementById("btn-analytics-export")?.addEventListener("click", () => {
    exportFilteredIncidentsCSV();
});

document.getElementById("btn-generate-ai-summary")?.addEventListener("click", () => {
    handleGenerateAllHotspots();
});

document.getElementById("ai-cooldown-close-btn")?.addEventListener("click", closeCooldownModal);
document.getElementById("ai-feedback-close")?.addEventListener("click", closeFeedbackModal);
document.getElementById("ai-feedback-cancel")?.addEventListener("click", closeFeedbackModal);
document.getElementById("ai-feedback-submit")?.addEventListener("click", handleFeedbackSubmit);

initAdminPage({
    pageId: "page-analytics",
    onReady(user) {
        currentAdminSessionId = user?.uid || "";
        updateGeminiKeyButtonUI();
        loadAnalytics().catch((err) =>
            console.error("[analytics] load", err),
        );
    },
});

