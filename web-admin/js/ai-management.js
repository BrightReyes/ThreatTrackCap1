/**
 * AI Management — Knowledge Base & Operational Rules UI Controller
 * Phase 2 & Phase 3 Implementation:
 * - Knowledge Management CRUD (ai_knowledge)
 * - Hybrid Operational Rules Management CRUD (ai_rules)
 * Strictly isolated from AI generation at this phase.
 */

import { initAdminPage } from "./admin-auth.js";
import { initAdminCustomSelects } from "./admin-custom-select.js";
import {
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    serverTimestamp,
    query,
    orderBy,
    writeBatch
} from "firebase/firestore";
import { db } from "../../shared/firebase.js";
import { toastSuccess, toastError, confirmDanger } from "./alerts.js";
import { logAudit } from "./audit.js";

// State
let currentAdminUser = null;
let activeTab = "knowledge";

// Knowledge State
let knowledgeList = [];
let knowledgeStatusFilter = "all";
let knowledgeTypeFilter = "all";
let knowledgeSearchQuery = "";
let expandedKnowledgeIds = new Set();

// Rules State
let rulesList = [];
let rulesCrimeFilter = "all";
let rulesPriorityFilter = "all";
let rulesStatusFilter = "all";
let rulesSearchQuery = "";
let expandedRuleIds = new Set();

// National Laws State (Immutable Baseline Preview)
let nationalLawsList = [];
let nationalLawsIncidentFilter = "all";
let nationalLawsSearchQuery = "";

// Enums & Sets
const VALID_KNOWLEDGE_TYPES = new Set([
    "ordinance",
    "policy",
    "procedure",
    "guideline",
    "reference",
]);

const VALID_CRIME_TYPES = new Set([
    "all",
    "theft_snatching",
    "robbery_holdup",
    "physical_assault_injury",
    "domestic_violence",
    "drug_related_activity",
    "public_disturbance",
    "vandalism_property_damage",
    "traffic_accident",
    "illegal_weapons",
    "suspicious_activity",
]);

const VALID_CONDITION_TYPES = new Set([
    "incident_count",
    "high_severity_count",
    "sos_count",
    "weighted_score",
]);

const VALID_OPERATORS = new Set([">=", ">", "<=", "<", "=="]);
const VALID_TIME_PERIODS = new Set(["7d", "14d", "30d", "90d"]);
const VALID_PRIORITIES = new Set(["low", "medium", "high", "critical"]);
const VALID_RULE_STATUSES = new Set(["active", "inactive", "archived"]);

// DOM Elements
const elements = {
    // Tabs & Panels
    tabKnowledge: document.getElementById("tab-knowledge"),
    tabRules: document.getElementById("tab-rules"),
    panelKnowledge: document.getElementById("panel-knowledge"),
    panelRules: document.getElementById("panel-rules"),

    // Overview Stat Counters
    statTotalKnowledge: document.getElementById("stat-total-knowledge"),
    statPublishedKnowledge: document.getElementById("stat-published-knowledge"),
    statActiveRules: document.getElementById("stat-active-rules"),
    statTotalRules: document.getElementById("stat-total-rules"),
    statDraftTotal: document.getElementById("stat-draft-total"),
    statGroundingRate: document.getElementById("stat-grounding-rate"),
    badgeKnowledgeCount: document.getElementById("badge-knowledge-count"),
    badgeRulesCount: document.getElementById("badge-rules-count"),

    // Knowledge Toolbar
    knowledgeSearch: document.getElementById("knowledge-search"),
    knowledgeFilterStatus: document.getElementById("knowledge-filter-status"),
    knowledgeFilterType: document.getElementById("knowledge-filter-type"),
    btnAddKnowledge: document.getElementById("btn-add-knowledge"),
    knowledgeTbody: document.getElementById("knowledge-tbody"),
    knowledgeCount: document.getElementById("knowledge-count"),

    // Rules Toolbar
    rulesSearch: document.getElementById("rules-search"),
    rulesFilterCrime: document.getElementById("rules-filter-crime"),
    rulesFilterPriority: document.getElementById("rules-filter-priority"),
    rulesFilterStatus: document.getElementById("rules-filter-status"),
    btnAddRule: document.getElementById("btn-add-rule"),
    rulesTbody: document.getElementById("rules-tbody"),
    rulesCount: document.getElementById("rules-count"),

    // National Laws Preview Modal
    btnViewNationalLaws: document.getElementById("btn-view-national-laws"),
    nationalLawsModal: document.getElementById("national-laws-modal"),
    nationalLawsModalClose: document.getElementById("national-laws-modal-close"),
    nationalLawsModalDone: document.getElementById("national-laws-modal-done"),
    nationalLawsSearch: document.getElementById("national-laws-search"),
    nationalLawsGrid: document.getElementById("national-laws-grid"),
    natLawsVisibleCount: document.getElementById("nat-laws-visible-count"),

    // Knowledge Modal
    knowledgeModal: document.getElementById("knowledge-modal"),
    knowledgeModalTitle: document.getElementById("knowledge-modal-title"),
    knowledgeModalClose: document.getElementById("knowledge-modal-close"),
    knowledgeModalCancel: document.getElementById("knowledge-modal-cancel"),
    knowledgeModalSave: document.getElementById("knowledge-modal-save"),
    knowledgeForm: document.getElementById("knowledge-form"),
    knowledgeEditId: document.getElementById("knowledge-edit-id"),
    knowledgeTitle: document.getElementById("knowledge-title"),
    knowledgeType: document.getElementById("knowledge-type"),
    knowledgeStatus: document.getElementById("knowledge-status"),
    knowledgeSource: document.getElementById("knowledge-source"),
    knowledgeRef: document.getElementById("knowledge-ref"),
    knowledgeContent: document.getElementById("knowledge-content"),
    knowledgeContentCount: document.getElementById("knowledge-content-count"),

    // Rules Modal (Hybrid Model)
    ruleModal: document.getElementById("rule-modal"),
    ruleModalTitle: document.getElementById("rule-modal-title"),
    ruleModalClose: document.getElementById("rule-modal-close"),
    ruleModalCancel: document.getElementById("rule-modal-cancel"),
    ruleModalSave: document.getElementById("rule-modal-save"),
    ruleForm: document.getElementById("rule-form"),
    ruleEditId: document.getElementById("rule-edit-id"),
    ruleName: document.getElementById("rule-name"),
    ruleCrimeType: document.getElementById("rule-crime-type"),
    ruleDescription: document.getElementById("rule-description"),
    ruleAction: document.getElementById("rule-action"),
    ruleActionCount: document.getElementById("rule-action-count"),
    rulePriority: document.getElementById("rule-priority"),
    ruleStatus: document.getElementById("rule-status"),
    ruleAccordionConditions: document.getElementById("rule-accordion-conditions"),
    ruleAccordionContext: document.getElementById("rule-accordion-context"),
    ruleEnableCondition: document.getElementById("rule-enable-condition"),
    ruleConditionFields: document.getElementById("rule-condition-fields"),
    ruleConditionType: document.getElementById("rule-condition-type"),
    ruleOperator: document.getElementById("rule-operator"),
    ruleThreshold: document.getElementById("rule-threshold"),
    ruleTimePeriod: document.getElementById("rule-time-period"),
};

let isEventsBound = false;

// Initialize Page
initAdminPage({
    pageId: "page-ai-management",
    onReady: async (user) => {
        initAdminCustomSelects(document.getElementById("page-ai-management"));
        currentAdminUser = user;
        bindEvents();
        await Promise.all([loadKnowledge(), loadRules(), loadNationalLaws()]);
    },
});

// Bind UI events immediately on script execution so buttons are responsive without waiting for auth
bindEvents();
loadNationalLaws();

/**
 * Bind UI event listeners
 */
function bindEvents() {
    if (isEventsBound) return;
    isEventsBound = true;
    // Tab switching (2 tabs)
    elements.tabKnowledge?.addEventListener("click", () => switchTab("knowledge"));
    elements.tabRules?.addEventListener("click", () => switchTab("rules"));

    // National Laws Preview Modal
    elements.btnViewNationalLaws?.addEventListener("click", openNationalLawsModal);
    elements.nationalLawsModalClose?.addEventListener("click", closeNationalLawsModal);
    elements.nationalLawsModalDone?.addEventListener("click", closeNationalLawsModal);
    elements.nationalLawsModal?.querySelector(".ai-mgmt-modal__backdrop")?.addEventListener("click", closeNationalLawsModal);
    elements.nationalLawsSearch?.addEventListener("input", (e) => {
        nationalLawsSearchQuery = (e.target.value || "").trim().toLowerCase();
        renderNationalLawsGrid();
    });

    document.querySelectorAll(".ai-nat-pill").forEach((pill) => {
        pill.addEventListener("click", () => {
            document.querySelectorAll(".ai-nat-pill").forEach((p) => p.classList.remove("ai-nat-pill--active"));
            pill.classList.add("ai-nat-pill--active");
            nationalLawsIncidentFilter = pill.getAttribute("data-incident") || "all";
            renderNationalLawsGrid();
        });
    });

    // Knowledge Search & Filters
    elements.knowledgeSearch?.addEventListener("input", (e) => {
        knowledgeSearchQuery = (e.target.value || "").trim().toLowerCase();
        renderKnowledgeTable();
    });

    elements.knowledgeFilterStatus?.addEventListener("change", (e) => {
        knowledgeStatusFilter = e.target.value || "all";
        renderKnowledgeTable();
    });

    elements.knowledgeFilterType?.addEventListener("change", (e) => {
        knowledgeTypeFilter = e.target.value || "all";
        renderKnowledgeTable();
    });

    elements.btnAddKnowledge?.addEventListener("click", () => openKnowledgeModal());
    elements.knowledgeModalClose?.addEventListener("click", closeKnowledgeModal);
    elements.knowledgeModalCancel?.addEventListener("click", closeKnowledgeModal);
    elements.knowledgeModal?.querySelector(".ai-mgmt-modal__backdrop")?.addEventListener("click", closeKnowledgeModal);
    elements.knowledgeContent?.addEventListener("input", () => {
        if (elements.knowledgeContentCount && elements.knowledgeContent) {
            elements.knowledgeContentCount.textContent = String(elements.knowledgeContent.value.length);
        }
    });
    elements.knowledgeModalSave?.addEventListener("click", handleSaveKnowledge);
    elements.knowledgeTbody?.addEventListener("click", handleKnowledgeTableAction);

    // Rules Search & Filters
    elements.rulesSearch?.addEventListener("input", (e) => {
        rulesSearchQuery = (e.target.value || "").trim().toLowerCase();
        renderRulesTable();
    });

    elements.rulesFilterCrime?.addEventListener("change", (e) => {
        rulesCrimeFilter = e.target.value || "all";
        renderRulesTable();
    });

    elements.rulesFilterPriority?.addEventListener("change", (e) => {
        rulesPriorityFilter = e.target.value || "all";
        renderRulesTable();
    });

    elements.rulesFilterStatus?.addEventListener("change", (e) => {
        rulesStatusFilter = e.target.value || "all";
        renderRulesTable();
    });

    elements.btnAddRule?.addEventListener("click", () => openRuleModal());
    elements.ruleModalClose?.addEventListener("click", closeRuleModal);
    elements.ruleModalCancel?.addEventListener("click", closeRuleModal);
    elements.ruleModal?.querySelector(".ai-mgmt-modal__backdrop")?.addEventListener("click", closeRuleModal);

    // Condition checkbox toggle
    elements.ruleEnableCondition?.addEventListener("change", (e) => {
        toggleConditionInputs(e.target.checked);
    });

    elements.ruleAction?.addEventListener("input", () => {
        if (elements.ruleActionCount && elements.ruleAction) {
            elements.ruleActionCount.textContent = String(elements.ruleAction.value.length);
        }
    });
    elements.ruleModalSave?.addEventListener("click", handleSaveRule);
    elements.rulesTbody?.addEventListener("click", handleRulesTableAction);
}

/**
 * Toggle Condition Input Availability
 */
function toggleConditionInputs(enabled) {
    if (elements.ruleConditionFields) {
        elements.ruleConditionFields.hidden = !enabled;
    }
}

/**
 * Switch top-level tabs (Knowledge, Rules)
 */
function switchTab(tabName) {
    activeTab = tabName;
    const isKnowledge = tabName === "knowledge";
    const isRules = tabName === "rules";

    elements.tabKnowledge?.classList.toggle("ai-mgmt-tab--active", isKnowledge);
    elements.tabKnowledge?.setAttribute("aria-selected", String(isKnowledge));
    elements.tabRules?.classList.toggle("ai-mgmt-tab--active", isRules);
    elements.tabRules?.setAttribute("aria-selected", String(isRules));

    if (elements.panelKnowledge) elements.panelKnowledge.hidden = !isKnowledge;
    if (elements.panelRules) elements.panelRules.hidden = !isRules;
}

/**
 * Unified Telemetry Strip Update (Reflects both Knowledge and Rules stats)
 */
function updateUnifiedTelemetry() {
    const totalK = knowledgeList.length;
    const publishedK = knowledgeList.filter((k) => k.status === "published").length;
    const draftK = knowledgeList.filter((k) => k.status === "draft" || k.status === "archived").length;

    const totalR = rulesList.length;
    const activeR = rulesList.filter((r) => r.status === "active").length;
    const inactiveR = rulesList.filter((r) => r.status === "inactive" || r.status === "archived").length;

    if (elements.statPublishedKnowledge) elements.statPublishedKnowledge.textContent = String(publishedK);
    if (elements.statTotalKnowledge) elements.statTotalKnowledge.textContent = String(totalK);
    if (elements.statActiveRules) elements.statActiveRules.textContent = String(activeR);
    if (elements.statTotalRules) elements.statTotalRules.textContent = String(totalR);
    if (elements.statDraftTotal) elements.statDraftTotal.textContent = String(draftK + inactiveR);
    if (elements.statGroundingRate) {
        elements.statGroundingRate.textContent = publishedK > 0 ? "100%" : "0%";
    }
    if (elements.badgeKnowledgeCount) elements.badgeKnowledgeCount.textContent = String(totalK);
    if (elements.badgeRulesCount) elements.badgeRulesCount.textContent = String(totalR);
}

function updateKnowledgeStats() {
    updateUnifiedTelemetry();
}

function updateRulesStats() {
    updateUnifiedTelemetry();
}

function getKnowledgeTypeBadge(type) {
    switch (type) {
        case "ordinance":
            return `<span class="ai-type-badge ai-type-badge--ordinance"><span class="material-symbols-outlined" style="font-size:13px;">gavel</span><span>City Ordinance</span></span>`;
        case "procedure":
            return `<span class="ai-type-badge ai-type-badge--procedure"><span class="material-symbols-outlined" style="font-size:13px;">shield</span><span>Tactical SOP</span></span>`;
        case "policy":
            return `<span class="ai-type-badge ai-type-badge--policy"><span class="material-symbols-outlined" style="font-size:13px;">account_balance</span><span>Dept Policy</span></span>`;
        case "guideline":
            return `<span class="ai-type-badge ai-type-badge--policy"><span class="material-symbols-outlined" style="font-size:13px;">campaign</span><span>Guideline</span></span>`;
        default:
            return `<span class="ai-type-badge ai-type-badge--reference"><span class="material-symbols-outlined" style="font-size:13px;">menu_book</span><span>National Law</span></span>`;
    }
}

/* ============================================================
   KNOWLEDGE BASE (ai_knowledge) CRUD
   ============================================================ */

async function loadKnowledge() {
    if (!elements.knowledgeTbody) return;
    elements.knowledgeTbody.innerHTML = `
        <tr>
            <td colspan="6" class="ai-mgmt-empty">
                <div class="ai-mgmt-loading-state">
                    <span class="material-symbols-outlined ai-mgmt-spin">progress_activity</span>
                    <span>Loading statutory knowledge entries…</span>
                </div>
            </td>
        </tr>
    `;

    try {
        const q = query(collection(db, "ai_knowledge"), orderBy("updatedAt", "desc"));
        const snapshot = await getDocs(q);

        knowledgeList = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                title: data.title || "",
                type: data.type || "reference",
                source: data.source || "",
                referenceNumber: data.referenceNumber || "",
                content: data.content || "",
                status: data.status || "draft",
                version: Number.isFinite(data.version) ? data.version : 1,
                effectiveDate: data.effectiveDate || null,
                expirationDate: data.expirationDate || null,
                createdBy: data.createdBy || "",
                createdAt: data.createdAt || null,
                updatedBy: data.updatedBy || "",
                updatedAt: data.updatedAt || null,
            };
        });

        updateUnifiedTelemetry();
        renderKnowledgeTable();
    } catch (error) {
        console.error("[ai-management] Failed to load knowledge:", error);
        elements.knowledgeTbody.innerHTML = `
            <tr>
                <td colspan="6" class="ai-mgmt-empty" style="color: #ef4444;">
                    Failed to load knowledge entries: ${escapeHtml(error.message)}
                </td>
            </tr>
        `;
        toastError("Failed to load knowledge entries.");
    }
}

function renderKnowledgeTable() {
    if (!elements.knowledgeTbody) return;

    let filtered = knowledgeList;

    if (knowledgeStatusFilter !== "all") {
        filtered = filtered.filter((item) => item.status === knowledgeStatusFilter);
    }

    if (knowledgeTypeFilter !== "all") {
        filtered = filtered.filter((item) => item.type === knowledgeTypeFilter);
    }

    if (knowledgeSearchQuery) {
        filtered = filtered.filter((item) => {
            return (
                item.title.toLowerCase().includes(knowledgeSearchQuery) ||
                item.source.toLowerCase().includes(knowledgeSearchQuery) ||
                item.referenceNumber.toLowerCase().includes(knowledgeSearchQuery) ||
                item.content.toLowerCase().includes(knowledgeSearchQuery) ||
                item.type.toLowerCase().includes(knowledgeSearchQuery)
            );
        });
    }

    if (elements.knowledgeCount) {
        const total = knowledgeList.length;
        const showing = filtered.length;
        elements.knowledgeCount.textContent = `Showing ${showing} of ${total} statutory entries`;
    }

    if (!filtered.length) {
        const message = knowledgeSearchQuery
            ? "No knowledge entries matching your search query."
            : knowledgeStatusFilter !== "all" || knowledgeTypeFilter !== "all"
              ? "No knowledge entries match the selected filters."
              : "No knowledge entries yet. Click \"Add Statutory Entry\" to create the first record.";
        elements.knowledgeTbody.innerHTML = `
            <tr>
                <td colspan="6" class="ai-mgmt-empty">${escapeHtml(message)}</td>
            </tr>
        `;
        return;
    }

    elements.knowledgeTbody.innerHTML = filtered
        .map((item) => {
            const dateStr = formatDate(item.updatedAt || item.createdAt);
            const isPublished = item.status === "published";
            const isArchived = item.status === "archived";
            const statusClass = `ai-mgmt-badge--${escapeAttr(item.status)}`;
            const isExpanded = expandedKnowledgeIds.has(item.id);

            let statusHtml = "";
            if (isArchived) {
                statusHtml = `<span class="ai-mgmt-badge ai-mgmt-badge--archived">Archived</span>`;
            } else {
                statusHtml = `
                    <div class="ai-mgmt-status-toggle-wrap">
                        <button
                            type="button"
                            class="ai-mgmt-toggle-switch ${isPublished ? "ai-mgmt-toggle-switch--on" : ""}"
                            data-action="toggle-status"
                            data-id="${escapeAttr(item.id)}"
                            data-next-status="${isPublished ? "draft" : "published"}"
                            role="switch"
                            aria-checked="${isPublished}"
                            title="Click to ${isPublished ? "Unpublish (set to Draft)" : "Publish in RAG"}"
                        >
                            <span class="ai-mgmt-toggle-switch__slider"></span>
                        </button>
                        <span class="ai-mgmt-badge ${statusClass}">${escapeHtml(isPublished ? "Published" : "Draft")}</span>
                    </div>
                `;
            }

            const mainRow = `
                <tr data-id="${escapeAttr(item.id)}" class="${isExpanded ? "ai-row--expanded" : ""}">
                    <td>
                        <div class="ai-mgmt-table__title" title="${escapeAttr(item.title)}">
                            ${escapeHtml(item.title)}
                        </div>
                        <div class="ai-mgmt-table__meta-sub" style="color:#64748b;font-size:0.76rem;margin-top:2px;">
                            ${escapeHtml(truncate(item.content, 65))}
                        </div>
                    </td>
                    <td>
                        ${getKnowledgeTypeBadge(item.type)}
                    </td>
                    <td>
                        <strong style="font-size:0.84rem;color:#0f172a;">${escapeHtml(item.source)}</strong>
                        ${item.referenceNumber ? `<div class="ai-mgmt-table__meta-sub" style="font-weight:600;color:#2563eb;">${escapeHtml(item.referenceNumber)}</div>` : ""}
                    </td>
                    <td>
                        ${statusHtml}
                    </td>
                    <td><span style="font-size:0.78rem;color:#475569;">${escapeHtml(dateStr)}</span></td>
                    <td class="ai-mgmt-th--actions">
                        <div class="ai-mgmt-table__actions">
                            <button
                                type="button"
                                class="ai-mgmt-btn ai-mgmt-btn--ghost ai-mgmt-btn--sm"
                                data-action="inspect-knowledge"
                                data-id="${escapeAttr(item.id)}"
                                title="${isExpanded ? "Collapse Details" : "Quick Inspect Excerpt"}"
                                style="${isExpanded ? "background:#eff6ff;color:#1d4ed8;" : ""}"
                            >
                                <span class="material-symbols-outlined">${isExpanded ? "expand_less" : "visibility"}</span>
                            </button>
                            <button
                                type="button"
                                class="ai-mgmt-btn ai-mgmt-btn--ghost ai-mgmt-btn--sm"
                                data-action="edit"
                                data-id="${escapeAttr(item.id)}"
                                title="Edit Entry"
                            >
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                            ${
                                item.status !== "archived"
                                    ? `
                                <button
                                    type="button"
                                    class="ai-mgmt-btn ai-mgmt-btn--archive ai-mgmt-btn--sm"
                                    data-action="archive"
                                    data-id="${escapeAttr(item.id)}"
                                    title="Archive"
                                >
                                    <span class="material-symbols-outlined">archive</span>
                                </button>`
                                    : `
                                <button
                                    type="button"
                                    class="ai-mgmt-btn ai-mgmt-btn--restore ai-mgmt-btn--sm"
                                    data-action="restore"
                                    data-id="${escapeAttr(item.id)}"
                                    title="Restore to Draft"
                                >
                                    <span class="material-symbols-outlined">unarchive</span>
                                </button>`
                            }
                        </div>
                    </td>
                </tr>
            `;

            const expandedRow = isExpanded ? `
                <tr class="ai-mgmt-expandable-row" id="expand-k-${escapeAttr(item.id)}">
                    <td colspan="6" style="padding: 0; background: #f8fafc;">
                        <div class="ai-mgmt-detail-drawer">
                            <div class="ai-mgmt-detail-drawer__top">
                                <span class="ai-mgmt-detail-drawer__title">
                                    <span class="material-symbols-outlined" style="color:#2563eb;font-size:18px;">menu_book</span>
                                    <span>${escapeHtml(item.title)} &mdash; Statutory Directive Inspection</span>
                                </span>
                                <span class="ai-telemetry-pill ${isPublished ? "ai-telemetry-pill--emerald" : "ai-telemetry-pill--amber"}">
                                    <span class="ai-telemetry-dot"></span>
                                    <span>${isPublished ? "Active in RAG Hotspot Citations" : "Private Draft"}</span>
                                </span>
                            </div>
                            <div class="ai-mgmt-detail-drawer__quote">"${escapeHtml(item.content)}"</div>
                            <div class="ai-mgmt-detail-drawer__grid">
                                <div class="ai-mgmt-detail-drawer__meta-item">
                                    <strong>Issuing Authority</strong>
                                    <span>${escapeHtml(item.source)}</span>
                                </div>
                                <div class="ai-mgmt-detail-drawer__meta-item">
                                    <strong>Reference / Docket Code</strong>
                                    <span>${escapeHtml(item.referenceNumber || "Official Gazette / Resolution")}</span>
                                </div>
                                <div class="ai-mgmt-detail-drawer__meta-item">
                                    <strong>Legal Powers Conferred</strong>
                                    <span>Authorizes field verification, perimeter visibility, and detention under Rule 113.</span>
                                </div>
                                <div class="ai-mgmt-detail-drawer__meta-item">
                                    <strong>Document Version &amp; Audit</strong>
                                    <span>v${item.version || 1} &bull; Updated ${escapeHtml(dateStr)}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            ` : "";

            return mainRow + expandedRow;
        })
        .join("");
}

async function handleKnowledgeTableAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const item = knowledgeList.find((k) => k.id === id);
    if (!item) return;

    if (action === "inspect-knowledge") {
        if (expandedKnowledgeIds.has(id)) {
            expandedKnowledgeIds.delete(id);
        } else {
            expandedKnowledgeIds.add(id);
        }
        renderKnowledgeTable();
    } else if (action === "toggle-status") {
        const nextStatus = btn.dataset.nextStatus;
        await toggleKnowledgeStatusDirect(item, nextStatus, btn);
    } else if (action === "edit") {
        openKnowledgeModal(item);
    } else if (action === "publish") {
        await handleKnowledgeStatusChange(item, "published");
    } else if (action === "archive") {
        await handleKnowledgeStatusChange(item, "archived");
    } else if (action === "restore") {
        await handleKnowledgeStatusChange(item, "draft");
    }
}

async function toggleKnowledgeStatusDirect(item, newStatus, btn) {
    if (!item) return;
    if (btn) btn.classList.add("ai-mgmt-toggle-switch--loading");

    try {
        const nextVersion = (item.version || 1) + 1;
        const docRef = doc(db, "ai_knowledge", item.id);

        await updateDoc(docRef, {
            status: newStatus,
            version: nextVersion,
            updatedBy: currentAdminUser?.uid || "admin",
            updatedAt: serverTimestamp(),
        });

        item.status = newStatus;
        item.version = nextVersion;

        await logAudit("ai_knowledge.toggle_status", {
            knowledgeId: item.id,
            title: item.title,
            previousStatus: newStatus === "published" ? "draft" : "published",
            newStatus,
            version: nextVersion,
        });

        updateKnowledgeStats();
        renderKnowledgeTable();

        if (newStatus === "published") {
            toastSuccess(`"${item.title}" is now Published for AI Decision Support.`);
        } else {
            toastSuccess(`"${item.title}" unpublished (set to Draft).`);
        }
    } catch (error) {
        console.error("[ai-management] Failed to toggle knowledge status:", error);
        toastError("Failed to update status.");
        if (btn) btn.classList.remove("ai-mgmt-toggle-switch--loading");
    }
}

function openKnowledgeModal(item = null) {
    if (!elements.knowledgeModal) return;
    clearFormErrors();

    if (item) {
        elements.knowledgeModalTitle.textContent = "Edit Knowledge Entry";
        elements.knowledgeEditId.value = item.id;
        elements.knowledgeTitle.value = item.title;
        elements.knowledgeType.value = item.type;
        elements.knowledgeStatus.value = item.status === "archived" ? "draft" : item.status;
        elements.knowledgeSource.value = item.source;
        elements.knowledgeRef.value = item.referenceNumber || "";
        elements.knowledgeContent.value = item.content;
    } else {
        elements.knowledgeModalTitle.textContent = "Add Knowledge Entry";
        elements.knowledgeEditId.value = "";
        elements.knowledgeForm.reset();
        elements.knowledgeStatus.value = "draft";
    }

    if (elements.knowledgeContentCount && elements.knowledgeContent) {
        elements.knowledgeContentCount.textContent = String(elements.knowledgeContent.value.length);
    }

    elements.knowledgeModal.hidden = false;
    elements.knowledgeTitle?.focus();
}

function closeKnowledgeModal() {
    if (elements.knowledgeModal) {
        elements.knowledgeModal.hidden = true;
    }
}

async function handleSaveKnowledge() {
    const editId = (elements.knowledgeEditId?.value || "").trim();
    const title = (elements.knowledgeTitle?.value || "").trim();
    const type = (elements.knowledgeType?.value || "").trim();
    const status = (elements.knowledgeStatus?.value || "draft").trim();
    const source = (elements.knowledgeSource?.value || "").trim();
    const referenceNumber = (elements.knowledgeRef?.value || "").trim();
    const content = (elements.knowledgeContent?.value || "").trim();

    clearFormErrors();
    let hasError = false;

    if (!title || title.length < 3 || title.length > 200) {
        setFieldError(elements.knowledgeTitle, "Title is required (3–200 characters).");
        hasError = true;
    }

    if (!VALID_KNOWLEDGE_TYPES.has(type)) {
        setFieldError(elements.knowledgeType, "Please select a valid knowledge type.");
        hasError = true;
    }

    if (!source || source.length < 3 || source.length > 200) {
        setFieldError(elements.knowledgeSource, "Source authority is required (3–200 characters).");
        hasError = true;
    }

    if (!content || content.length < 10 || content.length > 10000) {
        setFieldError(elements.knowledgeContent, "Content is required (10–10,000 characters).");
        hasError = true;
    }

    if (hasError) return;

    if (!currentAdminUser?.uid) {
        toastError("You must be signed in as an administrator.");
        return;
    }

    if (elements.knowledgeModalSave) {
        elements.knowledgeModalSave.disabled = true;
        elements.knowledgeModalSave.innerHTML = `
            <span class="material-symbols-outlined ai-mgmt-spin">progress_activity</span>
            <span>Saving…</span>
        `;
    }

    try {
        if (editId) {
            const existing = knowledgeList.find((k) => k.id === editId);
            const nextVersion = (existing?.version || 1) + 1;

            const docRef = doc(db, "ai_knowledge", editId);
            await updateDoc(docRef, {
                title,
                type,
                status,
                source,
                referenceNumber,
                content,
                version: nextVersion,
                updatedBy: currentAdminUser.uid,
                updatedAt: serverTimestamp(),
            });

            await logAudit("ai_knowledge.update", {
                knowledgeId: editId,
                title,
                version: nextVersion,
                status,
            });

            toastSuccess(`Knowledge entry updated to v${nextVersion}`);
        } else {
            const newDoc = {
                title,
                type,
                status,
                source,
                referenceNumber,
                content,
                version: 1,
                effectiveDate: null,
                expirationDate: null,
                createdBy: currentAdminUser.uid,
                createdAt: serverTimestamp(),
                updatedBy: currentAdminUser.uid,
                updatedAt: serverTimestamp(),
            };

            const docRef = await addDoc(collection(db, "ai_knowledge"), newDoc);

            await logAudit("ai_knowledge.create", {
                knowledgeId: docRef.id,
                title,
                type,
                status,
            });

            toastSuccess("Knowledge entry created successfully.");
        }

        closeKnowledgeModal();
        await loadKnowledge();
    } catch (error) {
        console.error("[ai-management] Save error:", error);
        toastError(error?.message || "Failed to save knowledge entry.");
    } finally {
        if (elements.knowledgeModalSave) {
            elements.knowledgeModalSave.disabled = false;
            elements.knowledgeModalSave.innerHTML = `
                <span class="material-symbols-outlined" aria-hidden="true">save</span>
                <span>Save Knowledge Entry</span>
            `;
        }
    }
}

async function handleKnowledgeStatusChange(item, newStatus) {
    const actionLabel =
        newStatus === "published"
            ? "publish"
            : newStatus === "archived"
              ? "archive"
              : "restore";

    const confirmed = await confirmDanger({
        title: `${capitalize(actionLabel)} Knowledge Entry?`,
        text: `Are you sure you want to ${actionLabel} "${item.title}"?`,
        confirmText: capitalize(actionLabel),
    });

    if (!confirmed) return;

    try {
        const nextVersion = (item.version || 1) + 1;
        const docRef = doc(db, "ai_knowledge", item.id);

        await updateDoc(docRef, {
            status: newStatus,
            version: nextVersion,
            updatedBy: currentAdminUser?.uid || "admin",
            updatedAt: serverTimestamp(),
        });

        await logAudit(`ai_knowledge.${actionLabel}`, {
            knowledgeId: item.id,
            title: item.title,
            previousStatus: item.status,
            newStatus,
            version: nextVersion,
        });

        toastSuccess(`Knowledge entry ${actionLabel}ed successfully (v${nextVersion}).`);
        await loadKnowledge();
    } catch (error) {
        console.error(`[ai-management] Failed to ${actionLabel}:`, error);
        toastError(`Failed to ${actionLabel} knowledge entry.`);
    }
}

/* ============================================================
   OPERATIONAL RULES (ai_rules) CRUD — Hybrid Model
   ============================================================ */

async function loadRules() {
    if (!elements.rulesTbody) return;
    elements.rulesTbody.innerHTML = `
        <tr>
            <td colspan="7" class="ai-mgmt-empty">
                <div class="ai-mgmt-loading-state">
                    <span class="material-symbols-outlined ai-mgmt-spin">progress_activity</span>
                    <span>Loading operational rules…</span>
                </div>
            </td>
        </tr>
    `;

    try {
        const q = query(collection(db, "ai_rules"), orderBy("updatedAt", "desc"));
        const snapshot = await getDocs(q);

        rulesList = snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
                id: docSnap.id,
                name: data.name || "",
                crimeType: data.crimeType || data.appliesTo || "all",
                description: data.description || data.additionalContext || "",
                recommendedAction: data.recommendedAction || data.guidance || "",
                hasConditions: data.hasConditions === true,
                conditionType: data.conditionType || null,
                operator: data.operator || null,
                threshold: Number.isFinite(data.threshold) ? data.threshold : null,
                timePeriod: data.timePeriod || null,
                priority: data.priority || "medium",
                status: data.status || "active",
                version: Number.isFinite(data.version) ? data.version : 1,
                createdBy: data.createdBy || "",
                createdAt: data.createdAt || null,
                updatedBy: data.updatedBy || "",
                updatedAt: data.updatedAt || null,
            };
        });

        updateRulesStats();
        renderRulesTable();
    } catch (error) {
        console.error("[ai-management] Failed to load rules:", error);
        elements.rulesTbody.innerHTML = `
            <tr>
                <td colspan="7" class="ai-mgmt-empty" style="color: #ef4444;">
                    Failed to load operational rules: ${escapeHtml(error.message)}
                </td>
            </tr>
        `;
        toastError("Failed to load operational rules.");
    }
}

function renderRulesTable() {
    if (!elements.rulesTbody) return;

    let filtered = rulesList;

    if (rulesCrimeFilter !== "all") {
        filtered = filtered.filter((r) => r.crimeType === rulesCrimeFilter);
    }

    if (rulesPriorityFilter !== "all") {
        filtered = filtered.filter((r) => r.priority === rulesPriorityFilter);
    }

    if (rulesStatusFilter !== "all") {
        filtered = filtered.filter((r) => r.status === rulesStatusFilter);
    }

    if (rulesSearchQuery) {
        filtered = filtered.filter((r) => {
            return (
                r.name.toLowerCase().includes(rulesSearchQuery) ||
                r.description.toLowerCase().includes(rulesSearchQuery) ||
                r.recommendedAction.toLowerCase().includes(rulesSearchQuery) ||
                r.crimeType.toLowerCase().includes(rulesSearchQuery)
            );
        });
    }

    if (elements.rulesCount) {
        const total = rulesList.length;
        const showing = filtered.length;
        elements.rulesCount.textContent = `Showing ${showing} of ${total} operational rules`;
    }

    if (!filtered.length) {
        const message = rulesSearchQuery
            ? "No operational rules matching your search query."
            : rulesCrimeFilter !== "all" || rulesPriorityFilter !== "all" || rulesStatusFilter !== "all"
              ? "No operational rules match the selected filters."
              : "No operational rules yet. Click \"Add Rule\" to create the first operational guidance.";
        elements.rulesTbody.innerHTML = `
            <tr>
                <td colspan="7" class="ai-mgmt-empty">${escapeHtml(message)}</td>
            </tr>
        `;
        return;
    }

    elements.rulesTbody.innerHTML = filtered
        .map((r) => {
            const dateStr = formatDate(r.updatedAt || r.createdAt);
            const statusClass = `ai-mgmt-badge--${escapeAttr(r.status)}`;
            const priorityClass = `ai-mgmt-priority--${escapeAttr(r.priority)}`;
            const isActive = r.status === "active";
            const isArchived = r.status === "archived";

            // Render Condition Badge: either formula tag or General Guidance pill
            let conditionHtml = "";
            if (r.hasConditions && r.conditionType && r.operator && r.threshold != null) {
                const metricLabel = formatConditionMetric(r.conditionType);
                conditionHtml = `
                    <span class="ai-mgmt-formula-tag" title="Trigger condition criteria">
                        ${escapeHtml(metricLabel)} ${escapeHtml(r.operator)} ${escapeHtml(String(r.threshold))}
                        <span class="ai-mgmt-formula-tag__window">[${escapeHtml(r.timePeriod || "30d")}]</span>
                    </span>
                `;
            } else {
                conditionHtml = `
                    <span class="ai-mgmt-guidance-pill" title="Applies broadly whenever target crime type occurs">
                        <span class="material-symbols-outlined" style="font-size: 1rem; color: #6366f1;">lightbulb</span>
                        General Guidance
                    </span>
                `;
            }

            let statusHtml = "";
            if (isArchived) {
                statusHtml = `<span class="ai-mgmt-badge ai-mgmt-badge--archived">Archived</span>`;
            } else {
                statusHtml = `
                    <div class="ai-mgmt-status-toggle-wrap">
                        <button
                            type="button"
                            class="ai-mgmt-toggle-switch ${isActive ? "ai-mgmt-toggle-switch--on" : ""}"
                            data-action="toggle-rule-status"
                            data-id="${escapeAttr(r.id)}"
                            data-next-status="${isActive ? "inactive" : "active"}"
                            role="switch"
                            aria-checked="${isActive}"
                            title="Click to ${isActive ? "Deactivate (set to Inactive)" : "Activate this Rule"}"
                        >
                            <span class="ai-mgmt-toggle-switch__slider"></span>
                        </button>
                        <span class="ai-mgmt-badge ${statusClass}">${escapeHtml(isActive ? "Active" : "Inactive")}</span>
                    </div>
                `;
            }

            const isExpanded = expandedRuleIds.has(r.id);

            const mainRow = `
                <tr data-id="${escapeAttr(r.id)}" class="${isExpanded ? "ai-row--expanded" : ""}">
                    <td>
                        <div class="ai-mgmt-table__title" title="${escapeAttr(r.name)}">
                            ${escapeHtml(r.name)}
                        </div>
                        ${r.description ? `<div class="ai-mgmt-table__meta-sub" title="${escapeAttr(r.description)}" style="color:#64748b;font-size:0.76rem;margin-top:2px;">${escapeHtml(truncate(r.description, 45))}</div>` : ""}
                    </td>
                    <td>
                        <span class="ai-mgmt-type-tag" style="background:#eef2ff;color:#3730a3;border-color:#c7d2fe;">${escapeHtml(humanizeCrimeType(r.crimeType))}</span>
                    </td>
                    <td>
                        <div class="ai-mgmt-table__title" style="max-width: 260px; font-weight: 500; font-size:0.83rem;" title="${escapeAttr(r.recommendedAction)}">
                            ${escapeHtml(truncate(r.recommendedAction, 70))}
                        </div>
                    </td>
                    <td>
                        ${conditionHtml}
                    </td>
                    <td>
                        <span class="ai-mgmt-priority ${priorityClass}">${escapeHtml(r.priority)}</span>
                    </td>
                    <td>
                        ${statusHtml}
                    </td>
                    <td class="ai-mgmt-th--actions">
                        <div class="ai-mgmt-table__actions">
                            <button
                                type="button"
                                class="ai-mgmt-btn ai-mgmt-btn--ghost ai-mgmt-btn--sm"
                                data-action="inspect-rule"
                                data-id="${escapeAttr(r.id)}"
                                title="${isExpanded ? "Collapse Details" : "Quick Inspect Guidance"}"
                                style="${isExpanded ? "background:#eff6ff;color:#1d4ed8;" : ""}"
                            >
                                <span class="material-symbols-outlined">${isExpanded ? "expand_less" : "visibility"}</span>
                            </button>
                            <button
                                type="button"
                                class="ai-mgmt-btn ai-mgmt-btn--ghost ai-mgmt-btn--sm"
                                data-action="edit-rule"
                                data-id="${escapeAttr(r.id)}"
                                title="Edit Rule"
                            >
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                            ${
                                r.status !== "archived"
                                    ? `
                                <button
                                    type="button"
                                    class="ai-mgmt-btn ai-mgmt-btn--archive ai-mgmt-btn--sm"
                                    data-action="archive-rule"
                                    data-id="${escapeAttr(r.id)}"
                                    title="Archive Rule"
                                >
                                    <span class="material-symbols-outlined">archive</span>
                                </button>`
                                    : `
                                <button
                                    type="button"
                                    class="ai-mgmt-btn ai-mgmt-btn--restore ai-mgmt-btn--sm"
                                    data-action="restore-rule"
                                    data-id="${escapeAttr(r.id)}"
                                    title="Restore Rule to Inactive"
                                >
                                    <span class="material-symbols-outlined">unarchive</span>
                                </button>`
                            }
                        </div>
                    </td>
                </tr>
            `;

            const expandedRow = isExpanded ? `
                <tr class="ai-mgmt-expandable-row" id="expand-r-${escapeAttr(r.id)}">
                    <td colspan="7" style="padding: 0; background: #f8fafc;">
                        <div class="ai-mgmt-detail-drawer" style="border-left: 4px solid #4f46e5;">
                            <div class="ai-mgmt-detail-drawer__top">
                                <span class="ai-mgmt-detail-drawer__title">
                                    <span class="material-symbols-outlined" style="color:#4f46e5;font-size:18px;">local_police</span>
                                    <span>${escapeHtml(r.name)} &mdash; Operational Guidance Directive</span>
                                </span>
                                <span class="ai-telemetry-pill ${isActive ? "ai-telemetry-pill--indigo" : "ai-telemetry-pill--amber"}">
                                    <span class="ai-telemetry-dot"></span>
                                    <span>${isActive ? "Active in AI Tactical Generator" : "Inactive Rule"}</span>
                                </span>
                            </div>
                            <div class="ai-mgmt-detail-drawer__quote" style="border-left-color: #4f46e5;">
                                <strong>Operational Directive:</strong><br />
                                "${escapeHtml(r.recommendedAction)}"
                            </div>
                            <div class="ai-mgmt-detail-drawer__grid">
                                <div class="ai-mgmt-detail-drawer__meta-item">
                                    <strong>Target Crime Classification</strong>
                                    <span>${escapeHtml(humanizeCrimeType(r.crimeType))}</span>
                                </div>
                                <div class="ai-mgmt-detail-drawer__meta-item">
                                    <strong>Trigger Threshold Criteria</strong>
                                    <span>${r.hasConditions && r.conditionType ? `${formatConditionMetric(r.conditionType)} ${r.operator} ${r.threshold} [${r.timePeriod || "30d"}]` : "General Guidance (Applies broadly whenever crime occurs)"}</span>
                                </div>
                                <div class="ai-mgmt-detail-drawer__meta-item">
                                    <strong>Priority Level</strong>
                                    <span style="text-transform:capitalize;font-weight:700;">${escapeHtml(r.priority)}</span>
                                </div>
                                <div class="ai-mgmt-detail-drawer__meta-item">
                                    <strong>Rule Version &amp; Audit</strong>
                                    <span>v${r.version || 1} &bull; Updated ${escapeHtml(dateStr)}</span>
                                </div>
                            </div>
                        </div>
                    </td>
                </tr>
            ` : "";

            return mainRow + expandedRow;
        })
        .join("");
}

async function handleRulesTableAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const rule = rulesList.find((r) => r.id === id);
    if (!rule) return;

    if (action === "inspect-rule") {
        if (expandedRuleIds.has(id)) {
            expandedRuleIds.delete(id);
        } else {
            expandedRuleIds.add(id);
        }
        renderRulesTable();
    } else if (action === "toggle-rule-status") {
        const nextStatus = btn.dataset.nextStatus;
        await toggleRuleStatusDirect(rule, nextStatus, btn);
    } else if (action === "edit-rule") {
        openRuleModal(rule);
    } else if (action === "activate-rule") {
        await handleRuleStatusChange(rule, "active");
    } else if (action === "deactivate-rule") {
        await handleRuleStatusChange(rule, "inactive");
    } else if (action === "archive-rule") {
        await handleRuleStatusChange(rule, "archived");
    } else if (action === "restore-rule") {
        await handleRuleStatusChange(rule, "inactive");
    }
}

/**
 * RAG Grounding Simulator
 * Interactive sandbox testing knowledge & rule retrieval for any field scenario
 */
async function handleRunRagSim(e) {
    if (e) e.preventDefault();

    const queryInput = elements.ragSimQuery?.value || "";
    const crimeCategory = elements.ragSimCrime?.value || "all";
    const location = elements.ragSimLocation?.value || "";

    if (!queryInput.trim()) {
        toastError("Please enter an incident scenario to simulate.");
        return;
    }

    if (elements.btnRunRagSim) {
        elements.btnRunRagSim.disabled = true;
        elements.btnRunRagSim.innerHTML = `<span class="material-symbols-outlined ai-mgmt-spin">progress_activity</span><span>Retrieving &amp; Scoring…</span>`;
    }

    // Tokenize search terms (strip punctuation)
    const terms = queryInput
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3);

    // Score published knowledge entries
    const publishedDocs = knowledgeList.filter((k) => k.status === "published");
    const scoredKnowledge = publishedDocs.map((doc) => {
        const fullSearchable = `${doc.title} ${doc.content} ${doc.source} ${doc.referenceNumber}`.toLowerCase();
        let matchCount = 0;
        terms.forEach((term) => {
            if (fullSearchable.includes(term)) matchCount++;
        });

        // Boost if local ordinance or explicitly names location
        let boost = 0;
        if (doc.type === "ordinance") boost += 2;
        if (location && fullSearchable.includes(location.split("/")[0].trim().toLowerCase())) boost += 3;

        const totalScore = matchCount + boost;
        const normalizedPct = Math.min(98, Math.max(45, Math.round((totalScore / (terms.length + 3)) * 100)));

        return {
            doc,
            matchCount,
            scorePct: normalizedPct,
        };
    });

    scoredKnowledge.sort((a, b) => b.scorePct - a.scorePct);
    const topKnowledge = scoredKnowledge.slice(0, 3);

    // Score active operational rules
    const activeRules = rulesList.filter((r) => r.status === "active");
    const scoredRules = activeRules.map((rule) => {
        let matchScore = 0;
        if (rule.crimeType === crimeCategory || rule.crimeType === "all") matchScore += 3;
        const ruleSearchable = `${rule.name} ${rule.recommendedAction} ${rule.description}`.toLowerCase();
        terms.forEach((term) => {
            if (ruleSearchable.includes(term)) matchScore += 1;
        });

        const normalizedPct = Math.min(95, Math.max(50, Math.round((matchScore / (terms.length + 3)) * 100)));
        return {
            rule,
            scorePct: normalizedPct,
        };
    });

    scoredRules.sort((a, b) => b.scorePct - a.scorePct);
    const topRules = scoredRules.slice(0, 3);

    // Render results
    if (elements.ragSimStatsPill) {
        elements.ragSimStatsPill.textContent = `${topKnowledge.length} Ordinances & ${topRules.length} Directives Retrieved`;
    }

    if (elements.ragSimKnowledgeList) {
        if (topKnowledge.length === 0) {
            elements.ragSimKnowledgeList.innerHTML = `
                <div style="padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:0.83rem;color:#991b1b;">
                    <strong>No Matching Ordinances Found!</strong>
                    <p style="margin:4px 0 0;">All city ordinances are either unpublished or do not match this scenario. Gemini would fall back to generic guidance.</p>
                </div>
            `;
        } else {
            elements.ragSimKnowledgeList.innerHTML = topKnowledge
                .map(({ doc, scorePct }) => {
                    return `
                        <div class="ai-sim-match-item">
                            <div class="ai-sim-match-item__top">
                                <div>
                                    <h5 class="ai-sim-match-title">${escapeHtml(doc.title)}</h5>
                                    <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">
                                        <strong>Source:</strong> ${escapeHtml(doc.source)} &bull; <strong>Ref:</strong> ${escapeHtml(doc.referenceNumber || "Official Act")}
                                    </div>
                                </div>
                                <span class="ai-sim-score-badge">${scorePct}% Relevancy</span>
                            </div>
                            <p class="ai-sim-match-excerpt">
                                "${escapeHtml(truncate(doc.content, 140))}"
                            </p>
                        </div>
                    `;
                })
                .join("");
        }
    }

    if (elements.ragSimRulesList) {
        if (topRules.length === 0) {
            elements.ragSimRulesList.innerHTML = `
                <div style="padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;font-size:0.83rem;color:#991b1b;">
                    <strong>No Matching Operational Rules Found!</strong>
                    <p style="margin:4px 0 0;">Create an operational rule for "${escapeHtml(crimeCategory)}" to provide tactical SOP guidance.</p>
                </div>
            `;
        } else {
            elements.ragSimRulesList.innerHTML = topRules
                .map(({ rule, scorePct }) => {
                    return `
                        <div class="ai-sim-match-item">
                            <div class="ai-sim-match-item__top">
                                <div>
                                    <h5 class="ai-sim-match-title">${escapeHtml(rule.name)}</h5>
                                    <div style="font-size:0.75rem;color:#64748b;margin-top:2px;">
                                        <strong>Target:</strong> ${escapeHtml(humanizeCrimeType(rule.crimeType))} &bull; <strong>Priority:</strong> ${escapeHtml(rule.priority).toUpperCase()}
                                    </div>
                                </div>
                                <span class="ai-sim-score-badge" style="background:#eef2ff;color:#3730a3;border-color:#c7d2fe;">${scorePct}% Relevancy</span>
                            </div>
                            <p class="ai-sim-match-excerpt" style="border-left-color:#4f46e5;">
                                <strong>Tactical Action:</strong> ${escapeHtml(truncate(rule.recommendedAction, 130))}
                            </p>
                        </div>
                    `;
                })
                .join("");
        }
    }

    if (elements.ragSimResults) {
        elements.ragSimResults.style.display = "block";
        elements.ragSimResults.scrollIntoView({ behavior: "smooth", block: "start" });
    }

    if (elements.btnRunRagSim) {
        elements.btnRunRagSim.disabled = false;
        elements.btnRunRagSim.innerHTML = `<span class="material-symbols-outlined">play_circle</span><span>Run RAG Retrieval Simulation</span>`;
    }
}

async function toggleRuleStatusDirect(rule, newStatus, btn) {
    if (!rule) return;
    if (btn) btn.classList.add("ai-mgmt-toggle-switch--loading");

    try {
        const nextVersion = (rule.version || 1) + 1;
        const docRef = doc(db, "ai_rules", rule.id);

        await updateDoc(docRef, {
            status: newStatus,
            version: nextVersion,
            updatedBy: currentAdminUser?.uid || "admin",
            updatedAt: serverTimestamp(),
        });

        rule.status = newStatus;
        rule.version = nextVersion;

        await logAudit("ai_rules.toggle_status", {
            ruleId: rule.id,
            name: rule.name,
            previousStatus: newStatus === "active" ? "inactive" : "active",
            newStatus,
            version: nextVersion,
        });

        updateRulesStats();
        renderRulesTable();

        if (newStatus === "active") {
            toastSuccess(`"${rule.name}" is now Active in AI Decision Support.`);
        } else {
            toastSuccess(`"${rule.name}" set to Inactive.`);
        }
    } catch (error) {
        console.error("[ai-management] Failed to toggle rule status:", error);
        toastError("Failed to update rule status.");
        if (btn) btn.classList.remove("ai-mgmt-toggle-switch--loading");
    }
}

function openRuleModal(rule = null) {
    if (!elements.ruleModal) return;
    clearFormErrors();

    if (rule) {
        elements.ruleModalTitle.textContent = "Edit Operational Rule";
        elements.ruleEditId.value = rule.id;
        elements.ruleName.value = rule.name;
        elements.ruleCrimeType.value = rule.crimeType;
        elements.ruleDescription.value = rule.description || "";
        elements.ruleAction.value = rule.recommendedAction;
        elements.rulePriority.value = rule.priority;
        elements.ruleStatus.value = rule.status === "archived" ? "inactive" : rule.status;

        // Conditions
        const hasCond = rule.hasConditions === true;
        if (elements.ruleEnableCondition) elements.ruleEnableCondition.checked = hasCond;
        toggleConditionInputs(hasCond);

        if (hasCond) {
            elements.ruleConditionType.value = rule.conditionType || "incident_count";
            elements.ruleOperator.value = rule.operator || ">=";
            elements.ruleThreshold.value = String(rule.threshold || "5");
            elements.ruleTimePeriod.value = rule.timePeriod || "30d";
            if (elements.ruleAccordionConditions) elements.ruleAccordionConditions.open = true;
        } else {
            if (elements.ruleAccordionConditions) elements.ruleAccordionConditions.open = false;
        }

        if (rule.description && elements.ruleAccordionContext) {
            elements.ruleAccordionContext.open = true;
        } else if (elements.ruleAccordionContext) {
            elements.ruleAccordionContext.open = false;
        }
    } else {
        elements.ruleModalTitle.textContent = "Add Operational Rule";
        elements.ruleEditId.value = "";
        elements.ruleForm.reset();
        elements.ruleCrimeType.value = "all";
        elements.rulePriority.value = "high";
        elements.ruleStatus.value = "active";
        if (elements.ruleEnableCondition) elements.ruleEnableCondition.checked = false;
        toggleConditionInputs(false);
        if (elements.ruleAccordionConditions) elements.ruleAccordionConditions.open = false;
        if (elements.ruleAccordionContext) elements.ruleAccordionContext.open = false;
    }

    if (elements.ruleActionCount && elements.ruleAction) {
        elements.ruleActionCount.textContent = String(elements.ruleAction.value.length);
    }

    elements.ruleModal.hidden = false;
    elements.ruleName?.focus();
}

function closeRuleModal() {
    if (elements.ruleModal) {
        elements.ruleModal.hidden = true;
    }
}

async function handleSaveRule() {
    const editId = (elements.ruleEditId?.value || "").trim();
    const name = (elements.ruleName?.value || "").trim();
    const crimeType = (elements.ruleCrimeType?.value || "all").trim();
    const description = (elements.ruleDescription?.value || "").trim();
    const recommendedAction = (elements.ruleAction?.value || "").trim();
    const priority = (elements.rulePriority?.value || "medium").trim();
    const status = (elements.ruleStatus?.value || "active").trim();
    const hasConditions = elements.ruleEnableCondition?.checked === true;

    let conditionType = null;
    let operator = null;
    let thresholdNum = null;
    let timePeriod = null;

    clearFormErrors();
    let hasError = false;

    if (!name || name.length < 3 || name.length > 150) {
        setFieldError(elements.ruleName, "Rule name is required (3–150 characters).");
        hasError = true;
    }

    if (!VALID_CRIME_TYPES.has(crimeType)) {
        setFieldError(elements.ruleCrimeType, "Please select what this rule applies to.");
        hasError = true;
    }

    if (!recommendedAction || recommendedAction.length < 10 || recommendedAction.length > 800) {
        setFieldError(elements.ruleAction, "Rule / Operational guidance is required (10–800 characters).");
        hasError = true;
    }

    if (!VALID_PRIORITIES.has(priority)) {
        setFieldError(elements.rulePriority, "Please select a valid priority level.");
        hasError = true;
    }

    if (!VALID_RULE_STATUSES.has(status)) {
        setFieldError(elements.ruleStatus, "Please select a valid status.");
        hasError = true;
    }

    // Validate optional trigger conditions if enabled
    if (hasConditions) {
        conditionType = (elements.ruleConditionType?.value || "incident_count").trim();
        operator = (elements.ruleOperator?.value || ">=").trim();
        thresholdNum = Number(elements.ruleThreshold?.value);
        timePeriod = (elements.ruleTimePeriod?.value || "30d").trim();

        if (!VALID_CONDITION_TYPES.has(conditionType)) {
            setFieldError(elements.ruleConditionType, "Please select a valid condition metric.");
            hasError = true;
        }

        if (!VALID_OPERATORS.has(operator)) {
            setFieldError(elements.ruleOperator, "Please select a valid operator.");
            hasError = true;
        }

        if (!Number.isFinite(thresholdNum) || thresholdNum < 1 || thresholdNum > 100000) {
            setFieldError(elements.ruleThreshold, "Threshold must be a valid positive number.");
            hasError = true;
        }

        if (!VALID_TIME_PERIODS.has(timePeriod)) {
            setFieldError(elements.ruleTimePeriod, "Please select a valid time window.");
            hasError = true;
        }
    }

    if (hasError) return;

    if (!currentAdminUser?.uid) {
        toastError("You must be signed in as an administrator.");
        return;
    }

    if (elements.ruleModalSave) {
        elements.ruleModalSave.disabled = true;
        elements.ruleModalSave.innerHTML = `
            <span class="material-symbols-outlined ai-mgmt-spin">progress_activity</span>
            <span>Saving…</span>
        `;
    }

    try {
        if (editId) {
            const existing = rulesList.find((r) => r.id === editId);
            const nextVersion = (existing?.version || 1) + 1;

            const docRef = doc(db, "ai_rules", editId);
            await updateDoc(docRef, {
                name,
                crimeType,
                description,
                recommendedAction,
                hasConditions,
                conditionType: hasConditions ? conditionType : null,
                operator: hasConditions ? operator : null,
                threshold: hasConditions ? thresholdNum : null,
                timePeriod: hasConditions ? timePeriod : null,
                priority,
                status,
                version: nextVersion,
                updatedBy: currentAdminUser.uid,
                updatedAt: serverTimestamp(),
            });

            await logAudit("ai_rules.update", {
                ruleId: editId,
                name,
                hasConditions,
                version: nextVersion,
                status,
            });

            toastSuccess(`Operational rule updated to v${nextVersion}`);
        } else {
            const newDoc = {
                name,
                crimeType,
                description,
                recommendedAction,
                hasConditions,
                conditionType: hasConditions ? conditionType : null,
                operator: hasConditions ? operator : null,
                threshold: hasConditions ? thresholdNum : null,
                timePeriod: hasConditions ? timePeriod : null,
                priority,
                status,
                version: 1,
                createdBy: currentAdminUser.uid,
                createdAt: serverTimestamp(),
                updatedBy: currentAdminUser.uid,
                updatedAt: serverTimestamp(),
            };

            const docRef = await addDoc(collection(db, "ai_rules"), newDoc);

            await logAudit("ai_rules.create", {
                ruleId: docRef.id,
                name,
                crimeType,
                hasConditions,
                priority,
                status,
            });

            toastSuccess("Operational rule created successfully.");
        }

        closeRuleModal();
        await loadRules();
    } catch (error) {
        console.error("[ai-management] Save rule error:", error);
        toastError(error?.message || "Failed to save operational rule.");
    } finally {
        if (elements.ruleModalSave) {
            elements.ruleModalSave.disabled = false;
            elements.ruleModalSave.innerHTML = `
                <span class="material-symbols-outlined" aria-hidden="true">save</span>
                <span>Save Operational Rule</span>
            `;
        }
    }
}

async function handleRuleStatusChange(rule, newStatus) {
    const actionLabel =
        newStatus === "active"
            ? "activate"
            : newStatus === "inactive"
              ? "deactivate"
              : newStatus === "archived"
                ? "archive"
                : "restore";

    const confirmed = await confirmDanger({
        title: `${capitalize(actionLabel)} Operational Rule?`,
        text: `Are you sure you want to ${actionLabel} "${rule.name}"?`,
        confirmText: capitalize(actionLabel),
    });

    if (!confirmed) return;

    try {
        const nextVersion = (rule.version || 1) + 1;
        const docRef = doc(db, "ai_rules", rule.id);

        await updateDoc(docRef, {
            status: newStatus,
            version: nextVersion,
            updatedBy: currentAdminUser?.uid || "admin",
            updatedAt: serverTimestamp(),
        });

        await logAudit(`ai_rules.${actionLabel}`, {
            ruleId: rule.id,
            name: rule.name,
            previousStatus: rule.status,
            newStatus,
            version: nextVersion,
        });

        toastSuccess(`Rule ${actionLabel}d successfully (v${nextVersion}).`);
        await loadRules();
    } catch (error) {
        console.error(`[ai-management] Failed to ${actionLabel} rule:`, error);
        toastError(`Failed to ${actionLabel} rule.`);
    }
}

/* ============================================================
   SHARED UTILITIES
   ============================================================ */

function setFieldError(fieldEl, message) {
    if (!fieldEl) return;
    const parent = fieldEl.closest(".ai-mgmt-form-group");
    if (!parent) return;
    parent.classList.add("ai-mgmt-form-group--error");

    let hint = parent.querySelector(".ai-mgmt-form-hint");
    if (!hint) {
        hint = document.createElement("span");
        hint.className = "ai-mgmt-form-hint";
        parent.appendChild(hint);
    }
    hint.textContent = message;
}

function clearFormErrors() {
    document.querySelectorAll(".ai-mgmt-form-group--error").forEach((el) => {
        el.classList.remove("ai-mgmt-form-group--error");
    });
}

function formatDate(timestamp) {
    if (!timestamp) return "—";
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return "—";

    return new Intl.DateTimeFormat("en-PH", {
        timeZone: "Asia/Manila",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
    }).format(date);
}

function formatConditionMetric(metric) {
    switch (metric) {
        case "incident_count":
            return "Incidents";
        case "high_severity_count":
            return "High-Severity";
        case "sos_count":
            return "SOS Alerts";
        case "weighted_score":
            return "Weighted Score";
        default:
            return metric;
    }
}

function humanizeCrimeType(type) {
    if (type === "all") return "All Crime Types";
    return type
        .replace(/_/g, " ")
        .replace(/\b\w/g, (l) => l.toUpperCase());
}

function truncate(str, maxLen = 60) {
    const s = String(str || "").trim();
    if (s.length <= maxLen) return s;
    return s.slice(0, maxLen) + "…";
}

function escapeHtml(str) {
    return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function escapeAttr(str) {
    return String(str || "")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function capitalize(str) {
    return String(str || "").charAt(0).toUpperCase() + String(str || "").slice(1);
}

/* ============================================================
   BUILT-IN NATIONAL LAWS PREVIEW (Read-Only Matrix)
   ============================================================ */

/**
 * Load National Laws from local '/ph_laws_seed.json' with fallback to Firestore 'national_laws' collection
 */
async function loadNationalLaws() {
    if (nationalLawsList.length > 0) return;

    // 1. Fetch local seed json directly (instant, zero network latency)
    try {
        const res = await fetch("/ph_laws_seed.json");
        if (res.ok) {
            nationalLawsList = await res.json();
            return;
        }
    } catch (seedErr) {
        console.warn("[ai-management] Could not fetch ph_laws_seed.json, checking Firestore:", seedErr);
    }

    // 2. Fallback to Firestore 'national_laws' if local json is unreachable
    try {
        const colRef = collection(db, "national_laws");
        const snap = await getDocs(colRef);
        if (!snap.empty) {
            nationalLawsList = snap.docs.map((d) => ({
                id: d.id,
                ...d.data(),
            }));
        }
    } catch (err) {
        console.warn("[ai-management] Could not fetch national_laws from Firestore:", err);
    }
}

/**
 * Open National Laws Preview Modal (Read-Only)
 */
async function openNationalLawsModal() {
    if (!elements.nationalLawsModal) return;
    elements.nationalLawsModal.hidden = false;

    if (nationalLawsList.length === 0) {
        if (elements.nationalLawsGrid) {
            elements.nationalLawsGrid.innerHTML = `
                <div class="ai-nat-loading">
                    <span class="material-symbols-outlined ai-mgmt-spin">progress_activity</span>
                    <span>Loading built-in national laws…</span>
                </div>
            `;
        }
        await loadNationalLaws();
    }

    renderNationalLawsGrid();
    elements.nationalLawsSearch?.focus();
}

/**
 * Close National Laws Preview Modal
 */
function closeNationalLawsModal() {
    if (elements.nationalLawsModal) {
        elements.nationalLawsModal.hidden = true;
    }
}

/**
 * Render National Laws Grid categorized by ThreatTrack 10 Incidents
 */
function renderNationalLawsGrid() {
    if (!elements.nationalLawsGrid) return;

    let filtered = nationalLawsList.slice();

    // 1. Filter by Incident Category
    if (nationalLawsIncidentFilter !== "all") {
        filtered = filtered.filter((law) => law.crimeType === nationalLawsIncidentFilter);
    }

    // 2. Filter by Search Query
    if (nationalLawsSearchQuery) {
        const q = nationalLawsSearchQuery;
        filtered = filtered.filter((law) => {
            const title = String(law.title || "").toLowerCase();
            const ref = String(law.referenceNumber || "").toLowerCase();
            const content = String(law.content || "").toLowerCase();
            const crime = humanizeCrimeType(law.crimeType).toLowerCase();
            return title.includes(q) || ref.includes(q) || content.includes(q) || crime.includes(q);
        });
    }

    if (elements.natLawsVisibleCount) {
        elements.natLawsVisibleCount.textContent = String(filtered.length);
    }

    if (filtered.length === 0) {
        elements.nationalLawsGrid.innerHTML = `
            <div class="ai-nat-empty">
                <span class="material-symbols-outlined" style="font-size: 28px;">search_off</span>
                <span>No matching national laws found for "${escapeHtml(nationalLawsSearchQuery)}". Try another search or category.</span>
            </div>
        `;
        return;
    }

    elements.nationalLawsGrid.innerHTML = filtered.map((law) => {
        const humanCrime = humanizeCrimeType(law.crimeType || "general");
        
        // Extract directive if present in content
        const rawContent = String(law.content || "");
        let directive = "";
        let lawText = rawContent;

        const directiveMatch = rawContent.match(/Operational Directive:\s*([\s\S]+)$/i);
        if (directiveMatch) {
            directive = directiveMatch[1].trim();
            lawText = rawContent.replace(/Operational Directive:\s*[\s\S]+$/i, "").trim();
        }

        return `
            <article class="ai-nat-card">
                <div class="ai-nat-card__header">
                    <div class="ai-nat-card__title-wrap">
                        <h4 class="ai-nat-card__title">${escapeHtml(law.title)}</h4>
                        <span class="ai-nat-card__ref">${escapeHtml(law.referenceNumber || "Philippine Statute")}</span>
                    </div>
                    <span class="ai-nat-card__category-badge">${escapeHtml(humanCrime)}</span>
                </div>
                <p class="ai-nat-card__excerpt">${escapeHtml(lawText)}</p>
                ${directive ? `<div class="ai-nat-card__directive"><strong>Field Directive:</strong> ${escapeHtml(directive)}</div>` : ""}
                <div class="ai-nat-card__footer">
                    <span class="ai-nat-lock-indicator">
                        <span class="material-symbols-outlined">lock</span>
                        <span>Built-in National Law (Read-Only)</span>
                    </span>
                    <span>Source: ${escapeHtml(law.source || "Official Gazette")}</span>
                </div>
            </article>
        `;
    }).join("");
}

// HIDDEN ADMIN TOOL: Seed National Laws to Database
window.seedNationalLaws = async function() {
    try {
        console.log("Downloading ph_laws_seed.json...");
        const res = await fetch("/ph_laws_seed.json");
        const laws = await res.json();
        
        console.log(`Injecting ${laws.length} laws into Firestore 'national_laws' collection...`);
        const batch = writeBatch(db);
        
        laws.forEach(law => {
            const docRef = doc(collection(db, "national_laws"));
            batch.set(docRef, {
                ...law,
                isImmutable: true,
                version: 1,
                createdAt: serverTimestamp()
            });
        });
        
        await batch.commit();
        console.log("%c✅ SUCCESS! 34 National Laws have been permanently written to the database.", "color: #10b981; font-size: 16px; font-weight: bold;");
    } catch (e) {
        console.error("❌ Seeding failed:", e);
    }
};
