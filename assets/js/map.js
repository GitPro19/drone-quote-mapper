const MapManager = {
  map: null,
  drawnItems: null,
  drawControl: null,
  satelliteLayer: null,
  streetLayer: null,
  currentLayer: null,
  isSatellite: true,

  init: () => {
    MapManager.createMap();
    MapManager.setupDrawing();
    MapManager.setupEventListeners();
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
    
    MapManager.satelliteLayer.addTo(MapManager.map);
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
      MapManager.updateMeasurement(layer);
    });
    
    MapManager.map.on(L.Draw.Event.EDITED, (e) => {
      e.layers.eachLayer((layer) => {
        MapManager.updateMeasurement(layer);
      });
    });
    
    MapManager.map.on(L.Draw.Event.DELETED, () => {
      document.getElementById('currentMeasurement').textContent = '';
    });
  },

  setupEventListeners: () => {
    document.getElementById('drawPolygon').addEventListener('click', () => {
      new L.Draw.Polygon(MapManager.map, MapManager.drawControl.options.draw.polygon).enable();
    });
    
    document.getElementById('drawRectangle').addEventListener('click', () => {
      new L.Draw.Rectangle(MapManager.map, MapManager.drawControl.options.draw.rectangle).enable();
    });
    
    document.getElementById('drawCircle').addEventListener('click', () => {
      new L.Draw.Circle(MapManager.map, MapManager.drawControl.options.draw.circle).enable();
    });
    
    document.getElementById('clearDrawings').addEventListener('click', () => {
      MapManager.drawnItems.clearLayers();
      document.getElementById('currentMeasurement').textContent = '';
    });
    
    document.getElementById('toggleSatellite').addEventListener('click', () => {
      MapManager.toggleSatellite();
    });
    
    document.getElementById('measurementUnit').addEventListener('change', () => {
      const layers = MapManager.drawnItems.getLayers();
      if (layers.length > 0) {
        MapManager.updateMeasurement(layers[layers.length - 1]);
      }
    });
  },

  toggleSatellite: () => {
    if (MapManager.isSatellite) {
      MapManager.map.removeLayer(MapManager.satelliteLayer);
      MapManager.streetLayer.addTo(MapManager.map);
      MapManager.currentLayer = MapManager.streetLayer;
      MapManager.isSatellite = false;
      document.getElementById('toggleSatellite').textContent = 'Map';
    } else {
      MapManager.map.removeLayer(MapManager.streetLayer);
      MapManager.satelliteLayer.addTo(MapManager.map);
      MapManager.currentLayer = MapManager.satelliteLayer;
      MapManager.isSatellite = true;
      document.getElementById('toggleSatellite').textContent = 'Satellite';
    }
  },

  updateMeasurement: (layer) => {
    const coords = Measurements.extractCoordinates(layer);
    const type = Measurements.getLayerType(layer);
    const area = Measurements.calculateArea(coords, type);
    const perimeter = Measurements.calculatePerimeter(coords);
    const unit = document.getElementById('measurementUnit').value;
    
    if (area) {
      const areaText = Measurements.formatArea(area, unit);
      const perimeterText = `${perimeter.feet.toFixed(0)} ft`;
      document.getElementById('currentMeasurement').innerHTML = 
        `<strong>Area:</strong> ${areaText}<br><strong>Perimeter:</strong> ${perimeterText}`;
      
      document.getElementById('quoteArea').value = area[unit] || 0;
      document.getElementById('quoteAreaUnit').value = unit;
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
  }
};
