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
  layers: {},
  refreshTimer: null
};

const INVALID_COLLAR_ID_MESSAGE =
  "Mã ID không hợp lệ. Vui lòng nhập đúng định dạng MAC (VD: B0:A1:C2:D3:E4:F5)";
const INVALID_FARM_CODE_MESSAGE = "Mã trang trại phải gồm 6 số";
const COLLAR_MAC_PATTERN = /^[0-9A-F]{2}(:[0-9A-F]{2}){5}$/;

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
    if (map) {
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

function markerIcon(kind, text) {
  return L.divIcon({
    className: "",
    html: `<div class="marker ${kind}">${text}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
}

function handleIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="marker handle"></div>',
    iconSize: [20, 20],
    iconAnchor: [10, 10]
  });
}

function ensureMap() {
  if (state.map || typeof L === "undefined") return;
  state.map = L.map("map", { zoomControl: true }).setView([10.776889, 106.700806], 16);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 20,
    attribution: "&copy; OpenStreetMap"
  }).addTo(state.map);
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

function destinationPoint(lat, lng, metersEast) {
  const earthRadiusM = 6371000;
  const dLng = (metersEast / (earthRadiusM * Math.cos((lat * Math.PI) / 180))) * (180 / Math.PI);
  return [lat, lng + dLng];
}

function updateFenceFromHandle(handleLatLng) {
  const center = state.layers.fenceCircle.getLatLng();
  const radius = state.map.distance(center, handleLatLng);
  state.geofence.radiusM = Math.max(20, Math.min(10000, radius));
  state.layers.fenceCircle.setRadius(state.geofence.radiusM);
  updateFenceInputs();
}

function drawFence() {
  clearLayer("fenceCircle");
  clearLayer("fenceCenter");
  clearLayer("fenceHandle");
  if (!state.map || !state.geofence) return;

  const center = gatewayCenter();
  state.layers.fenceCircle = L.circle(center, {
    radius: state.geofence.radiusM,
    color: "#2f6f4e",
    dashArray: "8 8",
    fillColor: "#8bbf70",
    fillOpacity: 0.14,
    weight: 2
  }).addTo(state.map);

  state.layers.fenceCenter = L.marker(center, {
    draggable: false,
    icon: markerIcon("gateway", "G")
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
  state.layers.fenceHandle.on("dragend", () => drawMode());
}

function drawRealtime() {
  ensureMap();
  if (!state.map) return;
  ["cows", "lines", "labels", "history"].forEach(clearLayer);
  drawFence();

  const cowGroup = L.layerGroup().addTo(state.map);
  const lineGroup = L.layerGroup().addTo(state.map);
  const labelGroup = L.layerGroup().addTo(state.map);
  state.layers.cows = cowGroup;
  state.layers.lines = lineGroup;
  state.layers.labels = labelGroup;

  const bounds = [];
  const [gatewayLat, gatewayLng] = gatewayCenter();
  const gateway = { lat: gatewayLat, lng: gatewayLng };
  bounds.push([gateway.lat, gateway.lng]);

  for (const reading of state.readings) {
    const cowPos = [reading.lat, reading.lng];
    bounds.push(cowPos);
    L.marker(cowPos, { icon: markerIcon("cow", "B") })
      .bindPopup(
        `Vòng cổ: ${reading.deviceId}<br>` +
          `Khoảng cách: ${formatDistance(reading.distanceM)}<br>` +
          `Pin: ${reading.battery}%<br>` +
          `Cập nhật: ${formatTime(reading.createdAt)}`
      )
      .addTo(cowGroup);
    L.polyline([[gateway.lat, gateway.lng], cowPos], {
      color: "#41362b",
      dashArray: "8 10",
      weight: 2
    }).addTo(lineGroup);

    const mid = [(gateway.lat + reading.lat) / 2, (gateway.lng + reading.lng) / 2];
    L.marker(mid, {
      icon: L.divIcon({
        className: "",
        html: `<div class="distance-label">${formatDistance(reading.distanceM)}</div>`
      })
    }).addTo(labelGroup);
  }

  if (bounds.length > 1) {
    state.map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
  } else {
    state.map.setView(bounds[0], 16);
  }
}

async function drawHistory() {
  ensureMap();
  if (!state.map) return;
  ["cows", "lines", "labels", "history"].forEach(clearLayer);
  drawFence();

  const deviceId = els.deviceSelect.value;
  if (!deviceId) return;
  const data = await api(`/api/history?hours=3&deviceId=${encodeURIComponent(deviceId)}`);
  const group = L.layerGroup().addTo(state.map);
  state.layers.history = group;
  const points = data.points.map((point) => [point.lat, point.lng]);
  if (points.length === 0) {
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
  state.map.fitBounds(points, { padding: [48, 48], maxZoom: 17 });
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
  drawMode();
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
  await refreshData();
});

els.geofenceTab.addEventListener("click", async () => {
  state.mode = "geofence";
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
  await drawMode();
});

bootstrap();
