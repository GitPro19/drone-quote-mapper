const CoverageCalculator = {
  // Calculate camera angle (pitch) for building shots
  calculateCameraAngle: (altitude, groundDistance, buildingHeight = 0) => {
    // Calculate the angle from horizontal (0° = horizontal, 90° = straight down)
    // For building shots, we want oblique angles (typically 30-60° from horizontal)
    // groundDistance is the horizontal distance from drone to building
    const totalHeight = altitude + (buildingHeight || 0);
    const angleRad = Math.atan2(totalHeight, groundDistance);
    const angleDeg = (angleRad * 180) / Math.PI;
    return {
      degrees: angleDeg,
      radians: angleRad,
      pitch: 90 - angleDeg, // Camera pitch (0° = horizontal, 90° = straight down)
      horizontalDistance: groundDistance
    };
  },

  // Calculate field of view coverage from a shot position
  calculateFieldOfView: (shotLat, shotLng, targetLat, targetLng, altitude, cameraAngle, sensorWidth, focalLength) => {
    // Calculate what area will be visible in the frame
    const distance = Measurements.calculateDistance([shotLat, shotLng], [targetLat, targetLng]);
    const groundDistance = distance.meters;
    
    // Calculate FOV based on camera specs
    // For oblique shots, the effective altitude is the distance to the target
    const effectiveDistance = Math.sqrt(groundDistance * groundDistance + altitude * altitude);
    const fovWidth = (sensorWidth / focalLength) * effectiveDistance;
    const fovHeight = fovWidth * 0.75; // Assuming 4:3 aspect ratio
    
    // Adjust for camera angle (oblique shots see more area on ground)
    // When camera is angled, the ground coverage increases
    const angleRad = (cameraAngle * Math.PI) / 180;
    const adjustedWidth = fovWidth / Math.cos(angleRad);
    const adjustedHeight = fovHeight / Math.cos(angleRad);
    
    return {
      width: adjustedWidth,
      height: adjustedHeight,
      widthFeet: adjustedWidth * 3.28084,
      heightFeet: adjustedHeight * 3.28084,
      distance: groundDistance,
      distanceFeet: distance.feet,
      effectiveDistance: effectiveDistance
    };
  },

  // Get compass direction from bearing
  getBearingDirection: (bearing) => {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(bearing / 22.5) % 16;
    return directions[index];
  },

  // Predict what will be visible from a shot position
  predictShotCoverage: (shotPosition, targetPosition, altitude, buildingHeight = 0, droneSpecs) => {
    const distance = Measurements.calculateDistance(
      [shotPosition.lat, shotPosition.lng],
      [targetPosition.lat, targetPosition.lng]
    );
    
    // Ground distance is the horizontal distance (for angle calculation)
    const groundDistance = distance.meters;
    
    const angle = CoverageCalculator.calculateCameraAngle(altitude, groundDistance, buildingHeight);
    const fov = CoverageCalculator.calculateFieldOfView(
      shotPosition.lat, shotPosition.lng,
      targetPosition.lat, targetPosition.lng,
      altitude,
      angle.pitch,
      droneSpecs.sensorWidth,
      droneSpecs.focalLength
    );
    
    return {
      position: shotPosition,
      target: targetPosition,
      altitude,
      distance: distance,
      angle: angle,
      fieldOfView: fov,
      willCapture: {
        buildingVisible: angle.pitch < 75, // Building visible if angle is less than 75° from horizontal
        groundVisible: true,
        coverageArea: fov.width * fov.height
      }
    };
  },

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
    // Guard against division by zero
    if (!focalLength || focalLength === 0 || !imageHeight || imageHeight === 0) {
      return 0;
    }
    const gsd = (sensorHeight / focalLength) * altitude * 100 / imageHeight;
    return Number.isFinite(gsd) ? gsd : 0;
  },

  calculatePhotoCoverage: (altitude, focalLength, sensorWidth, sensorHeight, imageWidth, imageHeight) => {
    // Ground coverage width (m) = (sensor width (mm) / focal length (mm)) * altitude (m)
    // Ground coverage height (m) = (sensor height (mm) / focal length (mm)) * altitude (m)
    // Guard against division by zero
    if (!focalLength || focalLength === 0) {
      return {
        width: 0,
        height: 0,
        area: 0,
        widthFeet: 0,
        heightFeet: 0,
        areaSqFt: 0,
        areaAcres: 0
      };
    }
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
    
    // Guard against division by zero
    if (!effectiveCoveragePerPhoto || effectiveCoveragePerPhoto <= 0 || !Number.isFinite(effectiveCoveragePerPhoto)) {
      return {
        minimum: 0,
        recommended: 0,
        effectiveCoveragePerPhoto: 0
      };
    }
    
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

      // Add angle predictions for property shots
      const altitude = options.altitude || CONFIG.droneSpecs?.defaultAltitude || 60;
      const shotPoints = selectedPoints.map(point => {
        const shot = { lat: point.lat, lng: point.lng, type: 'angled' };
        
        // Calculate approximate angle for property shots (typically 45-60° for good coverage)
        // For top-down shots, angle is 90° (straight down)
        // For angled shots, calculate based on typical oblique photography
        const typicalAngle = 50; // Typical oblique angle for property photography
        shot.cameraAngle = {
          pitch: typicalAngle,
          degrees: typicalAngle,
          description: 'Oblique (angled)'
        };
        
        return shot;
      });
      
      const topDownCount = Math.min(targetTopDown, shotPoints.length);
      const topDownIndices = CoverageCalculator.pickEvenIndices(shotPoints.length, topDownCount);
      topDownIndices.forEach(index => {
        if (shotPoints[index]) {
          shotPoints[index].type = 'top-down';
          shotPoints[index].cameraAngle = {
            pitch: 90,
            degrees: 90,
            description: 'Nadir (straight down)'
          };
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
        totalDistanceMiles: totalDistance * 0.000621371,
        altitude: altitude,
        shotPredictions: {
          totalShots: shotPoints.length,
          topDownShots: topDownCount,
          angledShots: angledCount,
          typicalAngles: {
            topDown: 90,
            angled: 50,
            building: 30
          }
        }
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
