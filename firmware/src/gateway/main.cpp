#include <Arduino.h>
#include <ArduinoJson.h>

#include "app_config.h"
#include "config.h"
#include "geo.h"
#include "gps_reader.h"
#include "lora_radio.h"
#include "payload.h"
#include "sim_a7680.h"

HardwareSerial GpsSerial(1);
HardwareSerial SimSerial(2);
GpsReader gps(GpsSerial);
LoraRadio lora;
SimA7680 sim(SimSerial);

static double gatewayLat = GATEWAY_DEFAULT_LAT;
static double gatewayLng = GATEWAY_DEFAULT_LNG;
static uint32_t lastFenceSmsMs = 0;
static uint32_t lastBatterySmsMs = 0;

static void updateGatewayGps() {
  GpsFix fix = gps.readCurrent(100);
  if (fix.valid && fix.ageMs < 10000) {
    gatewayLat = fix.lat;
    gatewayLng = fix.lng;
  }
}

static String makeServerJson(const CollarPayload& payload, double distanceM, float rssi, float snr) {
  StaticJsonDocument<512> doc;
  doc["gatewayId"] = deviceMacId();
  doc["deviceId"] = payload.deviceId;
  doc["lat"] = payload.lat;
  doc["lng"] = payload.lng;
  doc["battery"] = payload.batteryPercent;
  doc["distanceM"] = distanceM;
  doc["gatewayLat"] = gatewayLat;
  doc["gatewayLng"] = gatewayLng;
  doc["rssi"] = rssi;
  doc["snr"] = snr;
  doc["seq"] = payload.seq;
  doc["fix"] = payload.gpsFix;
  doc["firmware"] = FW_VERSION;

  String out;
  serializeJson(doc, out);
  return out;
}

static void maybeSendAlerts(const CollarPayload& payload, double distanceM) {
  uint32_t now = millis();
  if (distanceM > GEOFENCE_RADIUS_M && now - lastFenceSmsMs > ALERT_COOLDOWN_MS) {
    String msg = "Canh bao: bo ";
    msg += payload.deviceId;
    msg += " vuot rao ao, khoang cach ";
    msg += String(distanceM, 0);
    msg += " m.";
    sim.sendSms(OWNER_PHONE, msg);
    lastFenceSmsMs = now;
  }

  if (payload.batteryPercent < BATTERY_LOW_PERCENT && now - lastBatterySmsMs > ALERT_COOLDOWN_MS) {
    String msg = "Canh bao: pin vong co ";
    msg += payload.deviceId;
    msg += " con ";
    msg += payload.batteryPercent;
    msg += "%.";
    sim.sendSms(OWNER_PHONE, msg);
    lastBatterySmsMs = now;
  }
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("Gateway boot");

  gps.begin(PIN_GPS_RX, PIN_GPS_TX, GPS_BAUD);
  sim.begin(PIN_SIM_RX, PIN_SIM_TX, SIM_BAUD, PIN_SIM_RST);

  if (!lora.begin()) {
    Serial.println("LoRa init failed; retry by reset");
  }

  if (sim.waitReady(30000)) {
    sim.configurePacketData(SIM_APN);
  } else {
    Serial.println("SIM not ready; LoRa receive still active");
  }
}

void loop() {
  updateGatewayGps();

  String raw;
  if (!lora.receive(raw, 3000)) {
    return;
  }

  Serial.print("LoRa RX: ");
  Serial.println(raw);

  CollarPayload payload;
  if (!decodePayload(raw, payload) || !payload.gpsFix) {
    Serial.println("Invalid payload or GPS fix");
    return;
  }

  double distanceM = haversineMeters(gatewayLat, gatewayLng, payload.lat, payload.lng);
  String json = makeServerJson(payload, distanceM, lora.lastRssi(), lora.lastSnr());
  Serial.print("HTTP JSON: ");
  Serial.println(json);

  bool posted = sim.postJson(SERVER_URL, json, GATEWAY_TOKEN);
  Serial.printf("HTTP posted=%d distance=%.1f\n", posted, distanceM);
  maybeSendAlerts(payload, distanceM);
}
