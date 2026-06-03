#pragma once

#include <Arduino.h>
#include <RadioLib.h>

#include "config.h"

class LoraRadio {
 public:
  bool begin();
  bool transmit(const String& payload);
  bool receive(String& payload, uint32_t timeoutMs);
  float lastRssi() const;
  float lastSnr() const;

 private:
  SX1276 radio_ = new Module(PIN_LORA_NSS, PIN_LORA_DIO0, PIN_LORA_RST, RADIOLIB_NC);
};
