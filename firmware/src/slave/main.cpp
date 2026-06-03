#include <Arduino.h>

#include "app_config.h"
#include "battery.h"
#include "gps_reader.h"
#include "lora_radio.h"
#include "payload.h"

HardwareSerial GpsSerial(1);
GpsReader gps(GpsSerial);
LoraRadio lora;

RTC_DATA_ATTR uint32_t bootSeq = 0;

static void goToSleep() {
  Serial.printf("Sleeping for %lu seconds\n", SLAVE_SLEEP_SECONDS);
  Serial.flush();
  setOptionalOutput(PIN_GPS_PWR, LOW);
  esp_sleep_enable_timer_wakeup((uint64_t)SLAVE_SLEEP_SECONDS * 1000000ULL);
  esp_deep_sleep_start();
}

void setup() {
  Serial.begin(115200);
  delay(200);
  bootSeq++;

  setOptionalOutput(PIN_STATUS_LED, HIGH);
  setOptionalOutput(PIN_GPS_PWR, HIGH);
  batteryBegin();
  gps.begin(PIN_GPS_RX, PIN_GPS_TX, GPS_BAUD);

  CollarPayload payload;
  payload.deviceId = deviceMacId();
  payload.seq = bootSeq;

  Serial.printf("Slave wake seq=%lu id=%s\n", (unsigned long)bootSeq, payload.deviceId.c_str());
  GpsFix fix = gps.waitForFix(GPS_FIX_TIMEOUT_MS, GPS_MIN_SATELLITES);
  payload.gpsFix = fix.valid;
  payload.lat = fix.lat;
  payload.lng = fix.lng;
  payload.batteryPercent = readBatteryPercent();

  Serial.printf("GPS valid=%d lat=%.6f lng=%.6f sats=%lu battery=%d%%\n",
                payload.gpsFix, payload.lat, payload.lng,
                (unsigned long)fix.satellites, payload.batteryPercent);

  bool sent = false;
  if (lora.begin()) {
    String body = encodePayload(payload);
    Serial.print("LoRa payload: ");
    Serial.println(body);
    sent = lora.transmit(body);
  }
  Serial.printf("LoRa sent=%d\n", sent);
  setOptionalOutput(PIN_STATUS_LED, LOW);
  delay(100);
  goToSleep();
}

void loop() {
}

