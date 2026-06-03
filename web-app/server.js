const crypto = require("crypto");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 10000);
const DATA_FILE = process.env.DATA_FILE
  ? path.resolve(process.env.DATA_FILE)
  : path.join(__dirname, "data", "db.json");
const PUBLIC_DIR = path.join(__dirname, "public");
const GATEWAY_TOKEN = GATEWAY_TOKEN = "dev-gateway-token";
const ADMIN_TOKEN = process.env.IOT_ADMIN_TOKEN || "dev-admin-token";
const GATEWAY_COMMAND_URL = process.env.GATEWAY_COMMAND_URL || "";
const GATEWAY_DEFAULT_LAT = 10.776889;
const GATEWAY_DEFAULT_LNG = 106.700806;
const sessions = new Map();
const registrationClaims = new Map();

app.use(express.json({ limit: "1mb" }));
app.use("/", express.static(PUBLIC_DIR));

function defaultDb() {
  const now = new Date().toISOString();
  return {
    users: [
      {
        id: "farm-888888",
        loginCode: "888888",
        name: "Trang trai 888888",
        phone: "+84000000000",
        devices: ["B0:A1:C2:D3:E4:F5", "B0:A1:C2:D3:E4:F6"],
        geofence: {
          lat: GATEWAY_DEFAULT_LAT,
          lng: GATEWAY_DEFAULT_LNG,
          radiusM: 500
        }
      }
    ],
    gateways: [
      {
        id: "gateway-888888",
        userId: "farm-888888",
        lat: GATEWAY_DEFAULT_LAT,
        lng: GATEWAY_DEFAULT_LNG,
        updatedAt: now
      }
    ],
    readings: [],
    alerts: [],
    gatewayCommands: []
  };
}

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(defaultDb(), null, 2));
  }
}

function migrateDb(db) {
  const base = defaultDb();
  db.users = Array.isArray(db.users) ? db.users : base.users;
  db.gateways = Array.isArray(db.gateways) ? db.gateways : base.gateways;
  db.readings = Array.isArray(db.readings) ? db.readings : [];
  db.alerts = Array.isArray(db.alerts) ? db.alerts : [];
  db.gatewayCommands = Array.isArray(db.gatewayCommands) ? db.gatewayCommands : [];

  for (const user of db.users) {
    user.loginCode = String(user.loginCode || "").replace(/\D/g, "").slice(0, 6);
    if (!/^\d{6}$/.test(user.loginCode)) {
      user.loginCode = randomFarmCode(db);
    }
    user.id = user.id || `farm-${user.loginCode}`;
    user.name = user.name || `Trang trai ${user.loginCode}`;
    user.phone = user.phone || "";
    user.devices = Array.isArray(user.devices) ? Array.from(new Set(user.devices.map(normalizeDeviceId))) : [];
    user.geofence = {
      lat: toNumber(user.geofence?.lat, GATEWAY_DEFAULT_LAT),
      lng: toNumber(user.geofence?.lng, GATEWAY_DEFAULT_LNG),
      radiusM: clamp(toNumber(user.geofence?.radiusM, 500), 20, 10000)
    };
  }

  return db;
}

function readDb() {
  ensureDataFile();
  return migrateDb(JSON.parse(fs.readFileSync(DATA_FILE, "utf8")));
}

function writeDb(db) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

function sendJson(res, status, payload) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function notFound(res) {
  sendJson(res, 404, { error: "khong_tim_thay" });
}

function readBody(req) {
  if (req.body !== undefined) {
    return Promise.resolve(req.body || {});
  }
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("du_lieu_gui_len_qua_lon"));
        req.destroy();
      }
    });
    req.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error("json_khong_hop_le"));
      }
    });
  });
}

function tokenFrom(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) {
    return header.slice("Bearer ".length);
  }
  return "";
}

function requireUser(req, db) {
  const session = sessions.get(tokenFrom(req));
  if (!session) return null;
  return db.users.find((user) => user.id === session.userId) || null;
}

function requireGateway(req) {
  return tokenFrom(req) === GATEWAY_TOKEN;
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}

function normalizeFarmCode(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 6);
}

function normalizeDeviceId(value) {
  return String(value || "").trim().toUpperCase();
}

function validateFarmCode(code) {
  return /^\d{6}$/.test(code);
}

function validateDeviceId(deviceId) {
  return /^[A-Z0-9]{2}(:[A-Z0-9]{2}){2,7}$/.test(deviceId) || /^[A-Z0-9_-]{4,64}$/.test(deviceId);
}

function randomFarmCode(db) {
  const used = new Set((db.users || []).map((user) => String(user.loginCode)));
  for (let i = 0; i < 1000; i += 1) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    if (!used.has(code)) return code;
  }
  throw new Error("khong_tao_duoc_ma_trang_trai");
}

function publicUser(user) {
  return {
    id: user.id,
    loginCode: user.loginCode,
    name: user.name,
    phone: user.phone,
    devices: user.devices,
    geofence: user.geofence
  };
}

function createRegistrationToken(loginCode) {
  const token = crypto.randomBytes(24).toString("hex");
  registrationClaims.set(token, { loginCode, createdAt: Date.now() });
  return token;
}

function validRegistrationToken(loginCode, token) {
  const claim = registrationClaims.get(String(token || ""));
  if (!claim || claim.loginCode !== loginCode) return false;
  const ageMs = Date.now() - claim.createdAt;
  return ageMs < 4 * 60 * 60 * 1000;
}

function userGateway(db, userId) {
  return db.gateways.find((gateway) => gateway.userId === userId) || null;
}

function ensureGateway(db, user, gatewayId = `gateway-${user.loginCode}`) {
  let gateway = db.gateways.find((item) => item.id === gatewayId);
  if (!gateway) {
    gateway = {
      id: gatewayId,
      userId: user.id,
      lat: user.geofence?.lat || GATEWAY_DEFAULT_LAT,
      lng: user.geofence?.lng || GATEWAY_DEFAULT_LNG,
      updatedAt: new Date().toISOString()
    };
    db.gateways.push(gateway);
  }
  gateway.userId = user.id;
  return gateway;
}

function latestReadingsForUser(db, user) {
  const latest = new Map();
  for (const reading of db.readings) {
    if (!user.devices.includes(reading.deviceId)) continue;
    const current = latest.get(reading.deviceId);
    if (!current || new Date(reading.createdAt) > new Date(current.createdAt)) {
      latest.set(reading.deviceId, reading);
    }
  }
  return Array.from(latest.values());
}

function findOwnerByDevice(db, deviceId) {
  return db.users.find((user) => user.devices.includes(deviceId)) || null;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const earthRadiusM = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dphi = toRad(lat2 - lat1);
  const dlambda = toRad(lng2 - lng1);
  const a =
    Math.sin(dphi / 2) ** 2 +
    Math.cos(phi1) * Math.cos(phi2) * Math.sin(dlambda / 2) ** 2;
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointFrom(centerLat, centerLng, metersNorth, metersEast) {
  const earthRadiusM = 6371000;
  const lat = centerLat + (metersNorth / earthRadiusM) * (180 / Math.PI);
  const lng =
    centerLng +
    (metersEast / (earthRadiusM * Math.cos((centerLat * Math.PI) / 180))) * (180 / Math.PI);
  return { lat, lng };
}

function normalizeIngest(body) {
  const deviceId = normalizeDeviceId(body.deviceId || body.macAddress || body.mac || body.collarId);
  const gatewayId = normalizeDeviceId(body.gatewayId || "gateway-888888").toLowerCase();
  const lat = toNumber(body.lat ?? body.latitude, NaN);
  const lng = toNumber(body.lng ?? body.longitude, NaN);
  const gatewayLat = toNumber(body.gatewayLat, NaN);
  const gatewayLng = toNumber(body.gatewayLng, NaN);
  return {
    deviceId,
    gatewayId,
    lat,
    lng,
    battery: clamp(Math.round(toNumber(body.battery ?? body.bat, 0)), 0, 100),
    distanceM: toNumber(body.distanceM, NaN),
    gatewayLat,
    gatewayLng,
    rssi: toNumber(body.rssi, 0),
    snr: toNumber(body.snr, 0),
    seq: Math.max(0, Math.round(toNumber(body.seq, 0))),
    fix: body.fix !== false,
    createdAt: body.createdAt || new Date().toISOString()
  };
}

function smsMessageFor(alertType, deviceId, reading) {
  if (alertType === "geofence") {
    return `Canh bao! Bo ID ${deviceId} da di ra khoi hang rao an toan`;
  }
  if (alertType === "battery") {
    return `Canh bao! Bo ID ${deviceId} sap het pin (${reading.battery}%)`;
  }
  return `Canh bao! Bo ID ${deviceId} can kiem tra`;
}

function queueGatewayCommand(db, user, reading, alert) {
  const gateway = ensureGateway(db, user, reading.gatewayId || `gateway-${user.loginCode}`);
  const command = {
    id: crypto.randomUUID(),
    userId: user.id,
    gatewayId: gateway.id,
    deviceId: reading.deviceId,
    alertId: alert.id,
    type: "send_sms",
    transport: GATEWAY_COMMAND_URL ? "http" : "poll",
    targetPhone: user.phone || "",
    message: smsMessageFor(alert.type, reading.deviceId, reading),
    status: "queued",
    attempts: 0,
    createdAt: new Date().toISOString(),
    deliveredAt: null,
    acknowledgedAt: null,
    lastError: ""
  };
  db.gatewayCommands.push(command);
  return command;
}

function evaluateAlerts(db, user, reading) {
  const now = reading.createdAt;
  const alerts = [];
  const commands = [];
  const fence = user.geofence || {
    lat: reading.gatewayLat || GATEWAY_DEFAULT_LAT,
    lng: reading.gatewayLng || GATEWAY_DEFAULT_LNG,
    radiusM: 500
  };
  const distanceFromFence = haversineMeters(fence.lat, fence.lng, reading.lat, reading.lng);

  if (distanceFromFence > fence.radiusM) {
    alerts.push({
      id: crypto.randomUUID(),
      userId: user.id,
      deviceId: reading.deviceId,
      type: "geofence",
      message: `BÃ² ${reading.deviceId} Ä‘Ã£ vÆ°á»£t hÃ ng rÃ o áº£o: ${Math.round(distanceFromFence)} m`,
      createdAt: now,
      acknowledged: false
    });
  }

  if (reading.battery < 10) {
    alerts.push({
      id: crypto.randomUUID(),
      userId: user.id,
      deviceId: reading.deviceId,
      type: "battery",
      message: `Pin vÃ²ng cá»• ${reading.deviceId} cÃ²n ${reading.battery}%`,
      createdAt: now,
      acknowledged: false
    });
  }

  for (const alert of alerts) {
    commands.push(queueGatewayCommand(db, user, reading, alert));
  }

  db.alerts.push(...alerts);
  return { alerts, commands };
}

function appendReading(db, owner, incoming) {
  if (Number.isFinite(incoming.gatewayLat) && Number.isFinite(incoming.gatewayLng)) {
    const gateway = ensureGateway(db, owner, incoming.gatewayId);
    gateway.lat = incoming.gatewayLat;
    gateway.lng = incoming.gatewayLng;
    gateway.updatedAt = new Date().toISOString();
  }

  const gateway = db.gateways.find((item) => item.id === incoming.gatewayId) || ensureGateway(db, owner);
  const distanceM = Number.isFinite(incoming.distanceM)
    ? incoming.distanceM
    : haversineMeters(gateway.lat, gateway.lng, incoming.lat, incoming.lng);

  const reading = {
    id: crypto.randomUUID(),
    userId: owner.id,
    deviceId: incoming.deviceId,
    gatewayId: incoming.gatewayId,
    lat: incoming.lat,
    lng: incoming.lng,
    battery: incoming.battery,
    distanceM,
    gatewayLat: gateway.lat,
    gatewayLng: gateway.lng,
    rssi: incoming.rssi,
    snr: incoming.snr,
    seq: incoming.seq,
    fix: incoming.fix,
    createdAt: incoming.createdAt
  };

  db.readings.push(reading);
  const result = evaluateAlerts(db, owner, reading);
  return { reading, alerts: result.alerts, commands: result.commands };
}

async function dispatchCommands(commands) {
  if (!GATEWAY_COMMAND_URL || commands.length === 0) return;
  await Promise.all(
    commands.map(async (command) => {
      command.attempts += 1;
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(GATEWAY_COMMAND_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GATEWAY_TOKEN}`
          },
          body: JSON.stringify(command),
          signal: controller.signal
        });
        clearTimeout(timeout);
        command.status = res.ok ? "sent" : "failed";
        command.deliveredAt = res.ok ? new Date().toISOString() : null;
        command.lastError = res.ok ? "" : `HTTP ${res.status}`;
      } catch (err) {
        command.status = "failed";
        command.lastError = err && err.message ? err.message : "khong_gui_duoc_lenh";
      }
    })
  );
}

function nextSequence(db, deviceId) {
  return (
    db.readings
      .filter((item) => item.deviceId === deviceId)
      .reduce((max, item) => Math.max(max, Number(item.seq) || 0), 0) + 1
  );
}

function simulationReading(db, user, deviceId, options = {}) {
  const gateway = ensureGateway(db, user);
  const fence = user.geofence || { lat: gateway.lat, lng: gateway.lng, radiusM: 500 };
  const pos = pointFrom(
    fence.lat,
    fence.lng,
    options.northM ?? 40,
    options.eastM ?? 60
  );
  const distanceM = haversineMeters(gateway.lat, gateway.lng, pos.lat, pos.lng);

  return normalizeIngest({
    gatewayId: gateway.id,
    deviceId,
    lat: pos.lat,
    lng: pos.lng,
    battery: options.battery ?? 84,
    distanceM,
    gatewayLat: gateway.lat,
    gatewayLng: gateway.lng,
    rssi: options.rssi ?? -88,
    snr: options.snr ?? 8.5,
    seq: options.seq ?? nextSequence(db, deviceId),
    fix: true,
    createdAt: options.createdAt || new Date().toISOString()
  });
}

function clearUserDemoData(db, user) {
  db.readings = db.readings.filter((item) => !user.devices.includes(item.deviceId));
  db.alerts = db.alerts.filter((item) => item.userId !== user.id);
  db.gatewayCommands = db.gatewayCommands.filter((item) => item.userId !== user.id);
}

function runSimulation(db, user, scenario, body) {
  const deviceId = normalizeDeviceId(body.deviceId || user.devices[0] || "");
  const commands = [];
  if (!deviceId || !user.devices.includes(deviceId)) {
    return { status: 400, payload: { error: "thiet_bi_khong_hop_le" }, commands };
  }

  if (scenario === "reset") {
    clearUserDemoData(db, user);
    const reading = simulationReading(db, user, deviceId, { battery: 88, northM: 35, eastM: 45 });
    const result = appendReading(db, user, reading);
    commands.push(...result.commands);
    return {
      status: 200,
      payload: { ok: true, message: "ÄÃ£ Ä‘áº·t láº¡i dá»¯ liá»‡u mÃ´ phá»ng", readings: [result.reading] },
      commands
    };
  }

  if (scenario === "normal") {
    const offset = 30 + (nextSequence(db, deviceId) % 6) * 12;
    const reading = simulationReading(db, user, deviceId, {
      battery: 78 + (nextSequence(db, deviceId) % 15),
      northM: offset,
      eastM: 80 - offset
    });
    const result = appendReading(db, user, reading);
    commands.push(...result.commands);
    return {
      status: 201,
      payload: { ok: true, message: "ÄÃ£ táº¡o Ä‘iá»ƒm thá»i gian thá»±c", readings: [result.reading] },
      commands
    };
  }

  if (scenario === "history") {
    const readings = [];
    const now = Date.now();
    const baseSeq = nextSequence(db, deviceId);
    for (let index = 0; index < 6; index += 1) {
      const reading = simulationReading(db, user, deviceId, {
        battery: 92 - index * 3,
        northM: 20 + index * 28,
        eastM: -70 + index * 32,
        rssi: -82 - index * 2,
        snr: 9 - index * 0.3,
        createdAt: new Date(now - (5 - index) * 30 * 60 * 1000).toISOString(),
        seq: baseSeq + index
      });
      const result = appendReading(db, user, reading);
      readings.push(result.reading);
      commands.push(...result.commands);
    }
    return {
      status: 201,
      payload: { ok: true, message: "ÄÃ£ táº¡o 6 Ä‘iá»ƒm lá»‹ch sá»­ trong 3 giá» gáº§n nháº¥t", readings },
      commands
    };
  }

  if (scenario === "geofence") {
    const radius = user.geofence?.radiusM || 500;
    const reading = simulationReading(db, user, deviceId, {
      battery: 72,
      northM: radius + 180,
      eastM: radius + 120,
      rssi: -105,
      snr: 4.2
    });
    const result = appendReading(db, user, reading);
    commands.push(...result.commands);
    return {
      status: 201,
      payload: { ok: true, message: "ÄÃ£ táº¡o tÃ¬nh huá»‘ng vÆ°á»£t hÃ ng rÃ o áº£o", readings: [result.reading] },
      commands
    };
  }

  if (scenario === "battery") {
    const reading = simulationReading(db, user, deviceId, {
      battery: 7,
      northM: 55,
      eastM: 35,
      rssi: -91,
      snr: 7.1
    });
    const result = appendReading(db, user, reading);
    commands.push(...result.commands);
    return {
      status: 201,
      payload: { ok: true, message: "ÄÃ£ táº¡o tÃ¬nh huá»‘ng pin yáº¿u", readings: [result.reading] },
      commands
    };
  }

  if (scenario === "full") {
    clearUserDemoData(db, user);
    const history = runSimulation(db, user, "history", { deviceId });
    commands.push(...history.commands);
    const radius = user.geofence?.radiusM || 500;
    const reading = simulationReading(db, user, deviceId, {
      battery: 7,
      northM: radius + 220,
      eastM: radius + 160,
      rssi: -108,
      snr: 3.9
    });
    const result = appendReading(db, user, reading);
    commands.push(...result.commands);
    return {
      status: 201,
      payload: { ok: true, message: "ÄÃ£ táº¡o lá»‹ch sá»­, vÆ°á»£t rÃ o vÃ  pin yáº¿u" },
      commands
    };
  }

  return { status: 404, payload: { error: "kich_ban_mo_phong_khong_hop_le" }, commands };
}

function registerDevice(db, body) {
  const loginCode = normalizeFarmCode(body.farmCode || body.loginCode || body.code);
  const deviceId = normalizeDeviceId(body.collarId || body.deviceId || body.macAddress || body.mac);
  const registrationToken = String(body.registrationToken || "");

  if (!validateFarmCode(loginCode)) {
    return { status: 400, payload: { error: "ma_trang_trai_phai_gom_6_so" } };
  }
  if (!validateDeviceId(deviceId)) {
    return { status: 400, payload: { error: "ma_vong_co_khong_hop_le" } };
  }

  const deviceOwner = findOwnerByDevice(db, deviceId);
  if (deviceOwner && deviceOwner.loginCode !== loginCode) {
    return {
      status: 409,
      payload: {
        error: "vong_co_da_thuoc_trang_trai_khac",
        message: "MÃ£ ID vÃ²ng cá»• nÃ y Ä‘Ã£ Ä‘Æ°á»£c gáº¯n vá»›i mÃ£ trang tráº¡i khÃ¡c."
      }
    };
  }

  let user = db.users.find((item) => item.loginCode === loginCode);
  let createdFarm = false;
  const codeAlreadyExists = Boolean(user);
  if (!user) {
    createdFarm = true;
    user = {
      id: `farm-${loginCode}`,
      loginCode,
      name: `Trang trai ${loginCode}`,
      phone: "",
      devices: [],
      geofence: {
        lat: GATEWAY_DEFAULT_LAT,
        lng: GATEWAY_DEFAULT_LNG,
        radiusM: 500
      }
    };
    db.users.push(user);
  }

  if (
    codeAlreadyExists &&
    !user.devices.includes(deviceId) &&
    !validRegistrationToken(loginCode, registrationToken)
  ) {
    return {
      status: 409,
      payload: {
        error: "ma_trang_trai_da_ton_tai",
        message: "MÃ£ trang tráº¡i nÃ y Ä‘Ã£ tá»“n táº¡i. HÃ£y nháº­p mÃ£ khÃ¡c hoáº·c báº¥m Táº¡o mÃ£."
      }
    };
  }

  if (!user.devices.includes(deviceId)) {
    user.devices.push(deviceId);
  }
  ensureGateway(db, user);
  const token = validRegistrationToken(loginCode, registrationToken)
    ? registrationToken
    : createRegistrationToken(loginCode);

  return {
    status: 200,
    payload: {
      ok: true,
      createdFarm,
      registrationToken: token,
      user: publicUser(user),
      deviceId,
      deviceCount: user.devices.length
    }
  };
}

async function handleApi(req, res, pathname) {
  const db = readDb();

  if (req.method === "GET" && pathname === "/api/farm-code") {
    return sendJson(res, 200, { code: randomFarmCode(db) });
  }

  if (req.method === "POST" && pathname === "/api/register-device") {
    const result = registerDevice(db, await readBody(req));
    if (result.payload.ok) writeDb(db);
    return sendJson(res, result.status, result.payload);
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const body = await readBody(req);
    const code = normalizeFarmCode(body.code || body.farmCode || body.loginCode);
    if (!validateFarmCode(code)) {
      return sendJson(res, 400, { error: "ma_trang_trai_phai_gom_6_so" });
    }
    const user = db.users.find((item) => item.loginCode === code);
    if (!user) return sendJson(res, 401, { error: "ma_trang_trai_khong_ton_tai" });
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, { userId: user.id, createdAt: Date.now() });
    return sendJson(res, 200, { token, user: publicUser(user) });
  }

  if (req.method === "POST" && pathname === "/api/ingest") {
    if (!requireGateway(req)) {
      return sendJson(res, 401, { error: "token_gateway_khong_hop_le" });
    }

    const incoming = normalizeIngest(await readBody(req));
    if (
      !incoming.deviceId ||
      !incoming.fix ||
      !Number.isFinite(incoming.lat) ||
      !Number.isFinite(incoming.lng)
    ) {
      return sendJson(res, 400, { error: "du_lieu_dinh_vi_khong_hop_le" });
    }

    const owner = findOwnerByDevice(db, incoming.deviceId);
    if (!owner) {
      return sendJson(res, 404, { error: "thiet_bi_chua_duoc_gan_cho_trang_trai", deviceId: incoming.deviceId });
    }

    const result = appendReading(db, owner, incoming);
    await dispatchCommands(result.commands);
    writeDb(db);
    return sendJson(res, 201, {
      ok: true,
      reading: result.reading,
      alerts: result.alerts,
      commands: result.commands
    });
  }

  if (req.method === "POST" && pathname === "/api/provision") {
    if ((req.headers["x-admin-token"] || "") !== ADMIN_TOKEN) {
      return sendJson(res, 401, { error: "token_quan_tri_khong_hop_le" });
    }
    const body = await readBody(req);
    const loginCode = normalizeFarmCode(body.loginCode || body.farmCode || body.code);
    if (!validateFarmCode(loginCode)) {
      return sendJson(res, 400, { error: "ma_trang_trai_phai_gom_6_so" });
    }
    const devices = Array.isArray(body.devices)
      ? body.devices.map(normalizeDeviceId)
      : [normalizeDeviceId(body.deviceId || body.collarId)];
    if (devices.length === 0 || devices.some((device) => !validateDeviceId(device))) {
      return sendJson(res, 400, { error: "ma_vong_co_khong_hop_le" });
    }
    for (const device of devices) {
      const owner = findOwnerByDevice(db, device);
      if (owner && owner.loginCode !== loginCode) {
        return sendJson(res, 409, { error: "vong_co_da_thuoc_trang_trai_khac", deviceId: device });
      }
    }

    let user = db.users.find((item) => item.loginCode === loginCode);
    if (!user) {
      user = {
        id: `farm-${loginCode}`,
        loginCode,
        name: `Trang trai ${loginCode}`,
        phone: "",
        devices: [],
        geofence: {
          lat: GATEWAY_DEFAULT_LAT,
          lng: GATEWAY_DEFAULT_LNG,
          radiusM: 500
        }
      };
      db.users.push(user);
    }
    if (body.name) user.name = String(body.name);
    if (body.phone) user.phone = String(body.phone);
    if (body.geofence) {
      user.geofence = {
        lat: toNumber(body.geofence.lat, user.geofence.lat),
        lng: toNumber(body.geofence.lng, user.geofence.lng),
        radiusM: clamp(toNumber(body.geofence.radiusM, user.geofence.radiusM), 20, 10000)
      };
    }
    for (const device of devices) {
      if (!user.devices.includes(device)) user.devices.push(device);
    }
    ensureGateway(db, user);
    writeDb(db);
    return sendJson(res, 200, { ok: true, user: publicUser(user) });
  }

  if (pathname.startsWith("/api/gateway/")) {
    if (!requireGateway(req)) {
      return sendJson(res, 401, { error: "token_gateway_khong_hop_le" });
    }

    if (req.method === "GET" && pathname === "/api/gateway/commands") {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const gatewayId = normalizeDeviceId(url.searchParams.get("gatewayId") || "").toLowerCase();
      const commands = db.gatewayCommands
        .filter((command) => {
          const sameGateway = !gatewayId || command.gatewayId === gatewayId;
          return sameGateway && ["queued", "failed"].includes(command.status);
        })
        .slice(0, 10);
      const now = new Date().toISOString();
      for (const command of commands) {
        command.status = "delivered";
        command.deliveredAt = now;
      }
      writeDb(db);
      return sendJson(res, 200, { commands });
    }

    const ackMatch = pathname.match(/^\/api\/gateway\/commands\/([^/]+)\/ack$/);
    if (req.method === "POST" && ackMatch) {
      const body = await readBody(req);
      const command = db.gatewayCommands.find((item) => item.id === ackMatch[1]);
      if (!command) return notFound(res);
      command.status = body.ok === false ? "failed" : "acknowledged";
      command.acknowledgedAt = new Date().toISOString();
      command.lastError = body.error ? String(body.error) : "";
      writeDb(db);
      return sendJson(res, 200, { ok: true, command });
    }
  }

  const user = requireUser(req, db);
  if (!user) return sendJson(res, 401, { error: "chua_dang_nhap" });

  if (req.method === "POST" && pathname.startsWith("/api/simulate/")) {
    const scenario = pathname.split("/").pop();
    const body = await readBody(req);
    const result = runSimulation(db, user, scenario, body);
    if (result.payload.ok) {
      await dispatchCommands(result.commands);
      writeDb(db);
    }
    return sendJson(res, result.status, result.payload);
  }

  if (req.method === "GET" && pathname === "/api/me") {
    return sendJson(res, 200, { user: publicUser(user), gateway: userGateway(db, user.id) });
  }

  if (req.method === "GET" && pathname === "/api/latest") {
    return sendJson(res, 200, {
      gateway: userGateway(db, user.id),
      geofence: user.geofence,
      readings: latestReadingsForUser(db, user)
    });
  }

  if (req.method === "GET" && pathname === "/api/history") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const hours = clamp(toNumber(url.searchParams.get("hours"), 3), 1, 24);
    const deviceId = normalizeDeviceId(url.searchParams.get("deviceId") || user.devices[0]);
    if (!user.devices.includes(deviceId)) {
      return sendJson(res, 403, { error: "khong_co_quyen_xem_thiet_bi" });
    }
    const since = Date.now() - hours * 60 * 60 * 1000;
    const points = db.readings
      .filter((item) => item.deviceId === deviceId && new Date(item.createdAt).getTime() >= since)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .slice(-6);
    return sendJson(res, 200, { deviceId, points });
  }

  if (req.method === "PUT" && pathname === "/api/geofence") {
    const body = await readBody(req);
    user.geofence = {
      lat: toNumber(body.lat, user.geofence.lat),
      lng: toNumber(body.lng, user.geofence.lng),
      radiusM: clamp(toNumber(body.radiusM, user.geofence.radiusM), 20, 10000)
    };
    const gateway = ensureGateway(db, user);
    gateway.lat = user.geofence.lat;
    gateway.lng = user.geofence.lng;
    gateway.updatedAt = new Date().toISOString();
    writeDb(db);
    return sendJson(res, 200, { ok: true, geofence: user.geofence, gateway });
  }

  if (req.method === "GET" && pathname === "/api/alerts") {
    const alerts = db.alerts
      .filter((item) => item.userId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 30);
    return sendJson(res, 200, { alerts });
  }

  if (req.method === "GET" && pathname === "/api/commands") {
    const commands = db.gatewayCommands
      .filter((item) => item.userId === user.id)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 30);
    return sendJson(res, 200, { commands });
  }

  return notFound(res);
}

function serveStatic(req, res, pathname) {
  const safePath = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  const filePath = path.normalize(path.join(PUBLIC_DIR, safePath));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.status(403).type("text/plain; charset=utf-8").send("Khong co quyen truy cap");
    return;
  }
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    res.status(404).type("text/plain; charset=utf-8").send("Khong tim thay");
    return;
  }
  res.sendFile(filePath);
}

app.use(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/api/")) {
      await handleApi(req, res, url.pathname);
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (err) {
    const message = err && err.message ? err.message : "loi_may_chu";
    sendJson(res, message === "json_khong_hop_le" ? 400 : 500, { error: message });
  }
});

app.listen(PORT, () => {
  console.log(`Ung dung giam sat gia suc dang chay tai http://localhost:${PORT}`);
});
