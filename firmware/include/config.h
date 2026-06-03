#pragma once

/*
  Pin map note:
  The supplied schematic records identify the MCU symbol as ESP32-WROOM-32D,
  while the requested hardware is ESP32-S3-WROOM-1 N16R8. Keep every pin here
  configurable before flashing a real S3 PCB.
*/

#define FW_VERSION "0.1.0"

// -------- LoRa Ra-01H / SX1276 --------
#define PIN_LORA_NSS 32
#define PIN_LORA_RST 23
#define PIN_LORA_DIO0 12
#define PIN_LORA_SCK 18
#define PIN_LORA_MISO 19
#define PIN_LORA_MOSI 22

#define LORA_FREQ_MHZ 915.0
#define LORA_BW_KHZ 125.0
#define LORA_SF 12
#define LORA_CR 5
#define LORA_SYNC_WORD 0x12
#define LORA_TX_POWER_DBM 20
#define LORA_PREAMBLE_LEN 12

// -------- GPS GP-02 --------
// ESP RX receives GPS TXD. ESP TX drives GPS RXD.
#define PIN_GPS_RX 16
#define PIN_GPS_TX 17
#define GPS_BAUD 9600
#define GPS_FIX_TIMEOUT_MS 120000UL
#define GPS_MIN_SATELLITES 4
#define PIN_GPS_PWR -1

// -------- SIM A7680C --------
// ESP RX receives SIM TXD. ESP TX drives SIM RXD.
#define PIN_SIM_RX 4
#define PIN_SIM_TX 5
#define PIN_SIM_RST 27
#define SIM_BAUD 115200
#define SIM_APN "v-internet"
#define SERVER_URL "http://192.168.1.10:8080/api/ingest"
#define GATEWAY_TOKEN "dev-gateway-token"
#define OWNER_PHONE "+84000000000"

// -------- Battery --------
// Confirm this ADC pin from the final ESP32-S3 schematic.
#define PIN_BATTERY_ADC 34
#define BATTERY_ADC_ATTEN ADC_11db
#define BATTERY_DIVIDER_RATIO 2.0f
#define BATTERY_EMPTY_MV 3300
#define BATTERY_FULL_MV 4200
#define BATTERY_LOW_PERCENT 10

// -------- Timing and geofence defaults --------
#define SLAVE_SLEEP_SECONDS (30UL * 60UL)
#define GATEWAY_DEFAULT_LAT 10.776889
#define GATEWAY_DEFAULT_LNG 106.700806
#define GEOFENCE_RADIUS_M 500.0f
#define ALERT_COOLDOWN_MS (15UL * 60UL * 1000UL)

// Optional GPIO power switches. Use -1 when not populated.
#define PIN_LORA_PWR -1
#define PIN_STATUS_LED -1

