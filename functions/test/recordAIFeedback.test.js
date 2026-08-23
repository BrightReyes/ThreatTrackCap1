/**
 * Unit Tests for AI Feedback & Reinforcement Loop
 * Phase 8 Test Suite: Jest unit tests for functions/src/recordAIFeedback.js
 */

const {
  validateFeedbackPayload,
  buildFeedbackRecord,
  buildFeedbackAuditRecord,
} = require("../src/recordAIFeedback");

describe("AI Feedback Subsystem (Phase 8)", () => {
  describe("1. Feedback Payload Validator (validateFeedbackPayload)", () => {
    test("validates a complete and helpful feedback payload", () => {
      const input = {
        summaryId: "sum-abc",
        rating: "helpful",
        category: "helpful_strategy",
        hotspotLabel: "Karuhatan Commercial Hub",
        comment: "Excellent advice, foot patrol deployment effectively reduced snatching incidents.",
      };

      const validated = validateFeedbackPayload(input);
      expect(validated.summaryId).toBe("sum-abc");
      expect(validated.rating).toBe("helpful");
      expect(validated.category).toBe("helpful_strategy");
      expect(validated.hotspotLabel).toBe("Karuhatan Commercial Hub");
      expect(validated.comment).toContain("Excellent advice");
    });

    test("validates unhelpful rating with inaccurate_law category", () => {
      const input = {
        summaryId: "sum-xyz",
        rating: "unhelpful",
        category: "inaccurate_law",
        comment: "Ordinance cited was amended last year.",
      };

      const validated = validateFeedbackPayload(input);
      expect(validated.rating).toBe("unhelpful");
      expect(validated.category).toBe("inaccurate_law");
    });

    test("throws error when summaryId is missing", () => {
      expect(() => {
        validateFeedbackPayload({rating: "helpful"});
      }).toThrow("summaryId is required.");
    });

    test("throws error when rating is invalid", () => {
      expect(() => {
        validateFeedbackPayload({summaryId: "s1", rating: "super_good"});
      }).toThrow(/Invalid rating/);
    });

    test("throws error when category is invalid", () => {
      expect(() => {
        validateFeedbackPayload({summaryId: "s1", rating: "helpful", category: "magic"});
      }).toThrow(/Invalid category/);
    });
  });

  describe("2. Feedback Document Builder (buildFeedbackRecord)", () => {
    test("creates structured feedback document with user attribution", () => {
      const payload = {
        summaryId: "s1",
        hotspotLabel: "Malanday",
        rating: "helpful",
        category: "accurate",
        comment: "Good recommendation",
      };

      const user = {
        uid: "officer-777",
        email: "officer.santos@valenzuela.gov.ph",
        role: "police_admin",
      };

      const record = buildFeedbackRecord(payload, user);
      expect(record.summaryId).toBe("s1");
      expect(record.submittedBy).toBe("officer-777");
      expect(record.submitterEmail).toBe("officer.santos@valenzuela.gov.ph");
      expect(record.submitterRole).toBe("police_admin");
      expect(record.rating).toBe("helpful");
    });
  });

  describe("3. Audit Record Builder (buildFeedbackAuditRecord)", () => {
    test("creates immutable audit log entry for feedback submission", () => {
      const payload = {
        summaryId: "s1",
        hotspotLabel: "Malanday",
        rating: "unhelpful",
        category: "unrealistic_action",
      };

      const user = {
        uid: "officer-777",
        email: "officer.santos@valenzuela.gov.ph",
      };

      const audit = buildFeedbackAuditRecord(payload, user);
      expect(audit.action).toBe("ai_feedback.submit");
      expect(audit.uid).toBe("officer-777");
      expect(audit.meta.summaryId).toBe("s1");
      expect(audit.meta.rating).toBe("unhelpful");
      expect(audit.meta.category).toBe("unrealistic_action");
    });
  });
});
