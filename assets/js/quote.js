const Quote = {
  lastPhotoPlan: null,
  init: () => {
    Quote.setupEventListeners();
    Quote.populateServiceTypes();
    Quote.populatePackages();
    void Quote.renderList();
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

    const packageSelect = document.getElementById('quotePackage');
    if (packageSelect) {
      packageSelect.addEventListener('change', () => {
        Quote.updatePackageHint();
        Quote.calculateCoverage();
        Quote.updateQuoteDisplay();
      });
    }
  },
  getPhotoPackages: () => {
    if (CONFIG.photoPackages && Array.isArray(CONFIG.photoPackages) && CONFIG.photoPackages.length > 0) {
      return CONFIG.photoPackages;
    }
    return [
      { id: 'economy', name: 'Economy', description: 'Fewer photos, faster turnaround.', landPhotos: 15, topDownShots: 2, spacingMultiplier: 1.4, altitudeMultiplier: 1.3 },
      { id: 'standard', name: 'Standard', description: 'Balanced coverage for most properties.', landPhotos: 30, topDownShots: 3, spacingMultiplier: 1.0, altitudeMultiplier: 1.0 },
      { id: 'premium', name: 'Premium', description: 'Maximum detail with multiple angles.', landPhotos: 50, topDownShots: 4, spacingMultiplier: 0.85, altitudeMultiplier: 0.9 }
    ];
  },
  getSelectedPackage: () => {
    const packages = Quote.getPhotoPackages();
    const select = document.getElementById('quotePackage');
    const selectedId = select?.value || CONFIG.defaultPackageId || packages[0]?.id;
    return packages.find(pkg => pkg.id === selectedId) || packages[0];
  },
  getSelectedPackageOptions: () => {
    const selected = Quote.getSelectedPackage();
    if (!selected) return {};
    return {
      spacingMultiplier: selected.spacingMultiplier || 1.0,
      altitudeMultiplier: selected.altitudeMultiplier || 1.0,
      landPhotos: selected.landPhotos || 0,
      topDownShots: selected.topDownShots || 0,
      packageId: selected.id,
      packageName: selected.name
    };
  },
  getPhotoPlan: (plot) => {
    const packageOptions = Quote.getSelectedPackageOptions();
    const landPhotos = Math.max(0, Math.round(packageOptions.landPhotos || 0));
    const topDownShots = Math.max(0, Math.round(packageOptions.topDownShots || 0));
    const cappedTopDown = Math.min(topDownShots, landPhotos);
    const angledShots = Math.max(landPhotos - cappedTopDown, 0);
    let buildingPhotos = 0;
    if (plot && typeof LandPlotting !== 'undefined' && LandPlotting.getBuildingPhotoCount) {
      buildingPhotos = LandPlotting.getBuildingPhotoCount(plot);
    }
    return {
      landPhotos,
      topDownShots: cappedTopDown,
      angledShots,
      buildingPhotos,
      totalPhotos: landPhotos + buildingPhotos,
      packageId: packageOptions.packageId,
      packageName: packageOptions.packageName
    };
  },
  updatePackageSummary: (plan) => {
    const summary = document.getElementById('quotePackageSummary');
    if (!summary) return;
    const totalEl = document.getElementById('quotePackagePhotoCount');
    const landEl = document.getElementById('quotePackageLandCount');
    const topDownEl = document.getElementById('quotePackageTopDownCount');
    const angledEl = document.getElementById('quotePackageAngledCount');
    const buildingEl = document.getElementById('quotePackageBuildingCount');
    if (!plan) {
      if (totalEl) totalEl.textContent = '-';
      if (landEl) landEl.textContent = '-';
      if (topDownEl) topDownEl.textContent = '-';
      if (angledEl) angledEl.textContent = '-';
      if (buildingEl) buildingEl.textContent = '-';
      return;
    }
    if (totalEl) totalEl.textContent = plan.totalPhotos.toLocaleString();
    if (landEl) landEl.textContent = plan.landPhotos.toLocaleString();
    if (topDownEl) topDownEl.textContent = plan.topDownShots.toLocaleString();
    if (angledEl) angledEl.textContent = plan.angledShots.toLocaleString();
    if (buildingEl) buildingEl.textContent = plan.buildingPhotos.toLocaleString();
  },
  populatePackages: () => {
    const select = document.getElementById('quotePackage');
    if (!select) return;
    const packages = Quote.getPhotoPackages();
    select.innerHTML = packages.map(pkg => `<option value="${pkg.id}">${pkg.name}</option>`).join('');
    const defaultId = CONFIG.defaultPackageId || packages[0]?.id;
    if (defaultId) select.value = defaultId;
    Quote.updatePackageHint();
  },
  updatePackageHint: () => {
    const hint = document.getElementById('quotePackageHint');
    if (!hint) return;
    const selected = Quote.getSelectedPackage();
    hint.textContent = selected?.description || '';
  },
  populateServiceTypes: () => {
    const select = document.getElementById('quoteServiceType');
    if (!select) return;
    select.innerHTML = '<option value="">Select service type...</option>' +
      CONFIG.serviceTypes.map(s => `<option value="${s.id}" data-price="${s.basePrice || CONFIG.pricing.basePricePerAcre || 250}">${s.name}</option>`).join('');
    select.addEventListener('change', (e) => {
      const option = e.target.options[e.target.selectedIndex];
      const basePrice = option.dataset.price;
      if (basePrice) {
        document.getElementById('quoteBasePrice').value = basePrice;
        Quote.calculatePrice();
        Quote.updateQuoteDisplay();
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
      const perSqFt = CONFIG.pricing.basePricePerSqFt || (basePrice / 43560);
      areaCost = area * perSqFt;
    } else if (unit === 'sqmeters') {
      const acres = area * 0.000247105;
      areaCost = acres * basePrice;
    } else if (unit === 'hectares') {
      const acres = area * 2.47105;
      areaCost = acres * basePrice;
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
  createQuote: async () => {
    // Get customer information from form
    const customerName = document.getElementById('quoteCustomerName')?.value.trim();
    const customerEmail = document.getElementById('quoteCustomerEmail')?.value.trim();
    const customerPhone = document.getElementById('quoteCustomerPhone')?.value.trim();
    const serviceType = document.getElementById('quoteServiceType').value;
    const area = parseFloat(document.getElementById('quoteArea')?.value) || 0;
    const areaUnit = document.getElementById('quoteAreaUnit')?.value || 'acres';
    const photoCount = parseInt(document.getElementById('quotePhotoCount')?.value) || 0;
    
    // Validation
    if (!customerName || !customerEmail || !serviceType) {
      alert('Please fill in all required fields (Name, Email, and Service Type)');
      return;
    }
    
    if (area <= 0) {
      alert('Please map your property first before requesting a quote.');
      return;
    }
    
    // Auto-calculate coverage and price
    Quote.calculateCoverage();
    const total = Quote.calculatePrice();
    const service = CONFIG.serviceTypes.find(s => s.id === serviceType);
    
    // Get base price from service type or use default
    const basePrice = service?.basePrice || CONFIG.pricing.basePricePerAcre || 250;
    
    // Create or find customer
    let customer = null;
    try {
      const customers = await Storage.customers.getAll();
      customer = customers.find(c => c.email && c.email.toLowerCase() === customerEmail.toLowerCase()) || null;
      if (!customer) {
        customer = await Storage.customers.add({
          name: customerName,
          email: customerEmail,
          phone: customerPhone || '',
          address: '',
          notes: 'Created from quote request'
        });
      } else {
        await Storage.customers.update(customer.id, {
          name: customerName,
          phone: customerPhone || customer.phone || ''
        });
      }
    } catch (e) {
      console.error('Error saving customer:', e);
      alert('There was an error saving your information. Please try again.');
      return;
    }
    
    // Create quote
    const quote = {
      customerId: customer.id,
      customerName: customerName,
      customerEmail: customerEmail,
      customerPhone: customerPhone,
      serviceType: serviceType,
      serviceName: service ? service.name : '',
      area: area,
      areaUnit: areaUnit,
      basePrice: basePrice,
      photoCount: photoCount,
      photoCost: Quote.calculatePhotoCost(photoCount),
      areaCost: parseFloat(document.getElementById('quoteAreaCost')?.textContent.replace('$', '').replace(',', '') || 0),
      total: total,
      status: 'pending',
      requestedDate: new Date().toISOString()
    };
    
    try {
      await Storage.quotes.add(quote);
    } catch (e) {
      console.error('Error saving quote:', e);
      alert('There was an error submitting your quote. Please try again.');
      return;
    }
    
    // Show success message
    alert(`Thank you, ${customerName}! Your quote request has been submitted. We'll send a detailed quote to ${customerEmail} within 24 hours.`);
    
    // Reset form (but keep the mapped area)
    const areaValue = document.getElementById('quoteArea')?.value;
    const areaUnitValue = document.getElementById('quoteAreaUnit')?.value;
    const photoCountValue = document.getElementById('quotePhotoCount')?.value;
    const packageValue = document.getElementById('quotePackage')?.value;
    document.getElementById('quoteForm').reset();
    const areaEl = document.getElementById('quoteArea');
    const areaUnitEl = document.getElementById('quoteAreaUnit');
    const photoCountEl = document.getElementById('quotePhotoCount');
    const packageEl = document.getElementById('quotePackage');
    if (areaEl && areaValue) areaEl.value = areaValue;
    if (areaUnitEl && areaUnitValue) areaUnitEl.value = areaUnitValue;
    if (photoCountEl && photoCountValue) photoCountEl.value = photoCountValue;
    if (packageEl && packageValue) packageEl.value = packageValue;
    Quote.updatePackageHint();
    document.getElementById('quotePriceBreakdown')?.classList.add('is-hidden');
    
    // Optionally scroll to top or show confirmation
    window.scrollTo({ top: 0, behavior: 'smooth' });
  },
  
  calculateCoverage: () => {
    if (typeof LandPlotting === 'undefined') {
      alert('Plotting system not initialized');
      return;
    }
    
    const activePlot = LandPlotting.getActivePlot?.();
    if (!activePlot) {
      alert('Please plot your land first.');
      return;
    }
    const areaCoordinates = LandPlotting.getActivePlotCoordinates?.();
    if (!areaCoordinates) {
      alert('No area calculated. Please finish plotting your land.');
      return;
    }
    
    // Get total area from plots
    let totalAreaSqMeters = 0;
    if (activePlot.area) {
      totalAreaSqMeters = activePlot.area.sqmeters || 0;
    }
    
    if (totalAreaSqMeters <= 0) {
      alert('No area calculated. Please finish plotting your land.');
      return;
    }
    
    // Get coverage parameters
    const altitude = parseFloat(document.getElementById('coverageAltitude')?.value) || CONFIG.droneSpecs.defaultAltitude;
    const frontOverlap = parseFloat(document.getElementById('coverageFrontOverlap')?.value) || CONFIG.coverageDefaults.frontOverlap;
    const sideOverlap = parseFloat(document.getElementById('coverageSideOverlap')?.value) || CONFIG.coverageDefaults.sideOverlap;
    const packageOptions = Quote.getSelectedPackageOptions();
    const photoPlan = Quote.getPhotoPlan(activePlot);
    Quote.lastPhotoPlan = photoPlan;
    Quote.updatePackageHint();
    
    // Calculate coverage
    const result = CoverageCalculator.calculate(
      areaCoordinates,
      totalAreaSqMeters,
      altitude,
      frontOverlap,
      sideOverlap,
      CONFIG.droneSpecs,
      {
        ...packageOptions,
        landPhotos: photoPlan.landPhotos,
        topDownShots: photoPlan.topDownShots
      }
    );
    
    if (!result) {
      alert('Error calculating coverage. Please check your inputs.');
      return;
    }

    const totalPhotos = photoPlan.totalPhotos || result.photos.recommended;
    result.photos.total = totalPhotos;
    result.photos.land = photoPlan.landPhotos || result.photos.recommended;
    result.photos.building = photoPlan.buildingPhotos;
    result.photos.topDown = photoPlan.topDownShots;
    result.photos.angled = photoPlan.angledShots;
    result.flightTime = CoverageCalculator.calculateFlightTime(totalPhotos, 2);
    if (result.flightPath) {
      result.flightPath.landPhotos = result.photos.land;
      result.flightPath.topDownShots = result.photos.topDown;
      result.flightPath.angledShots = result.photos.angled;
      result.flightPath.buildingPhotos = result.photos.building;
      result.flightPath.totalPhotos = totalPhotos;
      if (typeof LandPlotting !== 'undefined' && LandPlotting.getBuildingOrbits) {
        result.flightPath.orbits = LandPlotting.getBuildingOrbits(activePlot);
      }
    }
    
    // Update UI with results
    const resultsEl = document.getElementById('coverageResults');
    if (resultsEl) {
      resultsEl.innerHTML = `
        <div class="coverage-results-item">
          <span>Photos Needed:</span>
          <strong>${totalPhotos}</strong>
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

    const packageSummary = document.getElementById('quotePackageSummary');
    Quote.updatePackageSummary(photoPlan);
    if (packageSummary) {
      packageSummary.classList.remove('is-hidden');
    }
    
    // Update quote form with photo count
    const photoCountEl = document.getElementById('quotePhotoCount');
    if (photoCountEl) {
      photoCountEl.value = totalPhotos;
    }
    
    // Update flight path visualization if available
    if (result.flightPath && typeof MapManager.updateFlightPath === 'function') {
      MapManager.updateFlightPath(result.flightPath);
    }
    
    // Update quote form price and display
    Quote.calculatePrice();
    Quote.updateQuoteDisplay();
  },
  
  updateQuoteDisplay: () => {
    const area = parseFloat(document.getElementById('quoteArea')?.value) || 0;
    const areaUnit = document.getElementById('quoteAreaUnit')?.value || 'acres';
    const photoCount = parseInt(document.getElementById('quotePhotoCount')?.value) || 0;
    const breakdown = document.getElementById('quotePriceBreakdown');
    const packageSummary = document.getElementById('quotePackageSummary');
    
    if (area > 0 && breakdown) {
      // Format area display
      let areaDisplay = '';
      if (areaUnit === 'acres') {
        areaDisplay = area.toFixed(2) + ' acres';
      } else if (areaUnit === 'sqft') {
        areaDisplay = area.toLocaleString() + ' sq ft';
      } else {
        areaDisplay = area.toFixed(2) + ' ' + areaUnit;
      }
      
      document.getElementById('quoteAreaDisplay').textContent = areaDisplay;
      document.getElementById('quotePhotoCountDisplay').textContent = photoCount.toLocaleString();
      breakdown.classList.remove('is-hidden');
    }
    if (packageSummary) {
      if (area > 0) {
        packageSummary.classList.remove('is-hidden');
      } else {
        packageSummary.classList.add('is-hidden');
      }
    }
    if (area > 0) {
      let plan = Quote.lastPhotoPlan;
      if (!plan && typeof LandPlotting !== 'undefined') {
        const activePlot = LandPlotting.getActivePlot?.();
        if (activePlot) {
          plan = Quote.getPhotoPlan(activePlot);
          Quote.lastPhotoPlan = plan;
        }
      }
      Quote.updatePackageSummary(plan);
    } else {
      Quote.updatePackageSummary(null);
    }
  },
  renderList: async () => {
    const list = document.getElementById('quoteList');
    if (!list) return;
    let quotes = [];
    let customers = [];
    try {
      quotes = await Storage.quotes.getAll();
      customers = await Storage.customers.getAll();
    } catch (e) {
      console.error('Error loading quotes:', e);
    }
    if (quotes.length === 0) {
      list.innerHTML = '<p class="empty-state">No quotes found. Create one above.</p>';
      return;
    }
    const customerById = new Map(customers.map(c => [c.id, c]));
    list.innerHTML = quotes.map(quote => {
      const customer = customerById.get(quote.customerId);
      const date = new Date(quote.date || quote.requestedDate || Date.now()).toLocaleDateString();
      return `
        <div class="quote-item">
          <div class="quote-item-header">
            <h4>${Utils.escapeHtml(quote.quoteNumber || 'Quote')} - ${Utils.escapeHtml(quote.serviceName)}</h4>
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
  viewQuote: async (id) => {
    try {
      const quote = await Storage.quotes.find(id);
      if (!quote) return;
      const customer = await Storage.customers.find(quote.customerId);
      const date = new Date(quote.date || quote.requestedDate || Date.now()).toLocaleDateString();
      const label = quote.quoteNumber || quote.id || 'Quote';
      document.getElementById('quotePreview').innerHTML = `<div class="quote-preview"><h2>Quote ${Utils.escapeHtml(label)}</h2><div class="quote-preview-section"><h3>Customer Information</h3><p><strong>Name:</strong> ${customer ? Utils.escapeHtml(customer.name) : 'N/A'}</p><p><strong>Email:</strong> ${customer ? Utils.escapeHtml(customer.email || 'N/A') : 'N/A'}</p><p><strong>Phone:</strong> ${customer ? Utils.escapeHtml(customer.phone || 'N/A') : 'N/A'}</p></div><div class="quote-preview-section"><h3>Service Details</h3><p><strong>Service:</strong> ${Utils.escapeHtml(quote.serviceName)}</p><p><strong>Area:</strong> ${quote.area} ${Utils.escapeHtml(quote.areaUnit)}</p><p><strong>Base Price:</strong> $${quote.basePrice.toFixed(2)}</p><p><strong>Total:</strong> $${quote.total.toFixed(2)}</p></div>${quote.notes ? `<div class="quote-preview-section"><h3>Notes</h3><p>${Utils.escapeHtml(quote.notes)}</p></div>` : ''}<div class="quote-preview-section"><p><strong>Date:</strong> ${date}</p><p><strong>Status:</strong> ${Utils.escapeHtml(quote.status)}</p></div></div>`;
      document.getElementById('quotePreviewModal').style.display = 'block';
    } catch (e) {
      console.error('Error loading quote:', e);
      alert('Unable to load quote. Please try again.');
    }
  },
  deleteQuote: async (id) => {
    if (confirm('Are you sure you want to delete this quote?')) {
      try {
        await Storage.quotes.delete(id);
        await Quote.renderList();
      } catch (e) {
        console.error('Error deleting quote:', e);
        alert('Error deleting quote. Please try again.');
      }
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
