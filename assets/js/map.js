const MapManager = {
  map: null,
  satelliteLayer: null,
  streetLayer: null,
  labelsLayer: null,
  currentLayer: null,
  isSatellite: true,
  coordinateDisplay: null,
  flightPathLayer: null,
  showFlightPath: false,
  lastFlightPath: null,
  addressMarker: null,
  
  // Plotting visualization
  plotMarkersLayer: null,
  plotLinesLayer: null,
  plotAreaLayer: null,
  previewLine: null,
  obstacleMarkersLayer: null,
  poiMarkersLayer: null,
  currentPlotMarkers: [],
  currentPlotLines: [],
  currentAreaPolygon: null,

  init: () => {
    // Prevent multiple initializations (race condition fix)
    if (MapManager._initializing || MapManager.map) {
      return;
    }
    MapManager._initializing = true;
    
    // Clear any existing timeout to prevent race conditions
    if (MapManager._initTimeoutId) {
      clearTimeout(MapManager._initTimeoutId);
    }
    
    // Delay slightly to ensure DOM is fully ready
    const timeoutId = setTimeout(() => {
      MapManager.createMap();
      if (!MapManager.map) {
        MapManager._initializing = false;
        return;
      }
      MapManager.setupPlotting();
      MapManager.setupEventListeners();
      MapManager.setupCoordinateDisplay();
      if (typeof LandPlotting !== 'undefined' && LandPlotting.updateWorkflowSteps) {
        LandPlotting.updateWorkflowSteps();
      }
      MapManager._initializing = false;
    }, 50);
    MapManager._initTimeoutId = timeoutId;
  },

  createMap: () => {
    console.log('createMap called');
    console.log('L available:', typeof L !== 'undefined');
    console.log('CONFIG available:', typeof CONFIG !== 'undefined');
    
    // Check if Leaflet is loaded
    if (typeof L === 'undefined') {
      console.error('Leaflet library not loaded!');
      return;
    }
    
    const mapElement = document.getElementById('map');
    if (!mapElement) {
      console.error('Map element #map not found');
      return;
    }
    
    console.log('Map element found, dimensions:', mapElement.offsetWidth, 'x', mapElement.offsetHeight);
    
    // Force dimensions if needed
    if (mapElement.offsetHeight === 0) {
      mapElement.style.height = '600px';
      console.log('Forced map height to 600px');
    }
    if (mapElement.offsetWidth === 0) {
      mapElement.style.width = '100%';
      console.log('Forced map width to 100%');
    }
    
    try {
      // Create map with explicit options
      const center = CONFIG ? [CONFIG.defaultCenter.lat, CONFIG.defaultCenter.lng] : [44.8356, -69.2733];
      const zoom = CONFIG ? CONFIG.defaultZoom : 13;
      
      console.log('Creating map at:', center, 'zoom:', zoom);
      
      MapManager.map = L.map('map', {
        center: center,
        zoom: zoom,
        zoomControl: true,
        preferCanvas: false
      });
      
      console.log('Map created:', MapManager.map);
      
      // Use OpenStreetMap as primary (most reliable)
      MapManager.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        subdomains: ['a', 'b', 'c']
      });
      
      // Satellite layer (Esri)
      MapManager.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Esri World Imagery',
        maxZoom: 19
      });
      
      // Labels layer
      MapManager.labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 19,
        pane: 'overlayPane',
        subdomains: ['a', 'b', 'c']
      });
      
      // Start with satellite + labels
      MapManager.satelliteLayer.addTo(MapManager.map);
      MapManager.labelsLayer.addTo(MapManager.map);
      MapManager.currentLayer = MapManager.satelliteLayer;
      const toggleSatelliteBtn = document.getElementById('toggleSatellite');
      if (toggleSatelliteBtn) toggleSatelliteBtn.textContent = 'Map';
      
      // Invalidate size
      MapManager.map.invalidateSize();
      
      MapManager.map.whenReady(() => {
        console.log('Map is ready!');
        if (typeof LandPlotting !== 'undefined') { LandPlotting.getAllPlots().forEach(plot => MapManager.displayPlot(plot)); }
        MapManager.map.invalidateSize();
      });
      
      // Force invalidate after a delay
      setTimeout(() => {
        if (MapManager.map) {
          MapManager.map.invalidateSize();
          console.log('Map size invalidated after delay');
        }
      }, 500);
      
    } catch (error) {
      console.error('Error creating map:', error);
      console.error(error.stack);
    }
  },

  setupPlotting: () => {
    // Initialize plotting layers
    MapManager.plotMarkersLayer = new L.FeatureGroup();
    MapManager.plotLinesLayer = new L.FeatureGroup();
    MapManager.plotAreaLayer = new L.FeatureGroup();
    MapManager.obstacleMarkersLayer = new L.FeatureGroup();
    MapManager.poiMarkersLayer = new L.FeatureGroup();
    
    MapManager.map.addLayer(MapManager.plotMarkersLayer);
    MapManager.map.addLayer(MapManager.plotLinesLayer);
    MapManager.map.addLayer(MapManager.plotAreaLayer);
    MapManager.map.addLayer(MapManager.obstacleMarkersLayer);
    MapManager.map.addLayer(MapManager.poiMarkersLayer);
  },

  setupEventListeners: () => {
    // Prevent duplicate event listeners (memory leak fix)
    if (MapManager._listenersSetup) {
      return;
    }
    MapManager._listenersSetup = true;
    
    // Plotting buttons
    const startBtn = document.getElementById('startPlotting');
    const finishBtn = document.getElementById('finishPlotting');
    const cancelBtn = document.getElementById('cancelPlotting');
    const clearBtn = document.getElementById('clearAllPlots');
    const undoBtn = document.getElementById('undoLastPoint');
    
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        if (typeof LandPlotting !== 'undefined') {
          LandPlotting.startPlotting();
        }
      });
    }
    
    if (finishBtn) {
      finishBtn.addEventListener('click', () => {
        if (typeof LandPlotting !== 'undefined') {
          LandPlotting.finishPlotting();
        }
      });
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        if (typeof LandPlotting !== 'undefined') {
          LandPlotting.cancelPlotting();
        }
      });
    }
    
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (typeof LandPlotting !== 'undefined') {
          LandPlotting.clearAllPlots();
        }
      });
    }
    
    if (undoBtn) {
      undoBtn.addEventListener('click', () => {
        if (typeof LandPlotting !== 'undefined') {
          LandPlotting.undo();
        }
      });
    }
    
    // Obstacle marking
    const markHouseBtn = document.getElementById('markHouse');
    const obstacleTypeSelect = document.getElementById('obstacleType');
    const markPoiBtn = document.getElementById('markPoi');
    const poiTypeSelect = document.getElementById('poiType');
    const finishObstaclesBtn = document.getElementById('finishObstacleMarking');
    const skipObstaclesBtn = document.getElementById('skipObstacles');
    const readjustBtn = document.getElementById('readjustPlotting');
    
    if (markHouseBtn) {
      markHouseBtn.addEventListener('click', () => {
        MapManager.enterObstacleMarkingMode();
      });
    }

    if (obstacleTypeSelect) {
      obstacleTypeSelect.addEventListener('change', () => {
        const type = obstacleTypeSelect.value || 'house';
        if (typeof LandPlotting !== 'undefined') {
          MapManager.setObstacleMarkingUI(LandPlotting.isMarkingObstacles, type);
        } else {
          MapManager.setObstacleMarkingUI(false, type);
        }
      });
    }

    if (markPoiBtn) {
      markPoiBtn.addEventListener('click', () => {
        MapManager.enterPoiMarkingMode();
      });
    }

    if (poiTypeSelect) {
      poiTypeSelect.addEventListener('change', () => {
        const type = poiTypeSelect.value || 'garden';
        if (typeof LandPlotting !== 'undefined') {
          MapManager.setPoiMarkingUI(LandPlotting.isMarkingPois, type);
        } else {
          MapManager.setPoiMarkingUI(false, type);
        }
      });
    }
    
    if (finishObstaclesBtn) {
      finishObstaclesBtn.addEventListener('click', () => {
        if (typeof LandPlotting !== 'undefined') {
          LandPlotting.finishObstacleMarking();
        }
      });
    }
    
    if (skipObstaclesBtn) {
      skipObstaclesBtn.addEventListener('click', () => {
        if (typeof LandPlotting !== 'undefined') {
          LandPlotting.skipObstacles();
        }
      });
    }

    if (readjustBtn) {
      readjustBtn.addEventListener('click', () => {
        if (typeof LandPlotting !== 'undefined') {
          LandPlotting.readjustLastPlot();
        }
      });
    }
    
    // Map controls
    const toggleSatelliteBtn = document.getElementById('toggleSatellite');
    if (toggleSatelliteBtn) {
      toggleSatelliteBtn.addEventListener('click', () => {
        MapManager.toggleSatellite();
      });
    }
    
    const measurementUnit = document.getElementById('measurementUnit');
    if (measurementUnit) {
      measurementUnit.addEventListener('change', () => {
        MapManager.updateAllMeasurements();
      });
    }

    const addressSearchBtn = document.getElementById('searchAddress');
    const addressSearchInput = document.getElementById('addressSearch');
    if (addressSearchBtn) {
      addressSearchBtn.addEventListener('click', () => {
        MapManager.searchAddress();
      });
    }
    if (addressSearchInput) {
      addressSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          MapManager.searchAddress();
        }
      });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && typeof LandPlotting !== 'undefined' && LandPlotting.isPlotting) {
        LandPlotting.cancelPlotting();
      } else if (e.key === 'Enter' && typeof LandPlotting !== 'undefined' && LandPlotting.isPlotting) {
        if (LandPlotting.currentPlot && LandPlotting.currentPlot.points.length >= 3) {
          LandPlotting.finishPlotting();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        if (typeof LandPlotting !== 'undefined' && LandPlotting.isPlotting) {
          LandPlotting.undo();
        }
      }
    });
  },

  toggleSatellite: () => {
    const toggleBtn = document.getElementById('toggleSatellite');
    if (MapManager.isSatellite) {
      MapManager.map.removeLayer(MapManager.satelliteLayer);
      MapManager.streetLayer.addTo(MapManager.map);
      MapManager.currentLayer = MapManager.streetLayer;
      MapManager.isSatellite = false;
      if (toggleBtn) toggleBtn.textContent = 'Satellite';
    } else {
      MapManager.map.removeLayer(MapManager.streetLayer);
      MapManager.satelliteLayer.addTo(MapManager.map);
      MapManager.currentLayer = MapManager.satelliteLayer;
      MapManager.isSatellite = true;
      if (toggleBtn) toggleBtn.textContent = 'Map';
    }
    // Keep labels layer visible
    if (!MapManager.map.hasLayer(MapManager.labelsLayer)) {
      MapManager.labelsLayer.addTo(MapManager.map);
    }
  },

  updateMeasurement: (layer) => {
    MapManager.updateAllMeasurements();
  },

  _measurementDebounceTimer: null,
  
  updateAllMeasurements: () => {
    if (typeof LandPlotting === 'undefined') return;
    
    // Debounce measurement updates for performance
    clearTimeout(MapManager._measurementDebounceTimer);
    MapManager._measurementDebounceTimer = setTimeout(() => {
      MapManager._updateAllMeasurementsImmediate();
    }, 150);
  },
  
  _updateAllMeasurementsImmediate: () => {
    if (typeof LandPlotting === 'undefined') return;
    
    const latestPlot = LandPlotting.getLatestPlot?.();
    const currentPlot = LandPlotting.getCurrentPlot();
    const unitEl = document.getElementById('measurementUnit');
    const unit = unitEl?.value || 'acres';
    
    const hasCurrentArea = LandPlotting.isPlotting && currentPlot && currentPlot.area;
    const hasLatestArea = !LandPlotting.isPlotting && latestPlot && latestPlot.area;
    if (!hasCurrentArea && !hasLatestArea) {
      const measurementValue = document.getElementById('measurementValue');
      if (measurementValue) measurementValue.textContent = '0';
      const measurementUnitLabel = document.getElementById('measurementUnitLabel');
      if (measurementUnitLabel) measurementUnitLabel.textContent = unit;
      return;
    }
    
    let totalAreaSqMeters = 0;
    let totalPerimeterFeet = 0;
    
    if (hasCurrentArea) {
      totalAreaSqMeters = currentPlot.area.sqmeters || 0;
      totalPerimeterFeet = currentPlot.perimeter?.feet || 0;
    } else if (hasLatestArea) {
      totalAreaSqMeters = latestPlot.area.sqmeters || 0;
      totalPerimeterFeet = latestPlot.perimeter?.feet || 0;
    }
    
    if (totalAreaSqMeters > 0) {
      // Convert total to selected unit
      const totalArea = {
        sqmeters: totalAreaSqMeters,
        sqft: totalAreaSqMeters * 10.764,
        acres: totalAreaSqMeters * 0.000247105,
        hectares: totalAreaSqMeters * 0.0001
      };
      
      const areaValue = totalArea[unit] || 0;
      const measurementValue = document.getElementById('measurementValue');
      const measurementUnitLabel = document.getElementById('measurementUnitLabel');
      
      if (measurementValue) {
        if (unit === 'acres') {
          measurementValue.textContent = areaValue.toFixed(2);
        } else if (unit === 'sqft') {
          measurementValue.textContent = areaValue.toLocaleString();
        } else {
          measurementValue.textContent = areaValue.toFixed(2);
        }
      }
      
      if (measurementUnitLabel) {
        measurementUnitLabel.textContent = unit;
      }
      
      // Update quote form if it exists
      const quoteArea = document.getElementById('quoteArea');
      const quoteAreaUnit = document.getElementById('quoteAreaUnit');
      if (quoteArea && quoteArea.value !== String(areaValue)) quoteArea.value = areaValue;
      if (quoteAreaUnit && quoteAreaUnit.value !== unit) quoteAreaUnit.value = unit;
      
      // Auto-trigger coverage calculation and quote update
      if (typeof CoverageCalculator !== 'undefined' && (hasCurrentArea || hasLatestArea)) {
        const activeCoords = LandPlotting.getActivePlotCoordinates?.();
        if (activeCoords) {
          MapManager.autoCalculateCoverage(activeCoords, totalArea);
        }
      }
      
      // Update quote display if form is visible
      if (typeof Quote !== 'undefined' && Quote.updateQuoteDisplay) {
        Quote.updateQuoteDisplay();
      }
    }
  },
  
  getAllPlotsBounds: () => {
    if (typeof LandPlotting === 'undefined') return null;
    const currentPlot = LandPlotting.getCurrentPlot();
    const latestPlot = LandPlotting.getLatestPlot?.();
    if (!currentPlot && !latestPlot) return null;
    
    const allPoints = [];
    if (LandPlotting.isPlotting && currentPlot) {
      currentPlot.points.forEach(point => {
        allPoints.push([point.lat, point.lng]);
      });
    } else if (latestPlot) {
      latestPlot.points.forEach(point => {
        allPoints.push([point.lat, point.lng]);
      });
    }
    
    if (allPoints.length === 0) return null;
    
    return L.latLngBounds(allPoints);
  },

  autoCalculateCoverage: (coords, area) => {
    // Auto-calculate coverage when area is updated
    if (typeof CoverageCalculator === 'undefined') return;
    
    const areaValueRaw = document.getElementById('quoteArea')?.value;
    const areaValue = parseFloat(areaValueRaw) || 0;
    const areaUnit = document.getElementById('quoteAreaUnit')?.value || 'acres';
    
    if (areaValue <= 0) return;
    
    // Convert area to square meters
    let areaSqMeters = 0;
    if (areaUnit === 'acres') {
      areaSqMeters = areaValue * 4046.86;
    } else if (areaUnit === 'sqft') {
      areaSqMeters = areaValue * 0.092903;
    } else if (areaUnit === 'sqmeters') {
      areaSqMeters = areaValue;
    } else if (areaUnit === 'hectares') {
      areaSqMeters = areaValue * 10000;
    }
    
    // Get current coverage parameters
    const altitudeEl = document.getElementById('coverageAltitude');
    const frontOverlapEl = document.getElementById('coverageFrontOverlap');
    const sideOverlapEl = document.getElementById('coverageSideOverlap');
    
    const altitudeRaw = altitudeEl?.value;
    const altitude = altitudeEl ? parseFloat(altitudeRaw) : (CONFIG.droneSpecs?.defaultAltitude || 60);
    const frontOverlapRaw = frontOverlapEl?.value;
    const frontOverlap = frontOverlapEl ? parseFloat(frontOverlapRaw) : (CONFIG.coverageDefaults?.frontOverlap || 70);
    const sideOverlapRaw = sideOverlapEl?.value;
    const sideOverlap = sideOverlapEl ? parseFloat(sideOverlapRaw) : (CONFIG.coverageDefaults?.sideOverlap || 60);
    const packageOptions = (typeof Quote !== 'undefined' && Quote.getSelectedPackageOptions)
      ? Quote.getSelectedPackageOptions()
      : {};
    const activePlot = (typeof LandPlotting !== 'undefined' && LandPlotting.getActivePlot)
      ? LandPlotting.getActivePlot()
      : null;
    const photoPlan = (typeof Quote !== 'undefined' && Quote.getPhotoPlan)
      ? Quote.getPhotoPlan(activePlot)
      : null;
    
    // Calculate coverage
    const result = CoverageCalculator.calculate(
      coords,
      areaSqMeters,
      altitude,
      frontOverlap,
      sideOverlap,
      CONFIG.droneSpecs,
      {
        ...packageOptions,
        landPhotos: photoPlan?.landPhotos ?? packageOptions.landPhotos,
        topDownShots: photoPlan?.topDownShots ?? packageOptions.topDownShots
      }
    );
    
    if (result) {
      const totalPhotos = Number.isFinite(photoPlan?.totalPhotos)
        ? photoPlan.totalPhotos
        : result.photos.recommended;
      if (photoPlan && typeof Quote !== 'undefined') {
        Quote.lastPhotoPlan = photoPlan;
        if (Quote.updatePackageSummary) {
          Quote.updatePackageSummary(photoPlan);
        }
      }
      // Update photo count in quote form
      const photoCountEl = document.getElementById('quotePhotoCount');
      if (photoCountEl) {
        photoCountEl.value = totalPhotos;
      }
      const packageCountEl = document.getElementById('quotePackagePhotoCount');
      if (packageCountEl) {
        packageCountEl.textContent = totalPhotos.toLocaleString();
      }
      
      // Update price if base price is set
      if (typeof Quote !== 'undefined' && document.getElementById('quoteBasePrice')?.value) {
        Quote.calculatePrice();
      }
    }
  },


  setupCoordinateDisplay: () => {
    MapManager.coordinateDisplay = L.control({ position: 'bottomright' });
    MapManager.coordinateDisplay.onAdd = () => {
      const div = L.DomUtil.create('div', 'coordinate-display');
      div.innerHTML = '<span id="coordinateText">Move mouse over map</span>';
      L.DomEvent.disableClickPropagation(div);
      return div;
    };
    MapManager.coordinateDisplay.addTo(MapManager.map);

    MapManager.map.on('mousemove', (e) => {
      const lat = e.latlng.lat;
      const lng = e.latlng.lng;
      const coordText = document.getElementById('coordinateText');
      if (coordText) {
        coordText.textContent = Measurements.formatCoordinate(lat, lng, 'decimal');
      }
    });
  },


  updateFlightPath: (flightPath) => {
    const hasLines = Array.isArray(flightPath?.waypoints) && flightPath.waypoints.length > 0;
    const hasShots = Array.isArray(flightPath?.shotPoints) && flightPath.shotPoints.length > 0;
    const hasOrbits = Array.isArray(flightPath?.orbits) && flightPath.orbits.length > 0;
    if (!hasLines && !hasShots && !hasOrbits) return;
    MapManager.lastFlightPath = flightPath;
    if (MapManager.shouldShowFlightPath && !MapManager.shouldShowFlightPath()) {
      MapManager.clearFlightPath();
      MapManager.showFlightPath = false;
      return;
    }
    
    // Remove existing flight path
    if (MapManager.flightPathLayer) {
      MapManager.map.removeLayer(MapManager.flightPathLayer);
    }
    
    const flightPane = MapManager.map.getPane('flightPath') || MapManager.map.createPane('flightPath');
    if (flightPane) {
      flightPane.style.zIndex = 430;
      flightPane.style.pointerEvents = 'none';
    }

    MapManager.flightPathLayer = new L.FeatureGroup();
    
    // Flight lines hidden for a cleaner Step 3 view (dots and orbits only).

    const shotPoints = Array.isArray(flightPath.shotPoints) ? flightPath.shotPoints : [];
    shotPoints.filter(shot => shot.type === 'top-down').forEach((shot) => {
      const marker = L.circleMarker([shot.lat, shot.lng], {
        radius: 6,
        fillColor: '#38bdf8',
        color: '#0f172a',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.98,
        pane: 'flightPath'
      });
      MapManager.flightPathLayer.addLayer(marker);
    });

    let propertyOrbit = flightPath.propertyOrbit;
    if (typeof LandPlotting !== 'undefined' && LandPlotting.getPropertyOrbit) {
      const activePlot = LandPlotting.getActivePlot?.();
      const shotCount = Number.isFinite(flightPath.angledShots)
        ? flightPath.angledShots
        : Number(propertyOrbit?.shots);
      if (activePlot && Number.isFinite(shotCount) && shotCount > 0) {
        const recalculated = LandPlotting.getPropertyOrbit(activePlot, shotCount);
        if (recalculated) {
          propertyOrbit = recalculated;
        }
      }
    }
    if (propertyOrbit && Array.isArray(propertyOrbit.points) && propertyOrbit.points.length > 0) {
      const orbitLatLngs = propertyOrbit.points.map(point => [point[0], point[1]]);
      if (orbitLatLngs.length > 1) {
        const closed = [...orbitLatLngs, orbitLatLngs[0]];
        const orbitLine = L.polyline(closed, {
          color: '#0ea5e9',
          weight: 1.5,
          opacity: 0.55,
          dashArray: '2 6',
          lineCap: 'round',
          lineJoin: 'round',
          pane: 'flightPath'
        });
        MapManager.flightPathLayer.addLayer(orbitLine);
      }
      
      propertyOrbit.points.forEach((point) => {
        const marker = L.circleMarker([point[0], point[1]], {
          radius: 6,
          fillColor: '#0ea5e9',
          color: '#0f172a',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.9,
          pane: 'flightPath'
        });
        MapManager.flightPathLayer.addLayer(marker);
      });
    }

    const orbits = Array.isArray(flightPath.orbits) ? flightPath.orbits : [];
    orbits.forEach((orbit) => {
      if (!orbit.points || orbit.points.length === 0) return;
      const orbitLatLngs = orbit.points.map(point => [point[0], point[1]]);
      const closed = orbitLatLngs.length > 1 ? [...orbitLatLngs, orbitLatLngs[0]] : orbitLatLngs;
      const orbitLine = L.polyline(closed, {
        color: '#10b981',
        weight: 2,
        opacity: 0.6,
        dashArray: '4 6',
        lineCap: 'round',
        lineJoin: 'round',
        pane: 'flightPath'
      });
      MapManager.flightPathLayer.addLayer(orbitLine);
      
      // Draw angle indicators for building shots
      if (orbit.shotDetails && Array.isArray(orbit.shotDetails)) {
        orbit.shotDetails.forEach((shot, index) => {
          if (!shot.position || !orbit.center) return;
          
          // Draw line from shot position to building center
          const angleLine = L.polyline([
            [shot.position.lat, shot.position.lng],
            [orbit.center.lat, orbit.center.lng]
          ], {
            color: '#ef4444',
            weight: 1.5,
            opacity: 0.5,
            dashArray: '2 4',
            pane: 'flightPath'
          });
          MapManager.flightPathLayer.addLayer(angleLine);
          
          // Add angle marker with tooltip
          const angleMarker = L.marker([shot.position.lat, shot.position.lng], {
            icon: L.divIcon({
              className: 'angle-marker',
              html: `<div class="angle-marker-inner" title="Angle: ${shot.angle.pitch.toFixed(1)}°">${shot.angle.pitch.toFixed(0)}°</div>`,
              iconSize: [24, 24],
              iconAnchor: [12, 12]
            }),
            pane: 'flightPath'
          });
          
          // Create detailed tooltip
          const tooltipContent = `
            <div class="shot-prediction-tooltip">
              <strong>${orbit.name || orbit.type}</strong><br>
              Camera Angle: ${shot.angle.pitch.toFixed(1)}° from horizontal<br>
              Distance: ${shot.fieldOfView.distanceFeet.toFixed(0)} ft<br>
              Bearing: ${shot.compassBearing.toFixed(0)}°<br>
              FOV: ${shot.fieldOfView.widthFeet.toFixed(0)}' × ${shot.fieldOfView.heightFeet.toFixed(0)}'<br>
              ${shot.willCapture.buildingVisible ? '✓ Building visible' : '✗ Building not visible'}
            </div>
          `;
          angleMarker.bindTooltip(tooltipContent, { permanent: false, direction: 'top' });
          MapManager.flightPathLayer.addLayer(angleMarker);
        });
      }
    });
    
    MapManager.map.addLayer(MapManager.flightPathLayer);
    MapManager.showFlightPath = true;
    
    // Fit bounds to show entire flight path
    if (MapManager.flightPathLayer.getBounds().isValid()) {
      MapManager.map.fitBounds(MapManager.flightPathLayer.getBounds(), { padding: [50, 50] });
    }
  },

  getFlightLineBudget: (flightPath) => {
    const packageId = flightPath?.packageId;
    if (packageId === 'economy') return 3;
    if (packageId === 'standard') return 4;
    if (packageId === 'premium') return 5;
    const landPhotos = Number.isFinite(flightPath?.landPhotos) ? flightPath.landPhotos : 0;
    if (landPhotos > 0 && landPhotos <= 20) return 3;
    if (landPhotos > 0 && landPhotos <= 35) return 4;
    if (landPhotos > 35) return 5;
    return 4;
  },

  getFlightLineStyle: (flightPath) => {
    const packageId = flightPath?.packageId;
    if (packageId === 'economy') {
      return { weight: 1.5, opacity: 0.45, dashArray: '12 14' };
    }
    if (packageId === 'premium') {
      return { weight: 2.5, opacity: 0.75, dashArray: '4 6' };
    }
    return { weight: 2, opacity: 0.6, dashArray: '8 10' };
  },

  shouldShowFlightPath: () => {
    const step3 = document.getElementById('workflowStep3');
    return !!(step3 && step3.classList.contains('active'));
  },

  refreshFlightPath: () => {
    if (!MapManager.lastFlightPath) {
      MapManager.clearFlightPath();
      return;
    }
    if (MapManager.shouldShowFlightPath()) {
      MapManager.updateFlightPath(MapManager.lastFlightPath);
    } else {
      MapManager.clearFlightPath();
    }
  },

  toggleFlightPath: () => {
    MapManager.showFlightPath = !MapManager.showFlightPath;
    if (MapManager.flightPathLayer) {
      if (MapManager.showFlightPath) {
        MapManager.map.addLayer(MapManager.flightPathLayer);
      } else {
        MapManager.map.removeLayer(MapManager.flightPathLayer);
      }
    }
  },

  clearFlightPath: () => {
    if (MapManager.flightPathLayer) {
      MapManager.map.removeLayer(MapManager.flightPathLayer);
      MapManager.flightPathLayer = null;
      MapManager.showFlightPath = false;
    }
  },

  enterPlottingMode: () => {
    MapManager.map.on('click', MapManager.handlePlottingClick);
    MapManager.map.on('mousemove', MapManager.handlePlottingMouseMove);
    MapManager.map.getContainer().style.cursor = 'crosshair';
  },

  exitPlottingMode: () => {
    MapManager.map.off('click', MapManager.handlePlottingClick);
    MapManager.map.off('mousemove', MapManager.handlePlottingMouseMove);
    MapManager.map.getContainer().style.cursor = '';
    if (MapManager.previewLine) {
      MapManager.map.removeLayer(MapManager.previewLine);
      MapManager.previewLine = null;
    }
  },

  handlePlottingClick: (e) => {
    if (typeof LandPlotting === 'undefined' || !LandPlotting.isPlotting) return;
    
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    LandPlotting.addPoint(lat, lng);
  },

  handlePlottingMouseMove: (e) => {
    if (typeof LandPlotting === 'undefined' || !LandPlotting.isPlotting || !LandPlotting.currentPlot) return;
    
    const points = LandPlotting.currentPlot.points;
    if (points.length === 0) return;
    
    const lastPoint = points[points.length - 1];
    const currentLat = e.latlng.lat;
    const currentLng = e.latlng.lng;
    
    // Update preview line
    if (MapManager.previewLine) {
      MapManager.map.removeLayer(MapManager.previewLine);
    }
    
    MapManager.previewLine = L.polyline(
      [[lastPoint.lat, lastPoint.lng], [currentLat, currentLng]],
      { color: '#999', weight: 2, dashArray: '5, 5', opacity: 0.5 }
    );
    MapManager.previewLine.addTo(MapManager.map);
  },

  addPlotPoint: (lat, lng, index) => {
    const isStart = index === 0;
    const marker = MapManager.createPointMarker(lat, lng, index, isStart, false);
    
    MapManager.currentPlotMarkers.push(marker);
    MapManager.plotMarkersLayer.addLayer(marker);
    
    // Make marker draggable
    marker.draggable = true;
    marker.on('dragend', (e) => {
      const newLat = e.target.getLatLng().lat;
      const newLng = e.target.getLatLng().lng;
      if (typeof LandPlotting !== 'undefined') {
        LandPlotting.movePoint(index, newLat, newLng);
      }
    });
    
    // Update connecting lines
    if (MapManager.currentPlotMarkers.length > 1) {
      const prevMarker = MapManager.currentPlotMarkers[MapManager.currentPlotMarkers.length - 2];
      const prevLat = prevMarker.getLatLng().lat;
      const prevLng = prevMarker.getLatLng().lng;
      
      const line = L.polyline(
        [[prevLat, prevLng], [lat, lng]],
        { color: '#3388ff', weight: 2 }
      );
      
      // Add distance label
      const distance = Measurements.calculateDistance([prevLat, prevLng], [lat, lng]);
      const midLat = (prevLat + lat) / 2;
      const midLng = (prevLng + lng) / 2;
      
      const label = L.marker([midLat, midLng], {
        icon: L.divIcon({
          className: 'distance-label',
          html: `<div class="distance-label-text">${distance.feet.toFixed(0)} ft</div>`,
          iconSize: null
        })
      });
      
      MapManager.currentPlotLines.push({ line, label });
      MapManager.plotLinesLayer.addLayer(line);
      MapManager.plotLinesLayer.addLayer(label);
    }
    
    // Update area preview
    MapManager.updateAreaPreview();
  },

  createPointMarker: (lat, lng, index, isStart, isCurrent, draggable = true) => {
    let color = '#3388ff'; // Blue for intermediate
    let label = (index + 1).toString();
    
    if (isStart) {
      color = '#10b981'; // Green for start
      label = 'START';
    } else if (isCurrent) {
      color = '#f59e0b'; // Orange for current
    }
    
    return L.marker([lat, lng], {
      icon: L.divIcon({
        className: `plotting-marker ${isStart ? 'start' : isCurrent ? 'current' : 'point'}`,
        html: `<div class="plotting-marker-inner" style="background: ${color};">
          <span class="plotting-marker-label">${label}</span>
        </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      }),
      draggable: draggable
    });
  },

  updateAreaPreview: () => {
    if (typeof LandPlotting === 'undefined' || !LandPlotting.currentPlot) return;
    
    const points = LandPlotting.currentPlot.points;
    if (points.length < 3) {
      if (MapManager.currentAreaPolygon) {
        MapManager.plotAreaLayer.removeLayer(MapManager.currentAreaPolygon);
        MapManager.currentAreaPolygon = null;
      }
      return;
    }
    
    const coords = points.map(p => [p.lat, p.lng]);
    
    if (MapManager.currentAreaPolygon) {
      MapManager.plotAreaLayer.removeLayer(MapManager.currentAreaPolygon);
    }
    
    MapManager.currentAreaPolygon = L.polygon(coords, {
      color: '#3388ff',
      fillColor: '#3388ff',
      fillOpacity: 0.3,
      weight: 2
    });
    
    MapManager.plotAreaLayer.addLayer(MapManager.currentAreaPolygon);
  },

  updatePlotVisualization: (plot) => {
    if (!plot) return;
    
    // Clear current visualization
    MapManager.currentPlotMarkers.forEach(m => MapManager.plotMarkersLayer.removeLayer(m));
    MapManager.currentPlotLines.forEach(({ line, label }) => {
      MapManager.plotLinesLayer.removeLayer(line);
      MapManager.plotLinesLayer.removeLayer(label);
    });
    MapManager.currentPlotMarkers = [];
    MapManager.currentPlotLines = [];
    
    // Redraw all points and lines
    plot.points.forEach((point, index) => {
      MapManager.addPlotPoint(point.lat, point.lng, index);
    });
    
    MapManager.updateAreaPreview();
  },

  clearPlotVisualization: () => {
    MapManager.currentPlotMarkers.forEach(m => MapManager.plotMarkersLayer.removeLayer(m));
    MapManager.currentPlotLines.forEach(({ line, label }) => {
      MapManager.plotLinesLayer.removeLayer(line);
      MapManager.plotLinesLayer.removeLayer(label);
    });
    if (MapManager.currentAreaPolygon) {
      MapManager.plotAreaLayer.removeLayer(MapManager.currentAreaPolygon);
    }
    MapManager.currentPlotMarkers = [];
    MapManager.currentPlotLines = [];
    MapManager.currentAreaPolygon = null;
  },

  displayPlot: (plot) => {
    if (!plot || !plot.points || plot.points.length < 3) return;
    
    const coords = plot.points.map(p => [p.lat, p.lng]);
    
    // Draw polygon
    const polygon = L.polygon(coords, {
      color: plot.color || '#3388ff',
      fillColor: plot.color || '#3388ff',
      fillOpacity: 0.2,
      weight: 2
    });
    MapManager.plotAreaLayer.addLayer(polygon);
    
    // Draw points
    plot.points.forEach((point, index) => {
    const marker = MapManager.createPointMarker(point.lat, point.lng, index, index === 0, false, false);
    MapManager.plotMarkersLayer.addLayer(marker);
    });
    
    // Draw lines
    for (let i = 0; i < plot.points.length; i++) {
      const current = plot.points[i];
      const next = plot.points[(i + 1) % plot.points.length];
      
      const line = L.polyline(
        [[current.lat, current.lng], [next.lat, next.lng]],
        { color: plot.color || '#3388ff', weight: 2 }
      );
      MapManager.plotLinesLayer.addLayer(line);
    }
    
    // Display obstacles
    if (plot.obstacles) {
      plot.obstacles.forEach(obstacle => {
        MapManager.addObstacleMarker(obstacle);
      });
    }
    
    if (plot.pois) {
      plot.pois.forEach(poi => {
        MapManager.addPoiMarker(poi);
      });
    }
  },

  clearAllPlots: () => {
    MapManager.plotMarkersLayer.clearLayers();
    MapManager.plotLinesLayer.clearLayers();
    MapManager.plotAreaLayer.clearLayers();
    MapManager.obstacleMarkersLayer.clearLayers();
    MapManager.poiMarkersLayer.clearLayers();
    MapManager.currentPlotMarkers = [];
    MapManager.currentPlotLines = [];
    MapManager.currentAreaPolygon = null;
  },

  enterObstacleMarkingMode: (type) => {
    if (typeof LandPlotting === 'undefined') return;
    
    const plots = LandPlotting.getAllPlots();
    if (plots.length === 0) {
      alert('Please finish plotting your land first');
      return;
    }
    
    LandPlotting.isMarkingObstacles = true;
    LandPlotting.isMarkingPois = false;
    const currentPlot = plots[plots.length - 1];
    
    // Remove any existing click handlers first
    MapManager.map.off('click');
    
    const obstacleClickHandler = (e) => {
      if (!LandPlotting.isMarkingObstacles) {
        MapManager.map.off('click', obstacleClickHandler);
        return;
      }
      const typeSelect = document.getElementById('obstacleType');
      const selectedType = typeSelect?.value || type || 'house';
      const obstacle = LandPlotting.addObstacle(currentPlot.id, e.latlng.lat, e.latlng.lng, selectedType);
      MapManager.updateObstaclesList();
    };
    
    MapManager.map.on('click', obstacleClickHandler);
    MapManager.map.getContainer().style.cursor = 'crosshair';

    const activeType = document.getElementById('obstacleType')?.value || type || 'house';
    MapManager.setObstacleMarkingUI(true, activeType);
    if (typeof MapManager.setPoiMarkingUI === 'function') {
      const poiType = document.getElementById('poiType')?.value || 'garden';
      MapManager.setPoiMarkingUI(false, poiType);
    }
    MapManager.updateObstaclesList();
    
    LandPlotting.updateWorkflowSteps();
  },

  enterPoiMarkingMode: (type) => {
    if (typeof LandPlotting === 'undefined') return;
    
    const plots = LandPlotting.getAllPlots();
    if (plots.length === 0) {
      alert('Please finish plotting your land first');
      return;
    }
    
    LandPlotting.isMarkingPois = true;
    LandPlotting.isMarkingObstacles = false;
    const currentPlot = plots[plots.length - 1];
    
    MapManager.map.off('click');
    
    const poiClickHandler = (e) => {
      if (!LandPlotting.isMarkingPois) {
        MapManager.map.off('click', poiClickHandler);
        return;
      }
      const typeSelect = document.getElementById('poiType');
      const selectedType = typeSelect?.value || type || 'garden';
      LandPlotting.addPoi(currentPlot.id, e.latlng.lat, e.latlng.lng, selectedType);
      MapManager.updatePoisList();
    };
    
    MapManager.map.on('click', poiClickHandler);
    MapManager.map.getContainer().style.cursor = 'crosshair';
    
    const activeType = document.getElementById('poiType')?.value || type || 'garden';
    MapManager.setPoiMarkingUI(true, activeType);
    if (typeof MapManager.setObstacleMarkingUI === 'function') {
      const obstacleType = document.getElementById('obstacleType')?.value || 'house';
      MapManager.setObstacleMarkingUI(false, obstacleType);
    }
    MapManager.updatePoisList();
    
    LandPlotting.updateWorkflowSteps();
  },

  getObstacleIcon: (type) => {
    const normalized = String(type || 'house').toLowerCase();
    if (normalized === 'garage') return { type: 'garage', label: 'G' };
    if (normalized === 'shed') return { type: 'shed', label: 'S' };
    if (normalized === 'barn') return { type: 'barn', label: 'B' };
    if (normalized === 'dock') return { type: 'dock', label: 'D' };
    return { type: 'house', label: 'H' };
  },

  getPoiIcon: (type) => {
    const normalized = String(type || 'garden').toLowerCase();
    if (normalized === 'pool') return { type: 'pool', label: 'P' };
    if (normalized === 'pond') return { type: 'pond', label: 'P' };
    if (normalized === 'river') return { type: 'river', label: 'R' };
    if (normalized === 'driveway') return { type: 'driveway', label: 'D' };
    if (normalized === 'viewpoint') return { type: 'viewpoint', label: 'V' };
    if (normalized === 'trail') return { type: 'trail', label: 'T' };
    if (normalized === 'other') return { type: 'other', label: 'O' };
    return { type: 'garden', label: 'G' };
  },

  setObstacleMarkingUI: (isActive, type) => {
    const button = document.getElementById('markHouse');
    const hint = document.getElementById('markBuildingHint');
    const selectedType = type || document.getElementById('obstacleType')?.value || 'building';
    const label = typeof LandPlotting !== 'undefined' && LandPlotting.getObstacleLabelForType
      ? LandPlotting.getObstacleLabelForType(selectedType)
      : selectedType;
    if (button) {
      button.dataset.active = isActive ? 'true' : 'false';
      button.textContent = isActive ? `Click map to place ${label}` : 'Mark a Building';
    }
    if (hint) {
      if (isActive) {
        hint.textContent = `Click on the map to place a ${label}.`;
        hint.classList.remove('is-hidden');
      } else {
        hint.classList.add('is-hidden');
      }
    }
  },

  setPoiMarkingUI: (isActive, type) => {
    const button = document.getElementById('markPoi');
    const hint = document.getElementById('markPoiHint');
    const selectedType = type || document.getElementById('poiType')?.value || 'garden';
    const label = typeof LandPlotting !== 'undefined' && LandPlotting.getPoiLabelForType
      ? LandPlotting.getPoiLabelForType(selectedType)
      : selectedType;
    if (button) {
      button.dataset.active = isActive ? 'true' : 'false';
      button.textContent = isActive ? `Click map to place ${label}` : 'Mark a POI';
    }
    if (hint) {
      if (isActive) {
        hint.textContent = `Click on the map to place ${label}.`;
        hint.classList.remove('is-hidden');
      } else {
        hint.classList.add('is-hidden');
      }
    }
  },

  addObstacleMarker: (obstacle) => {
    const icon = MapManager.getObstacleIcon(obstacle.type);
    const marker = L.marker([obstacle.position.lat, obstacle.position.lng], {
      icon: L.divIcon({
        className: 'obstacle-marker obstacle-marker-' + obstacle.type,
        html: `<div class="obstacle-marker-inner obstacle-marker-${icon.type}"><span class="obstacle-marker-label">${icon.label}</span></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      }),
      draggable: true
    });
    
    marker.obstacleId = obstacle.id;
    marker.on('dragend', (e) => {
      // Update obstacle position
      const plot = LandPlotting.allPlots.find(p => p.id === obstacle.plotId);
      if (plot) {
        const obs = plot.obstacles.find(o => o.id === obstacle.id);
        if (obs) {
          obs.position.lat = e.target.getLatLng().lat;
          obs.position.lng = e.target.getLatLng().lng;
          LandPlotting.savePlots();
        }
      }
    });
    
    marker.on('contextmenu', (e) => {
      e.originalEvent.preventDefault();
      if (confirm('Delete this obstacle?')) {
        LandPlotting.removeObstacle(obstacle.plotId, obstacle.id);
        MapManager.updateObstaclesList();
      }
    });
    
    MapManager.obstacleMarkersLayer.addLayer(marker);
  },

  addPoiMarker: (poi) => {
    const icon = MapManager.getPoiIcon(poi.type);
    const marker = L.marker([poi.position.lat, poi.position.lng], {
      icon: L.divIcon({
        className: 'poi-marker poi-marker-' + poi.type,
        html: `<div class="poi-marker-inner poi-marker-${icon.type}"><span class="poi-marker-label">${icon.label}</span></div>`,
        iconSize: [22, 22],
        iconAnchor: [11, 11]
      }),
      draggable: true
    });
    
    marker.poiId = poi.id;
    marker.on('dragend', (e) => {
      const plot = LandPlotting.allPlots.find(p => p.id === poi.plotId);
      if (plot) {
        const target = plot.pois?.find(p => p.id === poi.id);
        if (target) {
          target.position.lat = e.target.getLatLng().lat;
          target.position.lng = e.target.getLatLng().lng;
          LandPlotting.savePlots();
        }
      }
    });
    
    marker.on('contextmenu', (e) => {
      e.originalEvent.preventDefault();
      if (confirm('Delete this POI?')) {
        LandPlotting.removePoi(poi.plotId, poi.id);
        MapManager.updatePoisList();
      }
    });
    
    MapManager.poiMarkersLayer.addLayer(marker);
  },

  removeObstacleMarker: (obstacleId) => {
    MapManager.obstacleMarkersLayer.eachLayer((layer) => {
      if (layer.obstacleId === obstacleId) {
        MapManager.obstacleMarkersLayer.removeLayer(layer);
      }
    });
  },

  removePoiMarker: (poiId) => {
    MapManager.poiMarkersLayer.eachLayer((layer) => {
      if (layer.poiId === poiId) {
        MapManager.poiMarkersLayer.removeLayer(layer);
      }
    });
  },

  updateObstaclesList: () => {
    if (typeof LandPlotting === 'undefined') return;
    const plots = LandPlotting.getAllPlots();
    if (plots.length === 0) return;
    
    const currentPlot = plots[plots.length - 1];
    const obstaclesList = document.getElementById('obstaclesList');
    if (!obstaclesList) return;
    
    if (!currentPlot.obstacles || currentPlot.obstacles.length === 0) {
      obstaclesList.innerHTML = '<p class="empty-state">No buildings marked yet</p>';
      return;
    }
    
    obstaclesList.innerHTML = currentPlot.obstacles.map((obs, index) => `
      <div class="obstacle-item">
        <input type="text" class="form-input obstacle-name-input" data-id="${obs.id}" value="${Utils.escapeHtml(obs.name || `${LandPlotting.getObstacleLabelForType(obs.type)} ${index + 1}`)}" aria-label="Building name">
        <button class="btn-icon delete-obstacle" data-id="${obs.id}">Delete</button>
      </div>
    `).join('');
    
    obstaclesList.querySelectorAll('.delete-obstacle').forEach(btn => {
      btn.addEventListener('click', () => {
        LandPlotting.removeObstacle(currentPlot.id, btn.dataset.id);
        MapManager.updateObstaclesList();
      });
    });

    obstaclesList.querySelectorAll('.obstacle-name-input').forEach(input => {
      const saveName = () => {
        const obstacle = currentPlot.obstacles.find(o => o.id === input.dataset.id);
        if (!obstacle) return;
        const nextName = input.value.trim();
        if (!nextName) {
          input.value = obstacle.name || `${LandPlotting.getObstacleLabelForType(obstacle.type)} ${currentPlot.obstacles.indexOf(obstacle) + 1}`;
          return;
        }
        LandPlotting.renameObstacle(currentPlot.id, obstacle.id, nextName);
        MapManager.updateObstaclesList();
      };
      input.addEventListener('blur', saveName);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
    });
  },

  updatePoisList: () => {
    if (typeof LandPlotting === 'undefined') return;
    const plots = LandPlotting.getAllPlots();
    if (plots.length === 0) return;
    
    const currentPlot = plots[plots.length - 1];
    const poiList = document.getElementById('poiList');
    if (!poiList) return;
    
    if (!currentPlot.pois || currentPlot.pois.length === 0) {
      poiList.innerHTML = '<p class="empty-state">No points of interest yet</p>';
      return;
    }
    
    poiList.innerHTML = currentPlot.pois.map((poi, index) => `
      <div class="obstacle-item">
        <input type="text" class="form-input poi-name-input" data-id="${poi.id}" value="${Utils.escapeHtml(poi.name || `${LandPlotting.getPoiLabelForType(poi.type)} ${index + 1}`)}" aria-label="POI name">
        <button class="btn-icon delete-poi" data-id="${poi.id}">Delete</button>
      </div>
    `).join('');
    
    poiList.querySelectorAll('.delete-poi').forEach(btn => {
      btn.addEventListener('click', () => {
        LandPlotting.removePoi(currentPlot.id, btn.dataset.id);
        MapManager.updatePoisList();
      });
    });

    poiList.querySelectorAll('.poi-name-input').forEach(input => {
      const saveName = () => {
        const poi = currentPlot.pois.find(p => p.id === input.dataset.id);
        if (!poi) return;
        const nextName = input.value.trim();
        if (!nextName) {
          input.value = poi.name || `${LandPlotting.getPoiLabelForType(poi.type)} ${currentPlot.pois.indexOf(poi) + 1}`;
          return;
        }
        LandPlotting.renamePoi(currentPlot.id, poi.id, nextName);
        MapManager.updatePoisList();
      };
      input.addEventListener('blur', saveName);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          input.blur();
        }
      });
    });
  },

  searchAddress: () => {
    const addressInput = document.getElementById('addressSearch');
    if (!addressInput || !addressInput.value.trim()) {
      alert('Please enter an address or place name');
      return;
    }

    const query = addressInput.value.trim();
    const searchBtn = document.getElementById('searchAddress');
    if (searchBtn) {
      searchBtn.disabled = true;
      searchBtn.textContent = 'Searching...';
    }

    // Use Nominatim geocoding API (free, no key required)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`;
    
    fetch(url, {
      headers: {
        'User-Agent': 'DroneQuoteMapper/1.0'
      }
    })
    .then(response => response.json())
    .then(data => {
      if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
      }

      if (!data || data.length === 0) {
        alert('No results found for: ' + query);
        return;
      }

      // Use first result
      const result = data[0];
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);

      // Update coordinate inputs
      const latInput = document.getElementById('coordinateLat');
      const lngInput = document.getElementById('coordinateLng');
      if (latInput) latInput.value = lat;
      if (lngInput) lngInput.value = lng;

      // Center map on result
      MapManager.map.setView([lat, lng], 15);

      // Add marker
      if (MapManager.addressMarker) {
        MapManager.map.removeLayer(MapManager.addressMarker);
      }
      MapManager.addressMarker = L.marker([lat, lng], {
        icon: L.icon({
          iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjRkY5ODAwIi8+Cjwvc3ZnPg==',
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        })
      });
      MapManager.addressMarker.addTo(MapManager.map);
      
      const displayName = result.display_name.split(',').slice(0, 3).join(',');
      MapManager.addressMarker.bindPopup(`<strong>${displayName}</strong><br>${result.display_name}`).openPopup();

      // Remove marker after 5 seconds
      setTimeout(() => {
        if (MapManager.addressMarker) {
          MapManager.map.removeLayer(MapManager.addressMarker);
          MapManager.addressMarker = null;
        }
      }, 5000);
    })
    .catch(error => {
      console.error('Geocoding error:', error);
      if (searchBtn) {
        searchBtn.disabled = false;
        searchBtn.textContent = 'Search';
      }
      alert('Error searching for address. Please try again.');
    });
  }
};
