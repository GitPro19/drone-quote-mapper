/**
 * Storage layer. Uses Supabase for customers and quotes (when configured and authenticated).
 * Lots and plot data remain in localStorage per plan.
 */
(function () {
  'use strict';

  function supabaseReady() {
    return typeof window !== 'undefined' && window.supabase &&
      typeof CONFIG !== 'undefined' && CONFIG.supabase && CONFIG.supabase.url && CONFIG.supabase.anonKey;
  }

  function safeJsonParse(value, fallback) {
    try {
      return JSON.parse(value);
    } catch (e) {
      console.error('Storage parse error:', e);
      return fallback;
    }
  }

  function readLocalList(key) {
    if (!key) return [];
    const raw = localStorage.getItem(key);
    return raw ? safeJsonParse(raw, []) : [];
  }

  function writeLocalList(key, list) {
    if (!key) return;
    try {
      localStorage.setItem(key, JSON.stringify(list));
    } catch (e) {
      console.error('Storage write error:', e);
    }
  }

  function createId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
  }

  async function getSupabaseUser() {
    if (!supabaseReady()) return null;
    try {
      const { data: { user } } = await window.supabase.auth.getUser();
      return user || null;
    } catch (e) {
      console.error('Supabase auth error:', e);
      return null;
    }
  }

  function getLocalCustomers() {
    return readLocalList(CONFIG?.storageKeys?.customers);
  }

  function saveLocalCustomers(customers) {
    writeLocalList(CONFIG?.storageKeys?.customers, customers);
  }

  function getLocalQuotes() {
    return readLocalList(CONFIG?.storageKeys?.quotes);
  }

  function saveLocalQuotes(quotes) {
    writeLocalList(CONFIG?.storageKeys?.quotes, quotes);
  }

  function toCustomerRow(c) {
    return {
      id: c.id,
      email: c.email || '',
      name: c.name || '',
      phone: c.phone || '',
      address: c.address || '',
      notes: c.notes || '',
      createdAt: c.created_at,
      updatedAt: c.updated_at
    };
  }

  function fromCustomerRow(r) {
    return {
      email: r.email || '',
      name: r.name || '',
      phone: r.phone || '',
      address: r.address || ''
    };
  }

  function toQuoteRow(q) {
    return {
      id: q.id,
      customerId: q.customer_id,
      quoteNumber: q.quote_number || '',
      serviceType: q.service_type,
      serviceName: q.service_name || '',
      area: Number(q.area),
      areaUnit: q.area_unit || 'acres',
      photoCount: Number(q.photo_count) || 0,
      basePrice: Number(q.base_price),
      areaCost: Number(q.area_cost),
      photoCost: Number(q.photo_cost),
      total: Number(q.total),
      status: q.status || 'pending',
      plotData: q.plot_data || null,
      date: q.created_at,
      requestedDate: q.created_at
    };
  }

  const customerCache = [];
  const quoteCache = [];
  let cacheDirty = true;

  async function ensureCache() {
    if (!cacheDirty) return;
    if (!supabaseReady()) {
      customerCache.length = 0;
      quoteCache.length = 0;
      cacheDirty = false;
      return;
    }
    const user = await getSupabaseUser();
    if (!user) {
      customerCache.length = 0;
      quoteCache.length = 0;
      cacheDirty = false;
      return;
    }
    const custRes = await window.supabase
      .from('customers')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    const customerIds = custRes.data ? custRes.data.map(c => c.id) : [];
    let quoteRes = { data: [] };
    if (customerIds.length > 0) {
      quoteRes = await window.supabase
        .from('quotes')
        .select('*')
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false });
    }
    customerCache.length = 0;
    quoteCache.length = 0;
    if (custRes.data) custRes.data.forEach(c => customerCache.push(toCustomerRow(c)));
    if (quoteRes.data) quoteRes.data.forEach(q => quoteCache.push(toQuoteRow(q)));
    cacheDirty = false;
  }

  function invalidateCache() {
    cacheDirty = true;
  }

  const Storage = {
    customers: {
      getAll: async () => {
        const user = await getSupabaseUser();
        if (!user) return getLocalCustomers();
        await ensureCache();
        return customerCache.slice();
      },
      save: (customers) => {
        if (!supabaseReady()) {
          saveLocalCustomers(customers || []);
        }
      },
      add: async (customer) => {
        const user = await getSupabaseUser();
        if (!user) {
          const customers = getLocalCustomers();
          const now = new Date().toISOString();
          const record = {
            id: customer.id || createId('cust'),
            email: (customer.email || '').trim(),
            name: (customer.name || '').trim(),
            phone: (customer.phone || '').trim(),
            address: (customer.address || '').trim(),
            notes: (customer.notes || '').trim(),
            createdAt: now,
            updatedAt: now
          };
          customers.unshift(record);
          saveLocalCustomers(customers);
          return record;
        }
        const row = {
          email: (customer.email || '').trim(),
          name: (customer.name || '').trim(),
          phone: (customer.phone || '').trim() || null,
          address: (customer.address || '').trim() || null,
          user_id: user.id
        };
        const { data, error } = await window.supabase.from('customers').insert(row).select('*').single();
        if (error) throw error;
        invalidateCache();
        await ensureCache();
        return toCustomerRow(data);
      },
      update: async (id, updates) => {
        const user = await getSupabaseUser();
        if (!user) {
          const customers = getLocalCustomers();
          const index = customers.findIndex(c => c.id === id);
          if (index === -1) return null;
          const next = { ...customers[index], updatedAt: new Date().toISOString() };
          if (updates.name !== undefined) next.name = String(updates.name).trim();
          if (updates.email !== undefined) next.email = String(updates.email).trim();
          if (updates.phone !== undefined) next.phone = (updates.phone && String(updates.phone).trim()) || '';
          if (updates.address !== undefined) next.address = (updates.address && String(updates.address).trim()) || '';
          if (updates.notes !== undefined) next.notes = String(updates.notes).trim();
          customers[index] = next;
          saveLocalCustomers(customers);
          return next;
        }
        const row = {};
        if (updates.name !== undefined) row.name = String(updates.name).trim();
        if (updates.email !== undefined) row.email = String(updates.email).trim();
        if (updates.phone !== undefined) row.phone = (updates.phone && String(updates.phone).trim()) || null;
        if (updates.address !== undefined) row.address = (updates.address && String(updates.address).trim()) || null;
        const { data, error } = await window.supabase.from('customers').update(row).eq('id', id).eq('user_id', user.id).select('*').single();
        if (error) throw error;
        invalidateCache();
        await ensureCache();
        return data ? toCustomerRow(data) : null;
      },
      delete: async (id) => {
        const user = await getSupabaseUser();
        if (!user) {
          const customers = getLocalCustomers();
          const filtered = customers.filter(c => c.id !== id);
          saveLocalCustomers(filtered);
          return filtered.length < customers.length;
        }
        const { error } = await window.supabase.from('customers').delete().eq('id', id).eq('user_id', user.id);
        if (error) throw error;
        invalidateCache();
        await ensureCache();
        return true;
      },
      find: async (id) => {
        const user = await getSupabaseUser();
        if (!user) {
          return getLocalCustomers().find(c => c.id === id) || null;
        }
        await ensureCache();
        return customerCache.find(c => c.id === id) || null;
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
      getAll: async () => {
        const user = await getSupabaseUser();
        if (!user) return getLocalQuotes();
        await ensureCache();
        return quoteCache.slice();
      },
      save: (quotes) => {
        if (!supabaseReady()) {
          saveLocalQuotes(quotes || []);
        }
      },
      add: async (quote) => {
        const user = await getSupabaseUser();
        if (!user) {
          const quotes = getLocalQuotes();
          const now = new Date().toISOString();
          const record = {
            id: quote.id || createId('quote'),
            customerId: quote.customerId,
            quoteNumber: quote.quoteNumber || '',
            serviceType: quote.serviceType,
            serviceName: quote.serviceName || '',
            area: Number(quote.area) || 0,
            areaUnit: quote.areaUnit || 'acres',
            photoCount: Number(quote.photoCount) || 0,
            basePrice: Number(quote.basePrice) || 0,
            areaCost: Number(quote.areaCost) || 0,
            photoCost: Number(quote.photoCost) || 0,
            total: Number(quote.total) || 0,
            status: quote.status || 'pending',
            plotData: quote.plotData || null,
            date: quote.date || now,
            requestedDate: quote.requestedDate || now
          };
          quotes.unshift(record);
          saveLocalQuotes(quotes);
          return record;
        }
        const row = {
          customer_id: quote.customerId,
          service_type: quote.serviceType,
          service_name: quote.serviceName || '',
          area: quote.area,
          area_unit: quote.areaUnit || 'acres',
          photo_count: Number(quote.photoCount) || 0,
          base_price: quote.basePrice,
          area_cost: quote.areaCost,
          photo_cost: quote.photoCost,
          total: quote.total,
          status: quote.status || 'pending',
          plot_data: quote.plotData || null,
          quote_number: quote.quoteNumber || null
        };
        const { data, error } = await window.supabase.from('quotes').insert(row).select('*').single();
        if (error) throw error;
        invalidateCache();
        await ensureCache();
        return toQuoteRow(data);
      },
      update: async (id, updates) => {
        const user = await getSupabaseUser();
        if (!user) {
          const quotes = getLocalQuotes();
          const index = quotes.findIndex(q => q.id === id);
          if (index === -1) return null;
          const next = { ...quotes[index], ...updates };
          quotes[index] = next;
          saveLocalQuotes(quotes);
          return next;
        }
        await ensureCache();
        const existing = quoteCache.find(q => q.id === id);
        if (!existing) return null;
        const row = {};
        if (updates.status !== undefined) row.status = updates.status;
        if (Object.keys(row).length === 0) {
          return existing ? { ...existing, ...updates } : null;
        }
        const { data, error } = await window.supabase
          .from('quotes')
          .update(row)
          .eq('id', id)
          .eq('customer_id', existing.customerId)
          .select('*')
          .single();
        if (error) throw error;
        invalidateCache();
        await ensureCache();
        return data ? toQuoteRow(data) : null;
      },
      delete: async (id) => {
        const user = await getSupabaseUser();
        if (!user) {
          const quotes = getLocalQuotes();
          const filtered = quotes.filter(q => q.id !== id);
          saveLocalQuotes(filtered);
          return filtered.length < quotes.length;
        }
        await ensureCache();
        const existing = quoteCache.find(q => q.id === id);
        if (!existing) return false;
        const { error } = await window.supabase
          .from('quotes')
          .delete()
          .eq('id', id)
          .eq('customer_id', existing.customerId);
        if (error) throw error;
        invalidateCache();
        await ensureCache();
        return true;
      },
      findByCustomer: async (customerId) => {
        const user = await getSupabaseUser();
        if (!user) {
          return getLocalQuotes().filter(q => q.customerId === customerId);
        }
        await ensureCache();
        return quoteCache.filter(q => q.customerId === customerId);
      },
      find: async (id) => {
        const user = await getSupabaseUser();
        if (!user) {
          return getLocalQuotes().find(q => q.id === id) || null;
        }
        await ensureCache();
        return quoteCache.find(q => q.id === id) || null;
      }
    },

    refresh: () => {
      invalidateCache();
    },

    exportAll: async () => {
      const user = await getSupabaseUser();
      if (user) await ensureCache();
      return {
        customers: user ? customerCache.slice() : getLocalCustomers(),
        lots: Storage.lots.getAll(),
        quotes: user ? quoteCache.slice() : getLocalQuotes(),
        settings: localStorage.getItem(CONFIG.storageKeys.settings),
        exportDate: new Date().toISOString()
      };
    },

    importAll: (data) => {
      try {
        if (data.customers) saveLocalCustomers(data.customers);
        if (data.lots) Storage.lots.save(data.lots);
        if (data.quotes) saveLocalQuotes(data.quotes);
        if (data.settings) localStorage.setItem(CONFIG.storageKeys.settings, data.settings);
        return true;
      } catch (e) {
        console.error('Import error:', e);
        return false;
      }
    }
  };

  window.Storage = Storage;
})();
