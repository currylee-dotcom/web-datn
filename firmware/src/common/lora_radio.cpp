#include "lora_radio.h"

#include "app_config.h"

bool LoraRadio::begin() {
  setOptionalOutput(PIN_LORA_PWR, HIGH);
  delay(20);

  SPI.begin(PIN_LORA_SCK, PIN_LORA_MISO, PIN_LORA_MOSI, PIN_LORA_NSS);
  int state = radio_.begin(LORA_FREQ_MHZ, LORA_BW_KHZ, LORA_SF, LORA_CR,
                           LORA_SYNC_WORD, LORA_TX_POWER_DBM, LORA_PREAMBLE_LEN);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.printf("LoRa begin failed: %d\n", state);
    return false;
  }

  radio_.setCRC(true);
  radio_.setOutputPower(LORA_TX_POWER_DBM);
  return true;
}

bool LoraRadio::transmit(const String& payload) {
  int state = radio_.transmit(payload);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.printf("LoRa transmit failed: %d\n", state);
    return false;
  }
  return true;
}

bool LoraRadio::receive(String& payload, uint32_t timeoutMs) {
  (void)timeoutMs;
  int state = radio_.receive(payload);
  if (state == RADIOLIB_ERR_NONE) {
    return true;
  }
  if (state != RADIOLIB_ERR_RX_TIMEOUT) {
    Serial.printf("LoRa receive failed: %d\n", state);
  }
  return false;
}

float LoraRadio::lastRssi() const {
  return radio_.getRSSI();
}

float LoraRadio::lastSnr() const {
  return radio_.getSNR();
}
