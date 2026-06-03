#pragma once

#include <Arduino.h>

struct CollarPayload {
  String deviceId;
  double lat = 0;
  double lng = 0;
  int batteryPercent = 0;
  uint32_t seq = 0;
  bool gpsFix = false;
};

String encodePayload(const CollarPayload& payload);
bool decodePayload(const String& input, CollarPayload& payload);

