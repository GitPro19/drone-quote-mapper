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
  photoPackages: [
    { id: 'economy', name: 'Economy', description: 'Fewer photos, faster turnaround.', landPhotos: 15, topDownShots: 2, spacingMultiplier: 1.4, altitudeMultiplier: 1.3 },
    { id: 'standard', name: 'Standard', description: 'Balanced coverage for most properties.', landPhotos: 30, topDownShots: 3, spacingMultiplier: 1.0, altitudeMultiplier: 1.0 },
    { id: 'premium', name: 'Premium', description: 'Maximum detail with multiple angles.', landPhotos: 50, topDownShots: 4, spacingMultiplier: 0.85, altitudeMultiplier: 0.9 }
  ],
  defaultPackageId: 'standard',
  buildingShotCounts: {
    house: 5,
    garage: 4,
    shed: 3,
    barn: 5,
    dock: 4,
    default: 4
  },
  buildingShotRadii: {
    house: 18,
    garage: 12,
    shed: 10,
    barn: 20,
    dock: 14,
    default: 12
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
