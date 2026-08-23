/**
 * Unit Tests for AI Context Retrieval & Evaluation Engine
 * Phase 4 Test Suite: Jest unit tests for functions/src/retrieveAIContext.js
 */

const {
  evaluateCondition,
  extractMetricValue,
  matchesCrimeType,
  evaluateRuleAgainstHotspot,
  retrievePublishedKnowledge,
  evaluateActiveRules,
  retrieveAIContext,
} = require("../src/retrieveAIContext");

describe("AI Retrieval & Evaluation Engine (Phase 4)", () => {
  describe("1. Condition Operator Evaluation (evaluateCondition)", () => {
    test("handles >= correctly", () => {
      expect(evaluateCondition(5, ">=", 5)).toBe(true);
      expect(evaluateCondition(6, ">=", 5)).toBe(true);
      expect(evaluateCondition(4, ">=", 5)).toBe(false);
    });

    test("handles > correctly", () => {
      expect(evaluateCondition(6, ">", 5)).toBe(true);
      expect(evaluateCondition(5, ">", 5)).toBe(false);
    });

    test("handles <= correctly", () => {
      expect(evaluateCondition(5, "<=", 5)).toBe(true);
      expect(evaluateCondition(4, "<=", 5)).toBe(true);
      expect(evaluateCondition(6, "<=", 5)).toBe(false);
    });

    test("handles < correctly", () => {
      expect(evaluateCondition(4, "<", 5)).toBe(true);
      expect(evaluateCondition(5, "<", 5)).toBe(false);
    });

    test("handles == correctly", () => {
      expect(evaluateCondition(5, "==", 5)).toBe(true);
      expect(evaluateCondition(4, "==", 5)).toBe(false);
    });

    test("returns false for invalid inputs or unknown operator", () => {
      expect(evaluateCondition(NaN, ">=", 5)).toBe(false);
      expect(evaluateCondition(5, "!=", 5)).toBe(false);
    });
  });

  describe("2. Metric Extractor (extractMetricValue)", () => {
    const mockHotspot = {
      totalReports: 12,
      severityBreakdown: { high: 4, medium: 5, low: 3 },
      sosReports: 2,
      weightedScore: 25,
    };

    test("extracts incident_count", () => {
      expect(extractMetricValue(mockHotspot, "incident_count")).toBe(12);
    });

    test("extracts high_severity_count", () => {
      expect(extractMetricValue(mockHotspot, "high_severity_count")).toBe(4);
    });

    test("extracts sos_count", () => {
      expect(extractMetricValue(mockHotspot, "sos_count")).toBe(2);
    });

    test("extracts weighted_score", () => {
      expect(extractMetricValue(mockHotspot, "weighted_score")).toBe(25);
    });

    test("returns 0 for missing or invalid hotspot", () => {
      expect(extractMetricValue(null, "incident_count")).toBe(0);
      expect(extractMetricValue({}, "unknown_metric")).toBe(0);
    });
  });

  describe("3. Crime Type Matching (matchesCrimeType)", () => {
    test("matches rule with 'all' against any hotspot", () => {
      expect(matchesCrimeType({ crimeType: "all" }, { dominantType: "theft_snatching" })).toBe(true);
    });

    test("matches specific crime type accurately", () => {
      const rule = { crimeType: "theft_snatching" };
      expect(matchesCrimeType(rule, { dominantType: "theft_snatching" })).toBe(true);
      expect(matchesCrimeType(rule, { dominantType: "robbery_holdup" })).toBe(false);
    });

    test("matches against topTypes list in hotspot", () => {
      const rule = { crimeType: "drug_related_activity" };
      const hotspot = {
        dominantType: "public_disturbance",
        topTypes: ["public_disturbance", "drug_related_activity"],
      };
      expect(matchesCrimeType(rule, hotspot)).toBe(true);
    });
  });

  describe("4. Hybrid Rule Evaluation (evaluateRuleAgainstHotspot)", () => {
    const testHotspot = {
      locationLabel: "Gen. T. de Leon Commercial Strip",
      dominantType: "theft_snatching",
      totalReports: 8,
      severityBreakdown: { high: 3, medium: 3, low: 2 },
      sosReports: 1,
      weightedScore: 16,
    };

    test("evaluates General Guidance rule (no threshold) successfully", () => {
      const generalRule = {
        id: "rule-gen-1",
        name: "General Theft Guidance",
        crimeType: "theft_snatching",
        recommendedAction: "Maintain high visibility foot patrol.",
        description: "Area has multiple retail establishments.",
        priority: "high",
        status: "active",
        hasConditions: false,
        version: 1,
      };

      const result = evaluateRuleAgainstHotspot(generalRule, testHotspot);
      expect(result).not.toBeNull();
      expect(result.ruleType).toBe("general_guidance");
      expect(result.guidance).toBe("Maintain high visibility foot patrol.");
      expect(result.additionalContext).toBe("Area has multiple retail establishments.");
    });

    test("evaluates Threshold-Based rule when condition is met", () => {
      const thresholdRule = {
        id: "rule-thresh-1",
        name: "Theft Escalation Rule",
        crimeType: "theft_snatching",
        recommendedAction: "Deploy mobile patrol unit.",
        priority: "critical",
        status: "active",
        hasConditions: true,
        conditionType: "incident_count",
        operator: ">=",
        threshold: 5,
        timePeriod: "30d",
        version: 2,
      };

      const result = evaluateRuleAgainstHotspot(thresholdRule, testHotspot);
      expect(result).not.toBeNull();
      expect(result.ruleType).toBe("threshold_rule");
      expect(result.metricValue).toBe(8);
      expect(result.priority).toBe("critical");
      expect(result.conditionFormula).toBe("incident_count >= 5 [30d]");
    });

    test("does not trigger threshold rule when condition is not met", () => {
      const strictRule = {
        id: "rule-strict",
        name: "Extreme SOS Rule",
        crimeType: "all",
        recommendedAction: "Immediate SWAT alert.",
        status: "active",
        hasConditions: true,
        conditionType: "sos_count",
        operator: ">=",
        threshold: 5, // Hotspot only has 1
      };

      const result = evaluateRuleAgainstHotspot(strictRule, testHotspot);
      expect(result).toBeNull();
    });

    test("ignores inactive rules", () => {
      const inactiveRule = {
        id: "rule-inactive",
        name: "Inactive Rule",
        status: "inactive",
        hasConditions: false,
      };

      expect(evaluateRuleAgainstHotspot(inactiveRule, testHotspot)).toBeNull();
    });
  });

  describe("5. Knowledge Retrieval with Expiration (retrievePublishedKnowledge)", () => {
    test("retrieves published unexpired knowledge and skips expired/draft", async () => {
      const mockDocs = [
        {
          id: "know-1",
          data: () => ({
            title: "Night Patrol Ordinance",
            type: "ordinance",
            status: "published",
            content: "Official ordinance text...",
            version: 1,
          }),
        },
        {
          id: "know-2",
          data: () => ({
            title: "Expired COVID Guideline",
            type: "guideline",
            status: "published",
            content: "Outdated guideline...",
            expirationDate: new Date(Date.now() - 100000), // Past
          }),
        },
      ];

      const mockDb = {
        collection: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({
            get: jest.fn().mockResolvedValue(mockDocs),
          }),
        }),
      };

      const knowledge = await retrievePublishedKnowledge(mockDb);
      expect(knowledge).toHaveLength(1);
      expect(knowledge[0].title).toBe("Night Patrol Ordinance");
    });
  });

  describe("6. Complete AI Context Bundle (retrieveAIContext)", () => {
    test("coordinates knowledge and rules into enriched context bundle", async () => {
      const mockKnowledgeDocs = [
        {
          id: "k1",
          data: () => ({
            title: "Anti-Theft Ordinance",
            type: "ordinance",
            status: "published",
            content: "Ordinance 2024-001 content...",
          }),
        },
      ];

      const mockRuleDocs = [
        {
          id: "r1",
          data: () => ({
            name: "High Crime Alert",
            crimeType: "theft_snatching",
            recommendedAction: "Deploy additional units.",
            priority: "high",
            status: "active",
            hasConditions: true,
            conditionType: "incident_count",
            operator: ">=",
            threshold: 3,
          }),
        },
      ];

      const mockDb = {
        collection: jest.fn((colName) => ({
          where: jest.fn(() => ({
            get: jest.fn().mockResolvedValue(colName === "ai_knowledge" ? mockKnowledgeDocs : mockRuleDocs),
          })),
        })),
      };

      const payload = {
        priorityHotspots: [
          {
            locationLabel: "Barangay Karuhatan",
            dominantType: "theft_snatching",
            totalReports: 6,
          },
        ],
      };

      const result = await retrieveAIContext(mockDb, payload);
      expect(result.knowledge).toHaveLength(1);
      expect(result.triggeredRules).toHaveLength(1);
      expect(result.triggeredRules[0].ruleName).toBe("High Crime Alert");
      expect(result.metadata.knowledgeCount).toBe(1);
      expect(result.metadata.rulesTriggeredCount).toBe(1);
    });
  });
});
