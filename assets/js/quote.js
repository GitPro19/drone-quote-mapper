const Quote = {
  init: () => {
    Quote.setupEventListeners();
    Quote.populateServiceTypes();
    Quote.renderList();
  },
  setupEventListeners: () => {
    document.getElementById('quoteForm').addEventListener('submit', (e) => {
      e.preventDefault();
      Quote.createQuote();
    });
    document.getElementById('quoteCustomer').addEventListener('change', () => {
      Quote.updateLotSelect();
    });
    document.getElementById('exportQuote')?.addEventListener('click', () => Quote.exportQuote());
    document.getElementById('printQuote')?.addEventListener('click', () => window.print());
    const list = document.getElementById('quoteList');
    if (list) list.addEventListener('click', Quote.handleListClick);
  },
  populateServiceTypes: () => {
    const select = document.getElementById('quoteServiceType');
    select.innerHTML = '<option value="">Select service...</option>' +
      CONFIG.serviceTypes.map(s => `<option value="${s.id}" data-price="${s.basePrice}">${s.name}</option>`).join('');
    select.addEventListener('change', (e) => {
      const option = e.target.options[e.target.selectedIndex];
      const basePrice = option.dataset.price;
      if (basePrice) {
        document.getElementById('quoteBasePrice').value = basePrice;
        Quote.calculatePrice();
      }
    });
  },
  updateLotSelect: () => {
    const customerId = document.getElementById('quoteCustomer').value;
    const select = document.getElementById('quoteLot');
    if (customerId) {
      const lots = Storage.lots.findByCustomer(customerId);
      select.innerHTML = '<option value="">Select lot (optional)...</option>' +
        lots.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    } else {
      select.innerHTML = '<option value="">Select lot (optional)...</option>';
    }
  },
  calculatePrice: () => {
    const area = parseFloat(document.getElementById('quoteArea').value) || 0;
    const unit = document.getElementById('quoteAreaUnit').value;
    const basePrice = parseFloat(document.getElementById('quoteBasePrice').value) || 0;
    let total = 0;
    if (unit === 'acres') {
      total = area * basePrice;
    } else if (unit === 'sqft') {
      total = area * CONFIG.pricing.basePricePerSqFt;
    }
    if (total < CONFIG.pricing.minimumPrice) total = CONFIG.pricing.minimumPrice;
    return total;
  },
  createQuote: () => {
    const customerId = document.getElementById('quoteCustomer').value;
    const lotId = document.getElementById('quoteLot').value;
    const serviceType = document.getElementById('quoteServiceType').value;
    const area = parseFloat(document.getElementById('quoteArea').value) || 0;
    const areaUnit = document.getElementById('quoteAreaUnit').value;
    const basePrice = parseFloat(document.getElementById('quoteBasePrice').value) || 0;
    const notes = document.getElementById('quoteNotes').value;
    const total = Quote.calculatePrice();
    const service = CONFIG.serviceTypes.find(s => s.id === serviceType);
    const quote = {
      customerId: customerId,
      lotId: lotId || null,
      serviceType: serviceType,
      serviceName: service ? service.name : '',
      area: area,
      areaUnit: areaUnit,
      basePrice: basePrice,
      total: total,
      notes: notes,
      status: 'draft'
    };
    Storage.quotes.add(quote);
    Quote.renderList();
    document.getElementById('quoteForm').reset();
    alert('Quote created successfully!');
  },
  renderList: () => {
    const list = document.getElementById('quoteList');
    const quotes = Storage.quotes.getAll();
    if (quotes.length === 0) {
      list.innerHTML = '<p class="empty-state">No quotes found. Create one above.</p>';
      return;
    }
    list.innerHTML = quotes.map(quote => {
      const customer = Storage.customers.find(quote.customerId);
      const date = new Date(quote.date).toLocaleDateString();
      return `
        <div class="quote-item">
          <div class="quote-item-header">
            <h4>${quote.quoteNumber} - ${Utils.escapeHtml(quote.serviceName)}</h4>
            <div class="quote-actions">
              <button class="btn-icon" data-action="view" data-id="${quote.id}" title="View">View</button>
              <button class="btn-icon" data-action="delete" data-id="${quote.id}" title="Delete">Delete</button>
            </div>
          </div>
          <div class="quote-item-details">
            <div>Customer: ${customer ? Utils.escapeHtml(customer.name) : 'Unknown'}</div>
            <div>Date: ${date}</div>
            <div>Total: $${quote.total.toFixed(2)}</div>
            <div>Status: ${quote.status}</div>
          </div>
        </div>
      `;
    }).join('');
  },
  handleListClick: (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const id = button.dataset.id;
    const action = button.dataset.action;
    if (action === 'view') Quote.viewQuote(id);
    if (action === 'delete') Quote.deleteQuote(id);
  },
  viewQuote: (id) => {
    const quote = Storage.quotes.find(id);
    if (!quote) return;
    const customer = Storage.customers.find(quote.customerId);
    const date = new Date(quote.date).toLocaleDateString();
    document.getElementById('quotePreview').innerHTML = `<div class="quote-preview"><h2>Quote ${quote.quoteNumber}</h2><div class="quote-preview-section"><h3>Customer Information</h3><p><strong>Name:</strong> ${customer ? Utils.escapeHtml(customer.name) : 'N/A'}</p><p><strong>Email:</strong> ${customer ? Utils.escapeHtml(customer.email || 'N/A') : 'N/A'}</p><p><strong>Phone:</strong> ${customer ? Utils.escapeHtml(customer.phone || 'N/A') : 'N/A'}</p></div><div class="quote-preview-section"><h3>Service Details</h3><p><strong>Service:</strong> ${Utils.escapeHtml(quote.serviceName)}</p><p><strong>Area:</strong> ${quote.area} ${Utils.escapeHtml(quote.areaUnit)}</p><p><strong>Base Price:</strong> $${quote.basePrice.toFixed(2)}</p><p><strong>Total:</strong> $${quote.total.toFixed(2)}</p></div>${quote.notes ? `<div class="quote-preview-section"><h3>Notes</h3><p>${Utils.escapeHtml(quote.notes)}</p></div>` : ''}<div class="quote-preview-section"><p><strong>Date:</strong> ${date}</p><p><strong>Status:</strong> ${Utils.escapeHtml(quote.status)}</p></div></div>`;
    document.getElementById('quotePreviewModal').style.display = 'block';
  },
  deleteQuote: (id) => {
    if (confirm('Are you sure you want to delete this quote?')) {
      Storage.quotes.delete(id);
      Quote.renderList();
    }
  },
  exportQuote: () => {
    const preview = document.getElementById('quotePreview').innerHTML;
    const blob = new Blob([preview], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'quote.html';
    a.click();
  }
};
