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
    document.getElementById('exportQuote')?.addEventListener('click', () => Quote.exportQuote());
    document.getElementById('printQuote')?.addEventListener('click', () => window.print());
    const list = document.getElementById('quoteList');
    if (list) list.addEventListener('click', Quote.handleListClick);
    
    // Auto-calculate price when inputs change
    const priceInputs = ['quoteArea', 'quoteAreaUnit', 'quoteBasePrice', 'quotePhotoCount'];
    priceInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('input', () => Quote.calculatePrice());
        el.addEventListener('change', () => Quote.calculatePrice());
      }
    });
    
    // Coverage calculator button
    const calcBtn = document.getElementById('calculateCoverage');
    if (calcBtn) {
      calcBtn.addEventListener('click', () => Quote.calculateCoverage());
    }
    
    // Auto-calculate when coverage parameters change
    const coverageInputs = ['coverageAltitude', 'coverageFrontOverlap', 'coverageSideOverlap'];
    coverageInputs.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => {
          const area = parseFloat(document.getElementById('quoteArea').value) || 0;
          if (area > 0) {
            Quote.calculateCoverage();
          }
        });
      }
    });
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
  calculatePrice: () => {
    const area = parseFloat(document.getElementById('quoteArea').value) || 0;
    const unit = document.getElementById('quoteAreaUnit').value;
    const basePrice = parseFloat(document.getElementById('quoteBasePrice').value) || 0;
    const photoCount = parseInt(document.getElementById('quotePhotoCount').value) || 0;
    
    let areaCost = 0;
    if (unit === 'acres') {
      areaCost = area * basePrice;
    } else if (unit === 'sqft') {
      areaCost = area * (basePrice || CONFIG.pricing.basePricePerSqFt);
    }
    
    // Calculate photo processing cost
    const photoCost = photoCount * CONFIG.pricing.photoProcessingCost * CONFIG.pricing.photoMultiplier;
    
    // Total cost
    let total = areaCost + photoCost;
    if (total < CONFIG.pricing.minimumPrice) total = CONFIG.pricing.minimumPrice;
    
    // Update price breakdown display
    const breakdown = document.getElementById('quotePriceBreakdown');
    if (breakdown) {
      document.getElementById('quoteAreaCost').textContent = '$' + areaCost.toFixed(2);
      document.getElementById('quotePhotoCost').textContent = '$' + photoCost.toFixed(2);
      document.getElementById('quoteTotalCost').textContent = '$' + total.toFixed(2);
      breakdown.classList.remove('is-hidden');
    }
    
    return total;
  },
  
  calculatePhotoCost: (photoCount, basePrice) => {
    return photoCount * (basePrice || CONFIG.pricing.photoProcessingCost) * CONFIG.pricing.photoMultiplier;
  },
  createQuote: () => {
    const customerId = document.getElementById('quoteCustomer').value;
    const serviceType = document.getElementById('quoteServiceType').value;
    const area = parseFloat(document.getElementById('quoteArea')?.value) || 0;
    const areaUnit = document.getElementById('quoteAreaUnit')?.value || 'acres';
    const basePrice = parseFloat(document.getElementById('quoteBasePrice').value) || 0;
    const photoCount = parseInt(document.getElementById('quotePhotoCount')?.value) || 0;
    const total = Quote.calculatePrice();
    const service = CONFIG.serviceTypes.find(s => s.id === serviceType);
    
    if (!customerId || !serviceType) {
      alert('Please fill in all required fields');
      return;
    }
    
    const quote = {
      customerId: customerId,
      serviceType: serviceType,
      serviceName: service ? service.name : '',
      area: area,
      areaUnit: areaUnit,
      basePrice: basePrice,
      photoCount: photoCount,
      photoCost: Quote.calculatePhotoCost(photoCount),
      areaCost: parseFloat(document.getElementById('quoteAreaCost')?.textContent.replace('$', '') || 0),
      total: total,
      status: 'draft'
    };
    Storage.quotes.add(quote);
    Quote.renderList();
    document.getElementById('quoteForm').reset();
    document.getElementById('quotePriceBreakdown')?.classList.add('is-hidden');
    alert('Quote created successfully!');
  },
  
  calculateCoverage: () => {
    if (typeof LandPlotting === 'undefined') {
      alert('Plotting system not initialized');
      return;
    }
    
    const plots = LandPlotting.getAllPlots();
    if (plots.length === 0) {
      alert('Please plot your land first.');
      return;
    }
    
    // Get total area from plots
    let totalAreaSqMeters = 0;
    plots.forEach(plot => {
      if (plot.area) {
        totalAreaSqMeters += plot.area.sqmeters || 0;
      }
    });
    
    if (totalAreaSqMeters <= 0) {
      alert('No area calculated. Please finish plotting your land.');
      return;
    }
    
    // Get coverage parameters
    const altitude = parseFloat(document.getElementById('coverageAltitude')?.value) || CONFIG.droneSpecs.defaultAltitude;
    const frontOverlap = parseFloat(document.getElementById('coverageFrontOverlap')?.value) || CONFIG.coverageDefaults.frontOverlap;
    const sideOverlap = parseFloat(document.getElementById('coverageSideOverlap')?.value) || CONFIG.coverageDefaults.sideOverlap;
    
    // Get combined coordinates from all plots
    const allBounds = MapManager.getAllPlotsBounds();
    let areaCoordinates = null;
    if (allBounds && allBounds.isValid()) {
      areaCoordinates = [
        [allBounds.getSouthWest().lat, allBounds.getSouthWest().lng],
        [allBounds.getNorthWest().lat, allBounds.getNorthWest().lng],
        [allBounds.getNorthEast().lat, allBounds.getNorthEast().lng],
        [allBounds.getSouthEast().lat, allBounds.getSouthEast().lng],
        [allBounds.getSouthWest().lat, allBounds.getSouthWest().lng]
      ];
    }
    
    // Calculate coverage
    const result = CoverageCalculator.calculate(
      areaCoordinates,
      totalAreaSqMeters,
      altitude,
      frontOverlap,
      sideOverlap,
      CONFIG.droneSpecs
    );
    
    if (!result) {
      alert('Error calculating coverage. Please check your inputs.');
      return;
    }
    
    // Update UI with results
    const resultsEl = document.getElementById('coverageResults');
    if (resultsEl) {
      resultsEl.innerHTML = `
        <div class="coverage-results-item">
          <span>Photos Needed:</span>
          <strong>${result.photos.recommended}</strong>
        </div>
        <div class="coverage-results-item">
          <span>Coverage per Photo:</span>
          <strong>${result.coverage.widthFeet.toFixed(0)}' × ${result.coverage.heightFeet.toFixed(0)}'</strong>
        </div>
        <div class="coverage-results-item">
          <span>GSD:</span>
          <strong>${result.gsd.toFixed(2)} cm/pixel</strong>
        </div>
        <div class="coverage-results-item">
          <span>Estimated Flight Time:</span>
          <strong>${result.flightTime.formatted}</strong>
        </div>
        <div class="coverage-results-item">
          <span>Total Flight Distance:</span>
          <strong>${result.flightPath ? `${result.flightPath.totalDistanceFeet.toFixed(0)} ft (${result.flightPath.totalDistanceMiles.toFixed(2)} mi)` : 'N/A'}</strong>
        </div>
      `;
      resultsEl.classList.remove('is-hidden');
    }
    
    // Update quote form with photo count
    const photoCountEl = document.getElementById('quotePhotoCount');
    if (photoCountEl) {
      photoCountEl.value = result.photos.recommended;
    }
    
    // Update flight path visualization if available
    if (result.flightPath && typeof MapManager.updateFlightPath === 'function') {
      MapManager.updateFlightPath(result.flightPath);
    }
    
    // Update quote form price
    Quote.calculatePrice();
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
