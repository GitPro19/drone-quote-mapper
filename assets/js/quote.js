const Quote = {
  lastPhotoPlan: null,
  _debounceTimer: null,
  _elementCache: {},
  
  // Cache DOM elements for performance
  getElement: (id) => {
    if (!Quote._elementCache[id]) {
      Quote._elementCache[id] = document.getElementById(id);
    }
    return Quote._elementCache[id];
  },
  
  // Debounce function for expensive operations
  debounce: (func, delay = 300) => {
    return (...args) => {
      clearTimeout(Quote._debounceTimer);
      Quote._debounceTimer = setTimeout(() => func.apply(Quote, args), delay);
    };
  },
  
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
    
    // Auto-calculate price when inputs change (debounced for performance)
    const debouncedCalculatePrice = Quote.debounce(() => Quote.calculatePrice(), 300);
    const priceInputs = ['quoteArea', 'quoteAreaUnit', 'quoteBasePrice', 'quotePhotoCount'];
    priceInputs.forEach(id => {
      const el = Quote.getElement(id);
      if (el) {
        el.addEventListener('input', debouncedCalculatePrice);
        el.addEventListener('change', () => Quote.calculatePrice()); // Immediate on change
      }
    });
    
    // Coverage calculator button
    const calcBtn = document.getElementById('calculateCoverage');
    if (calcBtn) {
      calcBtn.addEventListener('click', () => Quote.calculateCoverage());
    }
    
    // Auto-calculate when coverage parameters change (debounced)
    const debouncedCalculateCoverage = Quote.debounce(() => {
      const area = parseFloat(Quote.getElement('quoteArea')?.value) || 0;
      if (area > 0) {
        Quote.calculateCoverage();
      }
    }, 500);
    const coverageInputs = ['coverageAltitude', 'coverageFrontOverlap', 'coverageSideOverlap'];
    coverageInputs.forEach(id => {
      const el = Quote.getElement(id);
      if (el) {
        el.addEventListener('change', debouncedCalculateCoverage);
      }
    });

    // Package selection is now handled by card clicks in populatePackages()
    // No need for change listener on hidden input
  },
  getPhotoPackages: () => {
    if (CONFIG.photoPackages && Array.isArray(CONFIG.photoPackages) && CONFIG.photoPackages.length > 0) {
      return CONFIG.photoPackages;
    }
    return [
      { id: 'economy', name: 'Economy', description: 'Fewer photos, faster turnaround.', landPhotos: 15, topDownShots: 2, spacingMultiplier: 1.4, altitudeMultiplier: 1.3, includedBuildings: 1 },
      { id: 'standard', name: 'Standard', description: 'Balanced coverage for most properties.', landPhotos: 30, topDownShots: 3, spacingMultiplier: 1.0, altitudeMultiplier: 1.0, includedBuildings: 2 },
      { id: 'premium', name: 'Premium', description: 'Maximum detail with multiple angles.', landPhotos: 50, topDownShots: 4, spacingMultiplier: 0.85, altitudeMultiplier: 0.9, includedBuildings: null }
    ];
  },
  getSelectedPackage: () => {
    const packages = Quote.getPhotoPackages();
    const hiddenInput = Quote.getElement('quotePackage');
    const selectedId = hiddenInput?.value || CONFIG.defaultPackageId || packages[0]?.id;
    return packages.find(pkg => pkg.id === selectedId) || packages[0];
  },
  getSelectedPackageOptions: () => {
    const selected = Quote.getSelectedPackage();
    if (!selected) return {};
    const defaultBuildingLimit = selected.id === 'economy'
      ? 1
      : selected.id === 'standard'
        ? 2
        : null;
    const includedBuildings = selected.includedBuildings === undefined
      ? defaultBuildingLimit
      : selected.includedBuildings;
    return {
      spacingMultiplier: selected.spacingMultiplier || 1.0,
      altitudeMultiplier: selected.altitudeMultiplier || 1.0,
      landPhotos: selected.landPhotos || 0,
      topDownShots: selected.topDownShots || 0,
      includedBuildings: includedBuildings,
      packageId: selected.id,
      packageName: selected.name
    };
  },
  getPhotoPlan: (plot) => {
    const packageOptions = Quote.getSelectedPackageOptions();
    const packageTotal = Math.max(0, Math.round(packageOptions.landPhotos || 0));
    let topDownTarget = Math.max(0, Math.round(packageOptions.topDownShots || 0));
    if (plot && plot.area && typeof CoverageCalculator !== 'undefined') {
      const specs = CONFIG.droneSpecs || {};
      const altitudeFeet = Number(CONFIG.coverageDefaults?.topDownAltitudeFeet);
      const topDownAltitudeFeet = Number.isFinite(altitudeFeet) ? altitudeFeet : 400;
      const topDownAltitudeMeters = topDownAltitudeFeet * 0.3048;
      const coverage = CoverageCalculator.calculatePhotoCoverage(
        topDownAltitudeMeters,
        specs.focalLength,
        specs.sensorWidth,
        specs.sensorHeight,
        specs.imageWidth,
        specs.imageHeight
      );
      const perShotAcres = Number(coverage?.areaAcres);
      const plotAcres = Number(plot.area.acres);
      if (Number.isFinite(perShotAcres) && perShotAcres > 0 && Number.isFinite(plotAcres) && plotAcres > 0) {
        topDownTarget = Math.max(1, Math.ceil(plotAcres / perShotAcres));
      }
    }
    if (packageOptions.packageId === 'economy') {
      topDownTarget = Math.min(topDownTarget, 2);
    }
    const includedBuildings = Number.isFinite(packageOptions.includedBuildings)
      ? Math.max(0, Math.round(packageOptions.includedBuildings))
      : null;
    let buildingDemand = 0;
    if (plot && typeof LandPlotting !== 'undefined' && LandPlotting.getBuildingPhotoCount) {
      buildingDemand = LandPlotting.getBuildingPhotoCount(plot, includedBuildings, {
        packageId: packageOptions.packageId
      });
    }
    let landDemand = 0;
    if (plot && plot.area && typeof CoverageCalculator !== 'undefined') {
      const specs = CONFIG.droneSpecs || {};
      const altitudeMultiplier = Number.isFinite(packageOptions.altitudeMultiplier) && packageOptions.altitudeMultiplier > 0
        ? packageOptions.altitudeMultiplier
        : 1.0;
      const spacingMultiplier = Number.isFinite(packageOptions.spacingMultiplier) && packageOptions.spacingMultiplier > 0
        ? packageOptions.spacingMultiplier
        : 1.0;
      const altitude = (specs.defaultAltitude || 60) * altitudeMultiplier;
      const coverage = CoverageCalculator.calculatePhotoCoverage(
        altitude,
        specs.focalLength,
        specs.sensorWidth,
        specs.sensorHeight,
        specs.imageWidth,
        specs.imageHeight
      );
      if (coverage && coverage.area > 0) {
        const frontOverlap = Number.isFinite(CONFIG.coverageDefaults?.frontOverlap)
          ? CONFIG.coverageDefaults.frontOverlap
          : 70;
        const sideOverlap = Number.isFinite(CONFIG.coverageDefaults?.sideOverlap)
          ? CONFIG.coverageDefaults.sideOverlap
          : 60;
        const spacing = CoverageCalculator.calculatePhotoSpacing(
          coverage,
          frontOverlap,
          sideOverlap
        );
        if (spacing && spacing.front > 0 && spacing.side > 0) {
          spacing.front *= spacingMultiplier;
          spacing.side *= spacingMultiplier;
          const photosNeeded = CoverageCalculator.calculatePhotosNeeded(
            plot.area.sqmeters || 0,
            coverage,
            spacing
          );
          landDemand = Math.max(0, Math.round(photosNeeded?.recommended || 0));
        }
      }
    }
    if (!Number.isFinite(landDemand) || landDemand <= 0) {
      landDemand = packageTotal;
    }
    if (!Number.isFinite(buildingDemand) || buildingDemand < 0) {
      buildingDemand = 0;
    }
    let buildingPhotos = 0;
    let landPhotos = packageTotal;
    const totalDemand = landDemand + buildingDemand;
    if (packageTotal > 0) {
      if (packageOptions.packageId === 'economy' && buildingDemand > 0) {
        buildingPhotos = Math.min(buildingDemand, packageTotal);
        landPhotos = packageTotal - buildingPhotos;
      } else if (totalDemand > 0) {
        const rawBuildingShare = Math.round(packageTotal * (buildingDemand / totalDemand));
        buildingPhotos = Math.min(buildingDemand, Math.max(0, rawBuildingShare));
        landPhotos = packageTotal - buildingPhotos;
      }
    }
    if (topDownTarget > 0 && landPhotos < topDownTarget && buildingPhotos > 0) {
      const shift = Math.min(topDownTarget - landPhotos, buildingPhotos);
      landPhotos += shift;
      buildingPhotos -= shift;
    }
    const topDownShots = Math.min(topDownTarget, landPhotos);
    const angledShots = Math.max(landPhotos - topDownShots, 0);
    return {
      landPhotos,
      topDownShots,
      angledShots,
      buildingPhotos,
      includedBuildings,
      totalPhotos: packageTotal,
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
  updatePackageLegend: () => {
    const legend = document.getElementById('packageTotalsLegend');
    if (!legend) return;
    const packages = Quote.getPhotoPackages();
    if (!packages || packages.length === 0) {
      legend.textContent = 'No packages available';
      return;
    }
    legend.innerHTML = packages.map(pkg => {
      const total = Math.max(0, Math.round(pkg.landPhotos || 0));
      const name = Utils.escapeHtml(pkg.name || pkg.id || 'Package');
      return `
        <div class="legend-item legend-item-split">
          <span class="legend-package">${name}</span>
          <span class="legend-count">${total} photos</span>
        </div>
      `;
    }).join('');
  },
  populatePackages: () => {
    const selector = document.getElementById('packageSelector');
    const hiddenInput = document.getElementById('quotePackage');
    if (!selector || !hiddenInput) return;
    
    const packages = Quote.getPhotoPackages();
    const defaultId = CONFIG.defaultPackageId || packages[0]?.id;
    
    selector.innerHTML = packages.map(pkg => {
      const isSelected = pkg.id === defaultId;
      const popularBadge = pkg.popular ? ' popular' : '';
      const selectedClass = isSelected ? ' selected' : '';
      
      return `
        <div class="package-card${popularBadge}${selectedClass}" data-package-id="${pkg.id}">
          <div class="package-card-header">
            <div class="package-card-name">${Utils.escapeHtml(pkg.name)}</div>
            <div class="package-card-price">
              $${pkg.basePrice?.toFixed(0) || '0'}
              <span class="price-label">base package</span>
            </div>
          </div>
          <div class="package-card-description">${Utils.escapeHtml(pkg.description)}</div>
          <ul class="package-card-features">
            ${(pkg.includes || []).map(item => `<li>${Utils.escapeHtml(item)}</li>`).join('')}
          </ul>
          ${pkg.bestFor ? `<div class="package-card-best-for">Best for: ${Utils.escapeHtml(pkg.bestFor)}</div>` : ''}
        </div>
      `;
    }).join('');
    
    // Set default selection
    if (defaultId) {
      hiddenInput.value = defaultId;
      const defaultCard = selector.querySelector(`[data-package-id="${defaultId}"]`);
      if (defaultCard) {
        defaultCard.classList.add('selected');
      }
    }
    
    // Add click handlers
    selector.querySelectorAll('.package-card').forEach(card => {
      card.addEventListener('click', () => {
        const packageId = card.dataset.packageId;
        hiddenInput.value = packageId;
        
        // Update visual selection
        selector.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        
        // Update package info
        Quote.updatePackageHint();
        Quote.calculateCoverage();
        Quote.updateQuoteDisplay();
      });
    });
    
    Quote.updatePackageHint();
    Quote.updatePackageLegend();
  },
  updatePackageHint: () => {
    const hint = document.getElementById('quotePackageHint');
    if (!hint) return;
    const selected = Quote.getSelectedPackage();
    if (selected) {
      hint.textContent = `Selected: ${selected.name} package - ${selected.description}`;
      hint.style.color = 'var(--primary)';
      hint.style.fontWeight = '500';
    } else {
      hint.textContent = '';
    }
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
    const areaRaw = Quote.getElement('quoteArea')?.value;
    const area = parseFloat(areaRaw) || 0;
    const unit = Quote.getElement('quoteAreaUnit')?.value;
    const basePriceRaw = Quote.getElement('quoteBasePrice')?.value;
    const basePrice = parseFloat(basePriceRaw) || 0;
    const photoCountRaw = Quote.getElement('quotePhotoCount')?.value;
    const photoCount = parseInt(photoCountRaw) || 0;
    
    // Get selected package base price
    const selectedPackage = Quote.getSelectedPackage();
    const packageBasePrice = selectedPackage?.basePrice || 0;
    
    // Calculate area-based pricing (scales with property size)
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
    
    // Calculate photo processing cost (additional photos beyond package base)
    const photoProcessingCost = CONFIG.pricing?.photoProcessingCost || 0.50;
    const photoMultiplier = CONFIG.pricing?.photoMultiplier || 1.0;
    const basePhotoCount = selectedPackage?.landPhotos || 0;
    const additionalPhotos = Math.max(0, photoCount - basePhotoCount);
    const photoCost = additionalPhotos * photoProcessingCost * photoMultiplier;
    
    // Total cost = package base price + area scaling + additional photo processing
    // Guard against NaN/Infinity
    let total = packageBasePrice + (Number.isFinite(areaCost) ? areaCost : 0) + (Number.isFinite(photoCost) ? photoCost : 0);
    const minimumPrice = CONFIG.pricing?.minimumPrice || packageBasePrice || 100;
    if (!Number.isFinite(total) || total < minimumPrice) {
      total = minimumPrice;
    }
    
    // Update price breakdown display
    const breakdown = Quote.getElement('quotePriceBreakdown');
    if (breakdown) {
      const selectedPackage = Quote.getSelectedPackage();
      const packageBasePrice = selectedPackage?.basePrice || 0;
      const areaCostEl = Quote.getElement('quoteAreaCost');
      const photoCostEl = Quote.getElement('quotePhotoCost');
      const totalCostEl = Quote.getElement('quoteTotalCost');
      let packagePriceEl = breakdown.querySelector('#quotePackagePrice');
      
      // Create or update package price display
      if (!packagePriceEl) {
        packagePriceEl = document.createElement('div');
        packagePriceEl.id = 'quotePackagePrice';
        packagePriceEl.className = 'quote-price-item';
        const areaDisplayEl = breakdown.querySelector('#quoteAreaDisplay')?.parentElement;
        if (areaDisplayEl && areaDisplayEl.nextSibling) {
          breakdown.insertBefore(packagePriceEl, areaDisplayEl.nextSibling);
        } else {
          breakdown.appendChild(packagePriceEl);
        }
      }
      
      if (packageBasePrice > 0) {
        packagePriceEl.innerHTML = `<span>Package Base (${selectedPackage?.name || 'Standard'}):</span><span>$${packageBasePrice.toFixed(2)}</span>`;
        packagePriceEl.style.display = 'flex';
      } else {
        packagePriceEl.style.display = 'none';
      }
      
      // Guard against NaN/Infinity before calling toFixed
      if (areaCostEl && Number.isFinite(areaCost)) {
        areaCostEl.textContent = '$' + areaCost.toFixed(2);
      }
      if (photoCostEl && Number.isFinite(photoCost)) {
        if (photoCost > 0) {
          photoCostEl.textContent = '$' + photoCost.toFixed(2) + ' (additional photos)';
        } else {
          photoCostEl.textContent = '$0.00 (included in package)';
        }
      }
      if (totalCostEl && Number.isFinite(total)) {
        totalCostEl.textContent = '$' + total.toFixed(2);
      }
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
    const areaValue = Quote.getElement('quoteArea')?.value;
    const areaUnitValue = Quote.getElement('quoteAreaUnit')?.value;
    const photoCountValue = Quote.getElement('quotePhotoCount')?.value;
    const packageValue = Quote.getElement('quotePackage')?.value;
    document.getElementById('quoteForm').reset();
    const areaEl = Quote.getElement('quoteArea');
    const areaUnitEl = Quote.getElement('quoteAreaUnit');
    const photoCountEl = Quote.getElement('quotePhotoCount');
    const packageEl = Quote.getElement('quotePackage');
    if (areaEl && areaValue) areaEl.value = areaValue;
    if (areaUnitEl && areaUnitValue) areaUnitEl.value = areaUnitValue;
    if (photoCountEl && photoCountValue) photoCountEl.value = photoCountValue;
    if (packageEl && packageValue) {
      packageEl.value = packageValue;
      // Update visual selection
      const selector = document.getElementById('packageSelector');
      if (selector) {
        selector.querySelectorAll('.package-card').forEach(c => c.classList.remove('selected'));
        const selectedCard = selector.querySelector(`[data-package-id="${packageValue}"]`);
        if (selectedCard) selectedCard.classList.add('selected');
      }
    }
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

    const totalPhotos = Number.isFinite(photoPlan?.totalPhotos)
      ? photoPlan.totalPhotos
      : result.photos.recommended;
    result.photos.total = totalPhotos;
    result.photos.land = Number.isFinite(photoPlan?.landPhotos)
      ? photoPlan.landPhotos
      : result.photos.recommended;
    result.photos.building = Number.isFinite(photoPlan?.buildingPhotos) ? photoPlan.buildingPhotos : 0;
    result.photos.topDown = Number.isFinite(photoPlan?.topDownShots) ? photoPlan.topDownShots : 0;
    result.photos.angled = Number.isFinite(photoPlan?.angledShots)
      ? photoPlan.angledShots
      : Math.max(result.photos.land - result.photos.topDown, 0);
    result.flightTime = CoverageCalculator.calculateFlightTime(totalPhotos, 2);
    if (result.flightPath) {
      result.flightPath.landPhotos = result.photos.land;
      result.flightPath.topDownShots = result.photos.topDown;
      result.flightPath.angledShots = result.photos.angled;
      result.flightPath.buildingPhotos = result.photos.building;
      result.flightPath.totalPhotos = totalPhotos;
      result.flightPath.packageId = packageOptions.packageId || null;
      result.flightPath.packageName = packageOptions.packageName || null;
      if (typeof LandPlotting !== 'undefined' && LandPlotting.getPropertyOrbit) {
        result.flightPath.propertyOrbit = LandPlotting.getPropertyOrbit(activePlot, photoPlan.angledShots);
      }
      if (typeof LandPlotting !== 'undefined' && LandPlotting.getBuildingOrbits) {
        result.flightPath.orbits = LandPlotting.getBuildingOrbits(
          activePlot,
          photoPlan.includedBuildings,
          photoPlan.buildingPhotos,
          { packageId: packageOptions.packageId }
        );
      }
      
      // Add angle information to shot points
      if (result.flightPath.shotPoints) {
        result.flightPath.shotPoints.forEach(shot => {
          if (!shot.cameraAngle) {
            shot.cameraAngle = shot.type === 'top-down' 
              ? { pitch: 90, degrees: 90, description: 'Nadir (straight down)' }
              : { pitch: 50, degrees: 50, description: 'Oblique (angled)' };
          }
        });
      }
    }
    
    // Update UI with results
    const resultsEl = document.getElementById('coverageResults');
    if (resultsEl) {
      const topDownCount = result.photos?.topDown || 0;
      const angledCount = result.photos?.angled || 0;
      const buildingCount = result.photos?.building || 0;
      
      resultsEl.innerHTML = `
        <div class="coverage-results-item">
          <span>Total Drone Photos:</span>
          <strong>${totalPhotos}</strong>
        </div>
        <div class="coverage-results-item">
          <span>Top-Down Shots (90°):</span>
          <strong>${topDownCount}</strong>
        </div>
        <div class="coverage-results-item">
          <span>Angled Shots (~50°):</span>
          <strong>${angledCount}</strong>
        </div>
        ${buildingCount > 0 ? `
        <div class="coverage-results-item">
          <span>Building Shots (~30°):</span>
          <strong>${buildingCount}</strong>
        </div>
        ` : ''}
        <div class="coverage-results-item">
          <span>Coverage per Photo:</span>
          <strong>${result.coverage.widthFeet.toFixed(0)}' × ${result.coverage.heightFeet.toFixed(0)}'</strong>
        </div>
        <div class="coverage-results-item">
          <span>GSD (Ground Sample Distance):</span>
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
  
  updateShotPredictions: (flightPath, plot) => {
    const infoPanel = document.getElementById('shotPredictionInfo');
    const detailsEl = document.getElementById('shotPredictionDetails');
    if (!infoPanel || !detailsEl) return;
    
    if (!flightPath) {
      infoPanel.classList.add('is-hidden');
      return;
    }
    
    let html = '';
    let hasPredictions = false;
    
    // Property shots summary
    const shotPoints = flightPath.shotPoints || [];
    if (shotPoints.length > 0) {
      hasPredictions = true;
      const topDownShots = shotPoints.filter(s => s.type === 'top-down').length;
      const angledShots = shotPoints.filter(s => s.type === 'angled').length;
      const altitude = flightPath.altitude || CONFIG.droneSpecs?.defaultAltitude || 60;
      
      html += `<div class="shot-building">`;
      html += `<div class="shot-building-header">Property Coverage Shots</div>`;
      html += `<div class="shot-building-meta">${shotPoints.length} total shots: ${topDownShots} top-down (90°), ${angledShots} angled (~50°) • Altitude: ${altitude}m</div>`;
      
      // Show sample predictions for property shots
      const sampleShots = shotPoints.slice(0, Math.min(3, shotPoints.length));
      sampleShots.forEach((shot, idx) => {
        const angle = shot.cameraAngle || { pitch: shot.type === 'top-down' ? 90 : 50, description: shot.type === 'top-down' ? 'Nadir' : 'Oblique' };
        const coverage = CoverageCalculator.calculatePhotoCoverage(
          altitude,
          CONFIG.droneSpecs.focalLength,
          CONFIG.droneSpecs.sensorWidth,
          CONFIG.droneSpecs.sensorHeight,
          CONFIG.droneSpecs.imageWidth,
          CONFIG.droneSpecs.imageHeight
        );
        
        html += `<div class="shot-item">`;
        html += `<div class="shot-item-header">${shot.type === 'top-down' ? 'Top-Down' : 'Angled'} Shot ${idx + 1}</div>`;
        html += `<div class="shot-item-detail">Camera Angle: <strong>${angle.pitch.toFixed(1)}°</strong> <span class="angle-badge">${angle.description}</span></div>`;
        html += `<div class="shot-item-detail">Type: <strong>${shot.type === 'top-down' ? 'Nadir (straight down)' : 'Oblique (angled view)'}</strong></div>`;
        html += `<div class="shot-item-detail">Coverage Area: <strong>${coverage.widthFeet.toFixed(0)}' × ${coverage.heightFeet.toFixed(0)}'</strong></div>`;
        html += `<div class="shot-item-detail">Coverage: <strong>${(coverage.areaSqFt).toFixed(0)} sq ft</strong> per shot</div>`;
        html += `</div>`;
      });
      if (shotPoints.length > 3) {
        html += `<div class="shot-item-detail" style="margin-top: 0.5rem; color: var(--text-tertiary);">+ ${shotPoints.length - 3} more property shots with similar coverage</div>`;
      }
      html += `</div>`;
    }
    
    // Building shots with detailed predictions
    const orbits = flightPath.orbits || [];
    orbits.forEach((orbit) => {
      const obstacle = plot?.obstacles?.find(o => o.id === orbit.id);
      if (!obstacle || !orbit.shotDetails || orbit.shotDetails.length === 0) return;
      
      hasPredictions = true;
      html += `<div class="shot-building">`;
      html += `<div class="shot-building-header">${Utils.escapeHtml(orbit.name || LandPlotting.getObstacleLabelForType(orbit.type))}</div>`;
      html += `<div class="shot-building-meta">${orbit.shots} shots at ${orbit.radius}m radius • Building height: ${orbit.buildingHeight || 4}m</div>`;
      
      orbit.shotDetails.forEach((shot, shotIndex) => {
        html += `<div class="shot-item">`;
        html += `<div class="shot-item-header">Shot ${shotIndex + 1} - ${shot.compassBearing.toFixed(0)}° Bearing</div>`;
        html += `<div class="shot-item-detail">Camera Angle: <strong>${shot.angle.pitch.toFixed(1)}°</strong> from horizontal <span class="angle-badge">Oblique</span></div>`;
        html += `<div class="shot-item-detail">Distance to Building: <strong>${shot.fieldOfView.distanceFeet.toFixed(0)} ft</strong> (${shot.fieldOfView.distance.toFixed(1)}m)</div>`;
        html += `<div class="shot-item-detail">Compass Bearing: <strong>${shot.compassBearing.toFixed(0)}°</strong> ${typeof CoverageCalculator !== 'undefined' && CoverageCalculator.getBearingDirection ? CoverageCalculator.getBearingDirection(shot.compassBearing) : ''}</div>`;
        html += `<div class="shot-item-detail">Field of View: <strong>${shot.fieldOfView.widthFeet.toFixed(0)}' × ${shot.fieldOfView.heightFeet.toFixed(0)}'</strong></div>`;
        html += `<div class="shot-item-detail">Coverage Area: <strong>${(shot.fieldOfView.width * shot.fieldOfView.height * 10.764).toFixed(0)} sq ft</strong></div>`;
        html += shot.willCapture.buildingVisible 
          ? `<div class="shot-item-detail"><span class="success-badge">✓ Building will be clearly visible</span></div>`
          : `<div class="shot-item-detail"><span class="warning-badge">⚠ Building may be partially obscured</span></div>`;
        html += `</div>`;
      });
      
      html += `</div>`;
    });
    
    if (hasPredictions && html) {
      detailsEl.innerHTML = html;
      infoPanel.classList.remove('is-hidden');
    } else {
      infoPanel.classList.add('is-hidden');
    }
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
