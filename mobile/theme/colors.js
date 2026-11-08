// ThreatTrack shared color tokens.
//
// BRAND_GRADIENT is the single red gradient used everywhere (headers, primary
// buttons, selected tabs, alert buttons). It matches the Incident Reports
// header: deep crimson -> red, diagonal top-left to bottom-right.
export const BRAND_GRADIENT = ['#7f1d1d', '#991b1b', '#dc2626'];
export const BRAND_GRADIENT_START = { x: 0, y: 0 };
export const BRAND_GRADIENT_END = { x: 1, y: 1 };

// Color system: RED MEANS URGENT.
// Bright red is reserved for SOS, the brand gradient, primary CTAs, high
// severity, errors/destructive actions, LIVE DISTRESS and location pins.
// Everyday icons use the deep crimson COLORS.icon (a subtle brand touch) on
// neutral slate tiles; section labels and borders are slate; statuses use
// their own semantic colors.
//
// NOTE: most screens still hardcode these hex values. When changing the
// palette, search for the hex as well as updating this file.
export const COLORS = {
  // Urgent / brand
  red: '#dc2626',
  redDark: '#991b1b',
  redTint: '#fef2f2',
  redBorder: '#fecaca',

  // Neutral UI
  icon: '#7f1d1d',        // deep crimson (darkest brand-gradient stop): everyday icons
  iconMuted: '#94a3b8',   // slate-400: inactive / decorative
  iconTile: '#f1f5f9',    // slate-100: icon background tiles
  iconTileBorder: '#e2e8f0',
  label: '#64748b',       // slate-500: eyebrows / section labels
  text: '#0f172a',
  textBody: '#334155',
  border: '#e2e8f0',

  // Semantic status
  submitted: '#475569',
  review: '#b45309',
  reviewTint: '#fffbeb',
  reviewBorder: '#fde68a',
  responding: '#1d4ed8',
  respondingTint: '#eff6ff',
  respondingBorder: '#bfdbfe',
  done: '#047857',
  doneTint: '#ecfdf5',
  doneBorder: '#a7f3d0',
};
