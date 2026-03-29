document.addEventListener("DOMContentLoaded", () => {
  // ─── DOM References ─────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const envBar = $("#env-bar");
  const envValue = $("#env-value");
  const envIcon = $("#env-icon");
  const recordCard = $("#record-card");
  const savedQueries = $("#saved-queries");
  const favoritesList = $("#favorites-list");
  const searchInput = $("#search-input");
  const toast = $("#toast");
  const toastText = $("#toast-text");

  // ─── Tab Navigation ─────────────────────────────────────
  const tabs = $$(".tab");
  const views = $$(".view");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const view = tab.dataset.view;
      tabs.forEach((t) => {
        t.classList.remove("active");
        t.setAttribute("aria-selected", "false");
        t.setAttribute("tabindex", "-1");
      });
      views.forEach((v) => v.classList.remove("active"));
      tab.classList.add("active");
      tab.setAttribute("aria-selected", "true");
      tab.setAttribute("tabindex", "0");
      $(`#view-${view}`)?.classList.add("active");
    });
  });

  // ─── Initialize ─────────────────────────────────────────
  init();

  async function init() {
    await detectEnvironment();
    await loadRecordInfo();
    await loadSavedQueries();
    await loadFavorites();
    await loadSettings();
    bindActions();
    bindSettings();
    bindNavigation();
    bindKeyboardShortcuts();
  }

  // ─── Environment Detection ──────────────────────────────
  async function detectEnvironment() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) {
        setEnv("unknown", "Not on Salesforce");
        return;
      }

      const url = new URL(tab.url);
      const isSF = url.hostname.includes("salesforce.com") || url.hostname.includes("force.com");

      if (!isSF) {
        setEnv("unknown", "Not on Salesforce");
        return;
      }

      const instance = url.hostname.split(".")[0];
      const isProd = !url.hostname.includes("--");
      setEnv(isProd ? "prod" : "sandbox", `${isProd ? "PROD" : "SANDBOX"} - ${instance.toUpperCase()}`);
    } catch {
      setEnv("unknown", "Detection failed");
    }
  }

  function setEnv(type, label) {
    envBar.className = "env-bar";
    envBar.classList.add(`sfdevhub-env-${type}`);
    envValue.textContent = label;
    envIcon.innerHTML = type === "prod" ? "&#9888;" : type === "sandbox" ? "&#10003;" : "&#8226;";
  }

  // ─── Record Info ────────────────────────────────────────
  async function loadRecordInfo() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;

      const url = new URL(tab.url);
      const hashPath = url.hash.replace("#/", "").replace("#", "");
      const segments = hashPath.split("/").filter(Boolean);

      let recordId = null;
      let objectName = null;

      if (segments[0] === "lightning" && segments[1] === "r") {
        objectName = segments[2] || "";
        recordId = segments[3] || "";
      }

      if (!recordId) {
        for (const seg of segments) {
          if (/^[a-zA-Z0-9]{15,18}$/.test(seg)) {
            recordId = seg;
            break;
          }
        }
      }

      if (!recordId) {
        const pathParts = url.pathname.split("/").filter(Boolean);
        for (const part of pathParts) {
          if (/^[a-zA-Z0-9]{15,18}$/.test(part)) {
            recordId = part;
            if (!objectName && pathParts.length >= 2) {
              objectName = pathParts[pathParts.indexOf(part) - 1] || "";
            }
            break;
          }
        }
      }

      if (recordId) {
        renderRecordCard(recordId, objectName || guessObjectFromId(recordId));
      }
    } catch {
      // Not in extension context
    }
  }

  function renderRecordCard(recordId, objectName) {
    recordCard.innerHTML = `
      <div class="record-header">
        <div class="record-icon">${(objectName || "?")[0]}</div>
        <div class="record-meta">
          <span class="record-label">${objectName || "Record"}</span>
          <span class="record-name">${recordId}</span>
        </div>
      </div>
      <div class="record-fields">
        <div class="record-field">
          <span class="field-label">Object</span>
          <span class="field-value">${objectName || "Unknown"}</span>
        </div>
        <div class="record-field">
          <span class="field-label">Record ID</span>
          <span class="field-value mono">${recordId}</span>
        </div>
      </div>
    `;
  }

  function guessObjectFromId(id) {
    if (!id) return "Unknown";
    const prefix = id.substring(0, 3);
    const map = {
      "001": "Account", "003": "Contact", "005": "User", "006": "Opportunity",
      "00Q": "Lead", "00T": "Task", "00U": "Event", "500": "Case",
      "701": "Campaign", "300": "Order", "800": "Contract",
      "01Z": "Dashboard", "00O": "Report"
    };
    return map[prefix] || "Record";
  }

  // ─── Saved Queries ──────────────────────────────────────
  async function loadSavedQueries() {
    try {
      const { savedQueries: queries } = await SFStorage.get("savedQueries");
      if (!queries || queries.length === 0) return;

      savedQueries.innerHTML = queries.slice(0, 10).map((q) => `
        <div class="saved-item" data-query="${escapeHtml(q.query)}" data-name="${escapeHtml(q.name)}">
          <span class="saved-item-name">${escapeHtml(q.name)}</span>
          <span class="saved-item-date">${formatDate(q.updatedAt || q.createdAt)}</span>
        </div>
      `).join("");

      savedQueries.querySelectorAll(".saved-item").forEach((el) => {
        el.addEventListener("click", () => {
          chrome.runtime.sendMessage({ type: "TOGGLE_SIDE_PANEL" });
        });
      });
    } catch {
      // Storage not available
    }
  }

  // ─── Favorites ──────────────────────────────────────────
  async function loadFavorites() {
    try {
      const { favoriteObjects } = await SFStorage.get("favoriteObjects");
      if (!favoriteObjects || favoriteObjects.length === 0) return;

      favoritesList.innerHTML = favoriteObjects.slice(0, 10).map((obj) => `
        <div class="fav-item" data-object="${escapeHtml(obj)}">
          <span class="saved-item-name">${escapeHtml(obj)}</span>
        </div>
      `).join("");

      favoritesList.querySelectorAll(".fav-item").forEach((el) => {
        el.addEventListener("click", () => {
          const obj = el.dataset.object;
          chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab?.id) {
              chrome.tabs.update(tab.id, { url: `https://${new URL(tab.url).hostname}/lightning/o/${obj}/list` });
            }
          });
        });
      });
    } catch {
      // Storage not available
    }
  }

  // ─── Settings ───────────────────────────────────────────
  async function loadSettings() {
    try {
      const prefs = await SFStorage.get(["showApiNames", "highlightRequired", "stickyHeaders", "collapseEmpty"]);
      $("#set-api-names").setAttribute("aria-checked", String(!!prefs.showApiNames));
      $("#set-highlight").setAttribute("aria-checked", String(!!prefs.highlightRequired));
      $("#set-sticky").setAttribute("aria-checked", String(!!prefs.stickyHeaders));
      $("#set-collapse").setAttribute("aria-checked", String(!!prefs.collapseEmpty));
    } catch {
      // Storage not available
    }
  }

  function bindSettings() {
    $$(".toggle").forEach((toggle) => {
      toggle.addEventListener("click", async () => {
        const current = toggle.getAttribute("aria-checked") === "true";
        const newState = !current;
        toggle.setAttribute("aria-checked", String(newState));

        const key = {
          "set-api-names": "showApiNames",
          "set-highlight": "highlightRequired",
          "set-sticky": "stickyHeaders",
          "set-collapse": "collapseEmpty"
        }[toggle.id];

        if (key) {
          await SFStorage.set({ [key]: newState });
          notifyContentScript(key, newState);
        }
      });
    });

    $("#btn-export-settings")?.addEventListener("click", exportSettings);
    $("#btn-import-settings")?.addEventListener("click", () => $("#import-file").click());
    $("#import-file")?.addEventListener("change", importSettings);
    $("#btn-clear-data")?.addEventListener("click", clearAllData);
  }

  function notifyContentScript(key, value) {
    const msgMap = {
      showApiNames: "TOGGLE_API_NAMES",
      highlightRequired: "HIGHLIGHT_REQUIRED",
      stickyHeaders: "STICKY_HEADERS",
      collapseEmpty: "COLLAPSE_EMPTY"
    };

    const msgType = msgMap[key];
    if (!msgType) return;

    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: msgType, enabled: value }).catch(() => {});
      }
    });
  }

  async function exportSettings() {
    const data = await SFStorage.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sfdevhub-settings.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Settings exported");
  }

  async function importSettings(e) {
    const file = e.target.files[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      await SFStorage.importAll(data);
      showToast("Settings imported");
      await loadSettings();
    } catch {
      showToast("Invalid settings file");
    }
  }

  async function clearAllData() {
    if (confirm("Clear all SFDevHub data? This cannot be undone.")) {
      await SFStorage.clear();
      showToast("All data cleared");
      await loadSettings();
    }
  }

  // ─── Action Bindings ────────────────────────────────────
  function bindActions() {
    $("#btn-sidepanel")?.addEventListener("click", openSidePanel);
    $("#qa-toggle-api")?.addEventListener("click", () => sendToContent("TOGGLE_API_NAMES"));
    $("#qa-highlight")?.addEventListener("click", () => sendToContent("HIGHLIGHT_REQUIRED"));
    $("#qa-copy-id")?.addEventListener("click", () => sendToContent("COPY_RECORD_ID"));
    $("#qa-export-json")?.addEventListener("click", exportCurrentRecord);
    $("#qa-soql")?.addEventListener("click", openSidePanel);
    $("#qa-quick-search")?.addEventListener("click", () => sendToContent("TOGGLE_QUICK_SEARCH"));
    $("#btn-refresh-record")?.addEventListener("click", loadRecordInfo);

    $$(".tool-card").forEach((card) => {
      card.addEventListener("click", () => handleToolAction(card.dataset.tool));
    });
  }

  function openSidePanel() {
    chrome.runtime.sendMessage({ type: "OPEN_SIDEPANEL" }).catch(() => {});
  }

  function sendToContent(type, data = {}) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type, ...data }).then((resp) => {
          if (type === "TOGGLE_API_NAMES") {
            showToast(resp?.visible ? "API names shown" : "API names hidden");
          } else if (type === "HIGHLIGHT_REQUIRED") {
            showToast("Required fields highlighted");
          } else if (type === "COPY_RECORD_ID") {
            showToast("Record ID copied");
          } else if (type === "TOGGLE_QUICK_SEARCH") {
            window.close();
          }
        }).catch(() => showToast("Navigate to a Salesforce page"));
      }
    });
  }

  function exportCurrentRecord() {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_RECORD_DATA" }).then((data) => {
          if (data && data.recordId) {
            const json = JSON.stringify(data, null, 2);
            navigator.clipboard.writeText(json).then(() => showToast("Record JSON copied"));
          } else {
            showToast("No record data found");
          }
        }).catch(() => showToast("Navigate to a record page"));
      }
    });
  }

  function handleToolAction(tool) {
    const actions = {
      "api-names": () => sendToContent("TOGGLE_API_NAMES"),
      "export-json": () => exportCurrentRecord(),
      "export-csv": () => sendToContent("EXPORT_LIST_CSV"),
      "apex-map": () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_RECORD_DATA" }).then((data) => {
              if (data?.fields) {
                const entries = Object.entries(data.fields).map(([k, v]) => {
                  if (!v) return `'${k}' => null`;
                  if (!isNaN(v)) return `'${k}' => ${v}`;
                  return `'${k}' => '${String(v).replace(/'/g, "\\'")}'`;
                });
                const apex = `Map<String, Object> rec = new Map<String, Object>{\n  ${entries.join(",\n  ")}\n};`;
                navigator.clipboard.writeText(apex).then(() => showToast("Apex Map copied"));
              }
            }).catch(() => showToast("Navigate to a record page"));
          }
        });
      },
      "soql-console": () => openSidePanel(),
      "auto-soql": () => {
        chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, { type: "EXTRACT_RECORD_DATA" }).then((data) => {
              if (data?.recordId && data?.objectName) {
                const soql = `SELECT FIELDS(ALL) FROM ${data.objectName} WHERE Id = '${data.recordId}' LIMIT 1`;
                navigator.clipboard.writeText(soql).then(() => showToast("SOQL copied"));
              } else {
                showToast("Navigate to a record page");
              }
            }).catch(() => showToast("Navigate to a record page"));
          }
        });
      },
      "quick-search": () => sendToContent("TOGGLE_QUICK_SEARCH"),
      "sticky-headers": () => sendToContent("STICKY_HEADERS"),
      "collapse-empty": () => sendToContent("COLLAPSE_EMPTY"),
      "highlight-required": () => sendToContent("HIGHLIGHT_REQUIRED"),
      "copy-json": () => exportCurrentRecord(),
      "copy-apex": () => handleToolAction("apex-map"),
      "copy-soql": () => handleToolAction("auto-soql")
    };

    if (actions[tool]) actions[tool]();
  }

  // ─── Navigation Shortcuts ───────────────────────────────
  function bindNavigation() {
    $$(".shortcut-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        const nav = btn.dataset.nav;
        const urls = {
          objects: "/lightning/setup/ObjectManager/home",
          flows: "/lightning/setup/ProcessAutomation/home",
          apex: "/lightning/setup/ApexClasses/home",
          triggers: "/lightning/setup/ApexTriggers/home",
          profiles: "/lightning/setup/EnhancedProfiles/home",
          debug: "/lightning/setup/ApexDebugLogs/home",
          validation: "/lightning/setup/ObjectManager/home",
          users: "/lightning/setup/ManageUsers/home"
        };

        const path = urls[nav];
        if (path) {
          chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
            if (tab?.id) {
              chrome.tabs.sendMessage(tab.id, { type: "GET_PAGE_INFO" }).then((info) => {
                const host = info?.hostname || new URL(tab.url).hostname;
                const base = host.includes("lightning")
                  ? `https://${host.split(".")[0]}.lightning.force.com`
                  : `https://${host}`;
                chrome.tabs.update(tab.id, { url: `${base}${path}` });
              }).catch(() => {
                chrome.tabs.update(tab.id, { url: `https://login.salesforce.com${path}` });
              });
            }
          });
        }
      });
    });
  }

  // ─── Keyboard Shortcuts ─────────────────────────────────
  function bindKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        searchInput.focus();
      }
    });

    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && searchInput.value.trim()) {
        SFStorage.addRecentSearch(searchInput.value.trim());
        sendToContent("TOGGLE_QUICK_SEARCH");
      }
    });
  }

  // ─── Utilities ──────────────────────────────────────────
  function showToast(message) {
    clearTimeout(showToast._timer);
    toastText.textContent = message;
    toast.classList.add("visible");
    showToast._timer = setTimeout(() => toast.classList.remove("visible"), 2500);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function formatDate(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }
});
