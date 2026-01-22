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
    LandPlotting.updateWorkflowSteps();
    
    // Display existing plots on map
    if (typeof MapManager !== 'undefined' && MapManager.map) {
      LandPlotting.getAllPlots().forEach(plot => {
        MapManager.displayPlot(plot);
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
    
    // Show obstacle marking option
    LandPlotting.showObstacleOption();
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
      return;
    }
    
    const coords = LandPlotting.currentPlot.points.map(p => [p.lat, p.lng]);
    const area = Measurements.calculateArea(coords, 'Polygon');
    const perimeter = Measurements.calculatePerimeter(coords);
    
    LandPlotting.currentPlot.area = area;
    LandPlotting.currentPlot.perimeter = perimeter;
  },

  addObstacle: (plotId, lat, lng, type = 'house') => {
    const plot = LandPlotting.allPlots.find(p => p.id === plotId);
    if (!plot) return;
    
    const obstacle = {
      id: 'obstacle_' + Date.now(),
      plotId: plotId,
      type: type,
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

  updateWorkflowSteps: () => {
    const step1 = document.getElementById('workflowStep1');
    const step2 = document.getElementById('workflowStep2');
    const step3 = document.getElementById('workflowStep3');
    const plots = LandPlotting.getAllPlots();
    
    // Reset all steps
    [step1, step2, step3].forEach(step => {
      if (step) {
        step.classList.remove('active', 'complete');
      }
    });
    
    if (step1) {
      if (LandPlotting.isPlotting) {
        step1.classList.add('active');
      } else if (plots.length > 0) {
        step1.classList.add('complete');
      }
    }
    
    if (step2) {
      if (plots.length > 0 && !LandPlotting.isPlotting && !LandPlotting.isMarkingObstacles) {
        step2.classList.add('active');
      } else if (LandPlotting.isMarkingObstacles) {
        step2.classList.add('active');
      } else if (plots.length > 0 && plots[plots.length - 1].obstacles && plots[plots.length - 1].obstacles.length > 0) {
        step2.classList.add('complete');
      }
    }
    
    if (step3) {
      if (plots.length > 0 && !LandPlotting.isPlotting && !LandPlotting.isMarkingObstacles) {
        step3.classList.add('active');
      }
    }
  },

  showObstacleOption: () => {
    const obstaclePanel = document.getElementById('obstaclePanel');
    if (obstaclePanel) {
      obstaclePanel.classList.remove('is-hidden');
    }
    LandPlotting.updateWorkflowSteps();
  },

  finishObstacleMarking: () => {
    LandPlotting.isMarkingObstacles = false;
    const obstaclePanel = document.getElementById('obstaclePanel');
    if (obstaclePanel) {
      obstaclePanel.classList.add('is-hidden');
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
  },

  skipObstacles: () => {
    LandPlotting.finishObstacleMarking();
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
