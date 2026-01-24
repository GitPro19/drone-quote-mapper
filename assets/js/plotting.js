const LandPlotting = {
  isPlotting: false,
  isMarkingObstacles: false,
  isMarkingPois: false,
  currentPlot: null,
  allPlots: [],
  selectedPointIndex: null,
  history: {
    undoStack: [],
    redoStack: []
  },

  init: () => {
    LandPlotting.loadPlots();
    LandPlotting.setupStepNavigation();
    LandPlotting.updateWorkflowSteps();

    // Display existing plots on map
    if (typeof MapManager !== 'undefined' && MapManager.map) {
      LandPlotting.getAllPlots().forEach(plot => {
        MapManager.displayPlot(plot);
      });
    }
  },

  setupStepNavigation: () => {
    const prevBtn = document.getElementById('prevStep');
    const nextBtn = document.getElementById('nextStep');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        const currentStep = LandPlotting.getCurrentStep();
        if (currentStep > 1) {
          LandPlotting.goToStep(currentStep - 1);
        }
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const currentStep = LandPlotting.getCurrentStep();
        if (currentStep < 3) {
          LandPlotting.goToStep(currentStep + 1);
        }
      });
    }
  },

  startPlotting: () => {
    if (LandPlotting.isPlotting) return;

    LandPlotting.isPlotting = true;
    LandPlotting.currentPlot = {
      id: 'plot_' + Date.now(),
      name: 'Plot ' + (LandPlotting.allPlots.length + 1),
      points: [],
      obstacles: [],
      pois: [],
      area: null,
      perimeter: null,
      createdAt: new Date().toISOString(),
      color: LandPlotting.getNextColor(),
      isComplete: false
    };

    LandPlotting.updateUI();
    if (typeof MapManager !== 'undefined') {
      MapManager.enterPlottingMode();
    }
  },

  addPoint: (lat, lng) => {
    if (!LandPlotting.isPlotting || !LandPlotting.currentPlot) return;

    const point = {
      lat: lat,
      lng: lng,
      order: LandPlotting.currentPlot.points.length,
      distance: 0
    };

    // Calculate distance from previous point
    if (LandPlotting.currentPlot.points.length > 0) {
      const prevPoint = LandPlotting.currentPlot.points[LandPlotting.currentPlot.points.length - 1];
      const distance = Measurements.calculateDistance(
        [prevPoint.lat, prevPoint.lng],
        [lat, lng]
      );
      point.distance = distance.feet;
    }

    LandPlotting.currentPlot.points.push(point);
    LandPlotting.saveToHistory('add', point);
    LandPlotting.updatePlotMeasurements();
    LandPlotting.updateUI();

    if (typeof MapManager !== 'undefined') {
      MapManager.addPlotPoint(lat, lng, LandPlotting.currentPlot.points.length - 1);
    }
  },

  removePoint: (index) => {
    if (!LandPlotting.isPlotting || !LandPlotting.currentPlot) return;
    if (index < 0 || index >= LandPlotting.currentPlot.points.length) return;

    const point = LandPlotting.currentPlot.points[index];
    LandPlotting.currentPlot.points.splice(index, 1);

    // Reorder points
    LandPlotting.currentPlot.points.forEach((p, i) => {
      p.order = i;
      if (i > 0) {
        const prevPoint = LandPlotting.currentPlot.points[i - 1];
        const distance = Measurements.calculateDistance(
          [prevPoint.lat, prevPoint.lng],
          [p.lat, p.lng]
        );
        p.distance = distance.feet;
      } else {
        p.distance = 0;
      }
    });

    LandPlotting.saveToHistory('remove', { index, point });
    LandPlotting.updatePlotMeasurements();
    LandPlotting.updateUI();

    if (typeof MapManager !== 'undefined') {
      MapManager.updatePlotVisualization(LandPlotting.currentPlot);
    }
  },

  movePoint: (index, newLat, newLng) => {
    if (!LandPlotting.isPlotting || !LandPlotting.currentPlot) return;
    if (index < 0 || index >= LandPlotting.currentPlot.points.length) return;

    const oldPoint = { ...LandPlotting.currentPlot.points[index] };
    LandPlotting.currentPlot.points[index].lat = newLat;
    LandPlotting.currentPlot.points[index].lng = newLng;

    // Recalculate distances
    if (index > 0) {
      const prevPoint = LandPlotting.currentPlot.points[index - 1];
      const distance = Measurements.calculateDistance(
        [prevPoint.lat, prevPoint.lng],
        [newLat, newLng]
      );
      LandPlotting.currentPlot.points[index].distance = distance.feet;
    }

    if (index < LandPlotting.currentPlot.points.length - 1) {
      const nextPoint = LandPlotting.currentPlot.points[index + 1];
      const distance = Measurements.calculateDistance(
        [newLat, newLng],
        [nextPoint.lat, nextPoint.lng]
      );
      LandPlotting.currentPlot.points[index + 1].distance = distance.feet;
    }

    LandPlotting.saveToHistory('move', { index, oldPoint, newPoint: { lat: newLat, lng: newLng } });
    LandPlotting.updatePlotMeasurements();
    LandPlotting.updateUI();

    if (typeof MapManager !== 'undefined') {
      MapManager.updatePlotVisualization(LandPlotting.currentPlot);
    }
  },

  finishPlotting: () => {
    if (!LandPlotting.isPlotting || !LandPlotting.currentPlot) return;
    if (LandPlotting.currentPlot.points.length < 3) {
      alert('Please add at least 3 points to create a plot');
      return;
    }
    LandPlotting.updatePlotMeasurements();
    LandPlotting.currentPlot.isComplete = true;
    LandPlotting.allPlots.push(LandPlotting.currentPlot);
    LandPlotting.savePlots();

    // Display the completed plot
    if (typeof MapManager !== 'undefined') {
      MapManager.displayPlot(LandPlotting.currentPlot);
    }

    LandPlotting.isPlotting = false;
    const finishedPlot = LandPlotting.currentPlot;
    LandPlotting.currentPlot = null;
    LandPlotting.history = { undoStack: [], redoStack: [] };
    LandPlotting.updateUI();

    if (typeof MapManager !== 'undefined') {
      MapManager.exitPlottingMode();
      MapManager.clearPlotVisualization();
      MapManager.updateAllMeasurements();
    }

    // Auto-calculate coverage and show quote estimate
    if (typeof Quote !== 'undefined') {
      Quote.calculateCoverage();
      Quote.updateQuoteDisplay();
    }

    // Show obstacle marking option and auto-advance to step 2
    LandPlotting.showObstacleOption();
    // Auto-advance to step 2 after finishing plot
    setTimeout(() => {
      LandPlotting.goToStep(2);
    }, 100);
  },

  cancelPlotting: () => {
    if (!LandPlotting.isPlotting) return;

    LandPlotting.isPlotting = false;
    LandPlotting.currentPlot = null;
    LandPlotting.history = { undoStack: [], redoStack: [] };
    LandPlotting.updateUI();

    if (typeof MapManager !== 'undefined') {
      MapManager.exitPlottingMode();
      MapManager.clearPlotVisualization();
    }
  },

  updatePlotMeasurements: () => {
    if (!LandPlotting.currentPlot || LandPlotting.currentPlot.points.length < 3) {
      LandPlotting.currentPlot.area = null;
      LandPlotting.currentPlot.perimeter = null;
      if (typeof MapManager !== 'undefined' && MapManager.updateAllMeasurements) {
        MapManager.updateAllMeasurements();
      }
      return;
    }

    const coords = LandPlotting.currentPlot.points.map(p => [p.lat, p.lng]);
    const area = Measurements.calculateArea(coords, 'Polygon');
    const perimeter = Measurements.calculatePerimeter(coords);

    LandPlotting.currentPlot.area = area;
    LandPlotting.currentPlot.perimeter = perimeter;
    if (typeof MapManager !== 'undefined' && MapManager.updateAllMeasurements) {
      MapManager.updateAllMeasurements();
    }
  },

  getObstacleLabelForType: (type) => {
    if (!type) return 'Building';
    const normalized = String(type).toLowerCase();
    if (normalized === 'house') return 'House';
    if (normalized === 'garage') return 'Garage';
    if (normalized === 'shed') return 'Shed';
    if (normalized === 'barn') return 'Barn';
    if (normalized === 'dock') return 'Dock';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  },

  getBuildingShotCountForType: (type) => {
    const normalized = String(type || 'default').toLowerCase();
    const counts = (typeof CONFIG !== 'undefined' && CONFIG.buildingShotCounts) ? CONFIG.buildingShotCounts : {};
    const fallback = counts.default || 4;
    return counts[normalized] || fallback;
  },

  getBuildingShotRadiusForType: (type) => {
    const normalized = String(type || 'default').toLowerCase();
    const radii = (typeof CONFIG !== 'undefined' && CONFIG.buildingShotRadii) ? CONFIG.buildingShotRadii : {};
    const fallback = radii.default || 12;
    return radii[normalized] || fallback;
  },

  getIncludedObstacles: (plot, includedBuildings, options = {}) => {
    if (!plot || !Array.isArray(plot.obstacles)) return [];
    if (!Number.isFinite(includedBuildings) || includedBuildings < 0) {
      return plot.obstacles.slice();
    }
    const limit = Math.max(0, Math.round(includedBuildings));
    if (limit === 0) return [];
    const obstacles = plot.obstacles.slice();
    if (options?.packageId === 'economy') {
      const priority = ['house', 'garage'];
      const ranked = obstacles.map((obs, index) => {
        const type = String(obs.type || '').toLowerCase();
        const priorityIndex = priority.indexOf(type);
        return {
          obs,
          index,
          priority: priorityIndex === -1 ? priority.length : priorityIndex
        };
      });
      ranked.sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.index - b.index;
      });
      return ranked.slice(0, limit).map(item => item.obs);
    }
    return obstacles.slice(0, limit);
  },

  getBuildingPhotoCount: (plot, includedBuildings, options = {}) => {
    const obstacles = LandPlotting.getIncludedObstacles(plot, includedBuildings, options);
    if (obstacles.length === 0) return 0;
    return obstacles.reduce((total, obs) => total + LandPlotting.getBuildingShotCountForType(obs.type), 0);
  },

  getBuildingOrbits: (plot, includedBuildings, totalBuildingShots, options = {}) => {
    const obstacles = LandPlotting.getIncludedObstacles(plot, includedBuildings, options);
    if (obstacles.length === 0) return [];
    const altitude = CONFIG.droneSpecs?.defaultAltitude || 60;
    const buildingHeights = {
      house: 6, // meters, typical single-story
      garage: 3,
      shed: 2.5,
      barn: 5,
      dock: 1,
      default: 4
    };

    const baseShots = obstacles.map(obs => LandPlotting.getBuildingShotCountForType(obs.type));
    let allocations = baseShots;
    if (Number.isFinite(totalBuildingShots)) {
      const total = Math.max(0, Math.round(totalBuildingShots));
      const baseTotal = baseShots.reduce((sum, count) => sum + count, 0);
      if (baseTotal <= 0 || total <= 0) {
        allocations = baseShots.map(() => 0);
      } else if (total < baseTotal) {
        const raw = baseShots.map(count => (count / baseTotal) * total);
        const floors = raw.map(count => Math.floor(count));
        let remaining = total - floors.reduce((sum, count) => sum + count, 0);
        const fractions = raw
          .map((count, index) => ({ index, fraction: count - floors[index] }))
          .sort((a, b) => b.fraction - a.fraction);
        for (let i = 0; i < remaining; i++) {
          floors[fractions[i].index] += 1;
        }
        allocations = floors;
      }
    }

    return obstacles.map((obs, index) => {
      const shots = allocations[index] ?? baseShots[index];
      if (shots <= 0) return null;
      const radius = LandPlotting.getBuildingShotRadiusForType(obs.type);
      const buildingHeight = buildingHeights[obs.type?.toLowerCase()] || buildingHeights.default;
      const points = [];
      const shotDetails = [];
      const latRad = (obs.position.lat * Math.PI) / 180;
      const latOffset = radius / 111320;
      const lngOffset = radius / (111320 * Math.cos(latRad));

      for (let i = 0; i < shots; i++) {
        const angle = (i / shots) * Math.PI * 2;
        const lat = obs.position.lat + (latOffset * Math.cos(angle));
        const lng = obs.position.lng + (lngOffset * Math.sin(angle));
        const point = [lat, lng];
        points.push(point);

        // Calculate shot predictions
        if (typeof CoverageCalculator !== 'undefined' && CoverageCalculator.predictShotCoverage) {
          const shotPos = { lat, lng };
          const targetPos = obs.position;
          const prediction = CoverageCalculator.predictShotCoverage(
            shotPos,
            targetPos,
            altitude,
            buildingHeight,
            CONFIG.droneSpecs
          );
          shotDetails.push({
            position: shotPos,
            angle: prediction.angle,
            fieldOfView: prediction.fieldOfView,
            willCapture: prediction.willCapture,
            compassBearing: (angle * 180 / Math.PI + 90) % 360 // Convert to compass bearing
          });
        }
      }

      return {
        id: obs.id,
        type: obs.type,
        name: obs.name,
        shots,
        radius,
        center: { ...obs.position },
        points,
        shotDetails: shotDetails.length > 0 ? shotDetails : null,
        buildingHeight
      };
    }).filter(Boolean);
  },

  getPropertyOrbit: (plot, shotCount) => {
    const count = Math.max(0, Math.round(shotCount || 0));
    if (!plot || !plot.points || plot.points.length < 3 || count === 0) return null;

    const coords = plot.points.map(p => [p.lat, p.lng]);
    const ring = coords.concat([coords[0]]);
    const configuredOffset = (typeof CONFIG !== 'undefined')
      ? Number(CONFIG.flightPathDefaults?.propertyOrbitOffsetMeters)
      : NaN;
    const offsetMeters = Number.isFinite(configuredOffset) ? Math.max(0, configuredOffset) : 10;
    const origin = coords.reduce((acc, point) => {
      acc.lat += point[0];
      acc.lng += point[1];
      return acc;
    }, { lat: 0, lng: 0 });
    origin.lat /= coords.length;
    origin.lng /= coords.length;
    const latRad = (origin.lat * Math.PI) / 180;
    const metersPerLat = 111320;
    const metersPerLng = 111320 * Math.cos(latRad) || 1e-6;
    const toXY = (lat, lng) => ({
      x: (lng - origin.lng) * metersPerLng,
      y: (lat - origin.lat) * metersPerLat
    });
    const ringXY = ring.map(point => toXY(point[0], point[1]));
    let area = 0;
    for (let i = 0; i < ringXY.length - 1; i++) {
      area += (ringXY[i].x * ringXY[i + 1].y) - (ringXY[i + 1].x * ringXY[i].y);
    }
    const isCCW = area > 0;
    const segments = [];
    let totalDistance = 0;

    for (let i = 0; i < ring.length - 1; i++) {
      const start = ring[i];
      const end = ring[i + 1];
      const startXY = ringXY[i];
      const endXY = ringXY[i + 1];
      const dx = endXY.x - startXY.x;
      const dy = endXY.y - startXY.y;
      let nx = isCCW ? dy : -dy;
      let ny = isCCW ? -dx : dx;
      const normalLength = Math.hypot(nx, ny) || 1;
      nx /= normalLength;
      ny /= normalLength;
      const distance = Measurements.calculateDistance(start, end);
      const meters = distance?.meters || 0;
      if (meters > 0) {
        segments.push({
          start: { lat: start[0], lng: start[1] },
          end: { lat: end[0], lng: end[1] },
          meters,
          startX: startXY.x,
          startY: startXY.y,
          dx,
          dy,
          nx,
          ny
        });
        totalDistance += meters;
      }
    }

    if (!Number.isFinite(totalDistance) || totalDistance <= 0) return null;

    const spacing = totalDistance / count;
    const startOffset = spacing / 2;
    const points = [];
    let segmentIndex = 0;
    let segmentStartDistance = 0;

    for (let i = 0; i < count; i++) {
      const targetDistance = startOffset + i * spacing;
      while (segmentIndex < segments.length - 1 &&
        segmentStartDistance + segments[segmentIndex].meters < targetDistance) {
        segmentStartDistance += segments[segmentIndex].meters;
        segmentIndex += 1;
      }

      const segment = segments[segmentIndex];
      const offset = Math.max(0, targetDistance - segmentStartDistance);
      const ratio = segment.meters > 0 ? Math.min(offset / segment.meters, 1) : 0;
      const x = segment.startX + (segment.dx * ratio) + (segment.nx * offsetMeters);
      const y = segment.startY + (segment.dy * ratio) + (segment.ny * offsetMeters);
      const lat = origin.lat + (y / metersPerLat);
      const lng = origin.lng + (x / metersPerLng);
      points.push([lat, lng]);
    }

    return {
      id: plot.id,
      type: 'property',
      name: plot.name || 'Property',
      shots: count,
      center: null,
      points
    };
  },

  getNextObstacleName: (plot, type) => {
    const label = LandPlotting.getObstacleLabelForType(type);
    const existing = (plot?.obstacles || []).filter(o => LandPlotting.getObstacleLabelForType(o.type) === label).length;
    return `${label} ${existing + 1}`;
  },

  addObstacle: (plotId, lat, lng, type = 'house') => {
    const plot = LandPlotting.allPlots.find(p => p.id === plotId);
    if (!plot) return;

    const obstacle = {
      id: 'obstacle_' + Date.now(),
      plotId: plotId,
      type: type,
      name: LandPlotting.getNextObstacleName(plot, type),
      position: { lat: lat, lng: lng },
      createdAt: new Date().toISOString()
    };

    if (!plot.obstacles) plot.obstacles = [];
    plot.obstacles.push(obstacle);
    LandPlotting.savePlots();

    if (typeof MapManager !== 'undefined') {
      MapManager.addObstacleMarker(obstacle);
    }

    return obstacle;
  },

  renameObstacle: (plotId, obstacleId, name) => {
    const plot = LandPlotting.allPlots.find(p => p.id === plotId);
    if (!plot || !plot.obstacles) return null;
    const obstacle = plot.obstacles.find(o => o.id === obstacleId);
    if (!obstacle) return null;
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    obstacle.name = trimmed;
    LandPlotting.savePlots();
    return obstacle;
  },

  removeObstacle: (plotId, obstacleId) => {
    const plot = LandPlotting.allPlots.find(p => p.id === plotId);
    if (!plot || !plot.obstacles) return;

    plot.obstacles = plot.obstacles.filter(o => o.id !== obstacleId);
    LandPlotting.savePlots();

    if (typeof MapManager !== 'undefined') {
      MapManager.removeObstacleMarker(obstacleId);
    }
  },

  getPoiLabelForType: (type) => {
    if (!type) return 'Point of Interest';
    const normalized = String(type).toLowerCase();
    if (normalized === 'garden') return 'Garden';
    if (normalized === 'pool') return 'Pool';
    if (normalized === 'pond') return 'Pond';
    if (normalized === 'river') return 'River';
    if (normalized === 'driveway') return 'Driveway';
    if (normalized === 'viewpoint') return 'Viewpoint';
    if (normalized === 'trail') return 'Trail';
    if (normalized === 'other') return 'POI';
    return normalized.charAt(0).toUpperCase() + normalized.slice(1);
  },

  getNextPoiName: (plot, type) => {
    const label = LandPlotting.getPoiLabelForType(type);
    const existing = (plot?.pois || []).filter(p => LandPlotting.getPoiLabelForType(p.type) === label).length;
    return `${label} ${existing + 1}`;
  },

  addPoi: (plotId, lat, lng, type = 'garden') => {
    const plot = LandPlotting.allPlots.find(p => p.id === plotId);
    if (!plot) return;

    const poi = {
      id: 'poi_' + Date.now(),
      plotId: plotId,
      type: type,
      name: LandPlotting.getNextPoiName(plot, type),
      position: { lat: lat, lng: lng },
      createdAt: new Date().toISOString()
    };

    if (!plot.pois) plot.pois = [];
    plot.pois.push(poi);
    LandPlotting.savePlots();

    if (typeof MapManager !== 'undefined') {
      MapManager.addPoiMarker(poi);
    }

    return poi;
  },

  renamePoi: (plotId, poiId, name) => {
    const plot = LandPlotting.allPlots.find(p => p.id === plotId);
    if (!plot || !plot.pois) return null;
    const poi = plot.pois.find(p => p.id === poiId);
    if (!poi) return null;
    const trimmed = String(name || '').trim();
    if (!trimmed) return null;
    poi.name = trimmed;
    LandPlotting.savePlots();
    return poi;
  },

  removePoi: (plotId, poiId) => {
    const plot = LandPlotting.allPlots.find(p => p.id === plotId);
    if (!plot || !plot.pois) return;

    plot.pois = plot.pois.filter(p => p.id !== poiId);
    LandPlotting.savePlots();

    if (typeof MapManager !== 'undefined') {
      MapManager.removePoiMarker(poiId);
    }
  },

  getAllPlots: () => {
    return LandPlotting.allPlots.filter(p => p.isComplete);
  },

  getLatestPlot: () => {
    const plots = LandPlotting.getAllPlots();
    return plots.length > 0 ? plots[plots.length - 1] : null;
  },

  getActivePlot: () => {
    return LandPlotting.isPlotting ? LandPlotting.currentPlot : LandPlotting.getLatestPlot();
  },

  getActivePlotCoordinates: () => {
    const plot = LandPlotting.getActivePlot();
    if (!plot || !plot.points || plot.points.length < 3) return null;
    const coords = plot.points.map(p => [p.lat, p.lng]);
    coords.push([plot.points[0].lat, plot.points[0].lng]);
    return coords;
  },

  getCurrentPlot: () => {
    return LandPlotting.currentPlot;
  },

  undo: () => {
    if (LandPlotting.history.undoStack.length === 0) return;

    const action = LandPlotting.history.undoStack.pop();
    LandPlotting.history.redoStack.push(action);

    // Apply reverse action
    if (action.type === 'add') {
      LandPlotting.currentPlot.points.pop();
    } else if (action.type === 'remove') {
      LandPlotting.currentPlot.points.splice(action.data.index, 0, action.data.point);
    } else if (action.type === 'move') {
      const point = LandPlotting.currentPlot.points[action.data.index];
      point.lat = action.data.oldPoint.lat;
      point.lng = action.data.oldPoint.lng;
    }

    // Reorder and recalculate
    LandPlotting.currentPlot.points.forEach((p, i) => {
      p.order = i;
      if (i > 0) {
        const prevPoint = LandPlotting.currentPlot.points[i - 1];
        const distance = Measurements.calculateDistance(
          [prevPoint.lat, prevPoint.lng],
          [p.lat, p.lng]
        );
        p.distance = distance.feet;
      } else {
        p.distance = 0;
      }
    });

    LandPlotting.updatePlotMeasurements();
    LandPlotting.updateUI();

    if (typeof MapManager !== 'undefined') {
      MapManager.updatePlotVisualization(LandPlotting.currentPlot);
    }
  },

  saveToHistory: (type, data) => {
    LandPlotting.history.undoStack.push({ type, data, timestamp: Date.now() });
    LandPlotting.history.redoStack = []; // Clear redo on new action
  },

  getNextColor: () => {
    const colors = ['#3388ff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];
    return colors[LandPlotting.allPlots.length % colors.length];
  },

  updateUI: () => {
    // Update plotting panel
    const panel = document.getElementById('plottingPanel');
    const startBtn = document.getElementById('startPlotting');
    const finishBtn = document.getElementById('finishPlotting');
    const cancelBtn = document.getElementById('cancelPlotting');
    const pointCount = document.getElementById('pointCount');
    const undoBtn = document.getElementById('undoLastPoint');

    if (LandPlotting.isPlotting) {
      if (panel) panel.classList.remove('is-hidden');
      if (startBtn) startBtn.classList.add('is-hidden');
      if (finishBtn) {
        finishBtn.classList.remove('is-hidden');
        finishBtn.disabled = LandPlotting.currentPlot.points.length < 3;
      }
      if (cancelBtn) cancelBtn.classList.remove('is-hidden');
      if (pointCount) {
        pointCount.textContent = LandPlotting.currentPlot.points.length;
      }
      if (undoBtn) {
        undoBtn.disabled = LandPlotting.currentPlot.points.length === 0;
      }
    } else {
      if (panel) panel.classList.add('is-hidden');
      if (startBtn) startBtn.classList.remove('is-hidden');
      if (finishBtn) finishBtn.classList.add('is-hidden');
      if (cancelBtn) cancelBtn.classList.add('is-hidden');
    }

    // Update workflow steps
    LandPlotting.updateWorkflowSteps();
  },

  canGoToStep2: () => {
    const plots = LandPlotting.getAllPlots();
    return plots.length > 0 && !LandPlotting.isPlotting;
  },

  canGoToStep3: () => {
    const plots = LandPlotting.getAllPlots();
    if (plots.length === 0) return false;
    const latestPlot = LandPlotting.getLatestPlot?.();
    return latestPlot && latestPlot.obstacleReviewComplete === true;
  },

  goToStep: (stepNumber) => {
    if (stepNumber === 1) {
      // Can always go back to step 1
      const step1 = document.getElementById('workflowStep1');
      const step2 = document.getElementById('workflowStep2');
      const step3 = document.getElementById('workflowStep3');
      [step1, step2, step3].forEach(step => step?.classList.remove('active'));
      step1?.classList.add('active');
      LandPlotting.updateWorkflowSteps();
    } else if (stepNumber === 2) {
      if (!LandPlotting.canGoToStep2()) {
        alert('Please finish mapping your property first.');
        return false;
      }
      const step1 = document.getElementById('workflowStep1');
      const step2 = document.getElementById('workflowStep2');
      const step3 = document.getElementById('workflowStep3');
      [step1, step2, step3].forEach(step => step?.classList.remove('active'));
      step2?.classList.add('active');
      LandPlotting.updateWorkflowSteps();
      return true;
    } else if (stepNumber === 3) {
      if (!LandPlotting.canGoToStep3()) {
        alert('Please complete or skip the building marking step first.');
        return false;
      }
      const step1 = document.getElementById('workflowStep1');
      const step2 = document.getElementById('workflowStep2');
      const step3 = document.getElementById('workflowStep3');
      [step1, step2, step3].forEach(step => step?.classList.remove('active'));
      step3?.classList.add('active');
      LandPlotting.updateWorkflowSteps();
      return true;
    }
    return false;
  },

  getCurrentStep: () => {
    const step1 = document.getElementById('workflowStep1');
    const step2 = document.getElementById('workflowStep2');
    const step3 = document.getElementById('workflowStep3');
    if (step1?.classList.contains('active')) return 1;
    if (step2?.classList.contains('active')) return 2;
    if (step3?.classList.contains('active')) return 3;
    return 1;
  },

  updateWorkflowSteps: () => {
    const step1 = document.getElementById('workflowStep1');
    const step2 = document.getElementById('workflowStep2');
    const step3 = document.getElementById('workflowStep3');
    const step1Status = document.getElementById('step1Status');
    const step2Status = document.getElementById('step2Status');
    const step3Status = document.getElementById('step3Status');
    const plots = LandPlotting.getAllPlots();
    const obstaclePanel = document.getElementById('obstaclePanel');
    const obstacleVisible = obstaclePanel && !obstaclePanel.classList.contains('is-hidden');
    const latestPlot = LandPlotting.getLatestPlot?.();
    const obstacleComplete = latestPlot ? latestPlot.obstacleReviewComplete === true : false;
    const hasPlot = plots.length > 0;
    const currentStep = LandPlotting.getCurrentStep();

    // Reset all steps
    [step1, step2, step3].forEach(step => {
      if (step) {
        step.classList.remove('active', 'complete');
      }
    });

    // Set active step based on currentStep, but respect state constraints
    if (currentStep === 1 || LandPlotting.isPlotting) {
      if (step1) step1.classList.add('active');
    } else if (hasPlot && currentStep !== 2 && currentStep !== 3) {
      if (step1) step1.classList.add('complete');
    }

    if (currentStep === 2 && !LandPlotting.isPlotting) {
      if (step2) step2.classList.add('active');
    } else if (hasPlot && obstacleComplete && currentStep !== 2) {
      if (step2) step2.classList.add('complete');
    }

    if (currentStep === 3 && hasPlot && obstacleComplete && !LandPlotting.isPlotting && !LandPlotting.isMarkingObstacles && !LandPlotting.isMarkingPois) {
      if (step3) step3.classList.add('active');
    }

    // Update status labels
    if (step1Status) {
      if (currentStep === 1 || LandPlotting.isPlotting) {
        step1Status.textContent = 'Active';
      } else if (hasPlot) {
        step1Status.textContent = 'Complete';
      } else {
        step1Status.textContent = 'Active';
      }
    }

    if (step2Status) {
      if (LandPlotting.isPlotting) {
        step2Status.textContent = 'Locked';
      } else if (currentStep === 2) {
        step2Status.textContent = 'Active';
      } else if (hasPlot && obstacleComplete) {
        step2Status.textContent = 'Complete';
      } else if (hasPlot) {
        step2Status.textContent = 'Optional';
      } else {
        step2Status.textContent = 'Locked';
      }
    }

    if (step3Status) {
      if (currentStep === 3 && hasPlot && obstacleComplete) {
        step3Status.textContent = 'Active';
      } else if (hasPlot && obstacleComplete) {
        step3Status.textContent = 'Ready';
      } else if (hasPlot) {
        step3Status.textContent = 'Locked';
      } else {
        step3Status.textContent = 'Locked';
      }
    }

    if (obstaclePanel) {
      // Show panel if on Step 2 and have a plot (regardless of completion status)
      if (currentStep === 2 && hasPlot && !LandPlotting.isPlotting) {
        obstaclePanel.classList.remove('is-hidden');
      } else if (!LandPlotting.isMarkingObstacles && !LandPlotting.isMarkingPois) {
        obstaclePanel.classList.add('is-hidden');
      }
    }
    if (hasPlot && !obstacleComplete && !LandPlotting.isPlotting) {
      if (typeof MapManager !== 'undefined' && MapManager.map && !LandPlotting.isMarkingObstacles && !LandPlotting.isMarkingPois) {
        MapManager.enterObstacleMarkingMode();
      }
    }
    if (typeof MapManager !== 'undefined' && MapManager.refreshFlightPath) {
      MapManager.refreshFlightPath();
    }

    // Update map controls visibility (hide in steps 2 and 3)
    const mapControls = document.querySelector('.map-controls');
    if (mapControls) {
      if (currentStep === 1) {
        mapControls.classList.remove('hidden');
      } else {
        mapControls.classList.add('hidden');
      }
    }

    // Update navigation buttons
    const prevBtn = document.getElementById('prevStep');
    const nextBtn = document.getElementById('nextStep');
    if (prevBtn) {
      prevBtn.disabled = currentStep === 1;
    }
    if (nextBtn) {
      if (currentStep === 1) {
        nextBtn.disabled = !LandPlotting.canGoToStep2();
      } else if (currentStep === 2) {
        nextBtn.disabled = !LandPlotting.canGoToStep3();
      } else {
        nextBtn.disabled = true; // Step 3 is final
      }
    }

    if (currentStep === 2 && typeof MapManager !== 'undefined') {
      if (typeof MapManager.updateObstaclesList === 'function') {
        MapManager.updateObstaclesList();
      }
      if (typeof MapManager.updatePoisList === 'function') {
        MapManager.updatePoisList();
      }
    }
  },

  showObstacleOption: () => {
    const obstaclePanel = document.getElementById('obstaclePanel');
    if (obstaclePanel) {
      obstaclePanel.classList.remove('is-hidden');
    }
    const latest = LandPlotting.getLatestPlot?.();
    if (latest) {
      latest.obstacleReviewComplete = false;
      LandPlotting.savePlots();
    }
    LandPlotting.updateWorkflowSteps();
  },

  finishObstacleMarking: () => {
    LandPlotting.isMarkingObstacles = false;
    LandPlotting.isMarkingPois = false;
    const obstaclePanel = document.getElementById('obstaclePanel');
    if (obstaclePanel) {
      obstaclePanel.classList.add('is-hidden');
    }
    if (typeof MapManager !== 'undefined' && MapManager.setObstacleMarkingUI) {
      MapManager.setObstacleMarkingUI(false);
    }
    if (typeof MapManager !== 'undefined' && MapManager.setPoiMarkingUI) {
      MapManager.setPoiMarkingUI(false);
    }
    const latest = LandPlotting.getLatestPlot?.();
    if (latest) {
      latest.obstacleReviewComplete = true;
      LandPlotting.savePlots();
    }

    // Remove obstacle marking click handler
    if (typeof MapManager !== 'undefined' && MapManager.map) {
      MapManager.map.off('click');
      MapManager.map.getContainer().style.cursor = '';
    }

    // Update workflow steps - move to step 3
    LandPlotting.updateWorkflowSteps();

    // Trigger coverage calculation
    if (typeof MapManager !== 'undefined') {
      MapManager.updateAllMeasurements();
    }

    // Auto-calculate coverage
    if (typeof Quote !== 'undefined') {
      Quote.calculateCoverage();
    }

    // Auto-advance to step 3
    setTimeout(() => {
      LandPlotting.goToStep(3);

      // Trigger AI Analysis
      if (typeof AIPlacement !== 'undefined') {
        AIPlacement.analyzeProperty();
      }
    }, 100);
  },

  skipObstacles: () => {
    // Skip obstacles is the same as finishing (marks as complete)
    LandPlotting.finishObstacleMarking();
  },

  readjustLastPlot: () => {
    if (LandPlotting.isPlotting) return;
    const plots = LandPlotting.getAllPlots();
    if (plots.length === 0) return;
    const lastPlot = plots[plots.length - 1];
    LandPlotting.allPlots = LandPlotting.allPlots.filter(p => p.id !== lastPlot.id);
    lastPlot.isComplete = false;
    lastPlot.obstacleReviewComplete = false;
    LandPlotting.currentPlot = lastPlot;
    LandPlotting.isPlotting = true;
    LandPlotting.isMarkingObstacles = false;
    LandPlotting.isMarkingPois = false;
    const obstaclePanel = document.getElementById('obstaclePanel');
    if (obstaclePanel) {
      obstaclePanel.classList.add('is-hidden');
    }
    if (typeof MapManager !== 'undefined' && MapManager.setObstacleMarkingUI) {
      MapManager.setObstacleMarkingUI(false);
    }
    if (typeof MapManager !== 'undefined' && MapManager.setPoiMarkingUI) {
      MapManager.setPoiMarkingUI(false);
    }

    if (typeof MapManager !== 'undefined') {
      MapManager.map?.off('click');
      MapManager.map?.getContainer()?.style && (MapManager.map.getContainer().style.cursor = '');
      // Clear all plots from map visualization
      MapManager.clearAllPlots();
      // Only display the current plot being edited, not all past plots
      // (Removed: LandPlotting.getAllPlots().forEach(plot => MapManager.displayPlot(plot));)
      MapManager.updatePlotVisualization(LandPlotting.currentPlot);
      MapManager.enterPlottingMode();
    }
    LandPlotting.updateUI();
  },

  savePlots: () => {
    try {
      localStorage.setItem('drone_mapper_plots', JSON.stringify(LandPlotting.allPlots));
    } catch (e) {
      console.error('Error saving plots:', e);
    }
  },

  loadPlots: () => {
    try {
      const saved = localStorage.getItem('drone_mapper_plots');
      if (saved) {
        LandPlotting.allPlots = JSON.parse(saved);
      }
    } catch (e) {
      console.error('Error loading plots:', e);
      LandPlotting.allPlots = [];
    }
  },

  clearAllPlots: () => {
    if (confirm('Are you sure you want to clear all plots?')) {
      LandPlotting.allPlots = [];
      LandPlotting.currentPlot = null;
      LandPlotting.isPlotting = false;
      LandPlotting.savePlots();
      LandPlotting.updateUI();

      if (typeof MapManager !== 'undefined') {
        MapManager.clearAllPlots();
        MapManager.updateAllMeasurements();
      }
    }
  }
};
