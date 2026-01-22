const CoverageCalculator = {
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

  calculateFlightPath: (areaCoordinates, coverage, spacing) => {
    // Calculate optimal flight path for the area
    // This is a simplified grid pattern calculation
    
    try {
      const lngLat = Measurements.toLngLat(areaCoordinates);
      const areaPolygon = turf.polygon([lngLat]);
      const bbox = turf.bbox(areaPolygon);
      
      // Get bounding box dimensions
      const sw = turf.point([bbox[0], bbox[1]]);
      const ne = turf.point([bbox[2], bbox[3]]);
      const width = turf.distance(sw, turf.point([bbox[2], bbox[1]]), { units: 'meters' });
      const height = turf.distance(sw, turf.point([bbox[0], bbox[3]]), { units: 'meters' });
      
      // Calculate number of flight lines
      const flightLines = Math.ceil(height / spacing.front);
      const photosPerLine = Math.ceil(width / spacing.side);
      
      // Generate flight path waypoints (simplified - straight lines)
      const waypoints = [];
      const startLat = bbox[1];
      const startLng = bbox[0];
      const latStep = (bbox[3] - bbox[1]) / Math.max(flightLines - 1, 1);
      const lngStep = (bbox[2] - bbox[0]) / Math.max(photosPerLine - 1, 1);
      
      for (let i = 0; i < flightLines; i++) {
        const lat = startLat + (i * latStep);
        const lineWaypoints = [];
        for (let j = 0; j < photosPerLine; j++) {
          const lng = startLng + (j * lngStep);
          lineWaypoints.push([lat, lng]);
        }
        waypoints.push(lineWaypoints);
      }
      
      // Calculate total flight distance
      let totalDistance = 0;
      waypoints.forEach((line, lineIndex) => {
        for (let i = 0; i < line.length - 1; i++) {
          const from = turf.point([line[i][1], line[i][0]]);
          const to = turf.point([line[i + 1][1], line[i + 1][0]]);
          totalDistance += turf.distance(from, to, { units: 'meters' });
        }
      });
      
      return {
        waypoints: waypoints,
        flightLines: flightLines,
        photosPerLine: photosPerLine,
        totalPhotos: flightLines * photosPerLine,
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

  calculate: (areaCoordinates, areaSqMeters, altitude, frontOverlap, sideOverlap, droneSpecs) => {
    // Main calculation function that ties everything together
    if (!areaCoordinates || !areaSqMeters || areaSqMeters <= 0) {
      return null;
    }
    
    const specs = droneSpecs || CONFIG.droneSpecs;
    const altitudeMeters = altitude || specs.defaultAltitude;
    
    // Calculate photo coverage
    const coverage = CoverageCalculator.calculatePhotoCoverage(
      altitudeMeters,
      specs.focalLength,
      specs.sensorWidth,
      specs.sensorHeight,
      specs.imageWidth,
      specs.imageHeight
    );
    
    // Calculate GSD
    const gsd = CoverageCalculator.calculateGSD(
      altitudeMeters,
      specs.focalLength,
      specs.sensorHeight,
      specs.imageHeight
    );
    
    // Calculate photo spacing
    const spacing = CoverageCalculator.calculatePhotoSpacing(
      coverage,
      frontOverlap || CONFIG.coverageDefaults.frontOverlap,
      sideOverlap || CONFIG.coverageDefaults.sideOverlap
    );
    
    // Calculate photos needed
    const photos = CoverageCalculator.calculatePhotosNeeded(areaSqMeters, coverage, spacing);
    
    // Calculate flight path
    const flightPath = CoverageCalculator.calculateFlightPath(areaCoordinates, coverage, spacing);
    
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
