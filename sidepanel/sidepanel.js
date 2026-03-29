document.addEventListener("DOMContentLoaded", () => {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  let lastResults = [];

  // ─── Panel Navigation ────────────────────────────────
  const navBtns = $$(".nav-btn");
  const panels = $$(".panel");

  navBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const panel = btn.dataset.panel;
      if (!panel) return;

      navBtns.forEach((b) => {
        b.classList.remove("active");
        b.removeAttribute("aria-current");
      });
      panels.forEach((p) => p.classList.remove("active"));

      btn.classList.add("active");
      btn.setAttribute("aria-current", "page");
      $(`#panel-${panel}`)?.classList.add("active");
    });
  });

  // ─── Initialize ──────────────────────────────────────
  init();

  async function init() {
    detectEnvironment();
    bindEditor();
    bindSoqlActions();
    bindMetadata();
    bindClipboard();
    bindLimits();
    loadSavedQueries();
  }

  // ─── Environment ─────────────────────────────────────
  async function detectEnvironment() {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url) return;

      const url = new URL(tab.url);
      const isSF = url.hostname.includes("salesforce.com") || url.hostname.includes("force.com");
      if (!isSF) return;

      const instance = url.hostname.split(".")[0];
      const isProd = !url.hostname.includes("--");
      $("#sp-env-text").textContent = `${isProd ? "PROD" : "SANDBOX"} - ${instance.toUpperCase()}`;
    } catch {
      // Not in extension context
    }
  }

  // ─── Editor ──────────────────────────────────────────
  function bindEditor() {
    const editor = $("#sp-editor");
    const cursor = $("#sp-cursor");

    editor.addEventListener("input", updateCursor);
    editor.addEventListener("click", updateCursor);
    editor.addEventListener("keyup", updateCursor);

    function updateCursor() {
      const text = editor.innerText;
      const sel = window.getSelection();
      if (!sel.rangeCount) return;

      const range = sel.getRangeAt(0);
      const preRange = range.cloneRange();
      preRange.selectNodeContents(editor);
      preRange.setEnd(range.endContainer, range.endOffset);
      const pos = preRange.toString().length;

      const before = text.substring(0, pos);
      const lines = before.split("\n");
      cursor.textContent = `Line ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
    }

    editor.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        executeQuery();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        document.execCommand("insertText", false, "  ");
      }
    });
  }

  // ─── SOQL Actions ────────────────────────────────────
  function bindSoqlActions() {
    $("#sp-run").addEventListener("click", executeQuery);
    $("#sp-clear").addEventListener("click", () => {
      $("#sp-editor").innerText = "";
      $("#sp-status").textContent = "Cleared";
    });
    $("#sp-format").addEventListener("click", () => {
      const query = $("#sp-editor").innerText;
      if (typeof SOQLHelper !== "undefined") {
        $("#sp-editor").innerText = SOQLHelper.format(query);
        showToast("Query formatted");
      }
    });
    $("#sp-save-query").addEventListener("click", saveCurrentQuery);
    $("#sp-recent").addEventListener("click", toggleSavedDrawer);
    $("#sp-close-drawer")?.addEventListener("click", () => {
      $("#sp-saved-drawer").style.display = "none";
    });
    $("#sp-export-all")?.addEventListener("click", exportResultsAsCsv);
    $("#sp-copy-results")?.addEventListener("click", copyResultsAsJson);
    $("#sp-csv-results")?.addEventListener("click", exportResultsAsCsv);
  }

  async function executeQuery() {
    const editor = $("#sp-editor");
    const query = editor.innerText.trim();
    if (!query) {
      showToast("Enter a SOQL query");
      return;
    }

    const runBtn = $("#sp-run");
    const status = $("#sp-status");
    runBtn.disabled = true;
    status.textContent = "Executing...";

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active Salesforce tab");

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (soql) => {
          try {
            const sid = document.cookie.match(/sid=([^;]+)/)?.[1];
            if (!sid) return { error: "No Salesforce session found. Navigate to a Salesforce tab." };

            const host = window.location.hostname;
            const instance = host.split(".")[0];
            const baseUrl = host.includes("lightning")
              ? `https://${instance}.my.salesforce.com`
              : `https://${host}`;

            const resp = await fetch(`${baseUrl}/services/data/v59.0/query?q=${encodeURIComponent(soql)}`, {
              headers: { "Authorization": `Bearer ${sid}`, "Content-Type": "application/json" }
            });

            if (!resp.ok) {
              const err = await resp.json().catch(() => ({}));
              return { error: err[0]?.message || `HTTP ${resp.status}` };
            }

            return await resp.json();
          } catch (e) {
            return { error: e.message };
          }
        },
        args: [query]
      });

      const data = results?.[0]?.result;
      if (data?.error) throw new Error(data.error);

      lastResults = data.records || [];
      renderResults(data);
      status.textContent = `${data.totalSize || 0} records`;

      const copyBtn = $("#sp-copy-results");
      const csvBtn = $("#sp-csv-results");
      if (copyBtn) copyBtn.disabled = false;
      if (csvBtn) csvBtn.disabled = false;

    } catch (err) {
      renderError(err.message);
      status.textContent = "Error";
    } finally {
      runBtn.disabled = false;
    }
  }

  function renderResults(data) {
    const container = $("#sp-results");
    const label = $("#sp-results-label");

    if (!data || !data.records || data.records.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No records found</p></div>';
      label.textContent = "RESULTS (0)";
      return;
    }

    label.textContent = `RESULTS (${data.totalSize || data.records.length})`;

    const allKeys = new Set();
    data.records.forEach(r => Object.keys(r).forEach(k => { if (k !== "attributes") allKeys.add(k); }));
    const columns = [...allKeys];

    let html = '<table class="results-table" role="grid" aria-label="Query results"><thead><tr>';
    columns.forEach(col => { html += `<th scope="col">${escapeHtml(col)}</th>`; });
    html += '</tr></thead><tbody>';

    data.records.forEach(record => {
      html += '<tr>';
      columns.forEach(col => {
        const val = record[col];
        const display = val === null ? '<em style="opacity:0.4">null</em>' :
          typeof val === "object" ? JSON.stringify(val) : escapeHtml(String(val));
        if (col === "Id") {
          html += `<td class="id-cell" data-id="${val}" title="Click to copy">${display}</td>`;
        } else {
          html += `<td>${display}</td>`;
        }
      });
      html += '</tr>';
    });

    html += '</tbody></table>';
    container.innerHTML = html;

    container.querySelectorAll(".id-cell").forEach(cell => {
      cell.addEventListener("click", () => {
        navigator.clipboard.writeText(cell.dataset.id);
        showToast("ID copied");
      });
    });
  }

  function renderError(message) {
    const container = $("#sp-results");
    container.innerHTML = `
      <div class="empty-state">
        <p style="color:var(--sfdevhub-error)">${escapeHtml(message)}</p>
        <p class="empty-hint">Check your query and Salesforce session</p>
      </div>
    `;
  }

  async function saveCurrentQuery() {
    const query = $("#sp-editor").innerText.trim();
    if (!query) return;

    const name = prompt("Query name:");
    if (!name) return;

    if (typeof SFStorage !== "undefined") {
      await SFStorage.saveQuery(name, query);
      showToast("Query saved");
      loadSavedQueries();
    }
  }

  async function loadSavedQueries() {
    if (typeof SFStorage === "undefined") return;

    const { savedQueries: queries } = await SFStorage.get("savedQueries");
    const container = $("#sp-saved-list");

    if (!queries || queries.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>No saved queries</p></div>';
      return;
    }

    container.innerHTML = queries.map((q) => `
      <div class="saved-item" data-query="${escapeHtml(q.query)}">
        <span class="saved-item-name">${escapeHtml(q.name)}</span>
        <span class="saved-item-query">${escapeHtml(q.query)}</span>
        <div class="saved-item-actions">
          <button class="saved-item-del" data-name="${escapeHtml(q.name)}">Delete</button>
        </div>
      </div>
    `).join("");

    container.querySelectorAll(".saved-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.classList.contains("saved-item-del")) return;
        const query = el.dataset.query;
        $("#sp-editor").innerText = query;
        $("#sp-saved-drawer").style.display = "none";
      });
    });

    container.querySelectorAll(".saved-item-del").forEach((btn) => {
      btn.addEventListener("click", async () => {
        await SFStorage.deleteQuery(btn.dataset.name);
        loadSavedQueries();
        showToast("Query deleted");
      });
    });
  }

  function toggleSavedDrawer() {
    const drawer = $("#sp-saved-drawer");
    drawer.style.display = drawer.style.display === "none" ? "flex" : "none";
    if (drawer.style.display === "flex") loadSavedQueries();
  }

  function copyResultsAsJson() {
    if (!lastResults.length) return;
    const clean = lastResults.map(r => {
      const obj = { ...r };
      delete obj.attributes;
      return obj;
    });
    navigator.clipboard.writeText(JSON.stringify(clean, null, 2));
    showToast("Results copied as JSON");
  }

  function exportResultsAsCsv() {
    if (!lastResults.length) {
      showToast("No results to export");
      return;
    }

    if (typeof SOQLHelper !== "undefined") {
      const csv = SOQLHelper.toCsv(lastResults);
      navigator.clipboard.writeText(csv);
      showToast(`Exported ${lastResults.length} rows as CSV`);
    }
  }

  // ─── Metadata ────────────────────────────────────────
  function bindMetadata() {
    $("#md-fetch").addEventListener("click", fetchMetadata);
  }

  async function fetchMetadata() {
    const type = $("#md-type").value;
    const container = $("#md-results");
    container.innerHTML = '<div class="empty-state"><p>Loading...</p></div>';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active Salesforce tab");

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async (objectType) => {
          try {
            const sid = document.cookie.match(/sid=([^;]+)/)?.[1];
            if (!sid) return { error: "No session" };

            const host = window.location.hostname;
            const instance = host.split(".")[0];
            const baseUrl = host.includes("lightning")
              ? `https://${instance}.my.salesforce.com`
              : `https://${host}`;

            const query = objectType === "Profile"
              ? "SELECT+Id,Name+FROM+Profile+ORDER+BY+Name+LIMIT+200"
              : `SELECT+Id,Name+FROM+${objectType}+ORDER+BY+Name+LIMIT+200`;

            const endpoint = objectType === "Profile"
              ? `${baseUrl}/services/data/v59.0/query?q=${query}`
              : `${baseUrl}/services/data/v59.0/tooling/query?q=${query}`;

            const resp = await fetch(endpoint, {
              headers: { "Authorization": `Bearer ${sid}`, "Content-Type": "application/json" }
            });

            if (!resp.ok) return { error: `HTTP ${resp.status}` };
            return await resp.json();
          } catch (e) {
            return { error: e.message };
          }
        },
        args: [type]
      });

      const data = results?.[0]?.result;
      if (data?.error) throw new Error(data.error);

      const records = data.records || [];
      if (records.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No items found</p></div>';
        return;
      }

      container.innerHTML = records.map((r) => `
        <div class="meta-item" data-id="${r.Id}" data-name="${escapeHtml(r.Name)}">
          <span class="meta-item-name">${escapeHtml(r.Name)}</span>
          <span class="meta-item-id">${r.Id}</span>
        </div>
      `).join("");

      container.querySelectorAll(".meta-item").forEach((el) => {
        el.addEventListener("click", () => {
          navigator.clipboard.writeText(el.dataset.id);
          showToast(`${el.dataset.name} ID copied`);
        });
      });

      showToast(`Loaded ${records.length} ${type} records`);

    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p style="color:var(--sfdevhub-error)">${escapeHtml(err.message)}</p></div>`;
    }
  }

  // ─── Clipboard ───────────────────────────────────────
  function bindClipboard() {
    $("#clip-json")?.addEventListener("click", () => copyRecordFormat("json"));
    $("#clip-apex")?.addEventListener("click", () => copyRecordFormat("apex"));
    $("#clip-soql")?.addEventListener("click", () => copyRecordFormat("soql"));
    $("#clip-csv")?.addEventListener("click", () => copyRecordFormat("csv"));
    $("#clip-ids")?.addEventListener("click", () => copyRecordFormat("id"));
    $("#clip-copy-preview")?.addEventListener("click", () => {
      const code = $("#clip-code").textContent;
      navigator.clipboard.writeText(code);
      showToast("Copied to clipboard");
    });
  }

  async function copyRecordFormat(format) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active tab");

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: (fmt) => {
          const fields = {};
          const recordId = (() => {
            const hash = window.location.hash.replace("#/", "");
            const segs = hash.split("/").filter(Boolean);
            for (const s of segs) { if (/^[a-zA-Z0-9]{15,18}$/.test(s)) return s; }
            return null;
          })();

          const objectName = (() => {
            const hash = window.location.hash.replace("#/", "");
            const segs = hash.split("/").filter(Boolean);
            if (segs[0] === "lightning" && segs[1] === "r") return segs[2] || "Unknown";
            return "Unknown";
          })();

          document.querySelectorAll("records-record-layout-item, .slds-form-element_horizontal").forEach(el => {
            const label = el.querySelector(".slds-form-element__label, .labelCol");
            const value = el.querySelector(".slds-form-element__static, .dataCol, lightning-formatted-text");
            if (label && value) {
              const key = label.textContent.trim().replace(/\*$/, "").trim();
              const val = value.textContent.trim();
              if (key) fields[key] = val === "--" ? null : val;
            }
          });

          switch (fmt) {
            case "id": return recordId || "No record ID found";
            case "json": return JSON.stringify({ recordId, objectName, fields }, null, 2);
            case "soql": {
              const fNames = Object.keys(fields);
              return `SELECT ${fNames.join(", ")} FROM ${objectName} WHERE Id = '${recordId}'`;
            }
            case "apex": {
              const entries = Object.entries(fields).map(([k, v]) => {
                if (v === null) return `'${k}' => null`;
                if (!isNaN(v) && v !== "") return `'${k}' => ${v}`;
                return `'${k}' => '${String(v).replace(/'/g, "\\'")}'`;
              });
              return `Map<String, Object> rec = new Map<String, Object>{\n  ${entries.join(",\n  ")}\n};`;
            }
            case "csv": {
              const headers = Object.keys(fields);
              const vals = Object.values(fields).map(v => v === null ? "" : String(v));
              return [headers.join(","), vals.join(",")].join("\n");
            }
            default: return JSON.stringify(fields, null, 2);
          }
        },
        args: [format]
      });

      const text = results?.[0]?.result;
      if (!text) throw new Error("No data found");

      const preview = $("#clip-code");
      const copyBtn = $("#clip-copy-preview");
      if (preview) preview.textContent = text;
      if (copyBtn) copyBtn.disabled = false;

      await navigator.clipboard.writeText(text);
      showToast(`${format.toUpperCase()} copied`);

    } catch (err) {
      showToast(err.message);
    }
  }

  // ─── Limits ──────────────────────────────────────────
  function bindLimits() {
    $("#limits-refresh")?.addEventListener("click", fetchLimits);
  }

  async function fetchLimits() {
    const container = $("#limits-body");
    container.innerHTML = '<div class="empty-state"><p>Loading limits...</p></div>';

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) throw new Error("No active Salesforce tab");

      const results = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: async () => {
          try {
            const sid = document.cookie.match(/sid=([^;]+)/)?.[1];
            if (!sid) return { error: "No session" };

            const host = window.location.hostname;
            const instance = host.split(".")[0];
            const baseUrl = host.includes("lightning")
              ? `https://${instance}.my.salesforce.com`
              : `https://${host}`;

            const resp = await fetch(`${baseUrl}/services/data/v59.0/limits/`, {
              headers: { "Authorization": `Bearer ${sid}`, "Content-Type": "application/json" }
            });

            if (!resp.ok) return { error: `HTTP ${resp.status}` };
            return await resp.json();
          } catch (e) {
            return { error: e.message };
          }
        }
      });

      const data = results?.[0]?.result;
      if (data?.error) throw new Error(data.error);

      const limits = [
        { key: "DailyApiRequests", name: "Daily API Requests" },
        { key: "DailyBulkApiRequests", name: "Daily Bulk API Requests" },
        { key: "DailyStreamingApiEvents", name: "Daily Streaming API" },
        { key: "DataStorageMB", name: "Data Storage (MB)" },
        { key: "FileStorageMB", name: "File Storage (MB)" },
        { key: "HourlyODataCallout", name: "Hourly OData Callouts" },
        { key: "HourlyPublishedPlatformEvents", name: "Hourly Platform Events" },
        { key: "HourlyPublishedStandardVolumePlatformEvents", name: "Hourly Std Platform Events" },
        { key: "MassEmail", name: "Mass Email" },
        { key: "SingleEmail", name: "Single Email" }
      ];

      const items = limits
        .filter(l => data[l.key])
        .map(l => {
          const info = data[l.key];
          const pct = info.Max > 0 ? Math.round((info.Remaining / info.Max) * 100) : 0;
          const used = info.Max - info.Remaining;
          const cls = pct > 50 ? "low" : pct > 20 ? "medium" : "high";
          return `
            <div class="limit-item">
              <div class="limit-info">
                <span class="limit-name">${l.name}</span>
                <span class="limit-values">${used.toLocaleString()} / ${info.Max.toLocaleString()} (${pct}% remaining)</span>
              </div>
              <div class="limit-bar"><div class="limit-fill ${cls}" style="width:${pct}%"></div></div>
            </div>
          `;
        });

      if (items.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No limit data available</p></div>';
        return;
      }

      container.innerHTML = items.join("");
      showToast("Limits refreshed");

    } catch (err) {
      container.innerHTML = `<div class="empty-state"><p style="color:var(--sfdevhub-error)">${escapeHtml(err.message)}</p></div>`;
    }
  }

  // ─── Utilities ───────────────────────────────────────
  function showToast(message) {
    const toast = $("#toast");
    const text = $("#toast-text");
    clearTimeout(showToast._timer);
    text.textContent = message;
    toast.classList.add("visible");
    showToast._timer = setTimeout(() => toast.classList.remove("visible"), 2500);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }
});
