/**
 * AI Management — Knowledge Base & Rules UI Controller
 * Phase 2 Implementation: Knowledge Management CRUD (isolated from AI generation)
 */

import { initAdminPage } from "./admin-auth.js";
import {
    collection,
    addDoc,
    getDocs,
    doc,
    updateDoc,
    serverTimestamp,
    query,
    orderBy,
} from "firebase/firestore";
import { db } from "../../shared/firebase.js";
import { toastSuccess, toastError, confirmDanger } from "./alerts.js";
import { logAudit } from "./audit.js";

// State
let currentAdminUser = null;
let knowledgeList = [];
let statusFilter = "all";
let typeFilter = "all";
let searchQuery = "";

const VALID_TYPES = new Set([
    "ordinance",
    "policy",
    "procedure",
    "guideline",
    "reference",
]);

const VALID_STATUSES = new Set(["draft", "published", "archived"]);

// DOM Elements
const elements = {
    tabKnowledge: document.getElementById("tab-knowledge"),
    tabRules: document.getElementById("tab-rules"),
    panelKnowledge: document.getElementById("panel-knowledge"),
    panelRules: document.getElementById("panel-rules"),
    statTotal: document.getElementById("stat-total-knowledge"),
    statPublished: document.getElementById("stat-published-knowledge"),
    statDraft: document.getElementById("stat-draft-knowledge"),
    statArchived: document.getElementById("stat-archived-knowledge"),
    searchInput: document.getElementById("knowledge-search"),
    filterStatus: document.getElementById("knowledge-filter-status"),
    filterType: document.getElementById("knowledge-filter-type"),
    btnAddKnowledge: document.getElementById("btn-add-knowledge"),
    knowledgeTbody: document.getElementById("knowledge-tbody"),
    knowledgeCount: document.getElementById("knowledge-count"),
    modal: document.getElementById("knowledge-modal"),
    modalTitle: document.getElementById("knowledge-modal-title"),
    modalClose: document.getElementById("knowledge-modal-close"),
    modalCancel: document.getElementById("knowledge-modal-cancel"),
    modalSave: document.getElementById("knowledge-modal-save"),
    form: document.getElementById("knowledge-form"),
    editId: document.getElementById("knowledge-edit-id"),
    inputTitle: document.getElementById("knowledge-title"),
    inputType: document.getElementById("knowledge-type"),
    inputStatus: document.getElementById("knowledge-status"),
    inputSource: document.getElementById("knowledge-source"),
    inputRef: document.getElementById("knowledge-ref"),
    inputContent: document.getElementById("knowledge-content"),
    contentCount: document.getElementById("knowledge-content-count"),
};

// Initialize Page
initAdminPage({
    pageId: "page-ai-management",
    onReady: async (user) => {
        currentAdminUser = user;
        bindEvents();
        await loadKnowledge();
    },
});

/**
 * Bind UI event listeners
 */
function bindEvents() {
    // Tab switching
    elements.tabKnowledge?.addEventListener("click", () => switchTab("knowledge"));
    elements.tabRules?.addEventListener("click", () => switchTab("rules"));

    // Search input
    elements.searchInput?.addEventListener("input", (e) => {
        searchQuery = (e.target.value || "").trim().toLowerCase();
        renderKnowledgeTable();
    });

    // Status filter dropdown
    elements.filterStatus?.addEventListener("change", (e) => {
        statusFilter = e.target.value || "all";
        renderKnowledgeTable();
    });

    // Type filter dropdown
    elements.filterType?.addEventListener("change", (e) => {
        typeFilter = e.target.value || "all";
        renderKnowledgeTable();
    });

    // Add Knowledge button
    elements.btnAddKnowledge?.addEventListener("click", () => {
        openModal();
    });

    // Modal Close / Cancel
    elements.modalClose?.addEventListener("click", closeModal);
    elements.modalCancel?.addEventListener("click", closeModal);
    elements.modal?.querySelector(".ai-mgmt-modal__backdrop")?.addEventListener("click", closeModal);

    // Character counter for textarea
    elements.inputContent?.addEventListener("input", () => {
        if (elements.contentCount && elements.inputContent) {
            elements.contentCount.textContent = String(elements.inputContent.value.length);
        }
    });

    // Save button
    elements.modalSave?.addEventListener("click", handleSaveKnowledge);

    // Delegate Table Action Buttons (Edit, Publish, Archive, Restore)
    elements.knowledgeTbody?.addEventListener("click", handleTableAction);
}

/**
 * Switch top-level tabs
 */
function switchTab(tabName) {
    if (tabName === "knowledge") {
        elements.tabKnowledge?.classList.add("ai-mgmt-tab--active");
        elements.tabKnowledge?.setAttribute("aria-selected", "true");
        elements.tabRules?.classList.remove("ai-mgmt-tab--active");
        elements.tabRules?.setAttribute("aria-selected", "false");

        if (elements.panelKnowledge) elements.panelKnowledge.hidden = false;
        if (elements.panelRules) elements.panelRules.hidden = true;
    } else {
        elements.tabRules?.classList.add("ai-mgmt-tab--active");
        elements.tabRules?.setAttribute("aria-selected", "true");
        elements.tabKnowledge?.classList.remove("ai-mgmt-tab--active");
        elements.tabKnowledge?.setAttribute("aria-selected", "false");

        if (elements.panelRules) elements.panelRules.hidden = false;
        if (elements.panelKnowledge) elements.panelKnowledge.hidden = true;
    }
}

/**
 * Load all knowledge documents from Firestore
 */
async function loadKnowledge() {
    if (!elements.knowledgeTbody) return;
    elements.knowledgeTbody.innerHTML = `
        <tr>
            <td colspan="7" class="ai-mgmt-empty">
                <div class="ai-mgmt-loading-state">
                    <span class="material-symbols-outlined ai-mgmt-spin">progress_activity</span>
                    <span>Loading knowledge entries…</span>
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

        updateSummaryStats();
        renderKnowledgeTable();
    } catch (error) {
        console.error("[ai-management] Failed to load knowledge:", error);
        elements.knowledgeTbody.innerHTML = `
            <tr>
                <td colspan="7" class="ai-mgmt-empty" style="color: #ef4444;">
                    Failed to load knowledge entries: ${escapeHtml(error.message)}
                </td>
            </tr>
        `;
        toastError("Failed to load knowledge entries.");
    }
}

/**
 * Update top 4 Summary Stat Cards
 */
function updateSummaryStats() {
    const total = knowledgeList.length;
    let published = 0;
    let draft = 0;
    let archived = 0;

    knowledgeList.forEach((k) => {
        if (k.status === "published") published++;
        else if (k.status === "draft") draft++;
        else if (k.status === "archived") archived++;
    });

    if (elements.statTotal) elements.statTotal.textContent = String(total);
    if (elements.statPublished) elements.statPublished.textContent = String(published);
    if (elements.statDraft) elements.statDraft.textContent = String(draft);
    if (elements.statArchived) elements.statArchived.textContent = String(archived);
}

/**
 * Filter & render knowledge table
 */
function renderKnowledgeTable() {
    if (!elements.knowledgeTbody) return;

    let filtered = knowledgeList;

    // Filter by status
    if (statusFilter !== "all") {
        filtered = filtered.filter((item) => item.status === statusFilter);
    }

    // Filter by type
    if (typeFilter !== "all") {
        filtered = filtered.filter((item) => item.type === typeFilter);
    }

    // Filter by search query
    if (searchQuery) {
        filtered = filtered.filter((item) => {
            return (
                item.title.toLowerCase().includes(searchQuery) ||
                item.source.toLowerCase().includes(searchQuery) ||
                item.referenceNumber.toLowerCase().includes(searchQuery) ||
                item.content.toLowerCase().includes(searchQuery) ||
                item.type.toLowerCase().includes(searchQuery)
            );
        });
    }

    // Update count display
    if (elements.knowledgeCount) {
        const total = knowledgeList.length;
        const showing = filtered.length;
        elements.knowledgeCount.textContent = `Showing ${showing} of ${total} knowledge entries`;
    }

    if (!filtered.length) {
        const message = searchQuery
            ? "No knowledge entries matching your search query."
            : statusFilter !== "all" || typeFilter !== "all"
              ? "No knowledge entries match the selected filters."
              : "No knowledge entries yet. Click \"Add Knowledge\" to create the first entry.";
        elements.knowledgeTbody.innerHTML = `
            <tr>
                <td colspan="7" class="ai-mgmt-empty">${escapeHtml(message)}</td>
            </tr>
        `;
        return;
    }

    elements.knowledgeTbody.innerHTML = filtered
        .map((item) => {
            const dateStr = formatDate(item.updatedAt || item.createdAt);
            const statusClass = `ai-mgmt-badge--${escapeAttr(item.status)}`;

            return `
                <tr data-id="${escapeAttr(item.id)}">
                    <td>
                        <div class="ai-mgmt-table__title" title="${escapeAttr(item.title)}">
                            ${escapeHtml(item.title)}
                        </div>
                        <div class="ai-mgmt-table__meta-sub">
                            ${escapeHtml(truncate(item.content, 55))}
                        </div>
                    </td>
                    <td>
                        <span class="ai-mgmt-type-tag">${escapeHtml(item.type)}</span>
                    </td>
                    <td>
                        <strong>${escapeHtml(item.source)}</strong>
                        ${item.referenceNumber ? `<div class="ai-mgmt-table__meta-sub">${escapeHtml(item.referenceNumber)}</div>` : ""}
                    </td>
                    <td>
                        <span class="ai-mgmt-badge ${statusClass}">${escapeHtml(item.status)}</span>
                    </td>
                    <td>
                        <strong>v${escapeHtml(String(item.version))}</strong>
                    </td>
                    <td>${escapeHtml(dateStr)}</td>
                    <td class="ai-mgmt-th--actions">
                        <div class="ai-mgmt-table__actions">
                            <button
                                type="button"
                                class="ai-mgmt-btn ai-mgmt-btn--ghost ai-mgmt-btn--sm"
                                data-action="edit"
                                data-id="${escapeAttr(item.id)}"
                                title="Edit Knowledge Entry"
                            >
                                <span class="material-symbols-outlined">edit</span>
                            </button>
                            ${
                                item.status !== "published"
                                    ? `
                                <button
                                    type="button"
                                    class="ai-mgmt-btn ai-mgmt-btn--publish ai-mgmt-btn--sm"
                                    data-action="publish"
                                    data-id="${escapeAttr(item.id)}"
                                    title="Publish Knowledge (Make Active for AI)"
                                >
                                    <span class="material-symbols-outlined">publish</span>
                                </button>`
                                    : ""
                            }
                            ${
                                item.status !== "archived"
                                    ? `
                                <button
                                    type="button"
                                    class="ai-mgmt-btn ai-mgmt-btn--archive ai-mgmt-btn--sm"
                                    data-action="archive"
                                    data-id="${escapeAttr(item.id)}"
                                    title="Archive Knowledge"
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
        })
        .join("");
}

/**
 * Handle clicks inside table actions
 */
async function handleTableAction(e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = btn.dataset.id;
    const item = knowledgeList.find((k) => k.id === id);
    if (!item) return;

    if (action === "edit") {
        openModal(item);
    } else if (action === "publish") {
        await handleStatusChange(item, "published");
    } else if (action === "archive") {
        await handleStatusChange(item, "archived");
    } else if (action === "restore") {
        await handleStatusChange(item, "draft");
    }
}

/**
 * Open Add/Edit Modal
 */
function openModal(item = null) {
    if (!elements.modal) return;

    // Reset errors
    clearFormErrors();

    if (item) {
        elements.modalTitle.textContent = "Edit Knowledge Entry";
        elements.editId.value = item.id;
        elements.inputTitle.value = item.title;
        elements.inputType.value = item.type;
        elements.inputStatus.value = item.status === "archived" ? "draft" : item.status;
        elements.inputSource.value = item.source;
        elements.inputRef.value = item.referenceNumber || "";
        elements.inputContent.value = item.content;
    } else {
        elements.modalTitle.textContent = "Add Knowledge Entry";
        elements.editId.value = "";
        elements.form.reset();
        elements.inputStatus.value = "draft";
    }

    if (elements.contentCount && elements.inputContent) {
        elements.contentCount.textContent = String(elements.inputContent.value.length);
    }

    elements.modal.hidden = false;
    elements.inputTitle?.focus();
}

/**
 * Close Modal
 */
function closeModal() {
    if (elements.modal) {
        elements.modal.hidden = true;
    }
}

/**
 * Validate and save knowledge entry (create or update)
 */
async function handleSaveKnowledge() {
    const editId = (elements.editId?.value || "").trim();
    const title = (elements.inputTitle?.value || "").trim();
    const type = (elements.inputType?.value || "").trim();
    const status = (elements.inputStatus?.value || "draft").trim();
    const source = (elements.inputSource?.value || "").trim();
    const referenceNumber = (elements.inputRef?.value || "").trim();
    const content = (elements.inputContent?.value || "").trim();

    // Validation
    clearFormErrors();
    let hasError = false;

    if (!title || title.length < 3 || title.length > 200) {
        setFieldError(elements.inputTitle, "Title is required (3–200 characters).");
        hasError = true;
    }

    if (!VALID_TYPES.has(type)) {
        setFieldError(elements.inputType, "Please select a valid knowledge type.");
        hasError = true;
    }

    if (!VALID_STATUSES.has(status)) {
        setFieldError(elements.inputStatus, "Please select a valid status.");
        hasError = true;
    }

    if (!source || source.length < 3 || source.length > 200) {
        setFieldError(elements.inputSource, "Source authority is required (3–200 characters).");
        hasError = true;
    }

    if (!content || content.length < 10 || content.length > 10000) {
        setFieldError(elements.inputContent, "Content is required (10–10,000 characters).");
        hasError = true;
    }

    if (hasError) return;

    if (!currentAdminUser?.uid) {
        toastError("You must be signed in as an administrator.");
        return;
    }

    // Disable Save Button with loading state
    if (elements.modalSave) {
        elements.modalSave.disabled = true;
        elements.modalSave.innerHTML = `
            <span class="material-symbols-outlined ai-mgmt-spin">progress_activity</span>
            <span>Saving…</span>
        `;
    }

    try {
        if (editId) {
            // Update existing
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
            // Create new
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

        closeModal();
        await loadKnowledge();
    } catch (error) {
        console.error("[ai-management] Save error:", error);
        toastError(error?.message || "Failed to save knowledge entry.");
    } finally {
        if (elements.modalSave) {
            elements.modalSave.disabled = false;
            elements.modalSave.innerHTML = `
                <span class="material-symbols-outlined" aria-hidden="true">save</span>
                <span>Save Knowledge Entry</span>
            `;
        }
    }
}

/**
 * Handle quick status changes (Publish, Archive, Restore)
 */
async function handleStatusChange(item, newStatus) {
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

// Form validation error helpers
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

// Utility: Date formatting
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

// Utility: String helpers
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
