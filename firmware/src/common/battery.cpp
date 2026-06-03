#include "battery.h"

#include "config.h"

void batteryBegin() {
  if (PIN_BATTERY_ADC >= 0) {
    analogReadResolution(12);
    analogSetPinAttenuation(PIN_BATTERY_ADC, BATTERY_ADC_ATTEN);
  }
}

int readBatteryMilliVolts() {
  if (PIN_BATTERY_ADC < 0) {
    return 0;
  }

#if defined(ESP32)
  int measured = analogReadMilliVolts(PIN_BATTERY_ADC);
#else
  int raw = analogRead(PIN_BATTERY_ADC);
  int measured = (raw * 3300) / 4095;
#endif

  return (int)(measured * BATTERY_DIVIDER_RATIO);
}

int batteryPercentFromMilliVolts(int mv) {
  if (mv <= BATTERY_EMPTY_MV) {
    return 0;
  }
  if (mv >= BATTERY_FULL_MV) {
    return 100;
  }
  return (int)(((mv - BATTERY_EMPTY_MV) * 100L) / (BATTERY_FULL_MV - BATTERY_EMPTY_MV));
}

int readBatteryPercent() {
  return batteryPercentFromMilliVolts(readBatteryMilliVolts());
}

