#include "payload.h"

#include <ArduinoJson.h>

String encodePayload(const CollarPayload& payload) {
  StaticJsonDocument<256> doc;
  doc["v"] = 1;
  doc["deviceId"] = payload.deviceId;
  doc["lat"] = payload.lat;
  doc["lng"] = payload.lng;
  doc["battery"] = payload.batteryPercent;
  doc["seq"] = payload.seq;
  doc["fix"] = payload.gpsFix;

  String out;
  serializeJson(doc, out);
  return out;
}

bool decodePayload(const String& input, CollarPayload& payload) {
  StaticJsonDocument<384> doc;
  DeserializationError err = deserializeJson(doc, input);
  if (err) {
    return false;
  }

  payload.deviceId = doc["deviceId"] | doc["mac"] | "";
  payload.lat = doc["lat"] | 0.0;
  payload.lng = doc["lng"] | 0.0;
  payload.batteryPercent = doc["battery"] | doc["bat"] | 0;
  payload.seq = doc["seq"] | 0;
  payload.gpsFix = doc["fix"] | true;
  return payload.deviceId.length() > 0;
}
