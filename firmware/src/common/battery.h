#pragma once

#include <Arduino.h>

void batteryBegin();
int readBatteryMilliVolts();
int batteryPercentFromMilliVolts(int mv);
int readBatteryPercent();

