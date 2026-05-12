# Admin Analytics Solution Recommendations

## Purpose

The current admin analytics already helps admins see what is happening: incident volume, crime types, severity mix, peak hours, response readiness, top hotspots, and the dashboard heatmap. The next layer should help admins decide what to do about each hotspot.

Example target behavior:

> If one street has many `robbery_holdup` reports and the heatmap is high, the admin panel should recommend specific actions such as adding street lights, adding CCTV coverage, increasing patrols during the peak reporting hours, and checking escape routes near the hotspot.

This document explains how to implement that solution layer in the admin side.

## Current Admin Analytics Reviewed

Relevant files:

- `web-admin/analytics.html`
- `web-admin/js/analytics.js`
- `web-admin/css/analytics.css`
- `web-admin/js/admin-map.js`
- `functions/src/getHeatmapData.js`
- `functions/src/aggregateHeatmapData.js`

What exists now:

- `web-admin/js/analytics.js` loads incident records from Firestore collection `incidents`.
- The analytics range filter supports `7d`, `30d`, `90d`, and `all`.
- The analytics page already calculates:
  - total incidents
  - reports today
  - high severity count
  - pending review count
  - SOS report count
  - verified rate
  - daily average
  - location coverage
  - incident trend
  - crime type severity mix
  - severity donut
  - status workload
  - peak reporting hours
  - response readiness
  - top hotspots
- Current hotspot grouping uses `barangay`, `area`, `district`, `locationName`, `location.barangay`, `location.area`, or a fallback coordinate grid label.
- `web-admin/js/admin-map.js` already renders incident heatmap points on the dashboard and filters by type, severity, and time range.
- `functions/src/getHeatmapData.js` can return heatmap cells with `count`, `severity`, and `types`.
- `functions/src/aggregateHeatmapData.js` already aggregates daily and period-based `typeBreakdown`, `severityBreakdown`, `incidentCount`, and `weightedScore`.

What is missing:

- A recommendation engine that converts hotspot analytics into suggested prevention or response actions.
- Street-level grouping for exact recommendations like "put lights and CCTV on this street."
- A UI panel in the admin analytics page that shows recommended actions per hotspot.
- A record of accepted, dismissed, or completed recommendations.

## Recommended Feature Name

Use this name in the UI:

`Recommended Area Actions`

The goal is to make the admin page action-oriented without pretending the system is making final public safety decisions. The system recommends. The admin verifies and acts.

## Target Admin Experience

Add a new wide panel below `Top Hotspots` on `analytics.html`.

Each recommendation card should show:

- Area or street name
- Risk level: `High`, `Medium`, or `Monitor`
- Main crime type driving the recommendation
- Evidence summary, for example `8 reports, 5 high severity, peak 8 PM - 11 PM`
- Specific suggested actions
- Reason why each action was suggested
- Suggested timeframe
- Optional admin action buttons:
  - `Create Task`
  - `Mark Reviewed`
  - `Dismiss`

Example card:

```text
MacArthur Highway near Barangay Karuhatan
High risk - Robbery/Holdup pattern

Evidence:
8 reports in the last 30 days
5 high severity
Peak reports: 7 PM - 11 PM

Recommended actions:
1. Install or repair street lights along the reported segment.
   Reason: robbery reports are concentrated at night.
2. Add CCTV facing both pedestrian paths and vehicle escape routes.
   Reason: repeated robbery/holdup reports need evidence capture and deterrence.
3. Assign visible patrols during 7 PM - 11 PM for the next 14 days.
   Reason: incidents cluster in this time window.
```

## Data Requirements

The current incident records already provide most required fields:

- `type`
- `severity`
- `status`
- `timestamp`, `reportedAt`, or `clientTimestamp`
- `location.latitude`
- `location.longitude`
- optional area fields such as `barangay`, `area`, `district`, `locationName`, `location.barangay`, and `location.area`
- `isSOSReport`

For street-specific suggestions, add or normalize these fields:

```javascript
location: {
  latitude: number,
  longitude: number,
  address: string,
  street: string,
  barangay: string,
  city: string
}
```

If `location.street` is not available yet, use a fallback:

1. `location.street`
2. `street`
3. `location.address`
4. `locationName`
5. `barangay` or `location.barangay`
6. coordinate grid label, for example `Grid 14.70, 120.98`

Important: the system can still recommend actions with grid-level hotspots, but exact "single street" recommendations will be better after street or address data is saved.

## Crime Types Used By The System

The current backend validates these incident types:

- `theft_snatching`
- `robbery_holdup`
- `physical_assault_injury`
- `domestic_violence`
- `drug_related_activity`
- `public_disturbance`
- `vandalism_property_damage`
- `traffic_accident`
- `illegal_weapons`
- `suspicious_activity`

The recommendation engine should use these exact keys so it matches the existing Firestore data.

## Hotspot Detection Logic

Use the selected analytics range. For every area or street group, calculate:

- `totalReports`
- `highSeverity`
- `mediumSeverity`
- `lowSeverity`
- `sosReports`
- `typeCounts`
- `peakHours`
- `latestReportAt`
- `weightedScore`

Recommended weighted score:

```text
weightedScore = highSeverity * 3 + mediumSeverity * 2 + lowSeverity * 1 + sosReports * 3
```

Recommended priority rules:

```text
High risk:
- weightedScore >= 12, or
- totalReports >= 8 in selected range, or
- highSeverity >= 3, or
- robbery_holdup or illegal_weapons has 3 or more reports

Medium risk:
- weightedScore >= 6, or
- totalReports >= 3, or
- highSeverity >= 1

Monitor:
- below medium threshold, but still visible if it is one of the top hotspots
```

Only show recommendations when there is enough evidence:

```text
Minimum for recommendation:
- at least 3 reports in the selected range, or
- at least 2 high severity reports, or
- at least 1 SOS report plus another related report nearby
```

This prevents the system from overreacting to one unverified report.

## Crime Type Recommendation Matrix

Use this as the first rule-based recommendation set.

### `robbery_holdup`

Use when reports show robbery, holdup, or forceful taking of property.

Recommended actions:

- Install or repair street lights in dark parts of the hotspot.
- Add CCTV cameras facing sidewalks, road crossings, store fronts, and escape routes.
- Increase visible patrols during the peak reporting hours.
- Coordinate with nearby stores, terminals, tricycle queues, and barangay watch points.
- Review previous incident descriptions to identify repeated suspect routes or waiting spots.

Best when:

- high heatmap intensity
- night-time peak
- high severity reports
- repeated incidents in the same street or transport area

### `theft_snatching`

Use when reports show snatching, pickpocketing, or non-forceful theft.

Recommended actions:

- Add CCTV around foot traffic areas, waiting sheds, terminals, markets, and crossings.
- Place warning signs in the hotspot reminding people to secure phones and bags.
- Assign foot or bike patrols during peak pedestrian hours.
- Improve lighting near sidewalks, alleys, and loading/unloading points.
- Coordinate with nearby businesses to report repeat offenders quickly.

Best when:

- incidents cluster near commuter or pedestrian areas
- reports peak during rush hour
- multiple low or medium severity incidents happen repeatedly

### `physical_assault_injury`

Use when reports show assault, injury, fights, or violent confrontation.

Recommended actions:

- Assign patrol visibility near the hotspot during peak hours.
- Add CCTV near gathering points, stores, schools, terminals, or nightlife areas.
- Improve lighting in alleys and corners where assaults are reported.
- Coordinate with barangay officials for conflict mediation if repeat involved parties are known.
- Prepare quick response routing for nearby responders.

Best when:

- high severity reports are present
- incidents happen at similar times
- hotspot is near public gathering places

### `domestic_violence`

Use when reports show domestic or household violence.

Recommended actions:

- Refer the case pattern to the barangay VAW desk or appropriate social welfare office.
- Prioritize confidential follow-up and victim safety checks.
- Avoid public hotspot warnings that could expose victims.
- Coordinate with trained responders instead of generic public patrol-only response.
- Track repeat reports by household or building only with strict access control.

Best when:

- repeat reports come from the same residence or small area
- reports are high severity
- victim safety and privacy are the main concerns

### `drug_related_activity`

Use when reports show suspected drug selling, use, or repeated drug-related activity.

Recommended actions:

- Increase intelligence-led patrols in the hotspot.
- Coordinate with the proper anti-drug enforcement unit.
- Add lighting and CCTV near alleys, vacant lots, and hidden gathering areas.
- Review time patterns to schedule patrols when activity is most reported.
- Encourage verified community reporting through official channels.

Best when:

- repeated suspicious activity appears in the same area
- activity is reported during consistent late-night hours
- hotspot is near poorly lit or low-visibility spaces

### `public_disturbance`

Use when reports show disorder, noise, harassment, public drinking, or crowd issues.

Recommended actions:

- Schedule patrols during the peak disturbance window.
- Coordinate with barangay enforcement for curfew, noise, or local ordinance checks.
- Add lighting near repeated gathering points.
- Work with nearby establishments if incidents cluster around stores or venues.
- Use warning notices before escalation when appropriate.

Best when:

- many medium or low severity reports happen repeatedly
- reports happen around the same hours
- hotspot is near public gathering areas

### `vandalism_property_damage`

Use when reports show damaged property, graffiti, or repeated destruction.

Recommended actions:

- Add CCTV facing walls, parked vehicles, public property, or building entrances.
- Improve lighting around damaged areas.
- Remove graffiti or visible damage quickly to reduce repeat targeting.
- Coordinate with property owners for access control.
- Increase patrol checks during the most common report hours.

Best when:

- repeated reports happen in the same building, wall, parking area, or public facility
- incidents happen late at night
- damage is recurring after cleanup

### `traffic_accident`

Use when reports show traffic collisions, pedestrian accidents, or road hazards.

Recommended actions:

- Request a road safety inspection for the hotspot.
- Add or repair warning signs, lane markings, pedestrian crossings, and reflectors.
- Improve lighting at intersections, crossings, and blind corners.
- Add speed control measures if accidents repeat on the same segment.
- Assign traffic visibility during peak accident hours.

Best when:

- incidents cluster at intersections or crossings
- reports peak during commute hours
- severity is medium or high

### `illegal_weapons`

Use when reports show weapons possession, armed threats, or weapon-related activity.

Recommended actions:

- Mark as high priority for police review.
- Increase responder caution and avoid routine public-facing intervention.
- Review nearby CCTV and witness reports.
- Coordinate controlled checkpoints only through authorized personnel.
- Add lighting and surveillance if the hotspot repeats.

Best when:

- any high severity report exists
- weapon reports repeat in the same area
- incidents overlap with robbery or assault

### `suspicious_activity`

Use when reports show suspicious behavior but the crime type is not yet confirmed.

Recommended actions:

- Increase patrol observation in the hotspot.
- Review report descriptions and CCTV before escalating.
- Ask barangay watch teams to monitor repeat times and locations.
- Improve lighting if reports mention dark or hidden areas.
- Convert to a more specific recommendation if later reports confirm a pattern.

Best when:

- reports are repeated but not yet verified as a specific crime type
- reports cluster by time and location
- hotspot may be an early warning signal

## Combining Recommendations

If one area has multiple crime types, combine the top two patterns instead of showing separate duplicate cards.

Example:

```text
If robbery_holdup = 5 and theft_snatching = 4:
- Recommend lighting
- Recommend CCTV
- Recommend patrols during peak hours
- Recommend public warning signs near pedestrian or commuter points
```

Deduplicate actions by `actionId`.

Recommended `actionId` examples:

- `improve_lighting`
- `install_cctv`
- `increase_patrol`
- `coordinate_barangay`
- `traffic_safety_audit`
- `victim_support_referral`
- `authorized_police_review`
- `public_warning_signage`
- `business_coordination`
- `cleanup_property_damage`

## Frontend Implementation Plan

### 1. Add a recommendation panel to `analytics.html`

Place this after the `Top Hotspots` panel inside `.analytics-grid`:

```html
<article class="analytics-panel analytics-panel--wide">
    <div class="analytics-panel__header">
        <h2>Recommended Area Actions</h2>
        <span>Based on hotspot crime patterns</span>
    </div>
    <div id="analytics-solutions" class="analytics-solutions"></div>
</article>
```

### 2. Add solution rendering to `analytics.js`

Add these main functions:

- `getHotspotKey(row)`
- `getIncidentHour(row)`
- `buildHotspotStats(rows)`
- `getDominantTypes(typeCounts)`
- `scoreHotspot(stats)`
- `getRecommendationsForType(type, stats)`
- `dedupeActions(actions)`
- `buildSolutionRecommendations(rows)`
- `renderSolutions(rows)`

Then call `renderSolutions(rows)` inside `renderAnalytics()`.

Recommended structure:

```javascript
function renderAnalytics() {
    const rows = getSelectedRangeRows();

    // existing analytics rendering...
    renderHotspots(rows);

    // new solution layer
    renderSolutions(rows);
}
```

### 3. Example frontend rule object

Keep this in `web-admin/js/analytics.js` first. Later it can move to a shared config file.

```javascript
const SOLUTION_RULES = {
    robbery_holdup: [
        {
            actionId: "improve_lighting",
            title: "Install or repair street lights",
            reason: "Robbery and holdup reports are reduced when dark areas become visible.",
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
            title: "Increase patrols during peak report hours",
            reason: "Visible patrols should match the hotspot's most active time window.",
            timeframe: "Start immediately",
        },
    ],
    theft_snatching: [
        {
            actionId: "install_cctv",
            title: "Add CCTV near pedestrian and commuter points",
            reason: "Snatching often happens in crowded movement areas.",
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
            reason: "Snatching patterns need visible patrols where people walk or wait.",
            timeframe: "Start immediately",
        },
    ],
};
```

### 4. Example hotspot stats object

```javascript
{
    area: "MacArthur Highway, Karuhatan",
    totalReports: 8,
    highSeverity: 5,
    mediumSeverity: 2,
    lowSeverity: 1,
    sosReports: 1,
    typeCounts: {
        robbery_holdup: 6,
        theft_snatching: 2
    },
    peakHours: [19, 20, 21, 22],
    weightedScore: 22,
    priority: "high"
}
```

### 5. Example rendered recommendation object

```javascript
{
    area: "MacArthur Highway, Karuhatan",
    priority: "high",
    dominantTypes: ["robbery_holdup", "theft_snatching"],
    evidence: "8 reports, 5 high severity, peak 7 PM - 10 PM",
    actions: [
        {
            actionId: "improve_lighting",
            title: "Install or repair street lights",
            reason: "Robbery and holdup reports are concentrated in this area.",
            timeframe: "Plan within 7 days"
        },
        {
            actionId: "install_cctv",
            title: "Add CCTV covering sidewalks and escape routes",
            reason: "Repeated reports need deterrence and evidence capture.",
            timeframe: "Plan within 14 days"
        }
    ]
}
```

## UI Behavior Rules

Use simple, direct language in the admin panel.

Good:

```text
Install or repair street lights along the reported segment.
```

Avoid:

```text
Consider improving environmental conditions.
```

Every suggestion should answer:

- What should be done?
- Where should it be done?
- Why did the system suggest it?
- When should admins prioritize it?
- Which crime type triggered it?

## Backend Implementation Option

For the first version, frontend-only logic in `analytics.js` is enough because the analytics page already loads the latest incident records.

The implemented version now uses a hybrid AI-assisted flow:

```text
Admin Analytics rows
-> frontend hotspot scoring and rule-based action selection
-> send only aggregated hotspot evidence to Cloud Function
-> OpenAI creates a concise admin summary and suggested solution wording
-> admin reviews the recommendation
```

Implemented files:

- `web-admin/analytics.html`
- `web-admin/js/analytics.js`
- `web-admin/css/analytics.css`
- `functions/src/generateAnalyticsSolutionSummary.js`
- `functions/index.js`

Important: the AI does not receive raw reporter descriptions, reporter identity, or incident IDs. It only receives area labels, counts, severity breakdowns, dominant crime types, peak hours, and already-approved rule-based actions.

Set the OpenAI key only on the server side:

```bash
firebase functions:secrets:set OPENAI_API_KEY
```

Firebase Secret Manager requires the Firebase project to be on the Blaze
pay-as-you-go plan. Without Blaze, the AI endpoint cannot securely store the
OpenAI key and the admin panel will continue showing the rule-based fallback.

If using normal environment variables during local development:

```bash
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5
```

If `OPENAI_API_KEY` is missing, the admin panel still works and shows the deterministic rule-based summary.

For a stronger version, create a Cloud Function that writes to:

```text
Collection: crime_solution_recommendations
Document ID: {period}_{areaKey}
```

Suggested document:

```javascript
{
  areaKey: "karuhatan_macarthur_highway",
  areaLabel: "MacArthur Highway, Karuhatan",
  period: "30d",
  priority: "high",
  weightedScore: 22,
  totalReports: 8,
  highSeverity: 5,
  dominantTypes: ["robbery_holdup", "theft_snatching"],
  peakHours: [19, 20, 21, 22],
  evidence: {
    typeCounts: {
      robbery_holdup: 6,
      theft_snatching: 2
    },
    severityBreakdown: {
      high: 5,
      medium: 2,
      low: 1
    }
  },
  actions: [
    {
      actionId: "improve_lighting",
      title: "Install or repair street lights",
      reason: "Robbery reports are concentrated in this street.",
      timeframe: "Plan within 7 days"
    }
  ],
  status: "new",
  createdAt: serverTimestamp,
  updatedAt: serverTimestamp
}
```

Recommendation status values:

- `new`
- `reviewed`
- `accepted`
- `in_progress`
- `completed`
- `dismissed`

This makes the solution system auditable and prevents recommendations from disappearing after the range filter changes.

## Recommended Phase Plan

### Phase 1: Frontend recommendation panel

Files to change:

- `web-admin/analytics.html`
- `web-admin/js/analytics.js`
- `web-admin/css/analytics.css`

Implement:

- group selected-range incidents by area or street
- calculate hotspot stats
- map dominant crime types to specific suggested actions
- render top 5 recommendation cards
- show empty state when no hotspot meets the threshold

### Phase 2: Better street-level data

Files to change:

- mobile report submission screen
- SOS report submission screen
- incident validation or enrichment function

Implement:

- save `location.address`
- save `location.street`
- save `location.barangay`
- optionally reverse geocode coordinates before storing or during backend processing

### Phase 3: Backend recommendation storage

Files to add:

- `functions/src/generateSolutionRecommendations.js`

Implement:

- scheduled generation every 1 hour or every night
- read incidents or `crime_statistics`
- write `crime_solution_recommendations`
- save recommendation status and audit trail

### Phase 4: Admin workflow actions

Files to change:

- `web-admin/analytics.html`
- `web-admin/js/analytics.js`
- optionally `web-admin/js/audit.js`

Implement:

- `Mark Reviewed`
- `Create Task`
- `Dismiss`
- `Complete`
- audit logs for all recommendation actions

## Example Recommendation Output By Area

### Robbery hotspot

```text
Area: P. Faustino Street, Barangay Punturin
Risk: High
Pattern: Robbery/Holdup

Evidence:
6 robbery/holdup reports in the last 30 days
4 high severity reports
Peak reporting hours: 8 PM - 11 PM

System suggestions:
1. Install or repair street lights along the street segment.
2. Add CCTV facing pedestrian paths, store fronts, and possible escape routes.
3. Increase visible patrols from 8 PM - 11 PM for the next 14 days.
4. Coordinate with nearby stores and barangay watch teams.
```

### Theft/snatching hotspot

```text
Area: Market entrance near Barangay Malinta
Risk: Medium
Pattern: Theft/Snatching

Evidence:
5 theft/snatching reports in the last 30 days
Peak reporting hours: 5 PM - 8 PM

System suggestions:
1. Add CCTV around entrances, exits, and waiting areas.
2. Place anti-snatching reminders near the market and transport stops.
3. Assign foot patrols during evening rush hours.
```

### Traffic accident hotspot

```text
Area: Intersection near Barangay Dalandanan
Risk: High
Pattern: Traffic Accident

Evidence:
7 traffic accident reports in the last 30 days
3 high severity reports
Peak reporting hours: 6 AM - 9 AM

System suggestions:
1. Request a road safety inspection.
2. Add or repair road signs, lane markings, pedestrian crossings, and reflectors.
3. Improve lighting at the intersection.
4. Assign traffic visibility during morning rush hours.
```

## Acceptance Criteria

The feature is ready when:

- Admin analytics shows `Recommended Area Actions`.
- Recommendations change when the range filter changes.
- Each recommendation is specific to the dominant crime type in that hotspot.
- The system can explain why each action was suggested.
- Robbery hotspots recommend lights, CCTV, and patrols when evidence supports it.
- Traffic accident hotspots recommend road safety actions instead of CCTV-only actions.
- Domestic violence recommendations protect privacy and do not show public hotspot-style warnings.
- Areas with too little evidence show no action or only `Monitor`.
- The UI has an empty state when no hotspot meets the threshold.

## Key Implementation Note

Start with a deterministic rule-based system. It is easier to test, easier to explain to admins, and safer for public safety workflows. AI can be added later to summarize evidence or rewrite recommendations, but the first version should use clear rules tied directly to crime type, severity, area, and time pattern.
