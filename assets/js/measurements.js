const Measurements = {
  toLngLat: (coordinates) => coordinates.map(coord => [coord[1], coord[0]]),
  calculateArea: (coordinates, type = 'Polygon') => {
    if (!coordinates || coordinates.length < 3) return null;
    try {
      let geometry;
      const lngLat = Measurements.toLngLat(coordinates);
      const ring = (() => {
        if (lngLat.length === 0) return lngLat;
        const first = lngLat[0];
        const last = lngLat[lngLat.length - 1];
        const isClosed = Math.abs(first[0] - last[0]) < 1e-12 && Math.abs(first[1] - last[1]) < 1e-12;
        return isClosed ? lngLat : [...lngLat, [first[0], first[1]]];
      })();
      if (type === 'Polygon' || type === 'Rectangle') {
        geometry = turf.polygon([ring]);
      } else {
        geometry = turf.polygon([ring]);
      }
      const areaSqMeters = turf.area(geometry);
      return {
        sqmeters: areaSqMeters,
        sqft: areaSqMeters * 10.764,
        acres: areaSqMeters * 0.000247105,
        hectares: areaSqMeters * 0.0001
      };
    } catch (e) {
      console.error('Area calculation error:', e);
      return null;
    }
  },
  calculatePerimeter: (coordinates) => {
    if (!coordinates || coordinates.length < 2) return { meters: 0, feet: 0 };
    try {
      const lngLat = Measurements.toLngLat(coordinates);
      let totalDistance = 0;
      for (let i = 0; i < lngLat.length; i++) {
        const from = lngLat[i];
        const to = lngLat[(i + 1) % lngLat.length];
        const fromPoint = turf.point(from);
        const toPoint = turf.point(to);
        const distance = turf.distance(fromPoint, toPoint, { units: 'meters' });
        totalDistance += distance;
      }
      return { meters: totalDistance, feet: totalDistance * 3.28084 };
    } catch (e) {
      console.error('Perimeter calculation error:', e);
      return { meters: 0, feet: 0 };
    }
  },
  formatArea: (area, unit = 'acres') => {
    if (!area) return '0';
    const value = area[unit] || 0;
    if (unit === 'acres') {
      return value.toFixed(2) + ' acres';
    }
    if (unit === 'sqft') {
      return value.toLocaleString() + ' sq ft';
    }
    if (unit === 'sqmeters') {
      return value.toLocaleString() + ' sq m';
    }
    if (unit === 'hectares') {
      return value.toFixed(2) + ' hectares';
    }
    return value.toString();
  },
  extractCoordinates: (layer) => {
    if (layer instanceof L.Polygon || layer instanceof L.Polyline) {
      const latlngs = layer.getLatLngs();
      if (Array.isArray(latlngs[0])) {
        return latlngs[0].map(ll => [ll.lat, ll.lng]);
      }
      return latlngs.map(ll => [ll.lat, ll.lng]);
    }
    if (layer instanceof L.Rectangle) {
      const bounds = layer.getBounds();
      return [
        [bounds.getSouthWest().lat, bounds.getSouthWest().lng],
        [bounds.getNorthWest().lat, bounds.getNorthWest().lng],
        [bounds.getNorthEast().lat, bounds.getNorthEast().lng],
        [bounds.getSouthEast().lat, bounds.getSouthEast().lng],
        [bounds.getSouthWest().lat, bounds.getSouthWest().lng]
      ];
    }
    if (layer instanceof L.Circle) {
      const center = layer.getLatLng();
      const radius = layer.getRadius();
      const points = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * 2 * Math.PI;
        const lat = center.lat + (radius / 111320) * Math.cos(angle);
        const lng = center.lng + (radius / (111320 * Math.cos(center.lat * Math.PI / 180))) * Math.sin(angle);
        points.push([lat, lng]);
      }
      return points;
    }
    return [];
  },
  getLayerType: (layer) => {
    if (layer instanceof L.Polygon) return 'Polygon';
    if (layer instanceof L.Rectangle) return 'Rectangle';
    if (layer instanceof L.Circle) return 'Circle';
    if (layer instanceof L.Polyline) return 'Polyline';
    return 'Unknown';
  },
  calculateDistance: (point1, point2) => {
    if (!point1 || !point2) return { meters: 0, feet: 0, miles: 0 };
    try {
      const fromPoint = turf.point([point1[1], point1[0]]);
      const toPoint = turf.point([point2[1], point2[0]]);
      const distanceMeters = turf.distance(fromPoint, toPoint, { units: 'meters' });
      return {
        meters: distanceMeters,
        feet: distanceMeters * 3.28084,
        miles: distanceMeters * 0.000621371
      };
    } catch (e) {
      console.error('Distance calculation error:', e);
      return { meters: 0, feet: 0, miles: 0 };
    }
  },
  formatDistance: (distance, unit = 'feet') => {
    if (!distance) return '0';
    const value = distance[unit] || 0;
    if (unit === 'feet') {
      return value.toFixed(0) + ' ft';
    }
    if (unit === 'meters') {
      return value.toFixed(2) + ' m';
    }
    if (unit === 'miles') {
      return value.toFixed(3) + ' mi';
    }
    return value.toString();
  },
  formatCoordinate: (lat, lng, format = 'decimal') => {
    if (format === 'decimal') {
      return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    } else if (format === 'dms') {
      const latDMS = Measurements.decimalToDMS(lat, true);
      const lngDMS = Measurements.decimalToDMS(lng, false);
      return `${latDMS} ${lngDMS}`;
    }
    return `${lat}, ${lng}`;
  },
  decimalToDMS: (decimal, isLat) => {
    const absolute = Math.abs(decimal);
    const degrees = Math.floor(absolute);
    const minutesFloat = (absolute - degrees) * 60;
    const minutes = Math.floor(minutesFloat);
    const seconds = (minutesFloat - minutes) * 60;
    const direction = isLat ? (decimal >= 0 ? 'N' : 'S') : (decimal >= 0 ? 'E' : 'W');
    return `${degrees}°${minutes}'${seconds.toFixed(2)}"${direction}`;
  },
  parseCoordinate: (input) => {
    const trimmed = input.trim();
    const parts = trimmed.split(/[,\s]+/);
    if (parts.length >= 2) {
      const lat = parseFloat(parts[0]);
      const lng = parseFloat(parts[1]);
      if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return [lat, lng];
      }
    }
    return null;
  }
};
