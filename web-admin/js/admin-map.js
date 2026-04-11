import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';
import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import icon from 'leaflet/dist/images/marker-icon.png';
import icon2x from 'leaflet/dist/images/marker-icon-2x.png';
import shadowImg from 'leaflet/dist/images/marker-shadow.png';
import { db } from '../../shared/firebase.js';

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

function severityColor(sev) {
  const custom = settings?.mapSettings?.markers?.severityColors;
  if (custom) {
    const s = String(sev || '').toLowerCase();
    if (s === 'high') return custom.high || '#ef4444';
    if (s === 'medium') return custom.medium || '#facc15';
    if (s === 'low') return custom.low || '#22c55e';
  }
  const s = String(sev || '').toLowerCase();
  if (s === 'high') return '#ef4444';
  if (s === 'medium') return '#f59e0b';
  if (s === 'low') return '#22c55e';
  return '#6b7280';
}

function hexToRgb(hex) {
  const str = String(hex || '').trim();
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

function heatSeverityBucket(severity) {
  const s = String(severity || '').toLowerCase();
  if (s === 'high') return 'high';
  if (s === 'medium') return 'medium';
  if (s === 'low') return 'low';
  return 'other';
}

function formatIncidentCode(docId) {
  // Stable 4-digit code derived from docId (not sequential).
  let hash = 0;
  const s = String(docId || '');
  for (let i = 0; i < s.length; i += 1) {
    hash = (hash * 31 + s.charCodeAt(i)) % 10000;
  }
  return `TR-${String(hash).padStart(4, '0')}`;
}

function startIncidentListener() {
  if (!mapInstance) return;
  if (unsubscribeIncidents) return;

  incidentsLayer = incidentsLayer || L.layerGroup().addTo(mapInstance);

  const markerLimit = Number(settings?.mapSettings?.performance?.markerLimit) || 250;
  const q = query(collection(db, 'incidents'), orderBy('timestamp', 'desc'), limit(markerLimit));

  const render = (snap) => {
    const markersEnabled = settings?.mapSettings?.markers?.enabled ?? true;
    const markerType = String(settings?.mapSettings?.markers?.type || 'dot').toLowerCase();
    const showMarkers = markersEnabled && markerType !== 'none';
    const heatEnabled = settings?.mapSettings?.heatmap?.enabled ?? false;

    const pts = [];
    const buckets = new Map(); // grid bucket -> count

    incidentsLayer.clearLayers();

    const sensitivity = String(settings?.mapSettings?.heatmap?.sensitivity || 'medium');
    const cellDeg = sensitivity === 'high' ? 0.0018 : sensitivity === 'low' ? 0.006 : 0.0035;

    snap.forEach((docSnap) => {
      const d = docSnap.data();
      const loc = d.location || {};
      const lat = Number(loc.latitude);
      const lng = Number(loc.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      const severity = d.severity ? String(d.severity) : 'unknown';
      const sev = severity.toLowerCase();
      const wBase = sev === 'high' ? 1 : sev === 'medium' ? 0.7 : sev === 'low' ? 0.45 : 0.55;

      // bucket counts for thresholding (simple defense-friendly explanation)
      const gx = Math.floor(lat / cellDeg);
      const gy = Math.floor(lng / cellDeg);
      const key = `${gx}:${gy}`;
      buckets.set(key, (buckets.get(key) || 0) + 1);

      pts.push({ lat, lng, wBase, severity, docId: docSnap.id, data: d });
    });

    // Heat points with threshold — one leaflet.heat layer per severity so spread color matches dot color.
    if (heatEnabled) {
      const threshold = Number(settings?.mapSettings?.heatmap?.minThreshold) || 3;
      const intensity = String(settings?.mapSettings?.heatmap?.intensity || 'medium');
      const intensityMul = intensity === 'high' ? 1.25 : intensity === 'low' ? 0.85 : 1.0;

      const filtered = pts.filter((p) => {
        const gx = Math.floor(p.lat / cellDeg);
        const gy = Math.floor(p.lng / cellDeg);
        return (buckets.get(`${gx}:${gy}`) || 0) >= threshold;
      });

      const heatBuckets = { high: [], medium: [], low: [], other: [] };
      filtered.forEach((p) => {
        const b = heatSeverityBucket(p.severity);
        heatBuckets[b].push([p.lat, p.lng, Math.min(1, p.wBase * intensityMul)]);
      });

      if (heatLayerGroup && mapInstance.hasLayer(heatLayerGroup)) {
        mapInstance.removeLayer(heatLayerGroup);
      }
      heatLayerGroup = L.layerGroup();

      const radius = Number(settings?.mapSettings?.heatmap?.radius) || 28;
      const opacity = Number(settings?.mapSettings?.heatmap?.opacity);
      const blur = Math.max(10, Math.round(radius * 0.6));
      const baseOpts = {
        radius,
        blur,
        maxZoom: mapInstance.getMaxZoom(),
        minOpacity: Number.isFinite(opacity) ? opacity : 0.65,
      };

      const order = ['low', 'medium', 'high', 'other'];
      for (const key of order) {
        const arr = heatBuckets[key];
        if (!arr.length) continue;
        const dotColor = key === 'other' ? severityColor('unknown') : severityColor(key);
        const hl = L.heatLayer(arr, {
          ...baseOpts,
          gradient: monoHeatGradient(dotColor),
        });
        heatLayerGroup.addLayer(hl);
      }

      if (heatLayerGroup.getLayers().length) {
        heatLayerGroup.addTo(mapInstance);
      }
    } else if (heatLayerGroup && mapInstance.hasLayer(heatLayerGroup)) {
      mapInstance.removeLayer(heatLayerGroup);
    }

    // Markers (dot or icon), or none for heatmap-only view
    if (showMarkers) {
      const useIcon = markerType === 'icon';
      pts.forEach((p) => {
        const code = formatIncidentCode(p.docId);
        const type = p.data?.type ? String(p.data.type) : 'incident';
        const status = p.data?.status ? String(p.data.status) : 'unknown';
        const popup =
          `<strong>${code}</strong><br>` +
          `${type} · ${p.severity} · ${status}<br>` +
          `<span style="color:#6b7280">${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</span>`;

        if (useIcon) {
          const marker = L.marker([p.lat, p.lng]);
          marker.bindPopup(popup);
          marker.addTo(incidentsLayer);
        } else {
          const marker = L.circleMarker([p.lat, p.lng], {
            radius: 7,
            color: '#0b1220',
            weight: 1,
            fillColor: severityColor(p.severity),
            fillOpacity: 0.9,
          });
          marker.bindPopup(popup);
          marker.addTo(incidentsLayer);
        }
      });
    }
  };

  const mode = String(settings?.mapSettings?.performance?.refreshMode || 'realtime');
  if (mode === 'manual') {
    (async () => {
      try {
        const snap = await getDocs(q);
        render(snap);
      } catch (err) {
        console.error('[admin-map] incidents load', err);
      }
    })();
    return;
  }

  unsubscribeIncidents = onSnapshot(q, render, (err) => console.error('[admin-map] incidents listener', err));
}

async function loadMapSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'system'));
    settings = snap.exists() ? snap.data() : null;
  } catch (err) {
    console.warn('[admin-map] settings load failed', err);
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

  const tiles = String(settings?.mapSettings?.appearance?.tiles || 'street');
  const theme = String(settings?.mapSettings?.appearance?.theme || 'light');

  if (tiles === 'satellite') {
    tileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri',
      maxZoom: 19,
    });
  } else if (theme === 'dark') {
    tileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap &copy; CARTO',
      maxZoom: 19,
    });
  } else {
    tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    });
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
  scrollZoom ? mapInstance.scrollWheelZoom.enable() : mapInstance.scrollWheelZoom.disable();
  dbl ? mapInstance.doubleClickZoom.enable() : mapInstance.doubleClickZoom.disable();

  const minZ = Number.isFinite(Number(inter.minZoom)) ? Number(inter.minZoom) : 10;
  const maxZ = Number.isFinite(Number(inter.maxZoom)) ? Number(inter.maxZoom) : 19;
  mapInstance.setMinZoom(Math.min(minZ, maxZ));
  mapInstance.setMaxZoom(Math.max(minZ, maxZ));
}

function applyBoundaryOverlay() {
  if (!mapInstance) return;
  const enabled = settings?.mapSettings?.appearance?.boundaryOverlay ?? true;

  if (!boundaryLayer) {
    boundaryLayer = L.polygon(VAL_BOUNDARY_LATLNG, {
      color: '#2563eb',
      weight: 2,
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
    });
  }

  if (enabled) {
    if (!mapInstance.hasLayer(boundaryLayer)) boundaryLayer.addTo(mapInstance);
  } else if (mapInstance.hasLayer(boundaryLayer)) {
    mapInstance.removeLayer(boundaryLayer);
  }
}

export function initAdminMap() {
  const el = document.getElementById('admin-map');
  if (!el || mapInstance) return;

  // Load saved settings first (best-effort).
  // If settings are missing, the map will still render with defaults.
  // eslint-disable-next-line no-void
  void loadMapSettings().finally(() => {
    const lat = Number(settings?.location?.defaultCoordinates?.lat);
    const lng = Number(settings?.location?.defaultCoordinates?.lng);
    const zoom = Number(settings?.location?.defaultZoom);

    const center = Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : VAL_CENTER;
    const z = Number.isFinite(zoom) ? zoom : 13;

    mapInstance = L.map(el, { scrollWheelZoom: true }).setView(center, z);
    applyBaseLayers();
    applyInteractionSettings();
    applyBoundaryOverlay();

    L.marker(center)
    .addTo(mapInstance)
    .bindPopup('<strong>Valenzuela City</strong><br>Admin map — connect Firestore for live incidents.');

    setTimeout(() => mapInstance.invalidateSize(), 100);
    startIncidentListener();
  });
}
