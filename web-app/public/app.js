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
  alertsList: document.getElementById("alertsList"),
  commandsList: document.getElementById("commandsList"),
  simulateFullBtn: document.getElementById("simulateFullBtn"),
  simulateNormalBtn: document.getElementById("simulateNormalBtn"),
  simulateHistoryBtn: document.getElementById("simulateHistoryBtn"),
  simulateFenceBtn: document.getElementById("simulateFenceBtn"),
  simulateBatteryBtn: document.getElementById("simulateBatteryBtn"),
  simulateResetBtn: document.getElementById("simulateResetBtn"),
  simulateStatus: document.getElementById("simulateStatus")
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
      throw new Error(data.message || data.error || "yeu_cau_that_bai");
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
  const messages = {
    ma_vong_co_khong_hop_le: INVALID_COLLAR_ID_MESSAGE,
    ma_trang_trai_phai_gom_6_so: "Mã trang trại phải gồm 6 số",
    ma_trang_trai_da_ton_tai: "Mã trang trại này đã tồn tại. Hãy nhập mã khác hoặc bấm Tạo mã.",
    vong_co_da_thuoc_trang_trai_khac: "Mã ID vòng cổ này đã được gắn với mã trang trại khác.",
    yeu_cau_that_bai: "Yêu cầu thất bại"
  };
  return messages[code] || code || "Yêu cầu thất bại";
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
  setTimeout(() => state.map && state.map.invalidateSize(), 50);
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
  els.farmName.textContent = state.user.name || `Trang trai ${state.user.loginCode}`;
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

  const center = [state.geofence.lat, state.geofence.lng];
  state.layers.fenceCircle = L.circle(center, {
    radius: state.geofence.radiusM,
    color: "#2f6f4e",
    dashArray: "8 8",
    fillColor: "#8bbf70",
    fillOpacity: 0.14,
    weight: 2
  }).addTo(state.map);

  state.layers.fenceCenter = L.marker(center, {
    draggable: state.mode === "geofence",
    icon: markerIcon("gateway", "G")
  })
    .bindPopup("Trạm thu Gateway")
    .addTo(state.map);

  state.layers.fenceCenter.on("drag", (event) => {
    const pos = event.target.getLatLng();
    state.geofence.lat = pos.lat;
    state.geofence.lng = pos.lng;
    state.layers.fenceCircle.setLatLng(pos);
    state.layers.fenceHandle.setLatLng(destinationPoint(pos.lat, pos.lng, state.geofence.radiusM));
  });
  state.layers.fenceCenter.on("dragend", () => drawMode());

  const handle = destinationPoint(state.geofence.lat, state.geofence.lng, state.geofence.radiusM);
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
  const gateway = state.gateway || {
    lat: state.geofence?.lat || 10.776889,
    lng: state.geofence?.lng || 106.700806
  };
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
    els.simulateStatus.textContent = "Chưa có điểm lịch sử trong 3 giờ gần nhất";
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
  for (const alert of data.alerts) {
    const item = document.createElement("div");
    item.className = `alert-item ${alert.type}`;
    item.innerHTML = `<strong>${alert.message}</strong><span>${formatTime(alert.createdAt)}</span>`;
    els.alertsList.appendChild(item);
  }
}

async function refreshCommands() {
  const data = await api("/api/commands");
  els.commandsList.innerHTML = "";
  if (data.commands.length === 0) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Không có lệnh chờ";
    els.commandsList.appendChild(empty);
    return;
  }
  for (const command of data.commands) {
    const item = document.createElement("div");
    item.className = "command-item";
    item.innerHTML =
      `<strong>${command.status}</strong>` +
      `<span>${command.deviceId} · ${command.message}</span>`;
    els.commandsList.appendChild(item);
  }
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
  await refreshCommands();
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

async function runSimulation(scenario, nextMode = state.mode) {
  const deviceId = els.deviceSelect.value || state.user?.devices?.[0];
  els.simulateStatus.textContent = "Đang tạo dữ liệu mô phỏng...";
  try {
    const data = await api(`/api/simulate/${scenario}`, {
      method: "POST",
      body: JSON.stringify({ deviceId })
    });
    state.mode = nextMode;
    els.simulateStatus.textContent = data.message || "Đã tạo dữ liệu mô phỏng";
    await refreshData();
  } catch (err) {
    els.simulateStatus.textContent = "Không tạo được dữ liệu mô phỏng";
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
    els.registerMessage.textContent = messageFor("ma_trang_trai_phai_gom_6_so");
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
    if (err.message === "ma_vong_co_khong_hop_le") {
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
    body: JSON.stringify(state.geofence)
  });
  state.geofence = data.geofence;
  state.gateway = data.gateway;
  updateFenceInputs();
  await drawMode();
  els.simulateStatus.textContent = "Đã lưu hàng rào ảo";
});

els.simulateFullBtn.addEventListener("click", () => runSimulation("full", "realtime"));
els.simulateNormalBtn.addEventListener("click", () => runSimulation("normal", "realtime"));
els.simulateHistoryBtn.addEventListener("click", () => runSimulation("history", "history"));
els.simulateFenceBtn.addEventListener("click", () => runSimulation("geofence", "realtime"));
els.simulateBatteryBtn.addEventListener("click", () => runSimulation("battery", "realtime"));
els.simulateResetBtn.addEventListener("click", () => runSimulation("reset", "realtime"));

bootstrap();
