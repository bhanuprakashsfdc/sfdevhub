const SOQLHelper = {
  RESERVED_WORDS: [
    "SELECT", "FROM", "WHERE", "AND", "OR", "NOT", "IN", "NOT IN",
    "LIKE", "INCLUDES", "EXCLUDES", "ORDER BY", "LIMIT", "OFFSET",
    "GROUP BY", "HAVING", "ASC", "DESC", "NULLS FIRST", "NULLS LAST",
    "TRUE", "FALSE", "NULL", "TODAY", "YESTERDAY", "TOMORROW",
    "THIS_WEEK", "THIS_MONTH", "THIS_QUARTER", "THIS_YEAR",
    "LAST_WEEK", "LAST_MONTH", "LAST_QUARTER", "LAST_YEAR",
    "NEXT_WEEK", "NEXT_MONTH", "NEXT_QUARTER", "NEXT_YEAR",
    "LAST_N_DAYS", "NEXT_N_DAYS", "LAST_N_WEEKS", "NEXT_N_WEEKS",
    "LAST_N_MONTHS", "NEXT_N_MONTHS", "LAST_N_QUARTERS", "NEXT_N_QUARTERS",
    "LAST_N_YEARS", "NEXT_N_YEARS", "LAST_N_FISCAL_QUARTERS",
    "NEXT_N_FISCAL_QUARTERS", "LAST_N_FISCAL_YEARS", "NEXT_N_FISCAL_YEARS",
    "WEEK_IN_MONTH", "FISCAL_QUARTER", "FISCAL_YEAR",
    "CALENDAR_QUARTER", "CALENDAR_YEAR", "CALENDAR_MONTH",
    "DAY_IN_MONTH", "DAY_IN_WEEK", "DAY_IN_YEAR", "DAY_ONLY",
    "FISCAL_MONTH", "HOUR_IN_DAY", "WEEK_IN_YEAR"
  ],

  OPERATORS: ["=", "!=", "<>", "<", ">", "<=", ">=", "LIKE", "IN", "NOT IN", "INCLUDES", "EXCLUDES"],

  parse(soql) {
    const result = {
      fields: [],
      object: null,
      where: null,
      orderBy: null,
      groupBy: null,
      having: null,
      limit: null,
      offset: null,
      subqueries: [],
      isValid: false,
      errors: []
    };

    if (!soql || typeof soql !== "string") {
      result.errors.push("Empty query");
      return result;
    }

    const cleaned = soql.trim().replace(/\s+/g, " ");

    if (!cleaned.toUpperCase().startsWith("SELECT")) {
      result.errors.push("Query must start with SELECT");
      return result;
    }

    const fromMatch = cleaned.match(/SELECT\s+(.+?)\s+FROM\s+(\w+(?:__c)?)/i);
    if (!fromMatch) {
      result.errors.push("Cannot find SELECT ... FROM clause");
      return result;
    }

    result.object = fromMatch[2];

    const fieldsStr = fromMatch[1].trim();
    if (fieldsStr === "*") {
      result.fields = ["*"];
    } else {
      result.fields = this.parseFields(fieldsStr);
    }

    const afterFrom = cleaned.substring(cleaned.toUpperCase().indexOf(`FROM ${result.object.toUpperCase()}`) + `FROM ${result.object}`.length);

    const whereMatch = afterFrom.match(/\s+WHERE\s+(.+?)(?=\s+ORDER BY|\s+GROUP BY|\s+HAVING|\s+LIMIT|\s+OFFSET|\s*$)/i);
    if (whereMatch) result.where = whereMatch[1].trim();

    const orderMatch = afterFrom.match(/\s+ORDER BY\s+(.+?)(?=\s+LIMIT|\s+OFFSET|\s*$)/i);
    if (orderMatch) result.orderBy = orderMatch[1].trim();

    const groupMatch = afterFrom.match(/\s+GROUP BY\s+(.+?)(?=\s+HAVING|\s+ORDER BY|\s+LIMIT|\s+OFFSET|\s*$)/i);
    if (groupMatch) result.groupBy = groupMatch[1].trim();

    const havingMatch = afterFrom.match(/\s+HAVING\s+(.+?)(?=\s+ORDER BY|\s+LIMIT|\s+OFFSET|\s*$)/i);
    if (havingMatch) result.having = havingMatch[1].trim();

    const limitMatch = afterFrom.match(/\s+LIMIT\s+(\d+)/i);
    if (limitMatch) result.limit = parseInt(limitMatch[1]);

    const offsetMatch = afterFrom.match(/\s+OFFSET\s+(\d+)/i);
    if (offsetMatch) result.offset = parseInt(offsetMatch[1]);

    const subqueryRegex = /\((SELECT\s+.+?FROM\s+\w+(?:__c)?)\)/gi;
    let subMatch;
    while ((subMatch = subqueryRegex.exec(fieldsStr)) !== null) {
      result.subqueries.push(this.parse(subMatch[1]));
    }

    result.isValid = result.fields.length > 0 && !!result.object && result.errors.length === 0;
    return result;
  },

  parseFields(fieldsStr) {
    const fields = [];
    let depth = 0;
    let current = "";

    for (let i = 0; i < fieldsStr.length; i++) {
      const ch = fieldsStr[i];
      if (ch === "(") depth++;
      else if (ch === ")") depth--;

      if (ch === "," && depth === 0) {
        fields.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    if (current.trim()) fields.push(current.trim());
    return fields;
  },

  build(objectName, options = {}) {
    let soql = "SELECT ";
    soql += (options.fields && options.fields.length) ? options.fields.join(", ") : "Id, Name";
    soql += ` FROM ${objectName}`;

    if (options.where) soql += ` WHERE ${options.where}`;
    if (options.orderBy) soql += ` ORDER BY ${options.orderBy}`;
    if (options.groupBy) soql += ` GROUP BY ${options.groupBy}`;
    if (options.having) soql += ` HAVING ${options.having}`;
    if (options.limit) soql += ` LIMIT ${options.limit}`;
    if (options.offset) soql += ` OFFSET ${options.offset}`;

    return soql;
  },

  format(soql) {
    const keywords = [
      "SELECT", "FROM", "WHERE", "AND", "OR", "ORDER BY", "GROUP BY",
      "HAVING", "LIMIT", "OFFSET", "ASC", "DESC", "NULLS FIRST", "NULLS LAST"
    ];

    let formatted = soql;
    for (const kw of keywords) {
      const regex = new RegExp(`\\b${kw}\\b`, "gi");
      formatted = formatted.replace(regex, kw);
    }

    formatted = formatted.replace(/\bSELECT\b/g, "\nSELECT");
    formatted = formatted.replace(/\bFROM\b/g, "\nFROM");
    formatted = formatted.replace(/\bWHERE\b/g, "\nWHERE");
    formatted = formatted.replace(/\bORDER BY\b/g, "\nORDER BY");
    formatted = formatted.replace(/\bGROUP BY\b/g, "\nGROUP BY");
    formatted = formatted.replace(/\bHAVING\b/g, "\nHAVING");
    formatted = formatted.replace(/\bLIMIT\b/g, "\nLIMIT");
    formatted = formatted.replace(/\bOFFSET\b/g, "\nOFFSET");

    return formatted.trim();
  },

  generateForRecord(objectName, recordId) {
    return `SELECT FIELDS(ALL) FROM ${objectName} WHERE Id = '${recordId}' LIMIT 1`;
  },

  suggestForField(objectName, fieldName, value) {
    const isText = typeof value === "string" && !/^\d+$/.test(value);
    const isDate = value && /^\d{4}-\d{2}-\d{2}/.test(value);

    if (isDate) {
      return `SELECT Id, Name FROM ${objectName} WHERE ${fieldName} >= ${value} ORDER BY ${fieldName} DESC LIMIT 200`;
    }

    if (isText) {
      return `SELECT Id, Name FROM ${objectName} WHERE ${fieldName} LIKE '%${value}%' LIMIT 200`;
    }

    return `SELECT Id, Name FROM ${objectName} WHERE ${fieldName} = ${value} LIMIT 200`;
  },

  toApexMap(records) {
    if (!records || !records.length) return "List<Map<String, Object>> data = new List<Map<String, Object>>();";

    const lines = ["List<Map<String, Object>> data = new List<Map<String, Object>>{"];

    records.forEach((record, i) => {
      const entries = [];
      for (const [key, val] of Object.entries(record)) {
        if (key === "attributes") continue;
        if (val === null) {
          entries.push(`'${key}' => null`);
        } else if (typeof val === "number") {
          entries.push(`'${key}' => ${val}`);
        } else if (typeof val === "boolean") {
          entries.push(`'${key}' => ${val}`);
        } else {
          entries.push(`'${key}' => '${String(val).replace(/'/g, "\\'")}'`);
        }
      }
      const comma = i < records.length - 1 ? "," : "";
      lines.push(`  new Map<String, Object>{${entries.join(", ")}}${comma}`);
    });

    lines.push("};");
    return lines.join("\n");
  },

  toCsv(records) {
    if (!records || !records.length) return "";

    const allKeys = new Set();
    records.forEach(r => Object.keys(r).forEach(k => { if (k !== "attributes") allKeys.add(k); }));
    const headers = [...allKeys];

    const rows = [headers.join(",")];
    records.forEach(record => {
      const row = headers.map(h => {
        const val = record[h];
        if (val === null || val === undefined) return "";
        const str = String(val);
        if (str.includes(",") || str.includes('"') || str.includes("\n")) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      });
      rows.push(row.join(","));
    });

    return rows.join("\n");
  },

  toClipboardFormat(records, format) {
    switch (format) {
      case "json":
        return JSON.stringify(records, null, 2);
      case "apex":
        return this.toApexMap(records);
      case "csv":
        return this.toCsv(records);
      case "soql_ids": {
        const ids = records.map(r => `'${r.Id}'`).join(", ");
        return `SELECT Id, Name FROM Account WHERE Id IN (${ids})`;
      }
      default:
        return JSON.stringify(records, null, 2);
    }
  },

  syntaxHighlight(soql) {
    return soql
      .replace(/\b(SELECT|FROM|WHERE|AND|OR|NOT|ORDER BY|GROUP BY|HAVING|LIMIT|OFFSET|ASC|DESC|NULLS FIRST|NULLS LAST|IN|NOT IN|LIKE|INCLUDES|EXCLUDES|TRUE|FALSE|NULL)\b/gi, '<span class="soql-keyword">$1</span>')
      .replace(/'([^']*)'/g, '<span class="soql-string">\'$1\'</span>')
      .replace(/\b(\d+)\b/g, '<span class="soql-number">$1</span>')
      .replace(/\b(Id|Name|CreatedDate|LastModifiedDate|OwnerId|RecordTypeId|AccountId|ContactId|Status|StageName|Amount|CloseDate|Email|Phone|Industry|Type|Rating)\b/g, '<span class="soql-field">$1</span>');
  }
};

if (typeof window !== "undefined") {
  window.SOQLHelper = SOQLHelper;
}
