/**
 * Unit Tests for AI Verification & Safety Guardrails Subsystem
 * Phase 6 Test Suite: Jest unit tests for functions/src/verifyAIGuardrails.js
 */

const {
  scanForPII,
  scanForProhibitedLanguage,
  verifyVAWCCompliance,
  verifyCitations,
  verifyAIGuardrails,
} = require("../src/verifyAIGuardrails");

describe("AI Verification & Safety Guardrails Subsystem (Phase 6)", () => {
  describe("1. PII / Privacy Scanner (scanForPII)", () => {
    test("detects Philippine mobile phone numbers", () => {
      const text = "Please contact Officer Cruz at 09171234567 or +639181234567 for updates.";
      const violations = scanForPII(text, "testField");

      expect(violations).toHaveLength(1);
      expect(violations[0].code).toBe("PII_PHONE_DETECTED");
      expect(violations[0].severity).toBe("critical");
    });

    test("detects email addresses", () => {
      const text = "Send resident complaints to barangay.admin@valenzuela.gov.ph directly.";
      const violations = scanForPII(text, "testField");

      expect(violations).toHaveLength(1);
      expect(violations[0].code).toBe("PII_EMAIL_DETECTED");
      expect(violations[0].severity).toBe("critical");
    });

    test("returns empty array when no PII is present", () => {
      const text = "Deploy 2 barangay tanod units to monitor Gen. T. de Leon commercial strip.";
      expect(scanForPII(text, "testField")).toHaveLength(0);
    });
  });

  describe("2. Prohibited & Vigilante Language Scanner (scanForProhibitedLanguage)", () => {
    test("flags vigilante / unauthorized force phrases as CRITICAL", () => {
      const text = "Residents should hunt down suspects and take matters into their own hands.";
      const violations = scanForProhibitedLanguage(text, "actionField");

      expect(violations.length).toBeGreaterThanOrEqual(1);
      expect(violations.some((v) => v.code === "VIGILANTE_LANGUAGE_DETECTED")).toBe(true);
      expect(violations.some((v) => v.severity === "critical")).toBe(true);
    });

    test("flags overly alarmist panic phrases as WARNING", () => {
      const text = "The city is facing a total collapse of public order.";
      const violations = scanForProhibitedLanguage(text, "headline");

      expect(violations.some((v) => v.code === "ALARMIST_LANGUAGE_DETECTED")).toBe(true);
      expect(violations.some((v) => v.severity === "warning")).toBe(true);
    });

    test("passes professional public safety language", () => {
      const text = "Increase patrol visibility and coordinate with PNP Sub-Station 4 during peak hours.";
      expect(scanForProhibitedLanguage(text, "actionField")).toHaveLength(0);
    });
  });

  describe("3. VAWC / Domestic Dispute Privacy Compliance (verifyVAWCCompliance)", () => {
    test("flags public advisory that exposes sensitive domestic victim details", () => {
      const hotspot = {
        rank: 1,
        mainPattern: "Domestic violence and physical assault disputes",
        suggestedPublicAdvisory: "Residents near specific address and victim name should be on alert.",
      };

      const violations = verifyVAWCCompliance(hotspot);
      expect(violations).toHaveLength(1);
      expect(violations[0].code).toBe("VAWC_PRIVACY_BREACH");
      expect(violations[0].severity).toBe("critical");
    });

    test("passes privacy-respecting VAWC advice", () => {
      const hotspot = {
        rank: 1,
        mainPattern: "Domestic dispute reports",
        suggestedPublicAdvisory: "Community support resources and the Barangay VAWC desk are available 24/7.",
      };

      expect(verifyVAWCCompliance(hotspot)).toHaveLength(0);
    });
  });

  describe("4. Citation & Grounding Reconciliation (verifyCitations)", () => {
    const mockAiContext = {
      knowledge: [
        {
          title: "Night Patrol Ordinance",
          referenceNumber: "Ord. No. 2024-088",
        },
      ],
      triggeredRules: [
        {
          ruleName: "Theft Hotspot Escalation",
        },
      ],
    };

    test("verifies citations that match registered knowledge and rules", () => {
      const summary = {
        priorityHotspots: [
          {
            rank: 1,
            citedKnowledge: ["Ord. No. 2024-088: Night Patrol Ordinance"],
            matchedGuidance: ["Theft Hotspot Escalation"],
          },
        ],
      };

      const report = verifyCitations(summary, mockAiContext);
      expect(report.violations).toHaveLength(0);
      expect(report.stats.groundingScore).toBe(1.0);
    });

    test("flags hallucinated / unverified ordinances with a warning", () => {
      const summary = {
        priorityHotspots: [
          {
            rank: 1,
            citedKnowledge: ["Fake Ordinance No. 9999-XYZ"],
            matchedGuidance: ["Unknown Mythical Rule"],
          },
        ],
      };

      const report = verifyCitations(summary, mockAiContext);
      expect(report.violations.length).toBeGreaterThan(0);
      expect(report.violations.some((v) => v.code === "UNVERIFIED_KNOWLEDGE_CITATION")).toBe(true);
      expect(report.violations.some((v) => v.code === "UNVERIFIED_RULE_CITATION")).toBe(true);
      expect(report.stats.groundingScore).toBe(0);
    });
  });

  describe("5. Complete Guardrail Verification (verifyAIGuardrails)", () => {
    test("passes clean, well-grounded summary with safetyScore 1.0", () => {
      const cleanSummary = {
        headline: "Theft incidents reported along Gen. T. de Leon corridor",
        overallRisk: "medium",
        executiveSummary: "Incident pattern indicates snatching along transport bays during evening rush hours.",
        groundingSummary: "Applied Ordinance 2024-088 and Theft Escalation Rule.",
        priorityHotspots: [
          {
            rank: 1,
            locationLabel: "Gen. T. de Leon",
            mainPattern: "Theft / snatching incidents",
            suggestedPublicAdvisory: "Stay alert with mobile phones while waiting at transport terminals.",
            citedKnowledge: ["Ord. No. 2024-088"],
            matchedGuidance: ["Theft Hotspot Escalation"],
            recommendedActions: [
              {
                action: "Schedule routine tanod foot patrols from 17:00 to 21:00.",
                reason: "Correlates with observed peak rush hour reports.",
              },
            ],
          },
        ],
      };

      const mockAiContext = {
        knowledge: [{title: "Night Patrol Ordinance", referenceNumber: "Ord. No. 2024-088"}],
        triggeredRules: [{ruleName: "Theft Hotspot Escalation"}],
      };

      const report = verifyAIGuardrails(cleanSummary, {}, mockAiContext);

      expect(report.passed).toBe(true);
      expect(report.safetyScore).toBe(1.0);
      expect(report.criticalViolationCount).toBe(0);
    });

    test("fails summary containing critical PII and vigilante language", () => {
      const badSummary = {
        headline: "Residents must hunt down suspects at 09171234567",
        executiveSummary: "Call officer at admin@city.gov.ph immediately.",
        priorityHotspots: [],
      };

      const report = verifyAIGuardrails(badSummary);

      expect(report.passed).toBe(false);
      expect(report.criticalViolationCount).toBeGreaterThan(0);
      expect(report.safetyScore).toBeLessThan(0.6);
    });
  });
});
