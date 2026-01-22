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
      CONFIG.defaultCenter.lat = parseFloat(document.getElementById('defaultLat').value);
      CONFIG.defaultCenter.lng = parseFloat(document.getElementById('defaultLng').value);
      CONFIG.defaultZoom = parseInt(document.getElementById('defaultZoom').value);
      CONFIG.company.name = document.getElementById('companyName').value;
      CONFIG.pricing.basePricePerAcre = parseFloat(document.getElementById('basePricePerAcre').value);
      saveConfig();
      alert('Settings saved!');
    });
    
    document.getElementById('defaultLat').value = CONFIG.defaultCenter.lat;
    document.getElementById('defaultLng').value = CONFIG.defaultCenter.lng;
    document.getElementById('defaultZoom').value = CONFIG.defaultZoom;
    document.getElementById('companyName').value = CONFIG.company.name;
    document.getElementById('basePricePerAcre').value = CONFIG.pricing.basePricePerAcre;
  }
};
