(function() {
  "use strict";

  if (window.__sfdevhub_injected__) return;
  window.__sfdevhub_injected__ = true;

  const SFDevHub = {
    state: {
      apiNamesVisible: false,
      requiredHighlighted: false,
      stickyHeadersEnabled: false,
      overlayInjected: false,
      quickSearchOpen: false,
      pageInfo: null
    },

    init() {
      this.state.pageInfo = PageDetector.detect();
      this.loadPreferences();
      this.bindMessages();
      this.injectForPageType(this.state.pageInfo.type);
      this.observePageChanges();
    },

    async loadPreferences() {
      try {
        const prefs = await SFStorage.get(["showApiNames", "highlightRequired", "stickyHeaders"]);
        this.state.apiNamesVisible = prefs.showApiNames;
        this.state.requiredHighlighted = prefs.highlightRequired;
        this.state.stickyHeadersEnabled = prefs.stickyHeaders;

        if (this.state.apiNamesVisible) this.showApiNames();
        if (this.state.requiredHighlighted) this.highlightRequiredFields();
        if (this.state.stickyHeadersEnabled) this.enableStickyHeaders();
      } catch (e) {
        // Storage not available
      }
    },

    bindMessages() {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        switch (message.type) {
          case "TOGGLE_API_NAMES":
            this.toggleApiNames();
            sendResponse({ visible: this.state.apiNamesVisible });
            break;
          case "HIGHLIGHT_REQUIRED":
            this.highlightRequiredFields();
            sendResponse({ done: true });
            break;
          case "EXTRACT_RECORD_DATA":
            sendResponse(this.extractRecordData());
            break;
          case "TOGGLE_QUICK_SEARCH":
            this.toggleQuickSearch();
            sendResponse({ open: this.state.quickSearchOpen });
            break;
          case "COPY_RECORD_ID":
            this.copyRecordId();
            sendResponse({ done: true });
            break;
          case "GET_PAGE_INFO":
            sendResponse(this.state.pageInfo);
            break;
          case "STICKY_HEADERS":
            this.enableStickyHeaders();
            sendResponse({ done: true });
            break;
          case "COLLAPSE_EMPTY":
            this.collapseEmptySections();
            sendResponse({ done: true });
            break;
          case "INJECT_BULK_TOOLS":
            this.injectBulkTools(message.selector);
            sendResponse({ done: true });
            break;
          case "EXPORT_LIST_CSV":
            sendResponse(this.exportListAsCsv());
            break;
          default:
            return false;
        }
        return true;
      });
    },

    injectForPageType(pageType) {
      switch (pageType) {
        case PageDetector.PAGE_TYPES.RECORD:
          this.injectRecordTools();
          break;
        case PageDetector.PAGE_TYPES.LIST_VIEW:
          this.injectListTools();
          break;
        case PageDetector.PAGE_TYPES.SETUP:
          this.injectSetupTools();
          break;
        case PageDetector.PAGE_TYPES.HOME:
          this.injectHomeTools();
          break;
      }
      this.injectQuickSearch();
      this.injectFloatingPanel();
    },

    // ─── RECORD PAGE TOOLS ───────────────────────────────────

    injectRecordTools() {
      this.waitForElement('[data-aura-rendered-by],.slds-page-header,record_flexipage-record-page', () => {
        if (this.state.apiNamesVisible) this.showApiNames();
        if (this.state.requiredHighlighted) this.highlightRequiredFields();
        this.addRecordActions();
      });
    },

    showApiNames() {
      this.state.apiNamesVisible = true;
      SFStorage.set({ showApiNames: true });

      const fieldLabels = document.querySelectorAll(
        ".test-id__field-label, .slds-form-element__label, " +
        "records-record-layout-item lightning-output-field, " +
        "records-record-layout-item lightning-input-field, " +
        "dt, .labelCol, .label"
      );

      fieldLabels.forEach((label) => {
        if (label.dataset.sfdevhubApiName) return;

        const fieldName = this.resolveFieldName(label);
        if (!fieldName) return;

        label.dataset.sfdevhubApiName = fieldName;
        label.dataset.sfdevhubOriginalHTML = label.innerHTML;

        const badge = document.createElement("span");
        badge.className = "sfdevhub-api-badge";
        badge.textContent = fieldName;
        badge.title = `API: ${fieldName} (click to copy)`;
        badge.addEventListener("click", (e) => {
          e.stopPropagation();
          navigator.clipboard.writeText(fieldName);
          badge.classList.add("sfdevhub-copied");
          setTimeout(() => badge.classList.remove("sfdevhub-copied"), 1000);
        });

        label.appendChild(badge);
      });
    },

    hideApiNames() {
      this.state.apiNamesVisible = false;
      SFStorage.set({ showApiNames: false });

      document.querySelectorAll(".sfdevhub-api-badge").forEach(el => el.remove());
      document.querySelectorAll("[data-sfdevhub-api-name]").forEach((el) => {
        if (el.dataset.sfdevhubOriginalHTML) {
          el.innerHTML = el.dataset.sfdevhubOriginalHTML;
        }
        delete el.dataset.sfdevhubApiName;
        delete el.dataset.sfdevhubOriginalHTML;
      });
    },

    toggleApiNames() {
      if (this.state.apiNamesVisible) {
        this.hideApiNames();
      } else {
        this.showApiNames();
      }
    },

    resolveFieldName(labelEl) {
      if (labelEl.getAttribute("data-field")) return labelEl.getAttribute("data-field");
      if (labelEl.getAttribute("data-label")) return labelEl.getAttribute("data-label");
      if (labelEl.id && labelEl.id.includes(":")) return labelEl.id.split(":").pop();

      const forAttr = labelEl.getAttribute("for");
      if (forAttr) {
        const input = document.getElementById(forAttr);
        if (input) return input.name || input.getAttribute("data-field") || forAttr;
      }

      const parent = labelEl.closest("records-record-layout-item, .slds-form-element, .dataCell");
      if (parent) {
        const fieldAttr = parent.getAttribute("data-field") || parent.getAttribute("data-target-selector-name");
        if (fieldAttr) return fieldAttr;
      }

      return null;
    },

    highlightRequiredFields() {
      this.state.requiredHighlighted = true;
      SFStorage.set({ highlightRequired: true });

      const requiredInputs = document.querySelectorAll(
        "input[required], select[required], textarea[required], " +
        "input[aria-required='true'], select[aria-required='true'], textarea[aria-required='true'], " +
        ".slds-is-required, lightning-input-field[data-required]"
      );

      requiredInputs.forEach((input) => {
        const formElement = input.closest(
          ".slds-form-element, .slds-m-bottom_small, lightning-input-field, records-record-layout-item"
        );
        if (formElement && !formElement.classList.contains("sfdevhub-required-highlight")) {
          formElement.classList.add("sfdevhub-required-highlight");
          formElement.style.position = "relative";

          if (!formElement.querySelector(".sfdevhub-required-marker")) {
            const marker = document.createElement("span");
            marker.className = "sfdevhub-required-marker";
            marker.textContent = "Required";
            formElement.appendChild(marker);
          }
        }
      });
    },

    enableStickyHeaders() {
      this.state.stickyHeadersEnabled = true;
      SFStorage.set({ stickyHeaders: true });

      const style = document.createElement("style");
      style.id = "sfdevhub-sticky-headers";
      style.textContent = `
        .slds-page-header, .slds-page-header__row, .oneHeader, .slds-global-header {
          position: sticky !important;
          top: 0 !important;
          z-index: 9990 !important;
        }
        .slds-tabs_default__nav, .slds-tabs_scoped__nav, .uiTabBar {
          position: sticky !important;
          top: 44px !important;
          z-index: 9989 !important;
        }
      `;
      document.head.appendChild(style);
    },

    collapseEmptySections() {
      this.state.collapseEmpty = true;

      const sections = document.querySelectorAll(
        ".slds-section, .slds-card, .slds-m-bottom_small, lightning-card, " +
        ".oneContent .forceRelatedListContainer, .forceRecordLayout"
      );

      sections.forEach((section) => {
        const content = section.querySelector(
          ".slds-section__content, .slds-card__body, lightning-card-body, .slds-p-around_medium"
        );
        if (!content) return;

        const isEmpty = content.children.length === 0 ||
          (content.children.length === 1 && content.children[0].textContent.trim() === "") ||
          content.textContent.trim().length < 5;

        if (isEmpty) {
          section.classList.add("sfdevhub-collapsed");
          section.style.maxHeight = "32px";
          section.style.overflow = "hidden";
          section.style.opacity = "0.5";
          section.style.cursor = "pointer";
          section.title = "Empty section - click to expand";

          section.addEventListener("click", () => {
            section.classList.toggle("sfdevhub-collapsed");
            if (section.classList.contains("sfdevhub-collapsed")) {
              section.style.maxHeight = "32px";
            } else {
              section.style.maxHeight = "none";
            }
          });
        }
      });
    },

    addRecordActions() {
      const pageInfo = this.state.pageInfo;
      if (!pageInfo?.recordId) return;

      const actions = document.createElement("div");
      actions.className = "sfdevhub-record-actions";
      actions.innerHTML = `
        <button class="sfdevhub-action-btn sfdevhub-action-primary" id="sfdevhub-copy-id" title="Copy Record ID (Alt+I)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy ID
        </button>
        <button class="sfdevhub-action-btn" id="sfdevhub-export-json" title="Export as JSON">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Export JSON
        </button>
        <button class="sfdevhub-action-btn" id="sfdevhub-export-apex" title="Copy as Apex Map">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          Apex Map
        </button>
        <button class="sfdevhub-action-btn" id="sfdevhub-open-console" title="Open Side Panel">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
          SOQL
        </button>
      `;

      document.body.appendChild(actions);

      document.getElementById("sfdevhub-copy-id")?.addEventListener("click", () => {
        navigator.clipboard.writeText(pageInfo.recordId);
        this.showToast("Record ID copied");
      });

      document.getElementById("sfdevhub-export-json")?.addEventListener("click", () => {
        this.exportRecordData("json");
      });

      document.getElementById("sfdevhub-export-apex")?.addEventListener("click", () => {
        this.exportRecordData("apex");
      });

      document.getElementById("sfdevhub-open-console")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
      });
    },

    copyRecordId() {
      const id = this.state.pageInfo?.recordId || PageDetector.extractRecordId();
      if (id) {
        navigator.clipboard.writeText(id);
        this.showToast(`Copied: ${id}`);
      }
    },

    extractRecordData() {
      const fields = {};
      const fieldElements = document.querySelectorAll(
        "records-record-layout-item, .slds-form-element_horizontal, .detailList tr"
      );

      fieldElements.forEach((el) => {
        const labelEl = el.querySelector(
          ".slds-form-element__label, .labelCol, .test-id__field-label"
        );
        const valueEl = el.querySelector(
          ".slds-form-element__static, .dataCol, .test-id__field-value, " +
          "lightning-formatted-text, lightning-formatted-number, lightning-formatted-url"
        );

        if (labelEl && valueEl) {
          const label = labelEl.textContent.trim().replace(/\*$/, "").trim();
          const value = valueEl.textContent.trim();
          const apiName = this.resolveFieldName(labelEl) || label;
          if (label) fields[apiName] = value;
        }
      });

      return {
        recordId: this.state.pageInfo?.recordId,
        objectName: this.state.pageInfo?.objectName,
        fields,
        extractedAt: new Date().toISOString()
      };
    },

    async exportRecordData(format) {
      const data = this.extractRecordData();
      let output;

      switch (format) {
        case "json":
          output = JSON.stringify(data, null, 2);
          break;
        case "apex": {
          const entries = Object.entries(data.fields).map(([k, v]) => {
            if (!v || v === "--") return `'${k}' => null`;
            if (!isNaN(v)) return `'${k}' => ${v}`;
            return `'${k}' => '${v.replace(/'/g, "\\'")}'`;
          });
          output = `Map<String, Object> record = new Map<String, Object>{\n  ${entries.join(",\n  ")}\n};`;
          break;
        }
        case "soql": {
          const fieldNames = Object.keys(data.fields);
          output = `SELECT ${fieldNames.join(", ")} FROM ${data.objectName} WHERE Id = '${data.recordId}'`;
          break;
        }
        default:
          output = JSON.stringify(data, null, 2);
      }

      await navigator.clipboard.writeText(output);
      this.showToast(`${format.toUpperCase()} copied to clipboard`);
    },

    // ─── LIST VIEW TOOLS ─────────────────────────────────────

    injectListTools() {
      this.waitForElement(".slds-table, .listView, table.bodyTable", () => {
        this.addBulkTools();
      });
    },

    addBulkTools() {
      const toolbar = document.querySelector(
        ".slds-grid.slds-grid_align-spread, .listHeader, .fBody"
      );
      if (!toolbar || toolbar.querySelector("#sfdevhub-bulk-toolbar")) return;

      const bulkBar = document.createElement("div");
      bulkBar.id = "sfdevhub-bulk-toolbar";
      bulkBar.className = "sfdevhub-bulk-toolbar";
      bulkBar.innerHTML = `
        <div class="sfdevhub-bulk-inner">
          <button class="sfdevhub-bulk-btn" id="sfdevhub-select-all">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Select All
          </button>
          <button class="sfdevhub-bulk-btn" id="sfdevhub-export-list">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Export CSV
          </button>
          <button class="sfdevhub-bulk-btn" id="sfdevhub-copy-ids">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy IDs
          </button>
          <span class="sfdevhub-selected-count" id="sfdevhub-selected-count">0 selected</span>
        </div>
      `;

      toolbar.appendChild(bulkBar);

      document.getElementById("sfdevhub-select-all")?.addEventListener("click", () => {
        const checkboxes = document.querySelectorAll(
          'input[type="checkbox"], .slds-checkbox input, .forceVirtualInputMarker'
        );
        checkboxes.forEach(cb => {
          if (!cb.checked) {
            cb.click();
            cb.dispatchEvent(new Event("change", { bubbles: true }));
          }
        });
        this.updateSelectedCount();
      });

      document.getElementById("sfdevhub-export-list")?.addEventListener("click", () => {
        this.exportListAsCsv();
      });

      document.getElementById("sfdevhub-copy-ids")?.addEventListener("click", () => {
        this.copySelectedIds();
      });
    },

    exportListAsCsv() {
      const table = document.querySelector(".slds-table, table.bodyTable, .listView");
      if (!table) return { csv: "", error: "No table found" };

      const headers = [];
      table.querySelectorAll("thead th, .headerRow th").forEach((th) => {
        const text = th.textContent.trim();
        if (text && text !== "Checkbox") headers.push(text);
      });

      const rows = [];
      table.querySelectorAll("tbody tr, .dataRow").forEach((tr) => {
        const cells = [];
        tr.querySelectorAll("td, .dataCell").forEach((td, i) => {
          if (i === 0 && td.querySelector('input[type="checkbox"]')) return;
          cells.push(td.textContent.trim().replace(/"/g, '""'));
        });
        if (cells.length > 0) rows.push(cells);
      });

      const csv = [headers.join(","), ...rows.map(r => r.map(c => `"${c}"`).join(","))].join("\n");

      navigator.clipboard.writeText(csv).then(() => {
        this.showToast(`Exported ${rows.length} rows as CSV`);
      });

      return { csv, rowCount: rows.length };
    },

    copySelectedIds() {
      const ids = [];
      document.querySelectorAll("tbody tr, .dataRow").forEach((tr) => {
        const link = tr.querySelector('a[href*="/"], a[data-refid]');
        if (link) {
          const href = link.getAttribute("href") || "";
          const match = href.match(/\/([a-zA-Z0-9]{15,18})/);
          if (match) ids.push(match[1]);
        }
      });

      if (ids.length) {
        navigator.clipboard.writeText(ids.join("\n"));
        this.showToast(`Copied ${ids.length} record IDs`);
      }
    },

    updateSelectedCount() {
      const count = document.querySelectorAll(
        'input[type="checkbox"]:checked, .slds-checkbox input:checked'
      ).length;
      const countEl = document.getElementById("sfdevhub-selected-count");
      if (countEl) countEl.textContent = `${count} selected`;
    },

    // ─── SETUP PAGE TOOLS ────────────────────────────────────

    injectSetupTools() {
      this.addSetupShortcuts();
    },

    addSetupShortcuts() {
      if (document.querySelector("#sfdevhub-setup-shortcuts")) return;

      const shortcuts = document.createElement("div");
      shortcuts.id = "sfdevhub-setup-shortcuts";
      shortcuts.className = "sfdevhub-setup-bar";
      shortcuts.innerHTML = `
        <a href="/lightning/setup/ObjectManager/home" class="sfdevhub-setup-link" title="Object Manager">Objects</a>
        <a href="/lightning/setup/ProcessAutomation/home" class="sfdevhub-setup-link" title="Flows">Flows</a>
        <a href="/lightning/setup/ApexClasses/home" class="sfdevhub-setup-link" title="Apex Classes">Apex</a>
        <a href="/lightning/setup/ApexTriggers/home" class="sfdevhub-setup-link" title="Triggers">Triggers</a>
        <a href="/lightning/setup/ApexDebugLogs/home" class="sfdevhub-setup-link" title="Debug Logs">Logs</a>
        <a href="/lightning/setup/ManageUsers/home" class="sfdevhub-setup-link" title="Users">Users</a>
        <a href="/lightning/setup/EnhancedProfiles/home" class="sfdevhub-setup-link" title="Profiles">Profiles</a>
      `;

      document.body.insertBefore(shortcuts, document.body.firstChild);
    },

    // ─── HOME TOOLS ──────────────────────────────────────────

    injectHomeTools() {
      // Home page enhancements - minimal
    },

    // ─── QUICK SEARCH ────────────────────────────────────────

    injectQuickSearch() {
      if (document.querySelector("#sfdevhub-quick-search")) return;

      const overlay = document.createElement("div");
      overlay.id = "sfdevhub-quick-search";
      overlay.className = "sfdevhub-qs-overlay";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-label", "Quick Search");
      overlay.style.display = "none";

      overlay.innerHTML = `
        <div class="sfdevhub-qs-container">
          <div class="sfdevhub-qs-header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--sfdevhub-on-surface-variant)" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <input type="text" class="sfdevhub-qs-input" placeholder="Search objects, flows, apex, profiles..." id="sfdevhub-qs-input" autocomplete="off" aria-label="Quick search">
            <kbd class="sfdevhub-qs-kbd">ESC</kbd>
          </div>
          <div class="sfdevhub-qs-results" id="sfdevhub-qs-results" role="listbox">
            <div class="sfdevhub-qs-empty">Start typing to search...</div>
          </div>
          <div class="sfdevhub-qs-footer">
            <span>Type to search</span>
            <span>Arrow keys to navigate, Enter to open</span>
          </div>
        </div>
      `;

      document.body.appendChild(overlay);

      const input = document.getElementById("sfdevhub-qs-input");
      const results = document.getElementById("sfdevhub-qs-results");

      input.addEventListener("input", () => this.handleQuickSearch(input.value));
      input.addEventListener("keydown", (e) => {
        if (e.key === "Escape") this.toggleQuickSearch();
        if (e.key === "Enter") {
          const selected = results.querySelector(".sfdevhub-qs-item-selected");
          if (selected) selected.click();
        }
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          this.navigateQuickSearch(e.key === "ArrowDown" ? 1 : -1);
        }
      });

      overlay.addEventListener("click", (e) => {
        if (e.target === overlay) this.toggleQuickSearch();
      });
    },

    toggleQuickSearch() {
      const overlay = document.getElementById("sfdevhub-quick-search");
      if (!overlay) return;

      this.state.quickSearchOpen = overlay.style.display === "none";
      overlay.style.display = this.state.quickSearchOpen ? "flex" : "none";

      if (this.state.quickSearchOpen) {
        const input = document.getElementById("sfdevhub-qs-input");
        input.value = "";
        input.focus();
        document.getElementById("sfdevhub-qs-results").innerHTML =
          '<div class="sfdevhub-qs-empty">Start typing to search...</div>';
      }
    },

    handleQuickSearch(query) {
      const results = document.getElementById("sfdevhub-qs-results");
      if (!query.trim()) {
        results.innerHTML = '<div class="sfdevhub-qs-empty">Start typing to search...</div>';
        return;
      }

      const items = this.getSearchResults(query);
      if (items.length === 0) {
        results.innerHTML = '<div class="sfdevhub-qs-empty">No results found</div>';
        return;
      }

      results.innerHTML = items.map((item, i) => `
        <div class="sfdevhub-qs-item ${i === 0 ? "sfdevhub-qs-item-selected" : ""}"
             role="option"
             data-url="${item.url}"
             data-type="${item.type}">
          <div class="sfdevhub-qs-item-icon">${item.icon}</div>
          <div class="sfdevhub-qs-item-info">
            <div class="sfdevhub-qs-item-name">${item.name}</div>
            <div class="sfdevhub-qs-item-type">${item.type}</div>
          </div>
          ${item.badge ? `<span class="sfdevhub-qs-item-badge">${item.badge}</span>` : ""}
        </div>
      `).join("");

      results.querySelectorAll(".sfdevhub-qs-item").forEach((el) => {
        el.addEventListener("click", () => {
          const url = el.dataset.url;
          if (url) window.location.href = url;
          this.toggleQuickSearch();
        });
      });
    },

    getSearchResults(query) {
      const q = query.toLowerCase();
      const items = [];

      const STANDARD_OBJECTS = [
        { name: "Account", type: "Object", icon: "🏢" },
        { name: "Contact", type: "Object", icon: "👤" },
        { name: "Opportunity", type: "Object", icon: "💰" },
        { name: "Lead", type: "Object", icon: "🎯" },
        { name: "Case", type: "Object", icon: "📋" },
        { name: "Task", type: "Object", icon: "✅" },
        { name: "Event", type: "Object", icon: "📅" },
        { name: "User", type: "Object", icon: "👤" },
        { name: "Campaign", type: "Object", icon: "📢" },
        { name: "Product2", type: "Object", icon: "📦" },
        { name: "Pricebook2", type: "Object", icon: "💲" },
        { name: "Order", type: "Object", icon: "📝" },
        { name: "Contract", type: "Object", icon: "📄" },
        { name: "Asset", type: "Object", icon: "🔧" },
        { name: "Report", type: "Object", icon: "📊" },
        { name: "Dashboard", type: "Object", icon: "📈" }
      ];

      const SETUP_PAGES = [
        { name: "Object Manager", type: "Setup", icon: "⚙️", url: "/lightning/setup/ObjectManager/home" },
        { name: "Flows", type: "Setup", icon: "🔄", url: "/lightning/setup/ProcessAutomation/home" },
        { name: "Apex Classes", type: "Setup", icon: "💻", url: "/lightning/setup/ApexClasses/home" },
        { name: "Apex Triggers", type: "Setup", icon: "⚡", url: "/lightning/setup/ApexTriggers/home" },
        { name: "Validation Rules", type: "Setup", icon: "✅", url: "/lightning/setup/ObjectManager/home" },
        { name: "Profiles", type: "Setup", icon: "🔒", url: "/lightning/setup/EnhancedProfiles/home" },
        { name: "Permission Sets", type: "Setup", icon: "🔑", url: "/lightning/setup/PermSets/home" },
        { name: "Users", type: "Setup", icon: "👥", url: "/lightning/setup/ManageUsers/home" },
        { name: "Debug Logs", type: "Setup", icon: "📜", url: "/lightning/setup/ApexDebugLogs/home" },
        { name: "Custom Settings", type: "Setup", icon: "🛠️", url: "/lightning/setup/CustomSettings/home" },
        { name: "Custom Metadata", type: "Setup", icon: "📦", url: "/lightning/setup/CustomMetadata/home" },
        { name: "Remote Site Settings", type: "Setup", icon: "🌐", url: "/lightning/setup/SecurityRemoteProxy/home" },
        { name: "Named Credentials", type: "Setup", icon: "🔐", url: "/lightning/setup/NamedCredential/home" },
        { name: "App Manager", type: "Setup", icon: "📱", url: "/lightning/setup/LightningApplication/home" },
        { name: "Page Layouts", type: "Setup", icon: "📐", url: "/lightning/setup/ObjectManager/home" },
        { name: "Sharing Rules", type: "Setup", icon: "🤝", url: "/lightning/setup/SecuritySharing/home" }
      ];

      STANDARD_OBJECTS.forEach(obj => {
        if (obj.name.toLowerCase().includes(q)) {
          items.push({ ...obj, url: `/lightning/o/${obj.name}/list`, badge: "Standard" });
        }
      });

      SETUP_PAGES.forEach(page => {
        if (page.name.toLowerCase().includes(q)) {
          items.push(page);
        }
      });

      return items.slice(0, 10);
    },

    navigateQuickSearch(direction) {
      const items = document.querySelectorAll(".sfdevhub-qs-item");
      if (!items.length) return;

      const current = document.querySelector(".sfdevhub-qs-item-selected");
      let index = current ? [...items].indexOf(current) : -1;

      if (current) current.classList.remove("sfdevhub-qs-item-selected");

      index += direction;
      if (index < 0) index = items.length - 1;
      if (index >= items.length) index = 0;

      items[index].classList.add("sfdevhub-qs-item-selected");
      items[index].scrollIntoView({ block: "nearest" });
    },

    // ─── FLOATING PANEL ──────────────────────────────────────

    injectFloatingPanel() {
      if (document.querySelector("#sfdevhub-float-panel")) return;

      const panel = document.createElement("div");
      panel.id = "sfdevhub-float-panel";
      panel.className = "sfdevhub-float";
      panel.setAttribute("role", "complementary");
      panel.setAttribute("aria-label", "SFDevHub Quick Actions");

      const isRecord = this.state.pageInfo?.type === PageDetector.PAGE_TYPES.RECORD;
      const isSetup = this.state.pageInfo?.type === PageDetector.PAGE_TYPES.SETUP;

      let actionsHtml = "";

      if (isRecord) {
        actionsHtml = `
          <button class="sfdevhub-float-btn sfdevhub-float-primary" id="sfdevhub-fl-toggle-api" title="Toggle API Names (Alt+A)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </button>
          <button class="sfdevhub-float-btn" id="sfdevhub-fl-copy-id" title="Copy ID (Alt+I)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          <button class="sfdevhub-float-btn" id="sfdevhub-fl-highlight" title="Highlight Required Fields">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
          </button>
          <div class="sfdevhub-float-divider"></div>
        `;
      }

      if (isSetup) {
        actionsHtml = `
          <button class="sfdevhub-float-btn" id="sfdevhub-fl-objects" title="Object Manager">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          </button>
          <button class="sfdevhub-float-btn" id="sfdevhub-fl-apex" title="Apex Classes">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
          </button>
          <button class="sfdevhub-float-btn" id="sfdevhub-fl-flows" title="Flows">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
          </button>
          <div class="sfdevhub-float-divider"></div>
        `;
      }

      actionsHtml += `
        <button class="sfdevhub-float-btn" id="sfdevhub-fl-search" title="Quick Search (Alt+K)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        </button>
        <button class="sfdevhub-float-btn" id="sfdevhub-fl-panel" title="Open Side Panel (Alt+S)">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/></svg>
        </button>
      `;

      panel.innerHTML = `
        <div class="sfdevhub-float-pulse"></div>
        <div class="sfdevhub-float-inner">
          <div class="sfdevhub-float-brand">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--sfdevhub-secondary)" stroke-width="2">
              <circle cx="12" cy="12" r="10"/>
            </svg>
            <span>SFDevHub</span>
          </div>
          <div class="sfdevhub-float-actions">${actionsHtml}</div>
          ${isRecord ? `
          <div class="sfdevhub-float-meta">
            <span class="sfdevhub-float-env ${this.state.pageInfo?.isProduction ? "sfdevhub-prod" : "sfdevhub-sandbox"}">
              ${this.state.pageInfo?.isProduction ? "PROD" : "SANDBOX"}
            </span>
          </div>` : ""}
        </div>
      `;

      document.body.appendChild(panel);

      document.getElementById("sfdevhub-fl-toggle-api")?.addEventListener("click", () => this.toggleApiNames());
      document.getElementById("sfdevhub-fl-copy-id")?.addEventListener("click", () => this.copyRecordId());
      document.getElementById("sfdevhub-fl-highlight")?.addEventListener("click", () => this.highlightRequiredFields());
      document.getElementById("sfdevhub-fl-search")?.addEventListener("click", () => this.toggleQuickSearch());
      document.getElementById("sfdevhub-fl-panel")?.addEventListener("click", () => {
        chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" });
      });
      document.getElementById("sfdevhub-fl-objects")?.addEventListener("click", () => {
        window.location.href = "/lightning/setup/ObjectManager/home";
      });
      document.getElementById("sfdevhub-fl-apex")?.addEventListener("click", () => {
        window.location.href = "/lightning/setup/ApexClasses/home";
      });
      document.getElementById("sfdevhub-fl-flows")?.addEventListener("click", () => {
        window.location.href = "/lightning/setup/ProcessAutomation/home";
      });
    },

    // ─── PAGE OBSERVER ───────────────────────────────────────

    observePageChanges() {
      let lastUrl = window.location.href;

      const observer = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
          lastUrl = window.location.href;
          this.state.pageInfo = PageDetector.detect();
          this.removeUI();
          setTimeout(() => this.injectForPageType(this.state.pageInfo.type), 500);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });
    },

    removeUI() {
      const selectors = [
        "#sfdevhub-float-panel",
        "#sfdevhub-quick-search",
        "#sfdevhub-bulk-toolbar",
        "#sfdevhub-setup-shortcuts",
        ".sfdevhub-record-actions",
        ".sfdevhub-api-badge",
        ".sfdevhub-required-marker",
        "#sfdevhub-sticky-headers"
      ];

      selectors.forEach(sel => {
        document.querySelectorAll(sel).forEach(el => el.remove());
      });

      document.querySelectorAll("[data-sfdevhub-api-name]").forEach(el => {
        if (el.dataset.sfdevhubOriginalHTML) {
          el.innerHTML = el.dataset.sfdevhubOriginalHTML;
        }
        delete el.dataset.sfdevhubApiName;
        delete el.dataset.sfdevhubOriginalHTML;
      });

      document.querySelectorAll(".sfdevhub-required-highlight").forEach(el => {
        el.classList.remove("sfdevhub-required-highlight");
      });
    },

    // ─── UTILITIES ───────────────────────────────────────────

    waitForElement(selector, callback, timeout = 10000) {
      const el = document.querySelector(selector);
      if (el) return callback(el);

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          callback(el);
        }
      });

      observer.observe(document.body, { childList: true, subtree: true });

      setTimeout(() => observer.disconnect(), timeout);
    },

    showToast(message) {
      let toast = document.getElementById("sfdevhub-toast");
      if (!toast) {
        toast = document.createElement("div");
        toast.id = "sfdevhub-toast";
        toast.setAttribute("role", "status");
        toast.setAttribute("aria-live", "polite");
        document.body.appendChild(toast);
      }

      toast.textContent = message;
      toast.classList.add("sfdevhub-toast-visible");
      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => toast.classList.remove("sfdevhub-toast-visible"), 2500);
    }
  };

  SFDevHub.init();
})();
