const Storage = {
  customers: {
    getAll: () => {
      const data = localStorage.getItem(CONFIG.storageKeys.customers);
      return data ? JSON.parse(data) : [];
    },
    save: (customers) => {
      localStorage.setItem(CONFIG.storageKeys.customers, JSON.stringify(customers));
    },
    add: (customer) => {
      const customers = Storage.customers.getAll();
      customer.id = customer.id || 'customer_' + Date.now();
      customer.createdAt = customer.createdAt || new Date().toISOString();
      customer.updatedAt = new Date().toISOString();
      customers.push(customer);
      Storage.customers.save(customers);
      return customer;
    },
    update: (id, updates) => {
      const customers = Storage.customers.getAll();
      const index = customers.findIndex(c => c.id === id);
      if (index !== -1) {
        customers[index] = { ...customers[index], ...updates, updatedAt: new Date().toISOString() };
        Storage.customers.save(customers);
        return customers[index];
      }
      return null;
    },
    delete: (id) => {
      const customers = Storage.customers.getAll();
      const filtered = customers.filter(c => c.id !== id);
      Storage.customers.save(filtered);
      return filtered.length < customers.length;
    },
    find: (id) => {
      return Storage.customers.getAll().find(c => c.id === id);
    }
  },
  lots: {
    getAll: () => {
      const data = localStorage.getItem(CONFIG.storageKeys.lots);
      return data ? JSON.parse(data) : [];
    },
    save: (lots) => {
      localStorage.setItem(CONFIG.storageKeys.lots, JSON.stringify(lots));
    },
    add: (lot) => {
      const lots = Storage.lots.getAll();
      lot.id = lot.id || 'lot_' + Date.now();
      lot.createdAt = lot.createdAt || new Date().toISOString();
      lot.updatedAt = new Date().toISOString();
      if (!lot.versions) lot.versions = [];
      if (!lot.currentVersion) lot.currentVersion = null;
      lots.push(lot);
      Storage.lots.save(lots);
      return lot;
    },
    update: (id, updates) => {
      const lots = Storage.lots.getAll();
      const index = lots.findIndex(l => l.id === id);
      if (index !== -1) {
        lots[index] = { ...lots[index], ...updates, updatedAt: new Date().toISOString() };
        Storage.lots.save(lots);
        return lots[index];
      }
      return null;
    },
    delete: (id) => {
      const lots = Storage.lots.getAll();
      const filtered = lots.filter(l => l.id !== id);
      Storage.lots.save(filtered);
      return filtered.length < lots.length;
    },
    findByCustomer: (customerId) => {
      return Storage.lots.getAll().filter(l => l.customerId === customerId);
    },
    find: (id) => {
      return Storage.lots.getAll().find(l => l.id === id);
    },
    addVersion: (lotId, version) => {
      const lot = Storage.lots.find(lotId);
      if (!lot) return null;
      version.versionId = version.versionId || 'v' + (lot.versions.length + 1);
      version.date = version.date || new Date().toISOString();
      if (lot.versions.length > 0) {
        const prevVersion = lot.versions[lot.versions.length - 1];
        const prevArea = prevVersion.boundary.area.acres || 0;
        const newArea = version.boundary.area.acres || 0;
        version.changes = {
          areaGained: {
            sqft: (version.boundary.area.sqft || 0) - (prevVersion.boundary.area.sqft || 0),
            acres: newArea - prevArea
          },
          percentChange: prevArea > 0 ? ((newArea - prevArea) / prevArea * 100) : 0
        };
      }
      lot.versions.push(version);
      lot.currentVersion = version.versionId;
      Storage.lots.update(lotId, lot);
      return version;
    }
  },
  quotes: {
    getAll: () => {
      const data = localStorage.getItem(CONFIG.storageKeys.quotes);
      return data ? JSON.parse(data) : [];
    },
    save: (quotes) => {
      localStorage.setItem(CONFIG.storageKeys.quotes, JSON.stringify(quotes));
    },
    add: (quote) => {
      const quotes = Storage.quotes.getAll();
      quote.id = quote.id || 'quote_' + Date.now();
      quote.quoteNumber = quote.quoteNumber || 'DR-' + new Date().getFullYear() + '-' + String(quotes.length + 1).padStart(3, '0');
      quote.date = quote.date || new Date().toISOString();
      quote.status = quote.status || 'draft';
      quotes.push(quote);
      Storage.quotes.save(quotes);
      return quote;
    },
    update: (id, updates) => {
      const quotes = Storage.quotes.getAll();
      const index = quotes.findIndex(q => q.id === id);
      if (index !== -1) {
        quotes[index] = { ...quotes[index], ...updates };
        Storage.quotes.save(quotes);
        return quotes[index];
      }
      return null;
    },
    delete: (id) => {
      const quotes = Storage.quotes.getAll();
      const filtered = quotes.filter(q => q.id !== id);
      Storage.quotes.save(filtered);
      return filtered.length < quotes.length;
    },
    findByCustomer: (customerId) => {
      return Storage.quotes.getAll().filter(q => q.customerId === customerId);
    },
    find: (id) => {
      return Storage.quotes.getAll().find(q => q.id === id);
    }
  },
  exportAll: () => {
    return {
      customers: Storage.customers.getAll(),
      lots: Storage.lots.getAll(),
      quotes: Storage.quotes.getAll(),
      settings: localStorage.getItem(CONFIG.storageKeys.settings),
      exportDate: new Date().toISOString()
    };
  },
  importAll: (data) => {
    try {
      if (data.customers) Storage.customers.save(data.customers);
      if (data.lots) Storage.lots.save(data.lots);
      if (data.quotes) Storage.quotes.save(data.quotes);
      if (data.settings) localStorage.setItem(CONFIG.storageKeys.settings, data.settings);
      return true;
    } catch (e) {
      console.error('Import error:', e);
      return false;
    }
  }
};
