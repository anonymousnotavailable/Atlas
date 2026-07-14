// The only genuine "device" hook reachable from a web page: the phone's
// browser reports GPS coordinates via the Geolocation API (client-side),
// POSTs them to /api/device/location, and we cache the latest fix here so
// Atlas can answer location-aware questions mid-conversation. True OS-level
// access (SMS, calls, contacts, notifications, files) is NOT possible from
// a browser tab — see CONNECTORS.md.

const MAX_AGE_MS = 30 * 60 * 1000; // treat fixes older than 30 min as stale

let lastLocation = null; // { lat, lng, accuracy, timestamp }

function setLocation(loc) {
  lastLocation = { ...loc, timestamp: Date.now() };
}

async function deviceLocation() {
  if (!lastLocation) {
    return { error: "No location on file yet. Open Atlas on Prathmesh's phone and grant location permission when prompted." };
  }
  const ageMs = Date.now() - lastLocation.timestamp;
  if (ageMs > MAX_AGE_MS) {
    return { error: `Last known location is ${Math.round(ageMs / 60000)} minutes old and considered stale.`, lastKnown: lastLocation };
  }
  return { lat: lastLocation.lat, lng: lastLocation.lng, accuracy: lastLocation.accuracy, ageSeconds: Math.round(ageMs / 1000) };
}

module.exports = {
  setLocation,
  tools: [
    {
      toolSchema: {
        name: "device_location",
        description: "Get Prathmesh's current device location (latitude/longitude from phone GPS), if the Atlas page has reported one recently.",
        input_schema: { type: "object", properties: {} },
      },
      execute: deviceLocation,
    },
  ],
};
