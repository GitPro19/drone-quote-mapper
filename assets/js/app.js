document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

const App = {
  init: () => {
    App.setupEmbedMode();
    App.setupTabs();
    App.setupExportImport();
    App.setupSettings();
    Customers.init();
    LotHistory.init();
    Quote.init();
    MapManager.init();
  },
  
  setupTabs: () => {
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(tab + 'Tab').classList.add('active');
      });
    });
  },
  
  setupEmbedMode: () => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('embed')) {
      document.body.classList.add('embed-mode');
    }
  },
  
  setupExportImport: () => {
    document.getElementById('exportData').addEventListener('click', () => {
      const data = Storage.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'drone-quote-mapper-backup-' + new Date().toISOString().split('T')[0] + '.json';
      a.click();
    });
    
    document.getElementById('importData').addEventListener('click', () => {
      document.getElementById('importFile').click();
    });
    
    document.getElementById('importFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (confirm('This will replace all current data. Continue?')) {
            Storage.importAll(data);
            location.reload();
          }
        } catch (e) {
          alert('Error importing file: ' + e.message);
        }
      };
      reader.readAsText(file);
    });
  },
  
  setupSettings: () => {
    document.getElementById('saveSettings').addEventListener('click', () => {
      // Map settings
      CONFIG.defaultCenter.lat = parseFloat(document.getElementById('defaultLat').value);
      CONFIG.defaultCenter.lng = parseFloat(document.getElementById('defaultLng').value);
      CONFIG.defaultZoom = parseInt(document.getElementById('defaultZoom').value);
      
      // Company settings
      CONFIG.company.name = document.getElementById('companyName').value;
      
      // Pricing settings
      CONFIG.pricing.basePricePerAcre = parseFloat(document.getElementById('basePricePerAcre').value);
      CONFIG.pricing.photoProcessingCost = parseFloat(document.getElementById('photoProcessingCost').value);
      CONFIG.pricing.photoMultiplier = parseFloat(document.getElementById('photoMultiplier').value);
      CONFIG.pricing.minimumPrice = parseFloat(document.getElementById('minimumPrice').value);
      
      // Drone specs
      CONFIG.droneSpecs.model = document.getElementById('droneModel').value;
      CONFIG.droneSpecs.sensorWidth = parseFloat(document.getElementById('sensorWidth').value);
      CONFIG.droneSpecs.sensorHeight = parseFloat(document.getElementById('sensorHeight').value);
      CONFIG.droneSpecs.focalLength = parseFloat(document.getElementById('focalLength').value);
      CONFIG.droneSpecs.imageWidth = parseInt(document.getElementById('imageWidth').value);
      CONFIG.droneSpecs.imageHeight = parseInt(document.getElementById('imageHeight').value);
      CONFIG.droneSpecs.maxAltitude = parseInt(document.getElementById('maxAltitude').value);
      CONFIG.droneSpecs.defaultAltitude = parseInt(document.getElementById('defaultAltitude').value);
      
      // Coverage defaults
      CONFIG.coverageDefaults.frontOverlap = parseInt(document.getElementById('defaultFrontOverlap').value);
      CONFIG.coverageDefaults.sideOverlap = parseInt(document.getElementById('defaultSideOverlap').value);
      CONFIG.coverageDefaults.targetGSD = parseFloat(document.getElementById('targetGSD').value);
      
      saveConfig();
      alert('Settings saved!');
    });
    
    // Load current settings into form
    document.getElementById('defaultLat').value = CONFIG.defaultCenter.lat;
    document.getElementById('defaultLng').value = CONFIG.defaultCenter.lng;
    document.getElementById('defaultZoom').value = CONFIG.defaultZoom;
    document.getElementById('companyName').value = CONFIG.company.name || '';
    document.getElementById('basePricePerAcre').value = CONFIG.pricing.basePricePerAcre;
    document.getElementById('photoProcessingCost').value = CONFIG.pricing.photoProcessingCost || 0.50;
    document.getElementById('photoMultiplier').value = CONFIG.pricing.photoMultiplier || 1.0;
    document.getElementById('minimumPrice').value = CONFIG.pricing.minimumPrice;
    
    document.getElementById('droneModel').value = CONFIG.droneSpecs?.model || 'DJI Mini 3';
    document.getElementById('sensorWidth').value = CONFIG.droneSpecs?.sensorWidth || 15.7;
    document.getElementById('sensorHeight').value = CONFIG.droneSpecs?.sensorHeight || 10.5;
    document.getElementById('focalLength').value = CONFIG.droneSpecs?.focalLength || 24;
    document.getElementById('imageWidth').value = CONFIG.droneSpecs?.imageWidth || 4000;
    document.getElementById('imageHeight').value = CONFIG.droneSpecs?.imageHeight || 3000;
    document.getElementById('maxAltitude').value = CONFIG.droneSpecs?.maxAltitude || 120;
    document.getElementById('defaultAltitude').value = CONFIG.droneSpecs?.defaultAltitude || 60;
    
    document.getElementById('defaultFrontOverlap').value = CONFIG.coverageDefaults?.frontOverlap || 70;
    document.getElementById('defaultSideOverlap').value = CONFIG.coverageDefaults?.sideOverlap || 60;
    document.getElementById('targetGSD').value = CONFIG.coverageDefaults?.targetGSD || 2.5;
  }
};
