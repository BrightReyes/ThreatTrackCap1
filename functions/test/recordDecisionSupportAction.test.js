/**
 * Unit Tests for Decision-Support Tracking & Audit Logging
 * Phase 7 Test Suite: Jest unit tests for functions/src/recordDecisionSupportAction.js
 */

const {
  validateDecisionPayload,
  buildReviewRecord,
  buildAuditRecord,
} = require("../src/recordDecisionSupportAction");

describe("Decision-Support Tracking & Audit Logging (Phase 7)", () => {
  describe("1. Payload Validator (validateDecisionPayload)", () => {
    test("accepts valid approved decision payload", () => {
      const input = {
        summaryId: "summary-123",
        decision: "approved",
        adminNotes: "Reviewed and approved by duty officer.",
        adoptedActions: [
          {
            actionId: "act-1",
            action: "Deploy foot patrol to Gen T de Leon",
            assignedUnit: "PNP Sub-station 4",
            targetLocation: "Gen T de Leon",
          },
        ],
      };

      const validated = validateDecisionPayload(input);
      expect(validated.summaryId).toBe("summary-123");
      expect(validated.decision).toBe("approved");
      expect(validated.adminNotes).toBe("Reviewed and approved by duty officer.");
      expect(validated.adoptedActions).toHaveLength(1);
      expect(validated.adoptedActions[0].actionId).toBe("act-1");
    });

    test("accepts valid rejected, modified, and adopted_action decisions", () => {
      expect(validateDecisionPayload({summaryId: "s1", decision: "rejected"}).decision).toBe("rejected");
      expect(validateDecisionPayload({summaryId: "s1", decision: "modified"}).decision).toBe("modified");
      expect(validateDecisionPayload({summaryId: "s1", decision: "adopted_action"}).decision).toBe("adopted_action");
    });

    test("throws error when summaryId is missing", () => {
      expect(() => {
        validateDecisionPayload({decision: "approved"});
      }).toThrow("summaryId is required.");
    });

    test("throws error on invalid decision type", () => {
      expect(() => {
        validateDecisionPayload({summaryId: "s1", decision: "arbitrary_choice"});
      }).toThrow(/Invalid decision/);
    });

    test("limits adoptedActions array to 10 items max", () => {
      const actions = new Array(15).fill({action: "Patrol"});
      const validated = validateDecisionPayload({summaryId: "s1", decision: "approved", adoptedActions: actions});
      expect(validated.adoptedActions).toHaveLength(10);
    });
  });

  describe("2. Review Record Builder (buildReviewRecord)", () => {
    test("creates structured review dictionary with user attribution", () => {
      const payload = {
        summaryId: "sum-999",
        decision: "approved",
        adminNotes: "All recommendations verified.",
        adoptedActions: [],
        modifications: null,
      };

      const user = {
        uid: "user-admin-1",
        email: "police.admin@valenzuela.gov.ph",
        role: "police_admin",
      };

      const record = buildReviewRecord(payload, user);
      expect(record["review.status"]).toBe("approved");
      expect(record["review.reviewedBy"]).toBe("user-admin-1");
      expect(record["review.reviewerEmail"]).toBe("police.admin@valenzuela.gov.ph");
      expect(record["review.reviewerRole"]).toBe("police_admin");
      expect(record["review.adminNotes"]).toBe("All recommendations verified.");
    });
  });

  describe("3. Immutable Audit Record Builder (buildAuditRecord)", () => {
    test("creates complete audit entry for ai_suggestion review", () => {
      const payload = {
        summaryId: "sum-999",
        decision: "approved",
        adminNotes: "Dispatched to substation.",
        adoptedActions: [{action: "Mobile checkpoint"}],
      };

      const user = {
        uid: "user-admin-1",
        email: "chief@valenzuela.gov.ph",
      };

      const summaryMeta = {
        inputStatsHash: "hash-abc-123",
        hotspotCount: 3,
        timeRange: "30d",
      };

      const audit = buildAuditRecord(payload, user, summaryMeta);
      expect(audit.action).toBe("ai_suggestion.approved");
      expect(audit.uid).toBe("user-admin-1");
      expect(audit.email).toBe("chief@valenzuela.gov.ph");
      expect(audit.meta.summaryId).toBe("sum-999");
      expect(audit.meta.adoptedActionsCount).toBe(1);
      expect(audit.meta.inputStatsHash).toBe("hash-abc-123");
      expect(audit.meta.hotspotCount).toBe(3);
      expect(audit.source).toBe("web_admin_decision_support");
    });
  });
});
