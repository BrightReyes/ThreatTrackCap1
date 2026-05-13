import {
    collection,
    doc,
    getDocs,
    limit,
    query,
    serverTimestamp,
    writeBatch,
} from "firebase/firestore";
import { auth, db } from "../../shared/firebase.js";
import { initAdminPage } from "./admin-auth.js";
import { initAdminCustomSelects } from "./admin-custom-select.js";
import { toastError, toastSuccess } from "./alerts.js";
import { logAudit } from "./audit.js";

const NOTIFICATION_LIMIT = 450;
const DESCRIPTION_MIN_LENGTH = 10;
const DESCRIPTION_MAX_LENGTH = 2000;
const GEOCODE_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const VALENZUELA_VIEWBOX = "120.94,14.76,121.04,14.63";
const VALENZUELA_BOUNDS = {
    south: 14.63,
    north: 14.76,
    west: 120.94,
    east: 121.04,
};

const INCIDENT_TYPES = {
    robbery_holdup: { label: "Robbery / Hold-up", severity: "high" },
    physical_assault_injury: {
        label: "Physical Assault / Injury",
        severity: "high",
    },
    domestic_violence: { label: "Domestic Violence", severity: "high" },
    traffic_accident: { label: "Traffic Accident", severity: "high" },
    illegal_weapons: { label: "Illegal Weapons", severity: "high" },
    drug_related_activity: {
        label: "Drug-Related Activity",
        severity: "medium",
    },
    public_disturbance: { label: "Public Disturbance", severity: "medium" },
    suspicious_activity: {
        label: "Suspicious Activity / Persons",
        severity: "medium",
    },
    theft_snatching: { label: "Theft / Snatching", severity: "medium" },
    vandalism_property_damage: {
        label: "Vandalism / Property Damage",
        severity: "low",
    },
};

const geocodeCache = new Map();

function setFeedback(message, state = "") {
    const feedback = document.getElementById("operation-feedback");
    if (!feedback) return;
    feedback.textContent = message;
    feedback.classList.toggle("is-error", state === "error");
    feedback.classList.toggle("is-success", state === "success");
}

function setLocationResult(message, state = "") {
    const result = document.getElementById("operation-location-result");
    if (!result) return;
    result.textContent = message;
    result.classList.toggle("is-resolved", state === "resolved");
    result.classList.toggle("is-error", state === "error");
}

function normalizeRole(role) {
    const value = String(role || "user").toLowerCase();
    return value === "moderator" ? "admin" : value;
}

function isEligibleAppUser(docSnap) {
    const data = docSnap.data() || {};
    const role = normalizeRole(data.role || "user");
    const status = String(data.status || "active").toLowerCase();
    return (
        role === "user" &&
        status === "active" &&
        data.disabled !== true &&
        data.suspended !== true &&
        docSnap.id !== auth.currentUser?.uid
    );
}

async function getEligibleUsers() {
    const snap = await getDocs(
        query(collection(db, "users"), limit(NOTIFICATION_LIMIT)),
    );
    return snap.docs.filter(isEligibleAppUser);
}

function getTypeLabel(type) {
    return INCIDENT_TYPES[type]?.label || "Incident";
}

function getSeverityFromType(type) {
    return INCIDENT_TYPES[type]?.severity || "medium";
}

function humanizeSeverity(severity) {
    return String(severity || "medium")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

function updateSeverityPreview(type) {
    const severity = type ? getSeverityFromType(type) : "";
    const severityInput = document.getElementById("operation-severity");
    const severityPill = document.getElementById("operation-severity-pill");
    const notificationHint = document.getElementById("operation-notification-hint");
    const submitText = document.getElementById("operation-submit-text");

    if (severityInput) {
        severityInput.value = severity ? humanizeSeverity(severity) : "Select type";
        severityInput.dataset.severity = severity;
    }

    if (severityPill) {
        severityPill.textContent = severity
            ? `${humanizeSeverity(severity)} severity`
            : "Auto severity";
        severityPill.dataset.severity = severity || "none";
    }

    if (notificationHint) {
        notificationHint.textContent =
            severity === "high"
                ? "High severity reports notify active app users."
                : "Medium and low severity reports are added to incidents and heatmap only.";
    }

    if (submitText) {
        submitText.textContent = severity === "high" ? "Publish Alert" : "Add Report";
    }
}

function normalizeAddressForGeocode(address) {
    const value = String(address || "").trim();
    if (!value) return "";
    if (/valenzuela/i.test(value)) return value;
    return `${value}, Valenzuela City, Metro Manila, Philippines`;
}

function isWithinValenzuelaBounds(latitude, longitude) {
    return (
        latitude >= VALENZUELA_BOUNDS.south &&
        latitude <= VALENZUELA_BOUNDS.north &&
        longitude >= VALENZUELA_BOUNDS.west &&
        longitude <= VALENZUELA_BOUNDS.east
    );
}

async function geocodeAddress(address) {
    const queryText = normalizeAddressForGeocode(address);
    if (!queryText) {
        throw new Error("Address is required.");
    }

    const cacheKey = queryText.toLowerCase();
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

    const params = new URLSearchParams({
        format: "jsonv2",
        q: queryText,
        limit: "1",
        countrycodes: "ph",
        addressdetails: "1",
        viewbox: VALENZUELA_VIEWBOX,
        bounded: "0",
    });

    const response = await fetch(`${GEOCODE_ENDPOINT}?${params.toString()}`, {
        headers: {
            Accept: "application/json",
        },
    });

    if (!response.ok) {
        throw new Error("Could not look up that address right now.");
    }

    const results = await response.json();
    const first = Array.isArray(results) ? results[0] : null;
    const latitude = Number(first?.lat);
    const longitude = Number(first?.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error("Address not found. Add a street or barangay in Valenzuela City.");
    }

    if (!isWithinValenzuelaBounds(latitude, longitude)) {
        throw new Error("Address was not matched inside Valenzuela City.");
    }

    const resolved = {
        latitude,
        longitude,
        address: first.display_name || queryText,
    };

    geocodeCache.set(cacheKey, resolved);
    return resolved;
}

function validateForm(form) {
    const type = String(form.elements.type?.value || "").trim();
    const description = String(form.elements.description?.value || "").trim();
    const address = String(form.elements.address?.value || "").trim();

    if (!type || !INCIDENT_TYPES[type]) {
        return { error: "Select a valid incident type." };
    }

    const severity = getSeverityFromType(type);

    if (description.length < DESCRIPTION_MIN_LENGTH) {
        return {
            error: `Description must be at least ${DESCRIPTION_MIN_LENGTH} characters.`,
        };
    }

    if (description.length > DESCRIPTION_MAX_LENGTH) {
        return {
            error: `Description must be under ${DESCRIPTION_MAX_LENGTH} characters.`,
        };
    }

    if (address.length < 6) {
        return { error: "Enter a specific address or barangay." };
    }

    return {
        data: {
            type,
            typeLabel: getTypeLabel(type),
            severity,
            description,
            address,
        },
    };
}

function buildNotificationBody(data) {
    const addressText = data.address ? ` Location: ${data.address}.` : "";
    return `${data.typeLabel}: ${data.description}${addressText}`;
}

async function publishOperationReport(data) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error("You must be signed in to add a report.");
    }

    const incidentRef = doc(collection(db, "incidents"));
    const shouldNotifyUsers = data.severity === "high";
    const usersToNotify = shouldNotifyUsers ? await getEligibleUsers() : [];
    const createdAtIso = new Date().toISOString();
    const location = {
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
    };
    const incidentPayload = {
        type: data.type,
        typeLabel: data.typeLabel,
        severity: data.severity,
        priority: shouldNotifyUsers ? "high" : "normal",
        reportingAs: "police_station",
        description: data.description,
        location,
        status: "under_review",
        timestamp: serverTimestamp(),
        reportedAt: serverTimestamp(),
        clientTimestamp: createdAtIso,
        source: "police_admin",
        createdFrom: "admin_operation",
        isAdminGenerated: true,
        createdBy: currentUser.uid,
        createdByEmail: currentUser.email || null,
        notificationAudience: shouldNotifyUsers ? "active_app_users" : "none",
    };

    const batch = writeBatch(db);
    batch.set(incidentRef, incidentPayload);

    usersToNotify.forEach((userDoc) => {
        const notificationRef = doc(collection(db, "notifications"));
        batch.set(notificationRef, {
            userId: userDoc.id,
            incidentId: incidentRef.id,
            title: "Urgent police alert",
            body: buildNotificationBody(data),
            type: "police_urgent_report",
            severity: data.severity,
            priority: "high",
            read: false,
            readAt: null,
            sentAt: serverTimestamp(),
            timestamp: serverTimestamp(),
            audience: "user",
            source: "police_admin",
            createdBy: currentUser.uid,
            reportType: data.type,
            location,
        });
    });

    await batch.commit();

    await logAudit("operation.report_created", {
        incidentId: incidentRef.id,
        type: data.type,
        severity: data.severity,
        notificationsCreated: usersToNotify.length,
    });

    return {
        incidentId: incidentRef.id,
        notificationsCreated: usersToNotify.length,
    };
}

function bindOperationForm() {
    const form = document.getElementById("operation-report-form");
    const submit = document.getElementById("operation-submit");
    const typeSelect = document.getElementById("operation-type");
    const addressInput = document.getElementById("operation-address");
    if (!form) return;

    updateSeverityPreview(typeSelect?.value || "");
    typeSelect?.addEventListener("change", () => {
        updateSeverityPreview(typeSelect.value);
    });

    addressInput?.addEventListener("input", () => {
        setLocationResult(
            "Coordinates will be resolved from the address when the report is submitted.",
        );
    });

    addressInput?.addEventListener("blur", async () => {
        const address = String(addressInput.value || "").trim();
        if (address.length < 6) return;
        setLocationResult("Resolving address...");
        try {
            const resolved = await geocodeAddress(address);
            setLocationResult(
                `Resolved: ${resolved.latitude.toFixed(5)}, ${resolved.longitude.toFixed(5)}`,
                "resolved",
            );
        } catch (err) {
            setLocationResult(err?.message || "Could not resolve address.", "error");
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const result = validateForm(form);
        if (result.error) {
            setFeedback(result.error, "error");
            toastError(result.error);
            return;
        }

        if (submit) submit.disabled = true;
        const willNotify = result.data.severity === "high";
        setFeedback(
            willNotify
                ? "Resolving address, then creating notifications..."
                : "Resolving address, then adding report to heatmap...",
        );
        setLocationResult("Resolving address...");

        try {
            const resolvedLocation = await geocodeAddress(result.data.address);
            const reportData = {
                ...result.data,
                latitude: resolvedLocation.latitude,
                longitude: resolvedLocation.longitude,
                address: resolvedLocation.address || result.data.address,
            };
            setLocationResult(
                `Resolved: ${resolvedLocation.latitude.toFixed(5)}, ${resolvedLocation.longitude.toFixed(5)}`,
                "resolved",
            );
            const published = await publishOperationReport(reportData);
            form.reset();
            updateSeverityPreview("");
            setLocationResult(
                "Coordinates will be resolved from the address when the report is submitted.",
            );
            setFeedback(
                published.notificationsCreated > 0
                    ? `Published. ${published.notificationsCreated} user notification${published.notificationsCreated === 1 ? "" : "s"} created.`
                    : "Report added. No user notification was sent because severity is not high.",
                "success",
            );
            toastSuccess(
                published.notificationsCreated > 0
                    ? "Urgent report published"
                    : "Report added",
            );
        } catch (err) {
            console.error("[operation] publish", err);
            const message = err?.message || "Failed to add operation report.";
            setFeedback(message, "error");
            toastError(message);
        } finally {
            if (submit) submit.disabled = false;
        }
    });
}

initAdminPage({
    pageId: "page-operation",
    requirePolice: true,
    onReady() {
        initAdminCustomSelects(document.getElementById("page-operation"));
        bindOperationForm();
    },
});
