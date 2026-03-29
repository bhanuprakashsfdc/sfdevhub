const SFAPI = {
  _sessionInfo: null,

  async getSession() {
    if (this._sessionInfo) return this._sessionInfo;

    try {
      const cookie = await this.getCookie("sid");
      if (!cookie) throw new Error("No Salesforce session found");

      const host = window.location.hostname;
      const instance = host.split(".")[0];
      const isLightning = host.includes("lightning.force.com");
      const isProduction = !host.includes("--");

      let baseUrl;
      if (isLightning) {
        const parts = host.split(".");
        const domain = parts.slice(1).join(".");
        baseUrl = `https://${instance}.my.salesforce.com`;
      } else {
        baseUrl = `https://${host}`;
      }

      this._sessionInfo = {
        sessionId: cookie,
        instance,
        baseUrl,
        isProduction,
        isLightning,
        host
      };

      return this._sessionInfo;
    } catch (err) {
      console.error("SFDevHub: Failed to get session:", err);
      return null;
    }
  },

  getCookie(name) {
    return new Promise((resolve) => {
      if (typeof chrome !== "undefined" && chrome.cookies) {
        chrome.cookies.get({
          url: window.location.origin,
          name: name
        }, (cookie) => {
          resolve(cookie ? cookie.value : null);
        });
      } else {
        const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
        resolve(match ? match[2] : null);
      }
    });
  },

  async query(soql) {
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const encodedQuery = encodeURIComponent(soql.trim());
    const url = `${session.baseUrl}/services/data/v59.0/query?q=${encodedQuery}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sessionId}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error[0]?.message || `Query failed: ${response.status}`);
    }

    return response.json();
  },

  async queryAll(soql) {
    let results = [];
    let nextUrl = null;
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const encodedQuery = encodeURIComponent(soql.trim());
    let url = `${session.baseUrl}/services/data/v59.0/query?q=${encodedQuery}`;

    do {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${session.sessionId}`,
          "Content-Type": "application/json"
        }
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error[0]?.message || `Query failed: ${response.status}`);
      }

      const data = await response.json();
      results = results.concat(data.records);
      nextUrl = data.nextRecordsUrl || null;
      url = nextUrl ? `${session.baseUrl}${nextUrl}` : null;
    } while (nextUrl);

    return { totalSize: results.length, records: results, done: true };
  },

  async describeObject(objectName) {
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const url = `${session.baseUrl}/services/data/v59.0/sobjects/${objectName}/describe/`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sessionId}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) throw new Error(`Describe failed: ${response.status}`);
    return response.json();
  },

  async getRecord(objectName, recordId, fields) {
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const fieldList = fields ? fields.join(",") : "";
    const url = `${session.baseUrl}/services/data/v59.0/sobjects/${objectName}/${recordId}${fieldList ? `?fields=${fieldList}` : ""}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sessionId}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) throw new Error(`Get record failed: ${response.status}`);
    return response.json();
  },

  async updateRecord(objectName, recordId, data) {
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const url = `${session.baseUrl}/services/data/v59.0/sobjects/${objectName}/${recordId}`;

    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${session.sessionId}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(data)
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error[0]?.message || `Update failed: ${response.status}`);
    }

    return { success: true };
  },

  async deleteRecord(objectName, recordId) {
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const url = `${session.baseUrl}/services/data/v59.0/sobjects/${objectName}/${recordId}`;

    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Authorization": `Bearer ${session.sessionId}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) throw new Error(`Delete failed: ${response.status}`);
    return { success: true };
  },

  async getGlobalDescribe() {
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const url = `${session.baseUrl}/services/data/v59.0/sobjects/`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sessionId}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) throw new Error(`Global describe failed: ${response.status}`);
    return response.json();
  },

  async search(sosl) {
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const encoded = encodeURIComponent(sosl);
    const url = `${session.baseUrl}/services/data/v59.0/search?q=${encoded}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sessionId}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) throw new Error(`Search failed: ${response.status}`);
    return response.json();
  },

  async getLimits() {
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const url = `${session.baseUrl}/services/data/v59.0/limits/`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sessionId}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) throw new Error(`Limits failed: ${response.status}`);
    return response.json();
  },

  async getMetadata(objectType) {
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const url = `${session.baseUrl}/services/data/v59.0/tooling/query?q=SELECT+Id,Name+FROM+${objectType}+LIMIT+200`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sessionId}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) throw new Error(`Metadata query failed: ${response.status}`);
    return response.json();
  },

  async getApexClasses() {
    return this.getMetadata("ApexClass");
  },

  async getApexTriggers() {
    return this.getMetadata("ApexTrigger");
  },

  async getFlows() {
    return this.getMetadata("Flow");
  },

  async getVFPages() {
    return this.getMetadata("ApexPage");
  },

  async getProfiles() {
    const session = await this.getSession();
    if (!session) throw new Error("No active Salesforce session");

    const url = `${session.baseUrl}/services/data/v59.0/query?q=SELECT+Id,Name+FROM+Profile+ORDER+BY+Name`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${session.sessionId}`,
        "Content-Type": "application/json"
      }
    });

    if (!response.ok) throw new Error(`Profiles query failed: ${response.status}`);
    return response.json();
  },

  getObjectUrl(objectName, recordId) {
    if (recordId) {
      return `/lightning/r/${objectName}/${recordId}/view`;
    }
    return `/lightning/o/${objectName}/list`;
  },

  getSetupUrl(setupPage) {
    const SETUP_URLS = {
      objects: "ObjectManager",
      flows: "ProcessAutomation/home",
      apex: "ApexClasses/home",
      triggers: "ApexTriggers/home",
      profiles: "EnhancedProfiles/home",
      users: "ManageUsers/home",
      debug: "ApexDebugLogs/home",
      validation: null
    };

    const page = SETUP_URLS[setupPage] || setupPage;
    return `/lightning/setup/${page}`;
  },

  getDevConsoleUrl() {
    return "/_ui/common/apex/debug/ApexDebugLogDetail";
  },

  buildSoql(objectName, fields, where, orderBy, limit) {
    let soql = `SELECT ${fields.join(", ")} FROM ${objectName}`;
    if (where) soql += ` WHERE ${where}`;
    if (orderBy) soql += ` ORDER BY ${orderBy}`;
    if (limit) soql += ` LIMIT ${limit}`;
    return soql;
  },

  clearSessionCache() {
    this._sessionInfo = null;
  }
};

if (typeof window !== "undefined") {
  window.SFAPI = SFAPI;
}
