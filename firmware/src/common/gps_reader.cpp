#include "gps_reader.h"

GpsReader::GpsReader(HardwareSerial& serial) : serial_(serial) {}

void GpsReader::begin(int rxPin, int txPin, uint32_t baud) {
  serial_.begin(baud, SERIAL_8N1, rxPin, txPin);
}

GpsFix GpsReader::waitForFix(uint32_t timeoutMs, uint8_t minSatellites) {
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    pump(250);
    GpsFix fix = currentFix();
    if (fix.valid && fix.satellites >= minSatellites) {
      return fix;
    }
  }
  return currentFix();
}

GpsFix GpsReader::readCurrent(uint32_t pumpMs) {
  pump(pumpMs);
  return currentFix();
}

void GpsReader::pump(uint32_t durationMs) {
  uint32_t start = millis();
  while (millis() - start < durationMs) {
    while (serial_.available()) {
      gps_.encode(serial_.read());
    }
    delay(5);
  }
}

GpsFix GpsReader::currentFix() const {
  GpsFix fix;
  fix.valid = gps_.location.isValid();
  fix.lat = gps_.location.lat();
  fix.lng = gps_.location.lng();
  fix.satellites = gps_.satellites.isValid() ? gps_.satellites.value() : 0;
  fix.ageMs = gps_.location.isValid() ? gps_.location.age() : UINT32_MAX;
  return fix;
}

