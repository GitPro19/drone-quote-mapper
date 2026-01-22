const CoverageCalculator = {
  pickEvenIndices: (total, count) => {
    if (count <= 0 || total <= 0) return [];
    if (count >= total) return Array.from({ length: total }, (_, i) => i);
    if (count === 1) return [Math.floor(total / 2)];
    const step = (total - 1) / (count - 1);
    const indices = new Set();
    for (let i = 0; i < count; i++) {
      indices.add(Math.round(i * step));
    }
    return Array.from(indices).sort((a, b) => a - b);
  },

  sampleEvenPoints: (points, count) => {
    if (!Array.isArray(points) || points.length === 0) return [];
    if (count >= points.length) return points.slice();
    const indices = CoverageCalculator.pickEvenIndices(points.length, count);
    return indices.map(index => points[index]);
  },

  calculateGSD: (altitude, focalLength, sensorHeight, imageHeight) => {
    // GSD (cm/pixel) = (sensor height (mm) / focal length (mm)) * altitude (m) * 100 / image height (pixels)
    const gsd = (sensorHeight / focalLength) * altitude * 100 / imageHeight;
    return gsd;
  },

  calculatePhotoCoverage: (altitude, focalLength, sensorWidth, sensorHeight, imageWidth, imageHeight) => {
    // Ground coverage width (m) = (sensor width (mm) / focal length (mm)) * altitude (m)
    // Ground coverage height (m) = (sensor height (mm) / focal length (mm)) * altitude (m)
    const coverageWidth = (sensorWidth / focalLength) * altitude;
    const coverageHeight = (sensorHeight / focalLength) * altitude;
    
    return {
      width: coverageWidth,
      height: coverageHeight,
      area: coverageWidth * coverageHeight, // square meters
      widthFeet: coverageWidth * 3.28084,
      heightFeet: coverageHeight * 3.28084,
      areaSqFt: (coverageWidth * coverageHeight) * 10.764,
      areaAcres: (coverageWidth * coverageHeight) * 0.000247105
    };
  },

  calculatePhotoSpacing: (coverage, frontOverlap, sideOverlap) => {
    // Photo spacing accounts for overlap
    // Spacing = coverage * (1 - overlap/100)
    const frontSpacing = coverage.height * (1 - frontOverlap / 100);
    const sideSpacing = coverage.width * (1 - sideOverlap / 100);
    
    return {
      front: frontSpacing,
      side: sideSpacing,
      frontFeet: frontSpacing * 3.28084,
      sideFeet: sideSpacing * 3.28084
    };
  },

  calculatePhotosNeeded: (areaSqMeters, coverage, spacing) => {
    // Calculate how many photos are needed to cover the area
    // This is a simplified calculation - in practice, flight path optimization would be more complex
    
    // Estimate based on effective coverage per photo (accounting for overlap)
    const effectiveCoveragePerPhoto = spacing.front * spacing.side; // square meters
    const photosNeeded = Math.ceil(areaSqMeters / effectiveCoveragePerPhoto);
    
    // Add buffer for edge cases and turns
    const photosWithBuffer = Math.ceil(photosNeeded * 1.1);
    
    return {
      minimum: photosNeeded,
      recommended: photosWithBuffer,
      effectiveCoveragePerPhoto: effectiveCoveragePerPhoto
    };
  },

  calculateFlightPath: (areaCoordinates, coverage, spacing, options = {}) => {
    // Calculate optimal flight path for the area
    // This is a simplified grid pattern calculation
    
    try {
      if (!spacing || spacing.front <= 0 || spacing.side <= 0) {
        return null;
      }
      if (!areaCoordinates || areaCoordinates.length < 3) {
        return null;
      }
      const lngLat = Measurements.toLngLat(areaCoordinates);
      const ring = (() => {
        if (lngLat.length === 0) return lngLat;
        const first = lngLat[0];
        const last = lngLat[lngLat.length - 1];
        const isClosed = Math.abs(first[0] - last[0]) < 1e-12 && Math.abs(first[1] - last[1]) < 1e-12;
        return isClosed ? lngLat : [...lngLat, [first[0], first[1]]];
      })();
      const areaPolygon = turf.polygon([ring]);
      const bbox = turf.bbox(areaPolygon);
      
      // Get bounding box dimensions
      const sw = turf.point([bbox[0], bbox[1]]);
      const width = turf.distance(sw, turf.point([bbox[2], bbox[1]]), { units: 'meters' });
      const height = turf.distance(sw, turf.point([bbox[0], bbox[3]]), { units: 'meters' });
      if (!Number.isFinite(width) || !Number.isFinite(height)) {
        return null;
      }
      
      const targetPhotos = Number.isFinite(options.landPhotos) ? Math.max(0, Math.round(options.landPhotos)) : 0;
      const targetTopDown = Number.isFinite(options.topDownShots) ? Math.max(0, Math.round(options.topDownShots)) : 0;
      const maxPoints = 40000;
      
      const buildGrid = (frontSpacing, sideSpacing) => {
        const flightLines = Math.max(1, Math.ceil(height / frontSpacing));
        const photosPerLine = Math.max(1, Math.ceil(width / sideSpacing));
        if (!Number.isFinite(flightLines) || !Number.isFinite(photosPerLine)) {
          return null;
        }
        if (flightLines < 1 || photosPerLine < 1) {
          return null;
        }
        const totalPoints = flightLines * photosPerLine;
        if (totalPoints > maxPoints) {
          return null;
        }

        const startLat = bbox[1];
        const startLng = bbox[0];
        const latStep = (bbox[3] - bbox[1]) / Math.max(flightLines - 1, 1);
        const lngStep = (bbox[2] - bbox[0]) / Math.max(photosPerLine - 1, 1);
        const lines = [];
        const points = [];
        
        for (let i = 0; i < flightLines; i++) {
          const lat = startLat + (i * latStep);
          const line = [];
          for (let j = 0; j < photosPerLine; j++) {
            const lng = startLng + (j * lngStep);
            const candidate = turf.point([lng, lat]);
            if (!turf.booleanPointInPolygon(candidate, areaPolygon)) {
              continue;
            }
            const point = {
              id: `${i}-${j}`,
              row: i,
              col: j,
              lat,
              lng
            };
            line.push(point);
            points.push(point);
          }
          if (line.length > 0) {
            lines.push(line);
          }
        }

        return { lines, points };
      };

      let spacingFront = spacing.front;
      let spacingSide = spacing.side;
      let grid = buildGrid(spacingFront, spacingSide);
      if (!grid) {
        return null;
      }

      let attempts = 0;
      while (targetPhotos > 0 && grid.points.length < targetPhotos && attempts < 5) {
        spacingFront *= 0.85;
        spacingSide *= 0.85;
        grid = buildGrid(spacingFront, spacingSide);
        if (!grid) {
          return null;
        }
        attempts += 1;
      }

      if (grid.points.length === 0) {
        return null;
      }

      const shotCount = targetPhotos > 0 ? Math.min(targetPhotos, grid.points.length) : grid.points.length;
      const selectedPoints = CoverageCalculator.sampleEvenPoints(grid.points, shotCount);
      const selectedIds = new Set(selectedPoints.map(point => point.id));
      const waypoints = grid.lines
        .map(line => line.filter(point => selectedIds.has(point.id)).map(point => [point.lat, point.lng]))
        .filter(line => line.length >= 2);

      const shotPoints = selectedPoints.map(point => ({ lat: point.lat, lng: point.lng, type: 'angled' }));
      const topDownCount = Math.min(targetTopDown, shotPoints.length);
      const topDownIndices = CoverageCalculator.pickEvenIndices(shotPoints.length, topDownCount);
      topDownIndices.forEach(index => {
        if (shotPoints[index]) {
          shotPoints[index].type = 'top-down';
        }
      });
      const angledCount = shotPoints.length - topDownCount;
      
      // Calculate total flight distance
      let totalDistance = 0;
      waypoints.forEach((line) => {
        for (let i = 0; i < line.length - 1; i++) {
          const from = turf.point([line[i][1], line[i][0]]);
          const to = turf.point([line[i + 1][1], line[i + 1][0]]);
          totalDistance += turf.distance(from, to, { units: 'meters' });
        }
      });
      
      return {
        waypoints: waypoints,
        shotPoints: shotPoints,
        landPhotos: shotPoints.length,
        topDownShots: topDownCount,
        angledShots: angledCount,
        totalPhotos: shotPoints.length,
        totalDistance: totalDistance,
        totalDistanceFeet: totalDistance * 3.28084,
        totalDistanceMiles: totalDistance * 0.000621371
      };
    } catch (e) {
      console.error('Flight path calculation error:', e);
      return null;
    }
  },

  calculateFlightTime: (photos, photoInterval = 2) => {
    // Estimate flight time based on photo count and interval
    // photoInterval is seconds between photos
    const totalTimeSeconds = photos * photoInterval;
    const minutes = Math.floor(totalTimeSeconds / 60);
    const seconds = totalTimeSeconds % 60;
    
    return {
      totalSeconds: totalTimeSeconds,
      minutes: minutes,
      seconds: seconds,
      formatted: `${minutes}m ${seconds}s`
    };
  },

  calculate: (areaCoordinates, areaSqMeters, altitude, frontOverlap, sideOverlap, droneSpecs, options = {}) => {
    // Main calculation function that ties everything together
    if (!areaCoordinates || !areaSqMeters || areaSqMeters <= 0) {
      return null;
    }
    
    const specs = droneSpecs || CONFIG.droneSpecs;
    const altitudeMultiplier = options.altitudeMultiplier && options.altitudeMultiplier > 0 ? options.altitudeMultiplier : 1;
    const altitudeMeters = (altitude || specs.defaultAltitude) * altitudeMultiplier;
    
    // Calculate photo coverage
    const coverage = CoverageCalculator.calculatePhotoCoverage(
      altitudeMeters,
      specs.focalLength,
      specs.sensorWidth,
      specs.sensorHeight,
      specs.imageWidth,
      specs.imageHeight
    );
    if (!coverage || coverage.width <= 0 || coverage.height <= 0) {
      return null;
    }
    
    // Calculate GSD
    const gsd = CoverageCalculator.calculateGSD(
      altitudeMeters,
      specs.focalLength,
      specs.sensorHeight,
      specs.imageHeight
    );
    if (!Number.isFinite(gsd) || gsd <= 0) {
      return null;
    }
    
    // Calculate photo spacing
    const spacing = CoverageCalculator.calculatePhotoSpacing(
      coverage,
      frontOverlap || CONFIG.coverageDefaults.frontOverlap,
      sideOverlap || CONFIG.coverageDefaults.sideOverlap
    );
    if (!spacing || spacing.front <= 0 || spacing.side <= 0) {
      return null;
    }
    if (options.spacingMultiplier && options.spacingMultiplier > 0) {
      spacing.front *= options.spacingMultiplier;
      spacing.side *= options.spacingMultiplier;
      spacing.frontFeet *= options.spacingMultiplier;
      spacing.sideFeet *= options.spacingMultiplier;
    }
    
    // Calculate photos needed
    const photos = CoverageCalculator.calculatePhotosNeeded(areaSqMeters, coverage, spacing);
    const landPhotos = Number.isFinite(options.landPhotos) ? Math.max(0, Math.round(options.landPhotos)) : photos.recommended;
    const topDownShots = Number.isFinite(options.topDownShots) ? Math.max(0, Math.round(options.topDownShots)) : 0;
    if (landPhotos > 0) {
      photos.recommended = landPhotos;
    }
    
    // Calculate flight path
    const flightPath = CoverageCalculator.calculateFlightPath(areaCoordinates, coverage, spacing, {
      landPhotos: photos.recommended,
      topDownShots: Math.min(topDownShots, photos.recommended)
    });
    
    // Calculate flight time
    const flightTime = CoverageCalculator.calculateFlightTime(photos.recommended, 2);
    
    return {
      coverage: coverage,
      gsd: gsd,
      spacing: spacing,
      photos: photos,
      flightPath: flightPath,
      flightTime: flightTime,
      altitude: altitudeMeters,
      frontOverlap: frontOverlap || CONFIG.coverageDefaults.frontOverlap,
      sideOverlap: sideOverlap || CONFIG.coverageDefaults.sideOverlap
    };
  }
};
