/**
 * Unit Tests for Context Grounding, Prompt Redesign & Fallback Engine
 * Phase 5 & 12 Test Suite: Jest unit tests for functions/src/generateAdminAISummary.js
 */

const {
  buildGeminiPrompt,
  normalizeSummary,
  buildDeterministicFallbackSummary,
  AI_SUMMARY_SCHEMA,
} = require("../src/generateAdminAISummary");

describe("AI Prompt & Grounding Synthesis Engine (Phase 5 & 12)", () => {
  const mockAnalyticsPayload = {
    timeRange: {label: "30d", start: "2026-07-24T00:00:00Z", end: "2026-08-23T00:00:00Z"},
    overallStats: {totalIncidents: 15, highSeverity: 5, openIncidents: 8, sosReports: 2, withCoordinates: 15},
    topCrimeTypes: {theft_snatching: 9, robbery_holdup: 4, domestic_violence: 2},
    peakHours: ["6:00 PM", "8:00 PM"],
    hotspots: [
      {
        key: "gen. t. de leon__commercial corridor",
        rank: 1,
        locationLabel: "Gen. T. de Leon Commercial Corridor",
        street: "Gen. T. de Leon",
        barangay: "Gen. T. de Leon",
        reportCount: 8,
        weightedScore: 18,
        severityBreakdown: {high: 3, medium: 4, low: 1},
      },
    ],
  };

  const mockAiContext = {
    knowledge: [
      {
        type: "ordinance",
        title: "Anti-Theft Commercial Corridor Ordinance",
        source: "Valenzuela City Council",
        referenceNumber: "Ord. No. 2024-045",
        content: "Mandates coordinated foot patrol between 17:00 and 22:00 in designated commercial corridors.",
      },
    ],
    triggeredRules: [
      {
        ruleName: "Theft Hotspot Escalation Rule",
        appliesTo: "theft_snatching",
        priority: "critical",
        guidance: "Deploy joint mobile patrol and establish high-visibility checkpoint during evening transit hours.",
        additionalContext: "Area contains multiple public jeepney loading bays.",
        reason: "Triggered by incident_count: 8 >= 5 (30d window)",
      },
    ],
    rulesByHotspot: {
      "gen. t. de leon__commercial corridor": [
        {
          ruleName: "Theft Hotspot Escalation Rule",
          guidance: "Deploy joint mobile patrol and establish high-visibility checkpoint.",
          priority: "critical",
          reason: "Triggered by incident_count: 8 >= 5",
        },
      ],
    },
    metadata: {
      knowledgeCount: 1,
      rulesTriggeredCount: 1,
    },
  };

  describe("1. Prompt Architecture (buildGeminiPrompt)", () => {
    test("builds prompt containing all 3 grounding sections", () => {
      const prompt = buildGeminiPrompt(mockAnalyticsPayload, mockAiContext);

      expect(prompt).toContain("=== SECTION 1: AGGREGATED INCIDENT EVIDENCE ===");
      expect(prompt).toContain("=== SECTION 2: OFFICIAL POLICIES & ORDINANCES (Knowledge Base) ===");
      expect(prompt).toContain("=== SECTION 3: ADMINISTRATIVE OPERATIONAL GUIDANCE & RULES ===");
    });

    test("includes knowledge title, source, reference number, and content in section 2", () => {
      const prompt = buildGeminiPrompt(mockAnalyticsPayload, mockAiContext);

      expect(prompt).toContain("Anti-Theft Commercial Corridor Ordinance");
      expect(prompt).toContain("Valenzuela City Council");
      expect(prompt).toContain("Ord. No. 2024-045");
      expect(prompt).toContain("Mandates coordinated foot patrol");
    });

    test("includes operational rule name, priority, guidance, and reason in section 3", () => {
      const prompt = buildGeminiPrompt(mockAnalyticsPayload, mockAiContext);

      expect(prompt).toContain("Theft Hotspot Escalation Rule");
      expect(prompt).toContain("CRITICAL");
      expect(prompt).toContain("Deploy joint mobile patrol");
      expect(prompt).toContain("Triggered by incident_count: 8 >= 5");
    });

    test("handles empty knowledge and rules gracefully with fallback text", () => {
      const emptyContext = {
        knowledge: [],
        triggeredRules: [],
        metadata: {knowledgeCount: 0, rulesTriggeredCount: 0},
      };
      const prompt = buildGeminiPrompt(mockAnalyticsPayload, emptyContext);

      expect(prompt).toContain("No official knowledge base documents currently registered.");
      expect(prompt).toContain("No specific operational guidance triggered for these hotspots.");
    });
  });

  describe("2. Summary Normalizer (normalizeSummary)", () => {
    test("preserves and normalizes citedKnowledge and matchedGuidance arrays", () => {
      const rawAiResponse = {
        headline: "Theft concentration along Gen. T. de Leon corridor",
        overallRisk: "high",
        executiveSummary: "Multiple theft incidents reported along commercial strip.",
        groundingSummary: "Applied Ordinance 2024-045 and Theft Escalation Rule.",
        priorityHotspots: [
          {
            rank: 1,
            locationLabel: "Gen. T. de Leon Commercial Corridor",
            street: "Gen. T. de Leon",
            barangay: "Gen. T. de Leon",
            riskLevel: "high",
            mainPattern: "Evening snatching incidents near transport bays.",
            evidence: ["8 reports", "Peak at 6:00 PM"],
            citedKnowledge: ["Ord. No. 2024-045: Anti-Theft Commercial Corridor Ordinance"],
            matchedGuidance: ["Theft Hotspot Escalation Rule: Joint Mobile Patrol"],
            recommendedActions: [
              {
                action: "Deploy joint mobile patrol unit",
                owner: "police",
                urgency: "today",
                reason: "High volume of evening commute incidents",
              },
            ],
            suggestedPublicAdvisory: "Remain vigilant with personal belongings during evening commute.",
            confidence: 0.9,
          },
        ],
        dataWarnings: [],
        nextDataToCollect: [],
      };

      const normalized = normalizeSummary(rawAiResponse, mockAnalyticsPayload, mockAiContext);

      expect(normalized.headline).toBe("Theft concentration along Gen. T. de Leon corridor");
      expect(normalized.priorityHotspots).toHaveLength(1);
      expect(normalized.priorityHotspots[0].citedKnowledge).toContain(
          "Ord. No. 2024-045: Anti-Theft Commercial Corridor Ordinance",
      );
      expect(normalized.priorityHotspots[0].matchedGuidance).toContain(
          "Theft Hotspot Escalation Rule: Joint Mobile Patrol",
      );
      expect(normalized.basedOn.knowledgeEntriesCited).toBe(1);
      expect(normalized.basedOn.rulesEvaluated).toBe(1);
    });

    test("safely handles missing citations without throwing", () => {
      const rawAiResponse = {
        headline: "General overview",
        overallRisk: "low",
        executiveSummary: "Overview text",
        priorityHotspots: [
          {
            rank: 1,
            locationLabel: "Barangay Karuhatan",
          },
        ],
      };

      const normalized = normalizeSummary(rawAiResponse, mockAnalyticsPayload, {});
      expect(normalized.priorityHotspots[0].citedKnowledge).toEqual([]);
      expect(normalized.priorityHotspots[0].matchedGuidance).toEqual([]);
    });
  });

  describe("3. Deterministic Fallback Engine (buildDeterministicFallbackSummary - Phase 12)", () => {
    test("generates complete, grounded summary when Gemini is offline", () => {
      const fallback = buildDeterministicFallbackSummary(mockAnalyticsPayload, mockAiContext, {range: "30d"});

      expect(fallback.headline).toContain("Operational rule guidance for 15 reported theft snatching incidents");
      expect(fallback.overallRisk).toBe("high");
      expect(fallback.groundingSummary).toContain("Fallback Mode");
      expect(fallback.priorityHotspots).toHaveLength(1);
      expect(fallback.priorityHotspots[0].locationLabel).toBe("Gen. T. de Leon Commercial Corridor");
      expect(fallback.priorityHotspots[0].citedKnowledge[0]).toContain("Anti-Theft Commercial Corridor Ordinance");
      expect(fallback.priorityHotspots[0].matchedGuidance[0]).toContain("Theft Hotspot Escalation Rule");
      expect(fallback.dataWarnings).toContain(
          "Generated via deterministic operational rule engine (AI network fallback mode).",
      );
    });
  });

  describe("4. Schema Integrity (AI_SUMMARY_SCHEMA)", () => {
    test("schema requires core summary properties and hotspot citation fields", () => {
      expect(AI_SUMMARY_SCHEMA.required).toContain("headline");
      expect(AI_SUMMARY_SCHEMA.required).toContain("overallRisk");
      expect(AI_SUMMARY_SCHEMA.required).toContain("priorityHotspots");

      const hotspotProps = AI_SUMMARY_SCHEMA.properties.priorityHotspots.items.properties;
      expect(hotspotProps).toHaveProperty("citedKnowledge");
      expect(hotspotProps).toHaveProperty("matchedGuidance");
      expect(hotspotProps).toHaveProperty("recommendedActions");
    });
  });
});
