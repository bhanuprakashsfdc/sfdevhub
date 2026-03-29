chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((err) => console.error("SFDevHub: sidePanel behavior error:", err));

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = MESSAGE_HANDLERS[message.type];
  if (handler) {
    handler(message, sender, sendResponse);
    return true;
  }
  return false;
});

chrome.commands.onCommand.addListener((command) => {
  switch (command) {
    case "open-soql-console":
      chrome.sidePanel.open({}).catch(() => {});
      break;
    case "quick-search":
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_QUICK_SEARCH" });
      });
      break;
    case "toggle-api-names":
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_API_NAMES" });
      });
      break;
    case "copy-record-id":
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab?.id) chrome.tabs.sendMessage(tab.id, { type: "COPY_RECORD_ID" });
      });
      break;
  }
});

chrome.action.onClicked.addListener((tab) => {
  if (tab?.id) {
    chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
  }
});

const MESSAGE_HANDLERS = {
  async GET_PAGE_CONTEXT(message, sender, sendResponse) {
    try {
      if (!sender.tab?.url) {
        sendResponse({ error: "No tab URL" });
        return;
      }
      const url = new URL(sender.tab.url);
      const isSalesforce = url.hostname.includes("salesforce.com") || url.hostname.includes("force.com");
      sendResponse({
        isSalesforce,
        hostname: url.hostname,
        pathname: url.pathname,
        hash: url.hash,
        isProduction: isSalesforce && !url.hostname.includes("--"),
        instance: isSalesforce ? url.hostname.split(".")[0] : null
      });
    } catch (err) {
      sendResponse({ error: err.message });
    }
  },

  OPEN_SIDEPANEL(message, sender, sendResponse) {
    chrome.sidePanel.open({ windowId: sender.tab?.windowId })
      .then(() => sendResponse({ success: true }))
      .catch((err) => sendResponse({ error: err.message }));
  },

  TOGGLE_SIDE_PANEL(message, sender, sendResponse) {
    chrome.sidePanel.open({ windowId: sender.tab?.windowId })
      .then(() => sendResponse({ success: true }))
      .catch(() => sendResponse({ success: false }));
  },

  async EXECUTE_SOQL(message, sender, sendResponse) {
    try {
      const results = await executeQueryInTab(sender.tab?.id, message.soql);
      sendResponse({ success: true, data: results });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  },

  async GET_ORG_INFO(message, sender, sendResponse) {
    try {
      if (!sender.tab?.url) {
        sendResponse({ error: "No tab" });
        return;
      }
      const url = new URL(sender.tab.url);
      sendResponse({
        instance: url.hostname.split(".")[0],
        isProduction: !url.hostname.includes("--"),
        hostname: url.hostname
      });
    } catch (err) {
      sendResponse({ error: err.message });
    }
  },

  async GET_RECORD_CONTEXT(message, sender, sendResponse) {
    try {
      chrome.tabs.sendMessage(sender.tab.id, { type: "EXTRACT_RECORD_DATA" }, (response) => {
        sendResponse(response || { error: "No response from content script" });
      });
    } catch (err) {
      sendResponse({ error: err.message });
    }
  },

  COPY_TO_CLIPBOARD(message, sender, sendResponse) {
    chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
      if (tab?.id) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: (text) => navigator.clipboard.writeText(text),
          args: [message.text]
        }).then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: err.message }));
      } else {
        sendResponse({ success: false, error: "No active tab" });
      }
    });
  },

  async EXPORT_SETTINGS(message, sender, sendResponse) {
    const data = await chrome.storage.local.get(null);
    sendResponse({ success: true, data });
  },

  async IMPORT_SETTINGS(message, sender, sendResponse) {
    try {
      await chrome.storage.local.clear();
      await chrome.storage.local.set(message.data);
      sendResponse({ success: true });
    } catch (err) {
      sendResponse({ success: false, error: err.message });
    }
  }
};

async function executeQueryInTab(tabId, soql) {
  if (!tabId) throw new Error("No tab ID");

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: async (query) => {
      try {
        const sid = document.cookie.match(/sid=([^;]+)/)?.[1];
        if (!sid) throw new Error("No session found");

        const host = window.location.hostname;
        const instance = host.split(".")[0];
        const baseUrl = host.includes("lightning")
          ? `https://${instance}.my.salesforce.com`
          : `https://${host}`;

        const encoded = encodeURIComponent(query.trim());
        const resp = await fetch(`${baseUrl}/services/data/v59.0/query?q=${encoded}`, {
          headers: {
            "Authorization": `Bearer ${sid}`,
            "Content-Type": "application/json"
          }
        });

        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err[0]?.message || `HTTP ${resp.status}`);
        }

        return await resp.json();
      } catch (e) {
        return { error: e.message };
      }
    },
    args: [soql]
  });

  if (results?.[0]?.result?.error) {
    throw new Error(results[0].result.error);
  }

  return results?.[0]?.result;
}

chrome.alarms.create("keep-alive", { periodInMinutes: 4.9 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keep-alive") {
    // Service worker keep-alive
  }
});
