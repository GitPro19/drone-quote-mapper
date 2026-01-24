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
    {
      id: 'economy',
      name: 'Economy',
      description: 'Essential coverage for small properties.',
      landPhotos: 15,
      topDownShots: 2,
      spacingMultiplier: 1.4,
      altitudeMultiplier: 1.3,
      includedBuildings: 1,
      basePrice: 199,
      includes: [
        '15 total aerial photos',
        'Top-down mapping shots (1 per acre)',
        'Angled property views',
        '1 building orbit (5 shots)',
        'Basic color correction',
        '3-5 day turnaround',
        'Digital delivery'
      ],
      bestFor: 'Small lots under 2 acres'
    },
    {
      id: 'standard',
      name: 'Standard',
      description: 'Complete coverage for most properties.',
      landPhotos: 30,
      topDownShots: 3,
      spacingMultiplier: 1.0,
      altitudeMultiplier: 1.0,
      includedBuildings: 2,
      basePrice: 449,
      includes: [
        '30 total aerial photos',
        'Top-down mapping shots (1 per acre)',
        'Angled property views',
        '2 building orbits (10 shots)',
        '30-60 second highlight video',
        'Professional editing',
        '2-3 day turnaround',
        'Social media ready formats'
      ],
      bestFor: 'Properties 2-10 acres',
      popular: true
    },
    {
      id: 'premium',
      name: 'Premium',
      description: 'Complete aerial + ground real estate package.',
      landPhotos: 50,
      topDownShots: 4,
      spacingMultiplier: 0.85,
      altitudeMultiplier: 0.9,
      includedBuildings: null,
      basePrice: 1299,
      includes: [
        '50+ total aerial photos',
        'Top-down mapping shots',
        'Comprehensive angled coverage',
        'Unlimited building orbits',
        '2-3 minute cinematic property video',
        '---',
        'GROUND PHOTOGRAPHY INCLUDED:',
        '25+ professional interior photos',
        '15+ exterior detail shots',
        'HDR editing for all rooms',
        'Virtual twilight conversion',
        '---',
        'Premium color grading',
        '2D property map',
        'Same-day/next-day turnaround',
        'MLS-ready + print-ready files'
      ],
      bestFor: 'Luxury listings, full real estate packages'
    }
  ],
  defaultPackageId: 'standard',
  buildingShotCounts: {
    house: 5,
    garage: 4,
    shed: 3,
    barn: 5,
    dock: 2,
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
    targetGSD: 2.5,
    topDownAltitudeFeet: 400
  },
  flightPathDefaults: {
    propertyOrbitOffsetMeters: 10
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
