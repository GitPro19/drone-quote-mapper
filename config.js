// Application Configuration
const CONFIG = {
  defaultCenter: { lat: 44.8356, lng: -69.2733 },
  defaultZoom: 13,
  satelliteProvider: 'esri',
  serviceTypes: [
    { id: 'aerial-photography', name: 'Aerial Photography/Videography', basePrice: 250 },
    { id: 'mapping', name: 'Mapping/Surveying', basePrice: 300 },
    { id: 'inspections', name: 'Inspections', basePrice: 200 },
    { id: 'agricultural', name: 'Agricultural Services', basePrice: 275 },
    { id: 'custom', name: 'Custom Service', basePrice: 250 }
  ],
  pricing: {
    basePricePerAcre: 250,
    basePricePerSqFt: 0.0057,
    photoProcessingCost: 0.50,
    minimumPrice: 100,
    photoMultiplier: 1.0
  },
  droneSpecs: {
    model: 'DJI Mini 3',
    sensorWidth: 15.7,
    sensorHeight: 10.5,
    focalLength: 24,
    imageWidth: 4000,
    imageHeight: 3000,
    maxAltitude: 120,
    defaultAltitude: 60
  },
  coverageDefaults: {
    frontOverlap: 70,
    sideOverlap: 60,
    targetGSD: 2.5
  },
  company: { name: 'Your Drone Service', email: '', phone: '', address: '' },
  defaultUnit: 'acres',
  storageKeys: {
    customers: 'drone_mapper_customers',
    lots: 'drone_mapper_lots',
    quotes: 'drone_mapper_quotes',
    settings: 'drone_mapper_settings'
  }
};

function loadConfig() {
  const saved = localStorage.getItem(CONFIG.storageKeys.settings);
  if (saved) {
    try {
      Object.assign(CONFIG, JSON.parse(saved));
    } catch (e) { console.error('Error loading config:', e); }
  }
}

function saveConfig() {
  try {
    localStorage.setItem(CONFIG.storageKeys.settings, JSON.stringify(CONFIG));
  } catch (e) { console.error('Error saving config:', e); }
}

loadConfig();
