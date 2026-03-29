const PageDetector = {
  PAGE_TYPES: {
    RECORD: "record",
    LIST_VIEW: "list_view",
    SETUP: "setup",
    HOME: "home",
    APP: "app",
    FLOW_BUILDER: "flow_builder",
    DEV_CONSOLE: "dev_console",
    UNKNOWN: "unknown"
  },

  detect(url) {
    if (!url) url = window.location.href;
    const u = new URL(url);
    const host = u.hostname;
    const path = u.pathname;
    const hash = u.hash;

    if (host.includes("visualforce") || host.includes(".vf.")) {
      return { type: this.PAGE_TYPES.APP, subtype: "visualforce", url, host, path };
    }

    if (host.includes("lightning.force.com")) {
      return this.detectLightning(u, hash, path);
    }

    if (host.includes(".salesforce.com") && !host.includes("lightning")) {
      return this.detectClassic(u, path);
    }

    return { type: this.PAGE_TYPES.UNKNOWN, url, host, path };
  },

  detectLightning(u, hash, path) {
    const hashPath = hash.replace("#/", "").replace("#", "");
    const segments = hashPath.split("/").filter(Boolean);

    if (segments[0] === "one" && segments[1] === "one.app") {
      return { type: this.PAGE_TYPES.APP, subtype: "one_app", url: u.href, host: u.hostname, path: hashPath };
    }

    if (segments[0] === "lightning" && segments[1] === "o") {
      return { type: this.PAGE_TYPES.APP, subtype: "custom_app", url: u.href, host: u.hostname, path: hashPath, objectName: segments[2] };
    }

    if (segments[0] === "lightning" && segments[1] === "r") {
      const objectName = segments[2] || "";
      const recordId = segments[3] || "";
      return {
        type: this.PAGE_TYPES.RECORD,
        url: u.href,
        host: u.hostname,
        path: hashPath,
        objectName,
        recordId,
        isProduction: !u.hostname.includes("--"),
        instance: u.hostname.split(".")[0]
      };
    }

    if (segments[0] === "lightning" && segments[1] === "n") {
      return { type: this.PAGE_TYPES.LIST_VIEW, subtype: "navigation", url: u.href, host: u.hostname, path: hashPath };
    }

    if (segments[0] === "lightning" && segments[1] === "setup") {
      return {
        type: this.PAGE_TYPES.SETUP,
        url: u.href,
        host: u.hostname,
        path: hashPath,
        setupPage: segments.slice(2).join("/"),
        isProduction: !u.hostname.includes("--"),
        instance: u.hostname.split(".")[0]
      };
    }

    if (segments[0] === "lightning" && segments[1] === "page") {
      return { type: this.PAGE_TYPES.HOME, subtype: "lightning_page", url: u.href, host: u.hostname, path: hashPath };
    }

    if (segments.length === 0 || (segments[0] === "lightning" && segments.length === 1)) {
      return { type: this.PAGE_TYPES.HOME, url: u.href, host: u.hostname, path: hashPath };
    }

    return { type: this.PAGE_TYPES.APP, url: u.href, host: u.hostname, path: hashPath, segments };
  },

  detectClassic(u, path) {
    const parts = path.split("/").filter(Boolean);

    if (parts[0] === "setup" || parts[0] === "ui" && parts[1] === "setup") {
      return { type: this.PAGE_TYPES.SETUP, url: u.href, host: u.hostname, path, setupPage: parts.slice(1).join("/") };
    }

    if (parts.length >= 1 && /^[a-zA-Z0-9]{15,18}$/.test(parts[parts.length - 1])) {
      return {
        type: this.PAGE_TYPES.RECORD,
        url: u.href,
        host: u.hostname,
        path,
        objectName: parts[0] || "",
        recordId: parts[parts.length - 1],
        isProduction: !u.hostname.includes("--"),
        instance: u.hostname.split(".")[0]
      };
    }

    if (parts.length === 1 && parts[0].endsWith("__c")) {
      return { type: this.PAGE_TYPES.LIST_VIEW, url: u.href, host: u.hostname, path, objectName: parts[0] };
    }

    return { type: this.PAGE_TYPES.UNKNOWN, url: u.href, host: u.hostname, path };
  },

  extractRecordId(url) {
    const u = new URL(url || window.location.href);
    const hashPath = u.hash.replace("#/", "").replace("#", "");
    const segments = hashPath.split("/").filter(Boolean);

    for (const seg of segments) {
      if (/^[a-zA-Z0-9]{15,18}$/.test(seg)) return seg;
    }

    const pathParts = u.pathname.split("/").filter(Boolean);
    for (const part of pathParts) {
      if (/^[a-zA-Z0-9]{15,18}$/.test(part)) return part;
    }

    return null;
  },

  getObjectNameFromId(recordId) {
    if (!recordId) return null;
    const prefix = recordId.substring(0, 3);
    const PREFIX_MAP = {
      "001": "Account", "003": "Contact", "005": "User", "006": "Opportunity",
      "00Q": "Lead", "00T": "Task", "00U": "Event", "001": "Account",
      "01t": "OpportunityLineItem", "01p": "PricebookEntry",
      "500": "Case", "501": "Solution", "570": "ServiceContract",
      "701": "Campaign", "706": "CampaignMember",
      "01Z": "Dashboard", "00O": "Report", "01s": "Report",
      "00D": "Organization", "00E": "UserRole", "00e": "Profile",
      "01I": "CustomObject", "01J": "CustomField",
      "300": "Order", "800": "Contract", "801": "OrderItem",
      "a00": "CustomObject1", "a01": "CustomObject2",
      "a02": "CustomObject3", "a03": "CustomObject4"
    };
    return PREFIX_MAP[prefix] || "Unknown";
  }
};

if (typeof window !== "undefined") {
  window.PageDetector = PageDetector;
}
