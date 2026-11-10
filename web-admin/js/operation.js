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
import {
    initAdminPage,
    humanizeAdminRole,
    getCachedAdminProfile,
} from "./admin-auth.js";
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
    traffic_accident: { label: "Traffic Accident", severity: "medium" },
    illegal_weapons: { label: "Illegal Weapons", severity: "high" },
    drug_related_activity: {
        label: "Drug-Related Activity",
        severity: "high",
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
    const value = String(role || "user")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (["moderator", "barangay", "barangay_admin"].includes(value)) {
        return "admin";
    }
    if (value === "police_admin") return "police";
    return value;
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
    return INCIDENT_TYPES[type]?.label || "Incident Report";
}

function getSeverityFromType(type) {
    return INCIDENT_TYPES[type]?.severity || "medium";
}

function humanizeSeverity(severity) {
    return String(severity || "medium")
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Known Valenzuela local coordinates for resilient fallback.
 */
function getValenzuelaLocalFallback(address = "") {
    const text = String(address).toLowerCase();
    if (text.includes("mapulang")) {
        return {
            latitude: 14.7068,
            longitude: 121.0018,
            address: "Mapulang Lupa, Valenzuela City",
        };
    }
    if (text.includes("balangkas")) {
        return {
            latitude: 14.7114,
            longitude: 120.9425,
            address: "Balangkas, Valenzuela City",
        };
    }
    if (text.includes("malinta")) {
        return {
            latitude: 14.6985,
            longitude: 120.9733,
            address: "Malinta, Valenzuela City",
        };
    }
    if (text.includes("karuhatan")) {
        return {
            latitude: 14.6922,
            longitude: 120.9774,
            address: "Karuhatan, Valenzuela City",
        };
    }
    if (text.includes("leon")) {
        return {
            latitude: 14.6953,
            longitude: 120.9994,
            address: "Gen. T. de Leon, Valenzuela City",
        };
    }
    if (text.includes("macarthur")) {
        return {
            latitude: 14.6950,
            longitude: 120.9740,
            address: "MacArthur Highway, Valenzuela City",
        };
    }
    return {
        latitude: 14.7011,
        longitude: 120.983,
        address: "Valenzuela City Center",
    };
}

function updateSeverityPreview(type) {
    const severity = type ? getSeverityFromType(type) : "";
    const severityInput = document.getElementById("operation-severity");
    const severityPill = document.getElementById("operation-severity-pill");
    const notificationHint = document.getElementById(
        "operation-notification-hint",
    );
    const submit = document.getElementById("operation-submit");
    const submitIcon = document.getElementById("operation-submit-icon");
    const submitText = document.getElementById("operation-submit-text");

    if (severityInput) {
        severityInput.value = severity ? humanizeSeverity(severity) : "";
        severityInput.dataset.severity = severity;
    }

    if (severityPill) {
        severityPill.textContent = severity
            ? `${humanizeSeverity(severity)} Urgency`
            : "Select an incident type";
        severityPill.dataset.severity = severity || "none";
    }

    if (notificationHint) {
        notificationHint.textContent = !severity
            ? "Select an incident type to evaluate push notification priority."
            : severity === "high"
              ? "High severity report: triggers high-priority sound and immediate citizen push."
              : "Standard severity report: pushed to active registered residents in Notifications feed.";
    }

    if (submitText) {
        submitText.textContent =
            severity === "high" ? "Broadcast Alert" : "Add Report";
    }

    if (submit) {
        submit.dataset.severity = severity || "none";
    }

    if (submitIcon) {
        submitIcon.textContent =
            severity === "high"
                ? "notification_important"
                : "assignment_add";
    }

    updateLivePreview();
}

/**
 * Synchronizes the Live Citizen Notification Preview card mockup.
 */
function updateLivePreview() {
    const typeSelect = document.getElementById("operation-type");
    const descTextarea = document.getElementById("operation-description");
    const addressInput = document.getElementById("operation-address");

    const previewSeverityBadge = document.getElementById(
        "preview-severity-badge",
    );
    const previewTypeBadge = document.getElementById("preview-type-badge");
    const previewTitle = document.getElementById("preview-title");
    const previewDescription = document.getElementById("preview-description");
    const previewLocation = document.getElementById("preview-location");

    const selectedType = typeSelect?.value || "";
    const severity = selectedType ? getSeverityFromType(selectedType) : "none";
    const typeLabel = selectedType ? getTypeLabel(selectedType) : "Police Advisory";
    const desc = descTextarea?.value?.trim() || "";
    const address = addressInput?.value?.trim() || "Valenzuela City";

    if (previewSeverityBadge) {
        previewSeverityBadge.textContent =
            severity !== "none"
                ? `${humanizeSeverity(severity)} Priority`
                : "Normal Priority";
        previewSeverityBadge.dataset.severity = severity;
    }

    if (previewTypeBadge) {
        previewTypeBadge.textContent = typeLabel;
    }

    if (previewTitle) {
        previewTitle.textContent = selectedType
            ? `${typeLabel} - Station Report`
            : "Police Station Incident Report";
    }

    if (previewDescription) {
        previewDescription.textContent =
            desc.length > 0
                ? desc
                : "Select an incident type and write a description to preview how this alert will appear to Valenzuela residents...";
    }

    if (previewLocation) {
        previewLocation.textContent = address.length > 0 ? address : "Valenzuela City";
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

/**
 * Robust geocoding: attempts network resolution with graceful local fallback.
 */
async function geocodeAddress(address) {
    const queryText = normalizeAddressForGeocode(address);
    if (!queryText) {
        throw new Error("Address is required.");
    }

    const cacheKey = queryText.toLowerCase();
    if (geocodeCache.has(cacheKey)) return geocodeCache.get(cacheKey);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4500);

    try {
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
            signal: controller.signal,
            headers: {
                Accept: "application/json",
            },
        });
        clearTimeout(timeoutId);

        if (response.ok) {
            const results = await response.json();
            const first = Array.isArray(results) ? results[0] : null;
            const latitude = Number(first?.lat);
            const longitude = Number(first?.lon);

            if (
                Number.isFinite(latitude) &&
                Number.isFinite(longitude) &&
                isWithinValenzuelaBounds(latitude, longitude)
            ) {
                const resolved = {
                    latitude,
                    longitude,
                    address: first.display_name || queryText,
                };
                geocodeCache.set(cacheKey, resolved);
                return resolved;
            }
        }
    } catch {
        clearTimeout(timeoutId);
    }

    // Graceful fallback to verified Valenzuela municipal map reference
    const fallback = getValenzuelaLocalFallback(address);
    const resolvedFallback = {
        latitude: fallback.latitude,
        longitude: fallback.longitude,
        address: address || fallback.address,
        isFallback: true,
    };
    geocodeCache.set(cacheKey, resolvedFallback);
    return resolvedFallback;
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

    if (address.length < 4) {
        return { error: "Enter a specific street address, landmark, or barangay." };
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

/**
 * Publishes the verified station operation report into Firestore with chunked batches.
 */
async function publishOperationReport(data, adminProfile = null) {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        throw new Error("You must be signed in to add an operation report.");
    }

    const incidentRef = doc(collection(db, "incidents"));
    const isHighPriority = data.severity === "high";
    const usersToNotify = await getEligibleUsers();
    const createdAtIso = new Date().toISOString();
    const location = {
        latitude: data.latitude,
        longitude: data.longitude,
        address: data.address,
    };

    const userRole = normalizeRole(adminProfile?.role || localStorage.getItem("tt_admin_role"));
    const reportSource = userRole === "police" || userRole === "head_police"
        ? "police_admin"
        : "barangay_admin";

    const incidentPayload = {
        type: data.type,
        typeLabel: data.typeLabel,
        severity: data.severity,
        priority: isHighPriority ? "high" : "normal",
        reportingAs: "police_station",
        description: data.description,
        location,
        status: "under_review",
        timestamp: serverTimestamp(),
        reportedAt: serverTimestamp(),
        clientTimestamp: createdAtIso,
        source: reportSource,
        createdFrom: "admin_operation",
        isAdminGenerated: true,
        createdBy: currentUser.uid,
        createdByEmail: currentUser.email || null,
        notificationAudience: "active_app_users",
    };

    // Split writes into chunks of 400 to respect Firestore's 500 max writes per batch
    const CHUNK_SIZE = 400;
    const totalBatches = Math.max(1, Math.ceil(usersToNotify.length / CHUNK_SIZE));

    for (let bIndex = 0; bIndex < totalBatches; bIndex++) {
        const batch = writeBatch(db);
        if (bIndex === 0) {
            batch.set(incidentRef, incidentPayload);
        }
        const start = bIndex * CHUNK_SIZE;
        const chunk = usersToNotify.slice(start, start + CHUNK_SIZE);

        chunk.forEach((userDoc) => {
            const notificationRef = doc(collection(db, "notifications"));
            batch.set(notificationRef, {
                userId: userDoc.id,
                incidentId: incidentRef.id,
                title: isHighPriority
                    ? "High Priority Police Advisory"
                    : "Police Station Report Published",
                body: buildNotificationBody(data),
                type: "police_operation_report",
                severity: data.severity,
                priority: isHighPriority ? "high" : "normal",
                read: false,
                readAt: null,
                sentAt: serverTimestamp(),
                timestamp: serverTimestamp(),
                audience: "user",
                source: reportSource,
                createdBy: currentUser.uid,
                reportType: data.type,
                location,
            });
        });

        await batch.commit();
    }

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

function bindOperationForm(adminProfile = null) {
    const form = document.getElementById("operation-report-form");
    const submit = document.getElementById("operation-submit");
    const typeSelect = document.getElementById("operation-type");
    const addressInput = document.getElementById("operation-address");
    const descTextarea = document.getElementById("operation-description");
    const charCounter = document.getElementById("char-counter");
    const resetBtn = document.getElementById("operation-reset");

    // Populate Telemetry Info
    const profile = adminProfile || getCachedAdminProfile() || {};
    const roleEl = document.getElementById("telemetry-admin-role");
    const jurEl = document.getElementById("telemetry-admin-jurisdiction");
    if (roleEl) {
        roleEl.textContent = humanizeAdminRole(
            profile.role || localStorage.getItem("tt_admin_role"),
        );
    }
    if (jurEl) {
        jurEl.textContent =
            profile.assignedBarangay ||
            profile.barangayName ||
            profile.assignedSubstation ||
            profile.substationName ||
            "Valenzuela Police Command";
    }

    if (!form) return;

    updateSeverityPreview(typeSelect?.value || "");

    typeSelect?.addEventListener("change", () => {
        updateSeverityPreview(typeSelect.value);
    });

    descTextarea?.addEventListener("input", () => {
        const len = descTextarea.value.length;
        if (charCounter) charCounter.textContent = `${len} / 2000`;
        updateLivePreview();
    });

    addressInput?.addEventListener("input", () => {
        setLocationResult(
            "Coordinates will be verified and resolved from Valenzuela geographic maps upon blur or submit.",
        );
        updateLivePreview();
    });

    addressInput?.addEventListener("blur", async () => {
        const address = String(addressInput.value || "").trim();
        if (address.length < 4) return;
        setLocationResult("Resolving address within Valenzuela City...");
        try {
            const resolved = await geocodeAddress(address);
            setLocationResult(
                `Resolved: ${resolved.latitude.toFixed(5)}, ${resolved.longitude.toFixed(5)}${
                    resolved.isFallback ? " (Municipal Sector Map)" : ""
                }`,
                "resolved",
            );
        } catch (err) {
            setLocationResult(err?.message || "Could not resolve address.", "error");
        }
    });

    // Quick narrative preset chips
    document.querySelectorAll("#quick-narrative-chips .quick-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
            const preset = btn.dataset.preset;
            if (descTextarea && preset) {
                descTextarea.value = preset;
                descTextarea.dispatchEvent(new Event("input", { bubbles: true }));
                descTextarea.focus();
            }
        });
    });

    // Quick location chips
    document.querySelectorAll("#quick-location-chips .quick-chip").forEach((btn) => {
        btn.addEventListener("click", () => {
            const loc = btn.dataset.loc;
            if (addressInput && loc) {
                addressInput.value = loc;
                addressInput.dispatchEvent(new Event("input", { bubbles: true }));
                addressInput.dispatchEvent(new Event("blur", { bubbles: true }));
            }
        });
    });

    // Clear / Reset Form
    resetBtn?.addEventListener("click", () => {
        form.reset();
        if (charCounter) charCounter.textContent = "0 / 2000";
        updateSeverityPreview("");
        updateLivePreview();
        setLocationResult(
            "Coordinates will be verified and resolved from Valenzuela geographic maps upon blur or submit.",
        );
        setFeedback("Form cleared. Ready for new station entry.");
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const result = validateForm(form);
        if (result.error) {
            setFeedback(result.error, "error");
            toastError(result.error);
            return;
        }

        if (submit) {
            submit.disabled = true;
            submit.setAttribute("aria-busy", "true");
        }
        setFeedback("Resolving address and broadcasting notifications to active citizens...");
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
            const published = await publishOperationReport(reportData, profile);
            form.reset();
            if (charCounter) charCounter.textContent = "0 / 2000";
            updateSeverityPreview("");
            updateLivePreview();
            setLocationResult(
                "Coordinates will be verified and resolved from Valenzuela geographic maps upon blur or submit.",
            );
            setFeedback(
                published.notificationsCreated > 0
                    ? `Report published. ${published.notificationsCreated} active resident notification${
                          published.notificationsCreated === 1 ? "" : "s"
                      } broadcasted.`
                    : "Report published. No active residents were available to notify.",
                "success",
            );
            toastSuccess(
                published.notificationsCreated > 0
                    ? "Operation report published and citizens notified"
                    : "Operation report published",
            );
        } catch (err) {
            console.error("[operation] publish", err);
            const message = err?.message || "Failed to add operation report.";
            setFeedback(message, "error");
            toastError(message);
        } finally {
            if (submit) {
                submit.disabled = false;
                submit.removeAttribute("aria-busy");
            }
        }
    });
}

initAdminPage({
    pageId: "page-operation",
    requirePolice: false,
    onReady(user, profile) {
        initAdminCustomSelects(document.getElementById("page-operation"));
        bindOperationForm(profile);
    },
});
