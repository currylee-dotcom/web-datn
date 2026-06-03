#pragma once

#include <Arduino.h>
#include <TinyGPSPlus.h>

struct GpsFix {
  bool valid = false;
  double lat = 0;
  double lng = 0;
  uint32_t satellites = 0;
  uint32_t ageMs = 0;
};

class GpsReader {
 public:
  explicit GpsReader(HardwareSerial& serial);
  void begin(int rxPin, int txPin, uint32_t baud);
  GpsFix waitForFix(uint32_t timeoutMs, uint8_t minSatellites);
  GpsFix readCurrent(uint32_t pumpMs);

 private:
  HardwareSerial& serial_;
  TinyGPSPlus gps_;
  void pump(uint32_t durationMs);
  GpsFix currentFix() const;
};

