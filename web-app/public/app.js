const state = {
  token: localStorage.getItem("token") || "",
  user: null,
  gateway: null,
  geofence: null,
  readings: [],
  mode: "realtime",
  lastRegisteredCode: "",
  registrationToken: "",
  map: null,
  mapEngine: "pending",
  mapTileLayer: null,
  mapTileErrors: 0,
  mapTileLoads: 0,
  mapHealthTimers: [],
  layers: {},
  fallbackView: null,
  refreshTimer: null
};

const INVALID_COLLAR_ID_MESSAGE =
  "Mã ID không hợp lệ. Vui lòng nhập đúng định dạng MAC (VD: B0:A1:C2:D3:E4:F5)";
const INVALID_FARM_CODE_MESSAGE = "Mã trang trại phải gồm 6 số";
const COLLAR_MAC_PATTERN = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/;
const PREFER_FALLBACK_MAP = false;
const MAP_FRAME_RADIUS_M = 320;

const els = {
  entryView: document.getElementById("entryView"),
  appView: document.getElementById("appView"),
  registerModeBtn: document.getElementById("registerModeBtn"),
  loginModeBtn: document.getElementById("loginModeBtn"),
  registerForm: document.getElementById("registerForm"),
  registerFarmCode: document.getElementById("registerFarmCode"),
  collarId: document.getElementById("collarId"),
  collarIdError: document.getElementById("collarIdError"),
  generateCodeBtn: document.getElementById("generateCodeBtn"),
  registerMessage: document.getElementById("registerMessage"),
  loginForm: document.getElementById("loginForm"),
  loginCode: document.getElementById("loginCode"),
  loginError: document.getElementById("loginError"),
  successModal: document.getElementById("successModal"),
  successText: document.getElementById("successText"),
  finishRegisterBtn: document.getElementById("finishRegisterBtn"),
  addMoreBtn: document.getElementById("addMoreBtn"),
  farmName: document.getElementById("farmName"),
  farmCodeLabel: document.getElementById("farmCodeLabel"),
  refreshBtn: document.getElementById("refreshBtn"),
  logoutBtn: document.getElementById("logoutBtn"),
  realtimeTab: document.getElementById("realtimeTab"),
  historyTab: document.getElementById("historyTab"),
  geofenceTab: document.getElementById("geofenceTab"),
  mapCanvas: document.getElementById("map"),
  fallbackMap: document.getElementById("fallbackMap"),
  deviceSelect: document.getElementById("deviceSelect"),
  distanceValue: document.getElementById("distanceValue"),
  batteryValue: document.getElementById("batteryValue"),
  rssiValue: document.getElementById("rssiValue"),
  updatedValue: document.getElementById("updatedValue"),
  radiusInput: document.getElementById("radiusInput"),
  radiusNumber: document.getElementById("radiusNumber"),
  saveFenceBtn: document.getElementById("saveFenceBtn"),
  alertsList: document.getElementById("alertsList")
};

function api(path, options = {}) {
  return fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: state.token ? `Bearer ${state.token}` : "",
      ...(options.headers || {})
    }
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const error = new Error(data.message || data.error || "Yêu cầu thất bại");
      error.code = data.error || "";
      throw error;
    }
    return data;
  });
}

function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function normalizeDevice(value) {
  return String(value || "").trim().toUpperCase();
}

function messageFor(error) {
  const code = error && error.message ? error.message : String(error || "");
  return code || "Yêu cầu thất bại";
}

function setCollarIdError(message = "") {
  els.collarIdError.textContent = message;
  els.collarIdError.hidden = !message;
}

function clearRegisterFeedback() {
  setCollarIdError("");
  els.registerMessage.textContent = "";
}

function showEntry(mode = "register", message = "") {
  els.entryView.hidden = false;
  els.appView.hidden = true;
  els.registerForm.hidden = mode !== "register";
  els.loginForm.hidden = mode !== "login";
  els.registerModeBtn.classList.toggle("active", mode === "register");
  els.loginModeBtn.classList.toggle("active", mode === "login");
  els.loginError.hidden = !message;
  els.loginError.textContent = message;
  if (mode === "register") {
    els.loginError.textContent = "";
    els.loginError.hidden = true;
  } else {
    clearRegisterFeedback();
  }
  setTimeout(() => (mode === "register" ? els.registerFarmCode : els.loginCode).focus(), 0);
}

function showApp() {
  els.entryView.hidden = true;
  els.appView.hidden = false;
  invalidateMapSize(50);
}

function invalidateMapSize(delay = 200) {
  setTimeout(() => {
    const map = state.map;
    if (map && state.mapEngine === "leaflet") {
      map.invalidateSize();
    }
  }, delay);
}

function showRegisterSuccess(data) {
  state.lastRegisteredCode = data.user.loginCode;
  state.registrationToken = data.registrationToken || state.registrationToken;
  els.successText.textContent = `Mã ${data.deviceId} đã được gắn vào trang trại ${data.user.loginCode}.`;
  els.successModal.hidden = false;
}

function hideRegisterSuccess() {
  els.successModal.hidden = true;
}

function formatDistance(meters) {
  if (!Number.isFinite(meters)) return "--";
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
}

function formatTime(iso) {
  if (!iso) return "--";
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(new Date(iso));
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function cowIconSvg() {
  return [
    '<svg viewBox="0 0 64 64" aria-hidden="true">',
    '<path d="M17 24 8 15c-2-2-1-5 2-6l13 8" fill="#d6b06a" stroke="#263126" stroke-width="2" stroke-linejoin="round"></path>',
    '<path d="M47 24 56 15c2-2 1-5-2-6l-13 8" fill="#d6b06a" stroke="#263126" stroke-width="2" stroke-linejoin="round"></path>',
    '<path d="M15 19c0-8 7-13 17-13s17 5 17 13v14c0 12-7 22-17 22S15 45 15 33V19Z" fill="#fff8ec" stroke="#263126" stroke-width="3"></path>',
    '<path d="M20 18c2-6 8-8 14-7-3 5-6 8-14 7ZM44 21c-6 1-10-1-13-7 8-1 13 2 13 7Z" fill="#262a25"></path>',
    '<circle cx="25" cy="32" r="3" fill="#263126"></circle>',
    '<circle cx="39" cy="32" r="3" fill="#263126"></circle>',
    '<path d="M23 42c2-5 16-5 18 0 1 5-3 9-9 9s-10-4-9-9Z" fill="#e8a8a1" stroke="#263126" stroke-width="2"></path>',
    '<circle cx="29" cy="44" r="1.7" fill="#263126"></circle>',
    '<circle cx="35" cy="44" r="1.7" fill="#263126"></circle>',
    "</svg>"
  ].join("");
}

function gatewayIconSvg() {
  return [
    '<svg viewBox="0 0 64 64" aria-hidden="true">',
    '<path d="M32 13 20 53h24L32 13Z" fill="#f7fbff" stroke="#174a61" stroke-width="3" stroke-linejoin="round"></path>',
    '<path d="M25 39h14M23 47h18M28 30h8M32 13v40" fill="none" stroke="#174a61" stroke-width="2" stroke-linecap="round"></path>',
    '<path d="M18 19a20 20 0 0 1 28 0M12 12a29 29 0 0 1 40 0" fill="none" stroke="#4e9bc0" stroke-width="4" stroke-linecap="round"></path>',
    '<circle cx="32" cy="13" r="5" fill="#e5c560" stroke="#174a61" stroke-width="2"></circle>',
    "</svg>"
  ].join("");
}

function markerHtml(kind, label) {
  const icon = kind === "cow" ? cowIconSvg() : gatewayIconSvg();
  return `<div class="marker-badge">${icon}</div><span class="marker-caption">${escapeHtml(label)}</span>`;
}

function markerIcon(kind, text) {
  return L.divIcon({
    className: `map-marker ${kind}-marker`,
    html: markerHtml(kind, text),
    iconSize: [58, 64],
    iconAnchor: [29, 56]
  });
}

function handleIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="fence-handle"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

function activateFallbackMap() {
  clearMapHealthChecks();
  state.mapEngine = "fallback";
  els.mapCanvas.hidden = true;
  els.fallbackMap.hidden = false;
}

function activateLeafletMap() {
  state.mapEngine = "leaflet";
  els.mapCanvas.hidden = false;
  els.fallbackMap.hidden = true;
}

function clearMapHealthChecks() {
  for (const timer of state.mapHealthTimers) {
    clearTimeout(timer);
  }
  state.mapHealthTimers = [];
}

function checkLeafletTileCoverage(minCoverage = 0.95) {
  if (state.mapEngine !== "leaflet") return;
  const mapRect = els.mapCanvas.getBoundingClientRect();
  if (mapRect.width < 20 || mapRect.height < 20) return;

  const tiles = Array.from(els.mapCanvas.querySelectorAll(".leaflet-tile"));
  const visibleTiles = tiles.filter((tile) => {
    const rect = tile.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > mapRect.top && rect.top < mapRect.bottom && rect.right > mapRect.left && rect.left < mapRect.right;
  });
  if (visibleTiles.length === 0) return;

  const loadedTiles = visibleTiles.filter(
    (tile) => tile.complete && tile.naturalWidth > 0 && tile.classList.contains("leaflet-tile-loaded")
  ).length;
  const coverage = loadedTiles / visibleTiles.length;
  if (loadedTiles === 0 || coverage < minCoverage) {
    activateFallbackMap();
    void drawMode();
  }
}

function scheduleMapHealthChecks() {
  clearMapHealthChecks();
  if (state.mapEngine !== "leaflet") return;
  state.mapHealthTimers.push(setTimeout(() => checkLeafletTileCoverage(0.2), 1800));
  state.mapHealthTimers.push(setTimeout(() => checkLeafletTileCoverage(0.95), 4200));
}

function ensureMap() {
  if (PREFER_FALLBACK_MAP) {
    activateFallbackMap();
    return;
  }
  if (state.mapEngine === "fallback") return;
  if (typeof L === "undefined") {
    activateFallbackMap();
    return;
  }
  activateLeafletMap();
  if (state.map) return;

  state.map = L.map("map", {
    zoomControl: false,
    attributionControl: true
  }).setView([10.776889, 106.700806], 16);
  L.control.zoom({ position: "bottomright" }).addTo(state.map);

  state.mapTileLayer = L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution: "Tiles &copy; Esri"
    }
  );
  state.mapTileLayer.on("tileload", () => {
    state.mapTileLoads += 1;
  });
  state.mapTileLayer.on("tileerror", () => {
    state.mapTileErrors += 1;
    if (
      (state.mapTileErrors >= 2 && state.mapTileLoads === 0) ||
      (state.mapTileErrors >= 8 && state.mapTileErrors > state.mapTileLoads)
    ) {
      activateFallbackMap();
      void drawMode();
    }
  });
  state.mapTileLayer.addTo(state.map);
  setTimeout(() => {
    if (state.mapEngine !== "leaflet") return;
    if (state.mapTileLoads === 0 && state.mapTileErrors > 0) {
      activateFallbackMap();
      void drawMode();
    }
  }, 2500);
}

function clearLayer(name) {
  if (state.layers[name]) {
    state.layers[name].remove();
    delete state.layers[name];
  }
}

function setTabs() {
  els.realtimeTab.classList.toggle("active", state.mode === "realtime");
  els.historyTab.classList.toggle("active", state.mode === "history");
  els.geofenceTab.classList.toggle("active", state.mode === "geofence");
}

function selectedReading() {
  const selected = els.deviceSelect.value;
  return state.readings.find((item) => item.deviceId === selected) || state.readings[0] || null;
}

function updateHeader() {
  if (!state.user) return;
  els.farmName.textContent = state.user.name || `Trang trại ${state.user.loginCode}`;
  els.farmCodeLabel.textContent = state.user.loginCode;
}

function updateMetrics() {
  const reading = selectedReading();
  els.distanceValue.textContent = reading ? formatDistance(reading.distanceM) : "--";
  els.batteryValue.textContent = reading ? `${reading.battery}%` : "--";
  els.rssiValue.textContent = reading ? `${reading.rssi} dBm` : "--";
  els.updatedValue.textContent = reading ? formatTime(reading.createdAt) : "--";
}

function syncDeviceSelect() {
  const current = els.deviceSelect.value;
  els.deviceSelect.innerHTML = "";
  const deviceIds = state.user ? state.user.devices : [];
  for (const id of deviceIds) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = id;
    els.deviceSelect.appendChild(option);
  }
  if (deviceIds.includes(current)) {
    els.deviceSelect.value = current;
  }
}

function updateFenceInputs() {
  if (!state.geofence) return;
  els.radiusInput.value = Math.round(state.geofence.radiusM);
  els.radiusNumber.value = Math.round(state.geofence.radiusM);
}

function gatewayCenter() {
  const lat = Number(state.gateway?.lat ?? state.geofence?.lat ?? 10.776889);
  const lng = Number(state.gateway?.lng ?? state.geofence?.lng ?? 106.700806);
  return [
    Number.isFinite(lat) ? lat : 10.776889,
    Number.isFinite(lng) ? lng : 106.700806
  ];
}

function gatewayPoint() {
  const [lat, lng] = gatewayCenter();
  return { lat, lng };
}

function destinationPoint(lat, lng, metersEast) {
  return offsetPoint(lat, lng, 0, metersEast);
}

function offsetPoint(lat, lng, metersNorth, metersEast) {
  const earthRadiusM = 6371000;
  const dLat = (metersNorth / earthRadiusM) * (180 / Math.PI);
  const dLng = (metersEast / (earthRadiusM * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return [lat + dLat, lng + dLng];
}

function extendStableMapFrame(bounds, center) {
  const lat = Array.isArray(center) ? center[0] : center.lat;
  const lng = Array.isArray(center) ? center[1] : center.lng;
  bounds.extend(offsetPoint(lat, lng, MAP_FRAME_RADIUS_M, MAP_FRAME_RADIUS_M));
  bounds.extend(offsetPoint(lat, lng, -MAP_FRAME_RADIUS_M, -MAP_FRAME_RADIUS_M));
}

function updateFenceFromHandle(handleLatLng) {
  const center = state.layers.fenceCircle.getLatLng();
  const radius = state.map.distance(center, handleLatLng);
  state.geofence.radiusM = Math.max(20, Math.min(10000, radius));
  state.layers.fenceCircle.setRadius(state.geofence.radiusM);
  updateFenceInputs();
}

function clearLeafletLayers() {
  ["cows", "lines", "labels", "history", "fenceCircle", "fenceCenter", "fenceHandle"].forEach(clearLayer);
}

function drawFence() {
  clearLayer("fenceCircle");
  clearLayer("fenceCenter");
  clearLayer("fenceHandle");
  if (!state.map || !state.geofence || state.mapEngine !== "leaflet") return;

  const center = gatewayCenter();
  state.layers.fenceCircle = L.circle(center, {
    radius: state.geofence.radiusM,
    color: "#2f8d59",
    fillColor: "#2f8d59",
    fillOpacity: 0.12,
    opacity: 0.88,
    weight: 3
  }).addTo(state.map);

  state.layers.fenceCenter = L.marker(center, {
    draggable: false,
    icon: markerIcon("gateway", "GW")
  })
    .bindPopup("Trạm thu")
    .addTo(state.map);

  const handle = destinationPoint(center[0], center[1], state.geofence.radiusM);
  state.layers.fenceHandle = L.marker(handle, {
    draggable: state.mode === "geofence",
    icon: handleIcon()
  })
    .bindPopup("Bán kính an toàn")
    .addTo(state.map);
  state.layers.fenceHandle.on("drag", (event) => updateFenceFromHandle(event.target.getLatLng()));
  state.layers.fenceHandle.on("dragend", updateFenceVisualsOnly);
}

function updateLeafletFenceVisualsOnly() {
  if (!state.map || state.mapEngine !== "leaflet" || !state.geofence) return false;
  const center = gatewayCenter();
  if (state.layers.fenceCircle) {
    state.layers.fenceCircle.setLatLng(center);
    state.layers.fenceCircle.setRadius(state.geofence.radiusM);
    state.layers.fenceCircle.bringToBack();
  }
  if (state.layers.fenceCenter) {
    state.layers.fenceCenter.setLatLng(center);
  }
  if (state.layers.fenceHandle) {
    state.layers.fenceHandle.setLatLng(destinationPoint(center[0], center[1], state.geofence.radiusM));
  }
  if (state.layers.lines) {
    let index = 0;
    state.layers.lines.eachLayer((line) => {
      const reading = state.readings[index];
      if (reading && typeof line.setStyle === "function") {
        line.setStyle({ color: reading.distanceM > state.geofence.radiusM ? "#c94735" : "#263126" });
      }
      index += 1;
    });
  }
  return Boolean(state.layers.fenceCircle);
}

function drawRealtime() {
  ensureMap();
  if (state.mapEngine === "fallback" || !state.map) {
    renderFallback(state.readings, []);
    return;
  }
  clearLeafletLayers();
  drawFence();

  const cowGroup = L.layerGroup().addTo(state.map);
  const lineGroup = L.layerGroup().addTo(state.map);
  const labelGroup = L.layerGroup().addTo(state.map);
  state.layers.cows = cowGroup;
  state.layers.lines = lineGroup;
  state.layers.labels = labelGroup;

  const [gatewayLat, gatewayLng] = gatewayCenter();
  const gateway = { lat: gatewayLat, lng: gatewayLng };
  const bounds = L.latLngBounds([[gateway.lat, gateway.lng]]);

  for (const reading of state.readings) {
    const cowPos = [reading.lat, reading.lng];
    const isOutside = Boolean(state.geofence && reading.distanceM > state.geofence.radiusM);
    bounds.extend(cowPos);
    L.marker(cowPos, { icon: markerIcon("cow", reading.deviceId) })
      .bindPopup(
        `Vòng cổ: ${reading.deviceId}<br>` +
          `Khoảng cách: ${formatDistance(reading.distanceM)}<br>` +
          `Pin: ${reading.battery}%<br>` +
          `Cập nhật: ${formatTime(reading.createdAt)}`
      )
      .addTo(cowGroup);
    L.polyline([[gateway.lat, gateway.lng], cowPos], {
      color: isOutside ? "#c94735" : "#263126",
      dashArray: "9 9",
      opacity: 0.9,
      weight: 4
    }).addTo(lineGroup);

    const mid = [(gateway.lat + reading.lat) / 2, (gateway.lng + reading.lng) / 2];
    L.marker(mid, {
      icon: L.divIcon({
        className: "leaflet-distance-label",
        html: `<span>${formatDistance(reading.distanceM)}</span>`,
        iconSize: [96, 30],
        iconAnchor: [48, 15]
      })
    }).addTo(labelGroup);
  }

  if (state.layers.fenceCircle) {
    state.layers.fenceCircle.bringToBack();
  }
  extendStableMapFrame(bounds, gateway);
  if (state.readings.length > 0) {
    state.map.fitBounds(bounds.pad(0.22), { padding: [48, 48], maxZoom: 18, animate: false });
  } else {
    state.map.setView([gateway.lat, gateway.lng], 16);
  }
  invalidateMapSize(0);
  scheduleMapHealthChecks();
}

async function drawHistory() {
  ensureMap();
  const deviceId = els.deviceSelect.value;
  if (!deviceId) return;
  const data = await api(`/api/history?hours=3&deviceId=${encodeURIComponent(deviceId)}`);
  if (state.mapEngine === "fallback" || !state.map) {
    renderFallback(selectedReading() ? [selectedReading()] : [], data.points, data.deviceId);
    return;
  }

  clearLeafletLayers();
  drawFence();
  const group = L.layerGroup().addTo(state.map);
  state.layers.history = group;
  const points = data.points.map((point) => [point.lat, point.lng]);
  if (points.length === 0) {
    invalidateMapSize(0);
    return;
  }

  L.polyline(points, { color: "#2d6f91", weight: 4 }).addTo(group);
  data.points.forEach((point, index) => {
    L.circleMarker([point.lat, point.lng], {
      radius: 6,
      color: "#ffffff",
      fillColor: index === data.points.length - 1 ? "#2f6f4e" : "#d79a2b",
      fillOpacity: 1,
      weight: 2
    })
      .bindPopup(
        `Điểm ${index + 1}<br>` +
          `Thời gian: ${formatTime(point.createdAt)}<br>` +
          `Khoảng cách: ${formatDistance(point.distanceM)}<br>` +
          `Pin: ${point.battery}%`
      )
      .addTo(group);
  });

  const gateway = gatewayPoint();
  L.marker([gateway.lat, gateway.lng], { icon: markerIcon("gateway", "GW") }).addTo(group);
  L.marker(points[points.length - 1], { icon: markerIcon("cow", data.deviceId || deviceId) }).addTo(group);

  const bounds = L.latLngBounds(points);
  bounds.extend([gateway.lat, gateway.lng]);
  if (state.layers.fenceCircle) {
    state.layers.fenceCircle.bringToBack();
  }
  extendStableMapFrame(bounds, gateway);
  state.map.fitBounds(bounds.pad(0.12), { padding: [48, 48], maxZoom: 18, animate: false });
  invalidateMapSize(0);
  scheduleMapHealthChecks();
}

function createFarmProjection(points, width, height) {
  const gateway = gatewayPoint();
  const metersPerLat = 111320;
  const metersPerLng = 111320 * Math.max(Math.cos((gateway.lat * Math.PI) / 180), 0.2);
  const deltas = points.map((point) => ({
    x: (point.lng - gateway.lng) * metersPerLng,
    y: (point.lat - gateway.lat) * metersPerLat
  }));
  const maxX = Math.max(...deltas.map((point) => Math.abs(point.x)), MAP_FRAME_RADIUS_M);
  const maxY = Math.max(...deltas.map((point) => Math.abs(point.y)), MAP_FRAME_RADIUS_M);
  const safeWidth = Math.max(160, width - 110);
  const safeHeight = Math.max(160, height - 110);
  const metersPerPixel = Math.max((maxX * 2.35) / safeWidth, (maxY * 2.35) / safeHeight, 0.45);

  return {
    metersPerPixel,
    project(point) {
      const dx = (point.lng - gateway.lng) * metersPerLng;
      const dy = (point.lat - gateway.lat) * metersPerLat;
      return {
        x: width / 2 + dx / metersPerPixel,
        y: height / 2 - dy / metersPerPixel
      };
    }
  };
}

function midpointXY(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function addFallbackMarker(map, xy, className, html) {
  const marker = document.createElement("div");
  marker.className = `fallback-marker ${className}`;
  marker.style.left = `${xy.x}px`;
  marker.style.top = `${xy.y}px`;
  marker.innerHTML = html;
  map.appendChild(marker);
}

function addDistancePill(map, xy, text) {
  const pill = document.createElement("div");
  pill.className = "distance-pill";
  pill.style.left = `${xy.x}px`;
  pill.style.top = `${xy.y}px`;
  pill.innerHTML = `<span>${escapeHtml(text)}</span>`;
  map.appendChild(pill);
}

function addFallbackScale(map, metersPerPixel) {
  const scale = document.createElement("div");
  scale.className = "fallback-scale";
  scale.textContent = `1 px ~= ${Math.max(1, Math.round(metersPerPixel))} m`;
  map.appendChild(scale);
}

function updateFallbackFenceVisualsOnly() {
  if (state.mapEngine !== "fallback" || !state.geofence || !state.fallbackView) return false;
  const circle = els.fallbackMap.querySelector(".farm-overlay circle");
  if (!circle) return false;
  const radiusM = Math.max(20, Number(state.geofence.radiusM || 500));
  const selected = selectedReading();
  const isOutside = Boolean(selected && selected.distanceM > radiusM);
  const strokeColor = isOutside ? "#c94735" : "#2f8d59";
  circle.setAttribute("r", radiusM / state.fallbackView.metersPerPixel);
  circle.setAttribute("fill", isOutside ? "rgba(201,71,53,0.12)" : "rgba(47,141,89,0.14)");
  circle.setAttribute("stroke", strokeColor);

  els.fallbackMap.querySelectorAll("[data-distance-m]").forEach((line) => {
    const distanceM = Number(line.getAttribute("data-distance-m"));
    line.setAttribute("stroke", distanceM > radiusM ? "#c94735" : "#263126");
  });
  return true;
}

function updateFenceVisualsOnly() {
  if (updateLeafletFenceVisualsOnly() || updateFallbackFenceVisualsOnly()) return;
  void drawMode();
}

function renderFallback(readings, historyPoints = [], historyDeviceId = "") {
  activateFallbackMap();
  const map = els.fallbackMap;
  const gateway = gatewayPoint();
  const radiusM = Math.max(20, Number(state.geofence?.radiusM || 500));
  const activeReadings = (Array.isArray(readings) ? readings : []).filter(Boolean);
  const pointsForBounds = [gateway]
    .concat(activeReadings.map((reading) => ({ lat: reading.lat, lng: reading.lng })))
    .concat((historyPoints || []).map((point) => ({ lat: point.lat, lng: point.lng })));
  const width = Math.max(320, map.clientWidth || 900);
  const height = Math.max(320, map.clientHeight || 560);
  const projection = createFarmProjection(pointsForBounds, width, height);
  const gatewayXY = projection.project(gateway);
  state.fallbackView = {
    metersPerPixel: projection.metersPerPixel,
    gatewayXY
  };
  const radiusPx = radiusM / projection.metersPerPixel;
  const selected = selectedReading();
  const isOutside = Boolean(selected && selected.distanceM > radiusM);
  const strokeColor = isOutside ? "#c94735" : "#2f8d59";
  const children = [
    `<svg class="farm-overlay" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`,
    `<circle cx="${gatewayXY.x}" cy="${gatewayXY.y}" r="${radiusPx}" fill="${
      isOutside ? "rgba(201,71,53,0.12)" : "rgba(47,141,89,0.14)"
    }" stroke="${strokeColor}" stroke-width="3"></circle>`
  ];

  if (state.mode === "history") {
    const polylinePoints = historyPoints
      .map((point) => {
        const xy = projection.project(point);
        return `${xy.x},${xy.y}`;
      })
      .join(" ");
    if (polylinePoints) {
      children.push(
        `<polyline points="${polylinePoints}" fill="none" stroke="#1f6f9a" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>`
      );
    }
  } else {
    activeReadings.forEach((reading) => {
      const cowXY = projection.project(reading);
      const lineColor = reading.distanceM > radiusM ? "#c94735" : "#263126";
      children.push(
        `<line x1="${gatewayXY.x}" y1="${gatewayXY.y}" x2="${cowXY.x}" y2="${cowXY.y}" stroke="${lineColor}" stroke-width="4" stroke-dasharray="9 9" stroke-linecap="round" data-distance-m="${reading.distanceM}"></line>`
      );
    });
  }
  children.push("</svg>");
  map.innerHTML = children.join("");

  addFallbackMarker(map, gatewayXY, "gateway-marker", markerHtml("gateway", "GW"));

  if (state.mode === "history") {
    historyPoints.forEach((point, index) => {
      const xy = projection.project(point);
      const dot = document.createElement("span");
      dot.className = `history-point${index === historyPoints.length - 1 ? " latest" : ""}`;
      dot.style.left = `${xy.x}px`;
      dot.style.top = `${xy.y}px`;
      map.appendChild(dot);
    });
    const latestPoint = historyPoints[historyPoints.length - 1] || activeReadings[0];
    if (latestPoint) {
      const latestXY = projection.project(latestPoint);
      addFallbackMarker(map, latestXY, "cow-marker", markerHtml("cow", historyDeviceId || selected?.deviceId || "Bo"));
      addDistancePill(map, midpointXY(gatewayXY, latestXY), formatDistance(latestPoint.distanceM));
    }
  } else {
    activeReadings.forEach((reading) => {
      const cowXY = projection.project(reading);
      addFallbackMarker(map, cowXY, "cow-marker", markerHtml("cow", reading.deviceId));
      addDistancePill(map, midpointXY(gatewayXY, cowXY), formatDistance(reading.distanceM));
    });
  }

  addFallbackScale(map, projection.metersPerPixel);
}

async function drawMode() {
  setTabs();
  if (state.mode === "history") {
    await drawHistory();
    return;
  }
  drawRealtime();
}

async function refreshAlerts() {
  const data = await api("/api/alerts");
  els.alertsList.innerHTML = "";
  if (data.alerts.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Không có cảnh báo";
    els.alertsList.appendChild(empty);
    return;
  }
  const alert = data.alerts[0];
  const item = document.createElement("div");
  item.className = `alert-item ${alert.type}`;
  item.innerHTML = `<strong>${alert.message}</strong><span>${formatTime(alert.createdAt)}</span>`;
  els.alertsList.appendChild(item);
}

async function refreshData() {
  const data = await api("/api/latest");
  state.gateway = data.gateway;
  state.geofence = data.geofence;
  state.readings = data.readings;
  syncDeviceSelect();
  updateFenceInputs();
  updateMetrics();
  await refreshAlerts();
  await drawMode();
}

async function loginWithCode(code) {
  const cleanCode = digitsOnly(code);
  if (cleanCode.length !== 6) {
    throw new Error("Mã trang trại phải gồm 6 số");
  }
  const data = await api("/api/login", {
    method: "POST",
    body: JSON.stringify({ code: cleanCode })
  });
  state.token = data.token;
  state.user = data.user;
  localStorage.setItem("token", state.token);
  updateHeader();
  showApp();
  ensureMap();
  await refreshData();
  clearInterval(state.refreshTimer);
  state.refreshTimer = setInterval(refreshData, 30000);
}

async function bootstrap() {
  if (!state.token) {
    showEntry("register");
    return;
  }
  try {
    const data = await api("/api/me");
    state.user = data.user;
    state.gateway = data.gateway;
    updateHeader();
    showApp();
    ensureMap();
    await refreshData();
    state.refreshTimer = setInterval(refreshData, 30000);
  } catch (err) {
    localStorage.removeItem("token");
    state.token = "";
    showEntry("login", "Phiên đăng nhập đã hết hạn");
  }
}

function setRadius(value) {
  if (!state.geofence) return;
  const radius = Math.max(20, Math.min(10000, Number(value) || state.geofence.radiusM));
  state.geofence.radiusM = radius;
  updateFenceInputs();
  updateFenceVisualsOnly();
}

els.registerModeBtn.addEventListener("click", () => showEntry("register"));
els.loginModeBtn.addEventListener("click", () => showEntry("login"));

els.registerFarmCode.addEventListener("input", (event) => {
  event.target.value = digitsOnly(event.target.value);
});
els.loginCode.addEventListener("input", (event) => {
  event.target.value = digitsOnly(event.target.value);
});
els.collarId.addEventListener("input", (event) => {
  event.target.value = normalizeDevice(event.target.value);
  setCollarIdError("");
});

els.generateCodeBtn.addEventListener("click", async () => {
  clearRegisterFeedback();
  els.registerMessage.textContent = "Đang tạo mã...";
  try {
    const data = await api("/api/farm-code");
    els.registerFarmCode.value = data.code;
    els.registerMessage.textContent = "";
    els.collarId.focus();
  } catch (err) {
    els.registerMessage.textContent = "Không tạo được mã mới";
  }
});

els.registerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  clearRegisterFeedback();
  const farmCode = digitsOnly(els.registerFarmCode.value);
  const collarId = normalizeDevice(els.collarId.value);
  if (farmCode.length !== 6) {
    els.registerMessage.textContent = INVALID_FARM_CODE_MESSAGE;
    els.registerFarmCode.focus();
    return;
  }
  if (!COLLAR_MAC_PATTERN.test(collarId)) {
    setCollarIdError(INVALID_COLLAR_ID_MESSAGE);
    els.collarId.focus();
    return;
  }
  els.registerMessage.textContent = "Đang lưu...";
  try {
    const data = await api("/api/register-device", {
      method: "POST",
      body: JSON.stringify({ farmCode, collarId, registrationToken: state.registrationToken })
    });
    els.registerMessage.textContent = "";
    showRegisterSuccess(data);
  } catch (err) {
    const message = messageFor(err);
    if (err.message === INVALID_COLLAR_ID_MESSAGE) {
      setCollarIdError(message);
      els.registerMessage.textContent = "";
      els.collarId.focus();
      return;
    }
    els.registerMessage.textContent = message || "Không lưu được thiết bị";
  }
});

els.finishRegisterBtn.addEventListener("click", async () => {
  hideRegisterSuccess();
  try {
    await loginWithCode(state.lastRegisteredCode);
  } catch (err) {
    els.loginCode.value = state.lastRegisteredCode;
    showEntry("login", err.message);
  }
});

els.addMoreBtn.addEventListener("click", () => {
  hideRegisterSuccess();
  els.registerFarmCode.value = state.lastRegisteredCode;
  els.collarId.value = "";
  showEntry("register");
  els.collarId.focus();
});

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await loginWithCode(els.loginCode.value);
  } catch (err) {
    showEntry("login", err.message || "Mã trang trại không hợp lệ");
  }
});

els.logoutBtn.addEventListener("click", () => {
  localStorage.removeItem("token");
  state.token = "";
  state.user = null;
  clearInterval(state.refreshTimer);
  showEntry("login");
});

els.refreshBtn.addEventListener("click", refreshData);
els.deviceSelect.addEventListener("change", async () => {
  updateMetrics();
  await drawMode();
});

els.realtimeTab.addEventListener("click", async () => {
  state.mode = "realtime";
  invalidateMapSize(200);
  await refreshData();
});

els.historyTab.addEventListener("click", async () => {
  state.mode = "history";
  invalidateMapSize(200);
  await refreshData();
});

els.geofenceTab.addEventListener("click", async () => {
  state.mode = "geofence";
  invalidateMapSize(200);
  await refreshData();
});

els.radiusInput.addEventListener("input", (event) => setRadius(event.target.value));
els.radiusNumber.addEventListener("change", (event) => setRadius(event.target.value));

els.saveFenceBtn.addEventListener("click", async () => {
  if (!state.geofence) return;
  const data = await api("/api/geofence", {
    method: "PUT",
    body: JSON.stringify({ radiusM: state.geofence.radiusM })
  });
  state.geofence = data.geofence;
  state.gateway = data.gateway;
  updateFenceInputs();
  updateFenceVisualsOnly();
});

bootstrap();
