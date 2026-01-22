const LotHistory = {
  currentLot: null,
  init: () => { LotHistory.setupEventListeners(); },
  setupEventListeners: () => {
    document.getElementById('newLot')?.addEventListener('click', () => LotHistory.openModal());
    document.getElementById('lotForm')?.addEventListener('submit', (e) => { e.preventDefault(); LotHistory.saveLot(); });
    document.getElementById('saveCurrentDrawing')?.addEventListener('click', () => LotHistory.saveCurrentDrawingAsBoundary());
    const list = document.getElementById('lotList');
    if (list) list.addEventListener('click', LotHistory.handleListClick);
    const versionList = document.getElementById('lotVersionList');
    if (versionList) versionList.addEventListener('click', LotHistory.handleVersionClick);
  },
  renderList: (customerId) => {
    const list = document.getElementById('lotList');
    if (!list) return;
    const lots = Storage.lots.findByCustomer(customerId);
    if (lots.length === 0) {
      list.innerHTML = '<p class="empty-state">No lots found. Click "+ New Lot" to add one.</p>';
      return;
    }
    list.innerHTML = lots.map(lot => {
      const currentVersion = lot.versions.find(v => v.versionId === lot.currentVersion) || lot.versions[lot.versions.length - 1];
      const area = currentVersion ? Measurements.formatArea(currentVersion.boundary.area, 'acres') : 'No boundary';
      return `
        <div class="lot-item" data-id="${lot.id}">
          <div class="lot-item-header">
            <h4>${Utils.escapeHtml(lot.name)}</h4>
            <div class="lot-actions">
              <button class="btn-icon" data-action="select" data-id="${lot.id}" title="Select">Select</button>
              <button class="btn-icon" data-action="edit" data-id="${lot.id}" title="Edit">Edit</button>
              <button class="btn-icon" data-action="delete" data-id="${lot.id}" title="Delete">Delete</button>
            </div>
          </div>
          <div class="lot-item-details">
            ${lot.lotNumber ? `<div>Lot #: ${Utils.escapeHtml(lot.lotNumber)}</div>` : ''}
            ${lot.parcelId ? `<div>Parcel: ${Utils.escapeHtml(lot.parcelId)}</div>` : ''}
            <div>Area: ${area}</div>
            <div>Versions: ${lot.versions.length}</div>
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
    if (action === 'select') LotHistory.selectLot(id);
    if (action === 'edit') LotHistory.editLot(id);
    if (action === 'delete') LotHistory.deleteLot(id);
  },
  handleVersionClick: (e) => {
    const button = e.target.closest('button[data-action]');
    if (!button) return;
    const lotId = button.dataset.lotId;
    const versionId = button.dataset.versionId;
    const compareId = button.dataset.compareId;
    const action = button.dataset.action;
    if (action === 'show') LotHistory.showVersionOnMap(lotId, versionId);
    if (action === 'compare') LotHistory.compareVersions(lotId, compareId, versionId);
  },
  openModal: (lotId = null) => {
    const modal = document.getElementById('lotModal');
    if (!modal) return;
    if (!Customers.currentCustomer) { alert('Please select a customer first'); return; }
    const title = document.getElementById('lotModalTitle');
    if (lotId) {
      const lot = Storage.lots.find(lotId);
      if (lot) {
        title.textContent = 'Edit Lot';
        document.getElementById('lotId').value = lot.id;
        document.getElementById('lotCustomerId').value = lot.customerId;
        document.getElementById('lotName').value = lot.name || '';
        document.getElementById('lotNumber').value = lot.lotNumber || '';
        document.getElementById('parcelId').value = lot.parcelId || '';
        document.getElementById('lotNotes').value = lot.notes || '';
      }
    } else {
      title.textContent = 'New Lot';
      document.getElementById('lotForm').reset();
      document.getElementById('lotId').value = '';
      document.getElementById('lotCustomerId').value = Customers.currentCustomer;
    }
    modal.style.display = 'block';
  },
  saveLot: () => {
    const id = document.getElementById('lotId').value;
    const lot = {
      customerId: document.getElementById('lotCustomerId').value,
      name: document.getElementById('lotName').value,
      lotNumber: document.getElementById('lotNumber').value,
      parcelId: document.getElementById('parcelId').value,
      notes: document.getElementById('lotNotes').value
    };
    if (id) { Storage.lots.update(id, lot); } else { Storage.lots.add(lot); }
    document.getElementById('lotModal').style.display = 'none';
    LotHistory.renderList(Customers.currentCustomer);
    LotHistory.updateQuoteLotSelect();
  },
  saveCurrentDrawingAsBoundary: () => {
    const drawnLayers = MapManager.drawnItems.getLayers();
    if (drawnLayers.length === 0) { alert('Please draw a boundary on the map first'); return; }
    const layer = drawnLayers[drawnLayers.length - 1];
    const coords = Measurements.extractCoordinates(layer);
    const type = Measurements.getLayerType(layer);
    const area = Measurements.calculateArea(coords, type);
    const perimeter = Measurements.calculatePerimeter(coords);
    if (!area) { alert('Could not calculate area'); return; }
    const lotId = document.getElementById('lotId').value;
    const customerId = document.getElementById('lotCustomerId').value || Customers.currentCustomer;
    if (!lotId && !customerId) { alert('Please create or select a lot first'); return; }
    const version = {
      boundary: { type: type, coordinates: coords, area: area, perimeter: perimeter },
      notes: document.getElementById('lotNotes').value || 'Initial boundary'
    };
    if (lotId) {
      Storage.lots.addVersion(lotId, version);
    } else {
      const lot = {
        customerId: customerId,
        name: document.getElementById('lotName').value || 'New Lot',
        lotNumber: document.getElementById('lotNumber').value || '',
        parcelId: document.getElementById('parcelId').value || '',
        notes: document.getElementById('lotNotes').value || ''
      };
      const newLot = Storage.lots.add(lot);
      Storage.lots.addVersion(newLot.id, version);
    }
    alert('Boundary saved successfully!');
    document.getElementById('lotModal').style.display = 'none';
    LotHistory.renderList(Customers.currentCustomer);
  },
  selectLot: (id) => {
    LotHistory.currentLot = id;
    const lot = Storage.lots.find(id);
    LotHistory.renderVersions(lot);
    document.getElementById('lotVersionSection').classList.remove('is-hidden');
    LotHistory.updateQuoteLotSelect();
  },
  renderVersions: (lot) => {
    const list = document.getElementById('lotVersionList');
    if (!list) return;
    document.getElementById('lotComparison').classList.add('is-hidden');
    if (!lot || lot.versions.length === 0) {
      list.innerHTML = '<p class="empty-state">No versions found. Draw a boundary and save it.</p>';
      return;
    }
    list.innerHTML = lot.versions.map((version, index) => {
      const area = Measurements.formatArea(version.boundary.area, 'acres');
      const change = version.changes
        ? `${version.changes.areaGained.acres >= 0 ? '+' : ''}${version.changes.areaGained.acres.toFixed(2)} acres (${version.changes.percentChange.toFixed(1)}%)`
        : 'Initial version';
      return `
        <div class="version-item" data-version="${version.versionId}">
          <div class="version-header">
            <h5>Version ${version.versionId} - ${new Date(version.date).toLocaleDateString()}</h5>
            <div class="version-actions">
              <button class="btn-sm" data-action="show" data-lot-id="${lot.id}" data-version-id="${version.versionId}">Show on Map</button>
              ${index > 0 ? `<button class="btn-sm" data-action="compare" data-lot-id="${lot.id}" data-version-id="${version.versionId}" data-compare-id="${lot.versions[index - 1].versionId}">Compare</button>` : ''}
            </div>
          </div>
          <div class="version-details">
            <div>Area: ${area}</div>
            <div>Change: ${change}</div>
            ${version.notes ? `<div>Notes: ${Utils.escapeHtml(version.notes)}</div>` : ''}
          </div>
        </div>
      `;
    }).join('');
  },
  showVersionOnMap: (lotId, versionId) => {
    const lot = Storage.lots.find(lotId);
    const version = lot.versions.find(v => v.versionId === versionId);
    if (version) { MapManager.displayBoundary(version.boundary); }
  },
  compareVersions: (lotId, version1Id, version2Id) => {
    const lot = Storage.lots.find(lotId);
    const v1 = lot.versions.find(v => v.versionId === version1Id);
    const v2 = lot.versions.find(v => v.versionId === version2Id);
    if (v1 && v2) {
      const area1 = v1.boundary.area.acres;
      const area2 = v2.boundary.area.acres;
      const change = area2 - area1;
      const percentChange = area1 > 0 ? ((change / area1) * 100) : 0;
      document.getElementById('comparisonMetrics').innerHTML = `
        <div class="comparison-item"><strong>Version ${v1.versionId}:</strong> ${Measurements.formatArea(v1.boundary.area, 'acres')}</div>
        <div class="comparison-item"><strong>Version ${v2.versionId}:</strong> ${Measurements.formatArea(v2.boundary.area, 'acres')}</div>
        <div class="comparison-item"><strong>Change:</strong> ${change >= 0 ? '+' : ''}${change.toFixed(2)} acres (${percentChange >= 0 ? '+' : ''}${percentChange.toFixed(1)}%)</div>
      `;
      document.getElementById('lotComparison').classList.remove('is-hidden');
      MapManager.displayBoundaryComparison(v1.boundary, v2.boundary);
    }
  },
  editLot: (id) => { LotHistory.openModal(id); },
  deleteLot: (id) => {
    if (confirm('Are you sure you want to delete this lot? All versions will be lost.')) {
      Storage.lots.delete(id);
      LotHistory.renderList(Customers.currentCustomer);
      if (LotHistory.currentLot === id) {
        LotHistory.currentLot = null;
        document.getElementById('lotVersionSection').classList.add('is-hidden');
      }
    }
  },
  updateQuoteLotSelect: () => {
    const select = document.getElementById('quoteLot');
    if (!select) return;
    const lots = Customers.currentCustomer ? Storage.lots.findByCustomer(Customers.currentCustomer) : [];
    select.innerHTML = '<option value="">Select lot (optional)...</option>' + lots.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    if (LotHistory.currentLot) { select.value = LotHistory.currentLot; }
  }
};
