import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import "leaflet.markercluster";
import {
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
} from "firebase/firestore";
import icon from "leaflet/dist/images/marker-icon.png";
import icon2x from "leaflet/dist/images/marker-icon-2x.png";
import shadowImg from "leaflet/dist/images/marker-shadow.png";
import { db } from "../../shared/firebase.js";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconUrl: icon,
    iconRetinaUrl: icon2x,
    shadowUrl: shadowImg,
});

/** Aligns with mobile app HomeScreen — Valenzuela City */
const VAL_CENTER = [14.6991, 120.982];

const VAL_BOUNDARY_LATLNG = [
    [14.748, 120.965],
    [14.745, 120.985],
    [14.74, 121.015],
    [14.72, 121.018],
    [14.695, 121.01],
    [14.67, 121.005],
    [14.655, 120.99],
    [14.652, 120.97],
    [14.66, 120.955],
    [14.675, 120.952],
    [14.7, 120.95],
    [14.725, 120.953],
    [14.74, 120.96],
];

let mapInstance = null;
let incidentsLayer = null;
let unsubscribeIncidents = null;
let heatLayerGroup = null;
let tileLayer = null;
let boundaryLayer = null;
let settings = null;
let heatRerenderBound = false;

function severityColor(sev) {
    const custom = settings?.mapSettings?.markers?.severityColors;
    if (custom) {
        const s = String(sev || "").toLowerCase();
        if (s === "high") return custom.high || "#ef4444";
        if (s === "medium") return custom.medium || "#facc15";
        if (s === "low") return custom.low || "#22c55e";
    }
    const s = String(sev || "").toLowerCase();
    if (s === "high") return "#ef4444";
    if (s === "medium") return "#f59e0b";
    if (s === "low") return "#22c55e";
    return "#6b7280";
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

function formatTimestamp(ts) {
    if (ts && typeof ts.toDate === "function") {
        try {
            return ts.toDate().toLocaleString(undefined, {
                dateStyle: "short",
                timeStyle: "short",
            });
        } catch {}
    }
    if (ts instanceof Date) {
        return ts.toLocaleString(undefined, {
            dateStyle: "short",
            timeStyle: "short",
        });
    }
    if (typeof ts === "number" && Number.isFinite(ts)) {
        return new Date(ts).toLocaleString(undefined, {
            dateStyle: "short",
            timeStyle: "short",
        });
    }
    return "—";
}

function reporterSummary(d) {
    if (d?.isAnonymous === true) return "Anonymous";
    if (d?.reporterId) return "Signed-in user";
    if (d?.reporterEmail) return String(d.reporterEmail);
    if (d?.email) return String(d.email);
    return "—";
}

function descriptionSnippet(text) {
    const value = String(text || "").trim();
    if (!value) return "No description provided.";
    return value.length > 120 ? `${value.slice(0, 120).trim()}…` : value;
}

function hexToRgb(hex) {
    const str = String(hex || "").trim();
    let m = /^#([0-9a-f]{6})$/i.exec(str);
    if (m) {
        const n = parseInt(m[1], 16);
        return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
    }
    m = /^#([0-9a-f]{3})$/i.exec(str);
    if (m) {
        const x = m[1];
        return {
            r: parseInt(x[0] + x[0], 16),
            g: parseInt(x[1] + x[1], 16),
            b: parseInt(x[2] + x[2], 16),
        };
    }
    return { r: 107, g: 114, b: 128 };
}

/** Single-hue ramp for leaflet.heat (intensity → same color, higher alpha). */
function monoHeatGradient(hex) {
    const { r, g, b } = hexToRgb(hex);
    return {
        0.15: `rgba(${r},${g},${b},0.14)`,
        0.4: `rgba(${r},${g},${b},0.38)`,
        0.65: `rgba(${r},${g},${b},0.64)`,
        0.9: `rgba(${r},${g},${b},0.92)`,
    };
}

function getAdaptiveHeatOptions() {
    const configuredRadius = Number(settings?.mapSettings?.heatmap?.radius) || 28;
    const configuredOpacity = Number(settings?.mapSettings?.heatmap?.opacity);
    const zoom = mapInstance?.getZoom?.() || 13;

    let zoomScale = 1;
    if (zoom <= 10) zoomScale = 0.38;
    else if (zoom <= 11) zoomScale = 0.5;
    else if (zoom <= 12) zoomScale = 0.68;
    else if (zoom >= 15) zoomScale = 1.08;

    const radius = Math.max(10, Math.round(configuredRadius * zoomScale));
    const blur = Math.max(6, Math.round(radius * 0.5));
    const baseOpacity = Number.isFinite(configuredOpacity)
        ? configuredOpacity
        : 0.42;
    const opacityScale = zoom <= 11 ? 0.42 : zoom <= 12 ? 0.62 : 1;

    return {
        radius,
        blur,
        minOpacity: Math.max(0.12, Math.min(0.56, baseOpacity * opacityScale)),
    };
}

function bindHeatZoomRerender() {
    if (!mapInstance || heatRerenderBound) return;
    heatRerenderBound = true;
    mapInstance.on("zoomend", () => {
        if (!heatLayerGroup || !lastIncidentsSnap) return;
        rerenderIncidentLayers();
    });
}

function heatSeverityBucket(severity) {
    const s = String(severity || "").toLowerCase();
    if (s === "high") return "high";
    if (s === "medium") return "medium";
    if (s === "low") return "low";
    return "other";
}

function formatIncidentCode(docId) {
    // Stable 4-digit code derived from docId (not sequential).
    let hash = 0;
    const s = String(docId || "");
    for (let i = 0; i < s.length; i += 1) {
        hash = (hash * 31 + s.charCodeAt(i)) % 10000;
    }
    return `TR-${String(hash).padStart(4, "0")}`;
}

function createSeverityClusterIcon(cluster) {
    const markers = cluster.getAllChildMarkers();
    const counts = { high: 0, medium: 0, low: 0, other: 0 };
    markers.forEach((marker) => {
        const sev = String(marker.options?.incidentSeverity || "").toLowerCase();
        if (sev === "high") counts.high += 1;
        else if (sev === "medium") counts.medium += 1;
        else if (sev === "low") counts.low += 1;
        else counts.other += 1;
    });

    const total = markers.length || 1;
    const highPct = Math.round((counts.high / total) * 100);
    const mediumPct = Math.round((counts.medium / total) * 100);
    const lowPct = Math.round((counts.low / total) * 100);
    const otherPct = Math.max(0, 100 - highPct - mediumPct - lowPct);

    const size = total >= 50 ? 48 : total >= 20 ? 42 : 36;
    const conic = `conic-gradient(
        ${severityColor("high")} 0 ${highPct}%,
        ${severityColor("medium")} ${highPct}% ${highPct + mediumPct}%,
        ${severityColor("low")} ${highPct + mediumPct}% ${highPct + mediumPct + lowPct}%,
        ${severityColor("unknown")} ${highPct + mediumPct + lowPct}% ${highPct + mediumPct + lowPct + otherPct}%
    )`;

    return L.divIcon({
        html: `<span style="
            width:${size}px;
            height:${size}px;
            display:grid;
            place-items:center;
            border-radius:999px;
            background:${conic};
            box-shadow:0 10px 24px rgba(15,23,42,.28), 0 0 0 2px rgba(255,255,255,.72);
        "><b style="
            width:${Math.max(22, size - 12)}px;
            height:${Math.max(22, size - 12)}px;
            display:grid;
            place-items:center;
            border-radius:999px;
            background:rgba(255,255,255,.92);
            color:#0f172a;
            font-size:.75rem;
            font-weight:900;
        ">${total}</b></span>`,
        className: "admin-map__severity-cluster",
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });
}

function createIncidentClusterLayer() {
    return L.markerClusterGroup({
        iconCreateFunction: createSeverityClusterIcon,
        showCoverageOnHover: false,
        maxClusterRadius: 42,
    });
}

let lastIncidentsSnap = null;

function getMapFilterValues() {
    const type = document.getElementById("map-filter-type")?.value || "all";
    const severity =
        document.getElementById("map-filter-severity")?.value || "all";
    const timeframe =
        document.getElementById("map-filter-timeframe")?.value || "all";
    return { type, severity, timeframe };
}

function timeframeThresholdMs(value) {
    if (value === "24h") return Date.now() - 24 * 60 * 60 * 1000;
    if (value === "7d") return Date.now() - 7 * 24 * 60 * 60 * 1000;
    if (value === "30d") return Date.now() - 30 * 24 * 60 * 60 * 1000;
    return null;
}

function incidentMatchesFilters(docSnap, filters) {
    if (!docSnap.exists()) return false;
    const d = docSnap.data() || {};
    const type = String(d.type || "").toLowerCase();
    const severity = String(d.severity || "").toLowerCase();
    const ts = d.timestamp;

    if (filters.type !== "all" && type !== filters.type.toLowerCase())
        return false;
    if (
        filters.severity !== "all" &&
        severity !== filters.severity.toLowerCase()
    )
        return false;

    const threshold = timeframeThresholdMs(filters.timeframe);
    if (threshold !== null) {
        let millis = null;
        if (ts && typeof ts.toMillis === "function") {
            millis = ts.toMillis();
        } else if (ts instanceof Date) {
            millis = ts.getTime();
        } else if (typeof ts === "number") {
            millis = ts;
        }
        if (!Number.isFinite(millis) || millis < threshold) return false;
    }

    return true;
}

function populateMapTypeFilter(snap) {
    const typeEl = document.getElementById("map-filter-type");
    if (!typeEl) return;

    const current = typeEl.value;
    const types = new Set(["all"]);
    snap.forEach((docSnap) => {
        const type = String(docSnap.data()?.type || "")
            .trim()
            .toLowerCase();
        if (type) types.add(type);
    });

    const options = Array.from(types).sort((a, b) => {
        if (a === "all") return -1;
        if (b === "all") return 1;
        return a.localeCompare(b);
    });

    typeEl.innerHTML = options
        .map(
            (type) =>
                `<option value="${type}">${type === "all" ? "All types" : type.charAt(0).toUpperCase() + type.slice(1)}</option>`,
        )
        .join("");

    if (options.includes(current)) {
        typeEl.value = current;
    }
}

function rerenderIncidentLayers() {
    if (!lastIncidentsSnap) return;
    startIncidentRender(lastIncidentsSnap);
}

function centerMapToCity() {
    if (!mapInstance) return;

    const bounds = L.latLngBounds(
        [14.652, 120.95], // SW
        [14.748, 121.018], // NE
    );

    mapInstance.flyToBounds(bounds, {
        duration: 0.8,
        padding: [50, 50],
    });
}

function bindMapFilters() {
    const typeEl = document.getElementById("map-filter-type");
    const severityEl = document.getElementById("map-filter-severity");
    const timeframeEl = document.getElementById("map-filter-timeframe");
    const resetBtn = document.getElementById("map-filter-reset");
    if (!typeEl || !severityEl || !timeframeEl || !resetBtn) return;

    const onChange = () => rerenderIncidentLayers();
    typeEl.addEventListener("change", onChange);
    severityEl.addEventListener("change", onChange);
    timeframeEl.addEventListener("change", onChange);
    resetBtn.addEventListener("click", () => {
        typeEl.value = "all";
        severityEl.value = "all";
        timeframeEl.value = "all";
        rerenderIncidentLayers();
    });
}

function startIncidentRender(snap) {
    if (!mapInstance) return;
    if (!incidentsLayer) {
        incidentsLayer = createIncidentClusterLayer().addTo(mapInstance);
    }

    lastIncidentsSnap = snap;
    populateMapTypeFilter(snap);

    const markersEnabled = settings?.mapSettings?.markers?.enabled ?? true;
    const markerType = String(
        settings?.mapSettings?.markers?.type || "dot",
    ).toLowerCase();
    const showMarkers = markersEnabled && markerType !== "none";
    const heatEnabled = settings?.mapSettings?.heatmap?.enabled ?? false;

    const filters = getMapFilterValues();
    const pts = [];
    const buckets = new Map(); // grid bucket -> count

    incidentsLayer.clearLayers();

    const sensitivity = String(
        settings?.mapSettings?.heatmap?.sensitivity || "medium",
    );
    const cellDeg =
        sensitivity === "high"
            ? 0.0018
            : sensitivity === "low"
              ? 0.006
              : 0.0035;

    snap.forEach((docSnap) => {
        if (!incidentMatchesFilters(docSnap, filters)) return;
        const d = docSnap.data();
        const loc = d.location || {};
        const lat = Number(loc.latitude);
        const lng = Number(loc.longitude);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

        const severity = d.severity ? String(d.severity) : "unknown";
        const sev = severity.toLowerCase();
        const wBase =
            sev === "high"
                ? 1
                : sev === "medium"
                  ? 0.7
                  : sev === "low"
                    ? 0.45
                    : 0.55;

        const gx = Math.floor(lat / cellDeg);
        const gy = Math.floor(lng / cellDeg);
        const key = `${gx}:${gy}`;
        buckets.set(key, (buckets.get(key) || 0) + 1);

        pts.push({ lat, lng, wBase, severity, docId: docSnap.id, data: d });
    });

    // Heat points with threshold — one leaflet.heat layer per severity so spread color matches dot color.
    if (heatEnabled) {
        const threshold =
            Number(settings?.mapSettings?.heatmap?.minThreshold) || 3;
        const intensity = String(
            settings?.mapSettings?.heatmap?.intensity || "medium",
        );
        const intensityMul =
            intensity === "high" ? 1.25 : intensity === "low" ? 0.85 : 1.0;

        const filtered = pts.filter((p) => {
            const gx = Math.floor(p.lat / cellDeg);
            const gy = Math.floor(p.lng / cellDeg);
            return (buckets.get(`${gx}:${gy}`) || 0) >= threshold;
        });

        if (heatLayerGroup && mapInstance.hasLayer(heatLayerGroup)) {
            mapInstance.removeLayer(heatLayerGroup);
        }
        heatLayerGroup = L.layerGroup();

        const adaptive = getAdaptiveHeatOptions();
        const baseOpts = {
            radius: adaptive.radius,
            blur: adaptive.blur,
            maxZoom: mapInstance.getMaxZoom(),
            minOpacity: adaptive.minOpacity,
        };

        // Render low first and high last so severe hotspots remain visually dominant.
        const order = ["low", "medium", "other", "high"];
        for (const key of order) {
            const arr = filtered
                .filter((p) => heatSeverityBucket(p.severity) === key)
                .map((p) => [
                    p.lat,
                    p.lng,
                    Math.min(1, p.wBase * intensityMul),
                ]);
            if (!arr.length) continue;
            const dotColor =
                key === "other" ? severityColor("unknown") : severityColor(key);
            const hl = L.heatLayer(arr, {
                ...baseOpts,
                gradient: monoHeatGradient(dotColor),
            });
            heatLayerGroup.addLayer(hl);
        }

        if (heatLayerGroup.getLayers().length) {
            heatLayerGroup.addTo(mapInstance);
            bindHeatZoomRerender();
        }
    } else if (heatLayerGroup && mapInstance.hasLayer(heatLayerGroup)) {
        mapInstance.removeLayer(heatLayerGroup);
    }

    if (showMarkers) {
        const useIcon = markerType === "icon";
        pts.forEach((p) => {
            const code = formatIncidentCode(p.docId);
            const type = p.data?.type ? String(p.data.type) : "Incident";
            const status = p.data?.status ? String(p.data.status) : "unknown";
            const reported = formatTimestamp(
                p.data?.timestamp || p.data?.reportedAt,
            );
            const reporter = reporterSummary(p.data);
            const description = descriptionSnippet(p.data?.description);
            const incidentLink = `incidents.html?incidentId=${encodeURIComponent(p.docId)}`;

            const popupHtml = `
        <div style="min-width:240px;line-height:1.4;font-size:0.95rem;">
          <div style="font-weight:700;margin-bottom:6px;">${escapeHtml(code)}</div>
          <div style="margin-bottom:6px;">
            <span style="color:${severityColor(p.severity)};font-weight:600;">${escapeHtml(String(p.severity))}</span>
            <span style="color:#6b7280;"> · ${escapeHtml(type)} · ${escapeHtml(status)}</span>
          </div>
          <div style="margin-bottom:8px;color:#374151;">${escapeHtml(description)}</div>
          <div style="font-size:0.84rem;color:#6b7280;">
            ${escapeHtml(reported)} · ${escapeHtml(reporter)}
          </div>
          <div style="margin-top:8px;">
            <a href="${escapeAttr(incidentLink)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:none;font-weight:700;">
              View full incident
            </a>
          </div>
        </div>
      `;

            const tooltipHtml = `
        <div style="line-height:1.2;font-size:0.86rem;">
          <strong>${escapeHtml(code)}</strong><br>
          <span style="color:${severityColor(p.severity)};font-weight:600;">${escapeHtml(String(p.severity))}</span>
          <span style="color:#6b7280;"> · ${escapeHtml(type)} · ${escapeHtml(status)}</span>
        </div>
      `;

            if (useIcon) {
                const marker = L.marker([p.lat, p.lng], {
                    incidentSeverity: String(p.severity).toLowerCase(),
                });
                marker.bindPopup(popupHtml);
                marker.bindTooltip(tooltipHtml, {
                    direction: "top",
                    offset: [0, -10],
                    sticky: true,
                    opacity: 0.95,
                });
                marker.addTo(incidentsLayer);
            } else {
                const marker = L.circleMarker([p.lat, p.lng], {
                    radius: 7,
                    color: "#0b1220",
                    weight: 1,
                    fillColor: severityColor(p.severity),
                    fillOpacity: 0.9,
                    incidentSeverity: String(p.severity).toLowerCase(),
                });
                marker.bindPopup(popupHtml);
                marker.bindTooltip(tooltipHtml, {
                    direction: "top",
                    offset: [0, -10],
                    sticky: true,
                    opacity: 0.95,
                });
                marker.addTo(incidentsLayer);
            }
        });
    }
}

function startIncidentListener() {
    if (!mapInstance) return;
    if (unsubscribeIncidents) return;

    incidentsLayer =
        incidentsLayer || createIncidentClusterLayer().addTo(mapInstance);

    const markerLimit =
        Number(settings?.mapSettings?.performance?.markerLimit) || 250;
    const q = query(
        collection(db, "incidents"),
        orderBy("timestamp", "desc"),
        limit(markerLimit),
    );

    const render = (snap) => {
        startIncidentRender(snap);
    };

    const mode = String(
        settings?.mapSettings?.performance?.refreshMode || "realtime",
    );
    if (mode === "manual") {
        (async () => {
            try {
                const snap = await getDocs(q);
                render(snap);
            } catch (err) {
                console.error("[admin-map] incidents load", err);
            }
        })();
        return;
    }

    unsubscribeIncidents = onSnapshot(q, render, (err) =>
        console.error("[admin-map] incidents listener", err),
    );
}

async function loadMapSettings() {
    try {
        const snap = await getDoc(doc(db, "settings", "system"));
        settings = snap.exists() ? snap.data() : null;
    } catch (err) {
        console.warn("[admin-map] settings load failed", err);
        settings = null;
    }
}

function applyBaseLayers() {
    if (!mapInstance) return;

    if (tileLayer) {
        try {
            mapInstance.removeLayer(tileLayer);
        } catch {}
        tileLayer = null;
    }

    const tiles = String(settings?.mapSettings?.appearance?.tiles || "street");
    const theme = String(settings?.mapSettings?.appearance?.theme || "light");

    if (tiles === "satellite") {
        tileLayer = L.tileLayer(
            "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            {
                attribution: "Tiles &copy; Esri",
                maxZoom: 19,
            },
        );
    } else if (theme === "dark") {
        tileLayer = L.tileLayer(
            "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            {
                attribution: "&copy; OpenStreetMap &copy; CARTO",
                maxZoom: 19,
            },
        );
    } else {
        tileLayer = L.tileLayer(
            "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
            {
                attribution: "&copy; OpenStreetMap",
                maxZoom: 19,
            },
        );
    }

    tileLayer.addTo(mapInstance);
}

function applyInteractionSettings() {
    if (!mapInstance) return;
    const inter = settings?.mapSettings?.interaction || {};

    const zoomControl = inter.zoomControl ?? true;
    const dragging = inter.dragging ?? true;
    const scrollZoom = inter.scrollZoom ?? true;
    const dbl = inter.doubleClickZoom ?? true;

    if (zoomControl) {
        if (!mapInstance.zoomControl) L.control.zoom().addTo(mapInstance);
    } else {
        mapInstance.zoomControl?.remove?.();
    }

    dragging ? mapInstance.dragging.enable() : mapInstance.dragging.disable();
    scrollZoom
        ? mapInstance.scrollWheelZoom.enable()
        : mapInstance.scrollWheelZoom.disable();
    dbl
        ? mapInstance.doubleClickZoom.enable()
        : mapInstance.doubleClickZoom.disable();

    const minZ = Number.isFinite(Number(inter.minZoom))
        ? Number(inter.minZoom)
        : 10;
    const maxZ = Number.isFinite(Number(inter.maxZoom))
        ? Number(inter.maxZoom)
        : 19;
    mapInstance.setMinZoom(Math.min(minZ, maxZ));
    mapInstance.setMaxZoom(Math.max(minZ, maxZ));
}

function applyBoundaryOverlay() {
    if (!mapInstance) return;
    const enabled = settings?.mapSettings?.appearance?.boundaryOverlay ?? true;

    if (!boundaryLayer) {
        boundaryLayer = L.polygon(VAL_BOUNDARY_LATLNG, {
            color: "#2563eb",
            weight: 2,
            fillColor: "#3b82f6",
            fillOpacity: 0.1,
        });
    }

    if (enabled) {
        if (!mapInstance.hasLayer(boundaryLayer))
            boundaryLayer.addTo(mapInstance);
    } else if (mapInstance.hasLayer(boundaryLayer)) {
        mapInstance.removeLayer(boundaryLayer);
    }
}

export function initAdminMap() {
    const el = document.getElementById("admin-map");
    if (!el || mapInstance) return;

    // Load saved settings first (best-effort).
    // If settings are missing, the map will still render with defaults.
    // eslint-disable-next-line no-void
    void loadMapSettings().finally(() => {
        const lat = Number(settings?.location?.defaultCoordinates?.lat);
        const lng = Number(settings?.location?.defaultCoordinates?.lng);
        const zoom = Number(settings?.location?.defaultZoom);

        const center =
            Number.isFinite(lat) && Number.isFinite(lng)
                ? [lat, lng]
                : VAL_CENTER;
        const z = Number.isFinite(zoom) ? zoom : 13;

        mapInstance = L.map(el, { scrollWheelZoom: true }).setView(center, z);
        applyBaseLayers();
        applyInteractionSettings();
        applyBoundaryOverlay();

        const centerControl = L.control({ position: "topright" });
        centerControl.onAdd = function () {
            const container = L.DomUtil.create(
                "div",
                "leaflet-bar leaflet-control admin-map__center-control",
            );
            const button = L.DomUtil.create(
                "button",
                "admin-map__center-btn",
                container,
            );
            button.type = "button";
            button.innerHTML = "⤢ City view";
            button.title = "Center map on Valenzuela City";
            button.addEventListener("click", (e) => {
                e.stopPropagation();
                e.preventDefault();
                mapInstance.invalidateSize();
                centerMapToCity();
            });
            L.DomEvent.disableClickPropagation(button);
            return container;
        };
        centerControl.addTo(mapInstance);

        L.marker(center)
            .addTo(mapInstance)
            .bindPopup(
                "<strong>Valenzuela City</strong><br>Admin map — connect Firestore for live incidents.",
            );

        centerMapToCity();
        setTimeout(() => mapInstance.invalidateSize(), 100);
        bindMapFilters();
        startIncidentListener();
    });
}
