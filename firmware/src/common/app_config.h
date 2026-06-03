#pragma once

#include <Arduino.h>
#include "config.h"

inline void setOptionalOutput(int pin, uint8_t value) {
  if (pin >= 0) {
    pinMode(pin, OUTPUT);
    digitalWrite(pin, value);
  }
}

inline String deviceMacId() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[18];
  snprintf(buf, sizeof(buf), "%02X:%02X:%02X:%02X:%02X:%02X",
           (uint8_t)(mac >> 40), (uint8_t)(mac >> 32), (uint8_t)(mac >> 24),
           (uint8_t)(mac >> 16), (uint8_t)(mac >> 8), (uint8_t)mac);
  return String(buf);
}

