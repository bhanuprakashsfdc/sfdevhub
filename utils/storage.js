const SFStorage = {
  DEFAULTS: {
    showApiNames: false,
    highlightRequired: false,
    stickyHeaders: false,
    collapseEmpty: false,
    darkMode: false,
    favoriteObjects: [],
    savedQueries: [],
    savedApiMaps: [],
    tabColors: {},
    recentSearches: [],
    keyboardShortcuts: {
      quickSearch: "Alt+K",
      soqlConsole: "Alt+S",
      toggleApiNames: "Alt+A",
      copyRecordId: "Alt+I"
    },
    uiPreferences: {
      fontSize: 12,
      compactMode: false,
      showPerformanceBadge: true
    }
  },

  async get(keys) {
    try {
      if (typeof keys === "string") keys = [keys];
      if (!keys) {
        const all = await chrome.storage.local.get(null);
        return { ...this.DEFAULTS, ...all };
      }
      const result = await chrome.storage.local.get(keys);
      const defaults = {};
      for (const k of keys) {
        if (k in this.DEFAULTS) defaults[k] = this.DEFAULTS[k];
      }
      return { ...defaults, ...result };
    } catch (err) {
      console.error("SFDevHub Storage get error:", err);
      return keys ? {} : { ...this.DEFAULTS };
    }
  },

  async set(data) {
    try {
      await chrome.storage.local.set(data);
      return true;
    } catch (err) {
      console.error("SFDevHub Storage set error:", err);
      return false;
    }
  },

  async remove(keys) {
    try {
      await chrome.storage.local.remove(keys);
      return true;
    } catch (err) {
      console.error("SFDevHub Storage remove error:", err);
      return false;
    }
  },

  async clear() {
    try {
      await chrome.storage.local.clear();
      return true;
    } catch (err) {
      console.error("SFDevHub Storage clear error:", err);
      return false;
    }
  },

  async exportAll() {
    const data = await this.get(null);
    const { showApiNames, favoriteObjects, savedQueries, savedApiMaps, tabColors, uiPreferences } = data;
    return { showApiNames, favoriteObjects, savedQueries, savedApiMaps, tabColors, uiPreferences };
  },

  async importAll(data) {
    const allowed = ["showApiNames", "favoriteObjects", "savedQueries", "savedApiMaps", "tabColors", "uiPreferences"];
    const filtered = {};
    for (const key of allowed) {
      if (key in data) filtered[key] = data[key];
    }
    return this.set(filtered);
  },

  async addFavoriteObject(objectName) {
    const { favoriteObjects } = await this.get("favoriteObjects");
    if (!favoriteObjects.includes(objectName)) {
      favoriteObjects.unshift(objectName);
      if (favoriteObjects.length > 50) favoriteObjects.length = 50;
      await this.set({ favoriteObjects });
    }
    return favoriteObjects;
  },

  async removeFavoriteObject(objectName) {
    const { favoriteObjects } = await this.get("favoriteObjects");
    const filtered = favoriteObjects.filter(o => o !== objectName);
    await this.set({ favoriteObjects: filtered });
    return filtered;
  },

  async saveQuery(name, query) {
    const { savedQueries } = await this.get("savedQueries");
    const existing = savedQueries.findIndex(q => q.name === name);
    if (existing >= 0) {
      savedQueries[existing] = { name, query, updatedAt: Date.now() };
    } else {
      savedQueries.unshift({ name, query, createdAt: Date.now(), updatedAt: Date.now() });
    }
    if (savedQueries.length > 100) savedQueries.length = 100;
    await this.set({ savedQueries });
    return savedQueries;
  },

  async deleteQuery(name) {
    const { savedQueries } = await this.get("savedQueries");
    const filtered = savedQueries.filter(q => q.name !== name);
    await this.set({ savedQueries: filtered });
    return filtered;
  },

  async addRecentSearch(term) {
    const { recentSearches } = await this.get("recentSearches");
    const filtered = recentSearches.filter(s => s !== term);
    filtered.unshift(term);
    if (filtered.length > 20) filtered.length = 20;
    await this.set({ recentSearches: filtered });
    return filtered;
  }
};

if (typeof window !== "undefined") {
  window.SFStorage = SFStorage;
}
