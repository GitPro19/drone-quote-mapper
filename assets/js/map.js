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
  addressMarker: null,
  
  // Plotting visualization
  plotMarkersLayer: null,
  plotLinesLayer: null,
  plotAreaLayer: null,
  previewLine: null,
  obstacleMarkersLayer: null,
  currentPlotMarkers: [],
  currentPlotLines: [],
  currentAreaPolygon: null,

  init: () => {
    // Delay slightly to ensure DOM is fully ready
    setTimeout(() => {
      MapManager.createMap();
      MapManager.setupPlotting();
      MapManager.setupEventListeners();
      MapManager.setupCoordinateDisplay();
    }, 50);
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
      
      // Invalidate size
      MapManager.map.invalidateSize();
      
      MapManager.map.whenReady(() => {
        console.log('Map is ready!');
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
    
    MapManager.map.addLayer(MapManager.plotMarkersLayer);
    MapManager.map.addLayer(MapManager.plotLinesLayer);
    MapManager.map.addLayer(MapManager.plotAreaLayer);
    MapManager.map.addLayer(MapManager.obstacleMarkersLayer);
  },

  setupEventListeners: () => {
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
    const finishObstaclesBtn = document.getElementById('finishObstacleMarking');
    const skipObstaclesBtn = document.getElementById('skipObstacles');
    
    if (markHouseBtn) {
      markHouseBtn.addEventListener('click', () => {
        MapManager.enterObstacleMarkingMode('house');
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
    if (MapManager.isSatellite) {
      MapManager.map.removeLayer(MapManager.satelliteLayer);
      MapManager.streetLayer.addTo(MapManager.map);
      MapManager.currentLayer = MapManager.streetLayer;
      MapManager.isSatellite = false;
      document.getElementById('toggleSatellite').textContent = 'Satellite';
    } else {
      MapManager.map.removeLayer(MapManager.streetLayer);
      MapManager.satelliteLayer.addTo(MapManager.map);
      MapManager.currentLayer = MapManager.satelliteLayer;
      MapManager.isSatellite = true;
      document.getElementById('toggleSatellite').textContent = 'Map';
    }
    // Keep labels layer visible
    if (!MapManager.map.hasLayer(MapManager.labelsLayer)) {
      MapManager.labelsLayer.addTo(MapManager.map);
    }
  },

  updateMeasurement: (layer) => {
    MapManager.updateAllMeasurements();
  },

  updateAllMeasurements: () => {
    if (typeof LandPlotting === 'undefined') return;
    
    const plots = LandPlotting.getAllPlots();
    const unit = document.getElementById('measurementUnit')?.value || 'acres';
    
    if (plots.length === 0) {
      const measurementValue = document.getElementById('measurementValue');
      const measurementUnit = document.getElementById('measurementUnit');
      if (measurementValue) measurementValue.textContent = '0';
      if (measurementUnit) measurementUnit.textContent = unit;
      return;
    }
    
    let totalAreaSqMeters = 0;
    let totalPerimeterFeet = 0;
    
    plots.forEach((plot) => {
      if (plot.area) {
        totalAreaSqMeters += plot.area.sqmeters || 0;
        totalPerimeterFeet += plot.perimeter?.feet || 0;
      }
    });
    
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
      if (quoteArea) quoteArea.value = areaValue;
      if (quoteAreaUnit) quoteAreaUnit.value = unit;
      
      // Auto-trigger coverage calculation and quote update
      if (typeof CoverageCalculator !== 'undefined' && plots.length > 0) {
        const allBounds = MapManager.getAllPlotsBounds();
        if (allBounds && allBounds.isValid()) {
          const combinedCoords = [
            [allBounds.getSouthWest().lat, allBounds.getSouthWest().lng],
            [allBounds.getNorthWest().lat, allBounds.getNorthWest().lng],
            [allBounds.getNorthEast().lat, allBounds.getNorthEast().lng],
            [allBounds.getSouthEast().lat, allBounds.getSouthEast().lng],
            [allBounds.getSouthWest().lat, allBounds.getSouthWest().lng]
          ];
          MapManager.autoCalculateCoverage(combinedCoords, totalArea);
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
    const plots = LandPlotting.getAllPlots();
    if (plots.length === 0) return null;
    
    const allPoints = [];
    plots.forEach(plot => {
      plot.points.forEach(point => {
        allPoints.push([point.lat, point.lng]);
      });
    });
    
    if (allPoints.length === 0) return null;
    
    return L.latLngBounds(allPoints);
  },

  autoCalculateCoverage: (coords, area) => {
    // Auto-calculate coverage when area is updated
    if (typeof CoverageCalculator === 'undefined') return;
    
    const areaValue = parseFloat(document.getElementById('quoteArea')?.value) || 0;
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
    
    const altitude = altitudeEl ? parseFloat(altitudeEl.value) : (CONFIG.droneSpecs?.defaultAltitude || 60);
    const frontOverlap = frontOverlapEl ? parseFloat(frontOverlapEl.value) : (CONFIG.coverageDefaults?.frontOverlap || 70);
    const sideOverlap = sideOverlapEl ? parseFloat(sideOverlapEl.value) : (CONFIG.coverageDefaults?.sideOverlap || 60);
    
    // Calculate coverage
    const result = CoverageCalculator.calculate(
      coords,
      areaSqMeters,
      altitude,
      frontOverlap,
      sideOverlap,
      CONFIG.droneSpecs
    );
    
    if (result) {
      // Update photo count in quote form
      const photoCountEl = document.getElementById('quotePhotoCount');
      if (photoCountEl) {
        photoCountEl.value = result.photos.recommended;
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
    if (!flightPath || !flightPath.waypoints) return;
    
    // Remove existing flight path
    if (MapManager.flightPathLayer) {
      MapManager.map.removeLayer(MapManager.flightPathLayer);
    }
    
    MapManager.flightPathLayer = new L.FeatureGroup();
    
    // Draw flight lines
    flightPath.waypoints.forEach((line, lineIndex) => {
      const latlngs = line.map(wp => [wp[0], wp[1]]);
      const polyline = L.polyline(latlngs, {
        color: '#FF9800',
        weight: 2,
        opacity: 0.7,
        dashArray: '10, 5'
      });
      MapManager.flightPathLayer.addLayer(polyline);
      
      // Add waypoint markers
      line.forEach((wp, wpIndex) => {
        const marker = L.circleMarker([wp[0], wp[1]], {
          radius: 4,
          fillColor: '#FF9800',
          color: '#fff',
          weight: 2,
          fillOpacity: 0.8
        });
        marker.bindTooltip(`Photo ${lineIndex * flightPath.photosPerLine + wpIndex + 1}`, {
          permanent: false,
          direction: 'top'
        });
        MapManager.flightPathLayer.addLayer(marker);
      });
    });
    
    MapManager.map.addLayer(MapManager.flightPathLayer);
    MapManager.showFlightPath = true;
    
    // Fit bounds to show entire flight path
    if (MapManager.flightPathLayer.getBounds().isValid()) {
      MapManager.map.fitBounds(MapManager.flightPathLayer.getBounds(), { padding: [50, 50] });
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

  createPointMarker: (lat, lng, index, isStart, isCurrent) => {
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
      draggable: true
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
      const marker = MapManager.createPointMarker(point.lat, point.lng, index, index === 0, false);
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
  },

  clearAllPlots: () => {
    MapManager.plotMarkersLayer.clearLayers();
    MapManager.plotLinesLayer.clearLayers();
    MapManager.plotAreaLayer.clearLayers();
    MapManager.obstacleMarkersLayer.clearLayers();
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
    const currentPlot = plots[plots.length - 1];
    
    // Remove any existing click handlers first
    MapManager.map.off('click');
    
    const obstacleClickHandler = (e) => {
      if (!LandPlotting.isMarkingObstacles) {
        MapManager.map.off('click', obstacleClickHandler);
        return;
      }
      const obstacle = LandPlotting.addObstacle(currentPlot.id, e.latlng.lat, e.latlng.lng, type);
      MapManager.updateObstaclesList();
    };
    
    MapManager.map.on('click', obstacleClickHandler);
    MapManager.map.getContainer().style.cursor = 'crosshair';
    
    LandPlotting.updateWorkflowSteps();
  },

  addObstacleMarker: (obstacle) => {
    const marker = L.marker([obstacle.position.lat, obstacle.position.lng], {
      icon: L.divIcon({
        className: 'obstacle-marker obstacle-marker-' + obstacle.type,
        html: `<div class="obstacle-marker-inner">🏠</div>`,
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

  removeObstacleMarker: (obstacleId) => {
    MapManager.obstacleMarkersLayer.eachLayer((layer) => {
      if (layer.obstacleId === obstacleId) {
        MapManager.obstacleMarkersLayer.removeLayer(layer);
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
      obstaclesList.innerHTML = '<p class="empty-state">No houses marked yet</p>';
      return;
    }
    
    obstaclesList.innerHTML = currentPlot.obstacles.map((obs, index) => `
      <div class="obstacle-item">
        <span>House ${index + 1}</span>
        <button class="btn-icon delete-obstacle" data-id="${obs.id}">Delete</button>
      </div>
    `).join('');
    
    obstaclesList.querySelectorAll('.delete-obstacle').forEach(btn => {
      btn.addEventListener('click', () => {
        LandPlotting.removeObstacle(currentPlot.id, btn.dataset.id);
        MapManager.updateObstaclesList();
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
