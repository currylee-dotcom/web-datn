#pragma once

#include <Arduino.h>

class SimA7680 {
 public:
  explicit SimA7680(HardwareSerial& serial);
  void begin(int rxPin, int txPin, uint32_t baud, int resetPin);
  bool waitReady(uint32_t timeoutMs);
  bool configurePacketData(const char* apn);
  bool postJson(const char* url, const String& json, const char* bearerToken);
  bool sendSms(const char* phone, const String& text);

 private:
  HardwareSerial& serial_;
  String readUntil(uint32_t timeoutMs);
  bool sendCommand(const String& command, const char* expect, uint32_t timeoutMs);
  bool waitFor(const char* expect, uint32_t timeoutMs);
};

