const LandPlotting = {
  isPlotting: false,
  isMarkingObstacles: false,
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

  getBuildingPhotoCount: (plot) => {
    if (!plot || !plot.obstacles) return 0;
    return plot.obstacles.reduce((total, obs) => total + LandPlotting.getBuildingShotCountForType(obs.type), 0);
  },

  getBuildingOrbits: (plot) => {
    if (!plot || !plot.obstacles) return [];
    const altitude = CONFIG.droneSpecs?.defaultAltitude || 60;
    const buildingHeights = {
      house: 6, // meters, typical single-story
      garage: 3,
      shed: 2.5,
      barn: 5,
      dock: 1,
      default: 4
    };
    
    return plot.obstacles.map(obs => {
      const shots = LandPlotting.getBuildingShotCountForType(obs.type);
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
    });
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
    
    if (currentStep === 3 && hasPlot && obstacleComplete && !LandPlotting.isPlotting && !LandPlotting.isMarkingObstacles) {
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
      if (hasPlot && !obstacleComplete && !LandPlotting.isPlotting) {
        obstaclePanel.classList.remove('is-hidden');
      } else if (!LandPlotting.isMarkingObstacles) {
        obstaclePanel.classList.add('is-hidden');
      }
    }
    if (hasPlot && !obstacleComplete && !LandPlotting.isPlotting) {
      if (typeof MapManager !== 'undefined' && MapManager.map && !LandPlotting.isMarkingObstacles) {
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
    const obstaclePanel = document.getElementById('obstaclePanel');
    if (obstaclePanel) {
      obstaclePanel.classList.add('is-hidden');
    }
    if (typeof MapManager !== 'undefined' && MapManager.setObstacleMarkingUI) {
      MapManager.setObstacleMarkingUI(false);
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
    const obstaclePanel = document.getElementById('obstaclePanel');
    if (obstaclePanel) {
      obstaclePanel.classList.add('is-hidden');
    }
    if (typeof MapManager !== 'undefined' && MapManager.setObstacleMarkingUI) {
      MapManager.setObstacleMarkingUI(false);
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
