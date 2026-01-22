const MapManager = {
  map: null,
  drawnItems: null,
  drawControl: null,
  satelliteLayer: null,
  streetLayer: null,
  labelsLayer: null,
  currentLayer: null,
  isSatellite: true,
  distanceMode: false,
  distancePoints: [],
  distanceLayer: null,
  gridLayer: null,
  showGrid: false,
  coordinateDisplay: null,
  flightPathLayer: null,
  showFlightPath: false,
  addressMarker: null,

  init: () => {
    MapManager.createMap();
    MapManager.setupDrawing();
    MapManager.setupEventListeners();
    MapManager.setupCoordinateDisplay();
  },

  createMap: () => {
    MapManager.map = L.map('map').setView([CONFIG.defaultCenter.lat, CONFIG.defaultCenter.lng], CONFIG.defaultZoom);
    
    MapManager.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Esri World Imagery',
      maxZoom: 19
    });
    
    MapManager.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'OpenStreetMap',
      maxZoom: 19
    });
    
    // Add labels layer for place names (works with both satellite and street views)
    MapManager.labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      maxZoom: 19,
      pane: 'overlayPane'
    });
    
    MapManager.satelliteLayer.addTo(MapManager.map);
    MapManager.labelsLayer.addTo(MapManager.map);
    MapManager.currentLayer = MapManager.satelliteLayer;
  },

  setupDrawing: () => {
    MapManager.drawnItems = new L.FeatureGroup();
    MapManager.map.addLayer(MapManager.drawnItems);
    
    const drawOptions = {
      draw: {
        polygon: { showArea: false },
        rectangle: { showArea: false },
        circle: { showArea: false },
        marker: false,
        polyline: false,
        circlemarker: false
      },
      edit: {
        featureGroup: MapManager.drawnItems,
        remove: true
      }
    };
    
    MapManager.drawControl = new L.Control.Draw(drawOptions);
    MapManager.map.addControl(MapManager.drawControl);
    
    MapManager.map.on(L.Draw.Event.CREATED, (e) => {
      const layer = e.layer;
      MapManager.drawnItems.addLayer(layer);
      MapManager.updateAllMeasurements();
      // Clear any existing flight path when new area is drawn
      MapManager.clearFlightPath();
    });
    
    MapManager.map.on(L.Draw.Event.EDITED, (e) => {
      MapManager.updateAllMeasurements();
    });
    
    MapManager.map.on(L.Draw.Event.DELETED, () => {
      MapManager.updateAllMeasurements();
    });
  },

  setupEventListeners: () => {
    document.getElementById('drawPolygon').addEventListener('click', () => {
      MapManager.exitDistanceMode();
      new L.Draw.Polygon(MapManager.map, MapManager.drawControl.options.draw.polygon).enable();
    });
    
    document.getElementById('drawRectangle').addEventListener('click', () => {
      MapManager.exitDistanceMode();
      new L.Draw.Rectangle(MapManager.map, MapManager.drawControl.options.draw.rectangle).enable();
    });
    
    document.getElementById('drawCircle').addEventListener('click', () => {
      MapManager.exitDistanceMode();
      new L.Draw.Circle(MapManager.map, MapManager.drawControl.options.draw.circle).enable();
    });
    
    document.getElementById('clearDrawings').addEventListener('click', () => {
      MapManager.drawnItems.clearLayers();
      MapManager.updateAllMeasurements();
      MapManager.exitDistanceMode();
      MapManager.clearFlightPath();
    });
    
    document.getElementById('toggleSatellite').addEventListener('click', () => {
      MapManager.toggleSatellite();
    });
    
    document.getElementById('measurementUnit').addEventListener('change', () => {
      MapManager.updateAllMeasurements();
      if (MapManager.distanceMode && MapManager.distancePoints.length === 2) {
        MapManager.updateDistanceDisplay();
      }
    });

    const distanceBtn = document.getElementById('drawDistance');
    if (distanceBtn) {
      distanceBtn.addEventListener('click', () => {
        MapManager.toggleDistanceMode();
      });
    }

    const gridBtn = document.getElementById('toggleGrid');
    if (gridBtn) {
      gridBtn.addEventListener('click', () => {
        MapManager.toggleGrid();
      });
    }

    const flightPathBtn = document.getElementById('toggleFlightPath');
    if (flightPathBtn) {
      flightPathBtn.addEventListener('click', () => {
        MapManager.toggleFlightPath();
      });
    }

    const coordInputBtn = document.getElementById('goToCoordinate');
    if (coordInputBtn) {
      coordInputBtn.addEventListener('click', () => {
        MapManager.goToCoordinate();
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
    const layers = MapManager.drawnItems.getLayers();
    const unit = document.getElementById('measurementUnit').value;
    
    if (layers.length === 0) {
      document.getElementById('currentMeasurement').textContent = '';
      document.getElementById('quoteArea').value = 0;
      return;
    }
    
    let totalAreaSqMeters = 0;
    let totalPerimeterFeet = 0;
    const individualAreas = [];
    
    layers.forEach((layer) => {
      const coords = Measurements.extractCoordinates(layer);
      const type = Measurements.getLayerType(layer);
      const area = Measurements.calculateArea(coords, type);
      const perimeter = Measurements.calculatePerimeter(coords);
      
      if (area) {
        totalAreaSqMeters += area.sqmeters || 0;
        totalPerimeterFeet += perimeter.feet || 0;
        individualAreas.push({
          area: area,
          perimeter: perimeter,
          type: type
        });
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
      
      const areaText = Measurements.formatArea(totalArea, unit);
      const perimeterText = `${totalPerimeterFeet.toFixed(0)} ft`;
      const countText = layers.length > 1 ? ` (${layers.length} areas)` : '';
      
      document.getElementById('currentMeasurement').innerHTML = 
        `<strong>Total Area:</strong> ${areaText}${countText}<br><strong>Total Perimeter:</strong> ${perimeterText}`;
      
      document.getElementById('quoteArea').value = totalArea[unit] || 0;
      document.getElementById('quoteAreaUnit').value = unit;
      
      // Auto-trigger coverage calculation with combined area
      if (typeof CoverageCalculator !== 'undefined') {
        // Use bounding box of all layers for coverage calculation
        const allBounds = MapManager.drawnItems.getBounds();
        if (allBounds.isValid()) {
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
    }
  },

  autoCalculateCoverage: (coords, area) => {
    // Only auto-calculate if CoverageCalculator is available
    if (typeof CoverageCalculator === 'undefined') {
      return;
    }
    
    const areaValue = parseFloat(document.getElementById('quoteArea').value) || 0;
    const areaUnit = document.getElementById('quoteAreaUnit').value;
    
    if (areaValue <= 0) {
      return;
    }
    
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
      
      // Update coverage results display if visible
      const coverageResults = document.getElementById('coverageResults');
      if (coverageResults && !coverageResults.classList.contains('is-hidden')) {
        const photosNeededEl = document.getElementById('coveragePhotosNeeded');
        const perPhotoEl = document.getElementById('coveragePerPhoto');
        const gsdEl = document.getElementById('coverageGSD');
        const flightTimeEl = document.getElementById('coverageFlightTime');
        const flightDistanceEl = document.getElementById('coverageFlightDistance');
        
        if (photosNeededEl) photosNeededEl.textContent = result.photos.recommended;
        if (perPhotoEl) perPhotoEl.textContent = `${result.coverage.widthFeet.toFixed(0)}' × ${result.coverage.heightFeet.toFixed(0)}'`;
        if (gsdEl) gsdEl.textContent = `${result.gsd.toFixed(2)} cm/pixel`;
        if (flightTimeEl) flightTimeEl.textContent = result.flightTime.formatted;
        if (flightDistanceEl && result.flightPath) {
          flightDistanceEl.textContent = 
            `${result.flightPath.totalDistanceFeet.toFixed(0)} ft (${result.flightPath.totalDistanceMiles.toFixed(2)} mi)`;
        }
      }
    }
  },

  displayBoundary: (boundary) => {
    MapManager.drawnItems.clearLayers();
    const coords = boundary.coordinates.map(c => [c[0], c[1]]);
    let layer;
    if (boundary.type === 'Polygon' || boundary.type === 'Rectangle') {
      layer = L.polygon(coords, { color: '#3388ff', fillColor: '#3388ff', fillOpacity: 0.2 });
    } else if (boundary.type === 'Circle') {
      const center = coords[0];
      const radius = turf.distance(turf.point([center[1], center[0]]), turf.point([coords[1][1], coords[1][0]]), { units: 'meters' });
      layer = L.circle(center, { radius: radius });
    }
    if (layer) {
      MapManager.drawnItems.addLayer(layer);
      MapManager.map.fitBounds(layer.getBounds());
    }
  },

  displayBoundaryComparison: (boundary1, boundary2) => {
    MapManager.drawnItems.clearLayers();
    const coords1 = boundary1.coordinates.map(c => [c[0], c[1]]);
    const coords2 = boundary2.coordinates.map(c => [c[0], c[1]]);
    const layer1 = L.polygon(coords1, { color: '#ff0000', fillColor: '#ff0000', fillOpacity: 0.3 });
    const layer2 = L.polygon(coords2, { color: '#00ff00', fillColor: '#00ff00', fillOpacity: 0.3 });
    MapManager.drawnItems.addLayer(layer1);
    MapManager.drawnItems.addLayer(layer2);
    const group = new L.FeatureGroup([layer1, layer2]);
    MapManager.map.fitBounds(group.getBounds());
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

  toggleDistanceMode: () => {
    MapManager.distanceMode = !MapManager.distanceMode;
    if (MapManager.distanceMode) {
      MapManager.distancePoints = [];
      if (MapManager.distanceLayer) {
        MapManager.map.removeLayer(MapManager.distanceLayer);
      }
      MapManager.distanceLayer = new L.FeatureGroup();
      MapManager.map.addLayer(MapManager.distanceLayer);
      MapManager.map.on('click', MapManager.handleDistanceClick);
      document.getElementById('drawDistance').classList.add('active');
      document.getElementById('currentMeasurement').innerHTML = '<strong>Distance Mode:</strong> Click two points on the map';
    } else {
      MapManager.exitDistanceMode();
    }
  },

  exitDistanceMode: () => {
    if (MapManager.distanceMode) {
      MapManager.distanceMode = false;
      MapManager.map.off('click', MapManager.handleDistanceClick);
      if (MapManager.distanceLayer) {
        MapManager.map.removeLayer(MapManager.distanceLayer);
        MapManager.distanceLayer = null;
      }
      MapManager.distancePoints = [];
      const btn = document.getElementById('drawDistance');
      if (btn) btn.classList.remove('active');
    }
  },

  handleDistanceClick: (e) => {
    if (!MapManager.distanceMode) return;
    
    const point = [e.latlng.lat, e.latlng.lng];
    MapManager.distancePoints.push(point);
    
    const marker = L.marker(e.latlng, {
      icon: L.divIcon({
        className: 'distance-marker',
        html: `<div style="background: #4CAF50; color: white; border-radius: 50%; width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold;">${MapManager.distancePoints.length}</div>`,
        iconSize: [20, 20]
      })
    });
    MapManager.distanceLayer.addLayer(marker);

    if (MapManager.distancePoints.length === 2) {
      MapManager.updateDistanceDisplay();
      MapManager.exitDistanceMode();
    }
  },

  updateDistanceDisplay: () => {
    if (MapManager.distancePoints.length !== 2) return;
    
    const distance = Measurements.calculateDistance(
      MapManager.distancePoints[0],
      MapManager.distancePoints[1]
    );
    const unit = document.getElementById('measurementUnit').value === 'acres' ? 'feet' : 
                 document.getElementById('measurementUnit').value === 'sqmeters' ? 'meters' : 'feet';
    const distanceText = Measurements.formatDistance(distance, unit);
    
    const line = L.polyline(
      [MapManager.distancePoints[0], MapManager.distancePoints[1]],
      { color: '#4CAF50', weight: 2, dashArray: '5, 5' }
    );
    MapManager.distanceLayer.addLayer(line);

    const midPoint = [
      (MapManager.distancePoints[0][0] + MapManager.distancePoints[1][0]) / 2,
      (MapManager.distancePoints[0][1] + MapManager.distancePoints[1][1]) / 2
    ];
    const label = L.marker(midPoint, {
      icon: L.divIcon({
        className: 'distance-label',
        html: `<div style="background: rgba(76, 175, 80, 0.9); color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; white-space: nowrap;">${distanceText}</div>`,
        iconSize: null
      })
    });
    MapManager.distanceLayer.addLayer(label);

    document.getElementById('currentMeasurement').innerHTML = 
      `<strong>Distance:</strong> ${distanceText}`;
  },

  toggleGrid: () => {
    MapManager.showGrid = !MapManager.showGrid;
    const btn = document.getElementById('toggleGrid');
    
    if (MapManager.showGrid) {
      if (!MapManager.gridLayer) {
        MapManager.gridLayer = L.layerGroup();
        MapManager.updateGrid();
        MapManager.map.on('moveend', MapManager.updateGrid);
        MapManager.map.on('zoomend', MapManager.updateGrid);
      }
      MapManager.map.addLayer(MapManager.gridLayer);
      if (btn) btn.classList.add('active');
    } else {
      if (MapManager.gridLayer) {
        MapManager.map.removeLayer(MapManager.gridLayer);
      }
      MapManager.map.off('moveend', MapManager.updateGrid);
      MapManager.map.off('zoomend', MapManager.updateGrid);
      if (btn) btn.classList.remove('active');
    }
  },

  updateGrid: () => {
    if (!MapManager.gridLayer || !MapManager.showGrid) return;
    
    MapManager.gridLayer.clearLayers();
    const bounds = MapManager.map.getBounds();
    const zoom = MapManager.map.getZoom();
    
    let interval;
    if (zoom >= 15) interval = 0.001;
    else if (zoom >= 12) interval = 0.01;
    else if (zoom >= 9) interval = 0.1;
    else interval = 1;
    
    for (let lat = Math.floor(bounds.getSouth() / interval) * interval; lat <= bounds.getNorth(); lat += interval) {
      const line = L.polyline(
        [[lat, bounds.getWest()], [lat, bounds.getEast()]],
        { color: '#666', weight: 1, opacity: 0.3, dashArray: '2, 2' }
      );
      MapManager.gridLayer.addLayer(line);
    }
    
    for (let lng = Math.floor(bounds.getWest() / interval) * interval; lng <= bounds.getEast(); lng += interval) {
      const line = L.polyline(
        [[bounds.getSouth(), lng], [bounds.getNorth(), lng]],
        { color: '#666', weight: 1, opacity: 0.3, dashArray: '2, 2' }
      );
      MapManager.gridLayer.addLayer(line);
    }
  },

  goToCoordinate: () => {
    const latInput = document.getElementById('coordinateLat');
    const lngInput = document.getElementById('coordinateLng');
    
    if (!latInput || !lngInput) return;
    
    const lat = parseFloat(latInput.value);
    const lng = parseFloat(lngInput.value);
    
    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      alert('Please enter valid coordinates (Lat: -90 to 90, Lng: -180 to 180)');
      return;
    }
    
    MapManager.map.setView([lat, lng], MapManager.map.getZoom());
    const marker = L.marker([lat, lng], {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHBhdGggZD0iTTEyIDJMMTMuMDkgOC4yNkwyMCA5TDEzLjA5IDE1Ljc0TDEyIDIyTDEwLjkxIDE1Ljc0TDQgOUwxMC45MSA4LjI2TDEyIDJaIiBmaWxsPSIjNENBRjUwIi8+Cjwvc3ZnPg==',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
      })
    });
    marker.addTo(MapManager.map);
    marker.bindPopup(`Coordinates: ${Measurements.formatCoordinate(lat, lng)}`).openPopup();
    
    setTimeout(() => {
      MapManager.map.removeLayer(marker);
    }, 3000);
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
