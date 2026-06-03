# Cattle Collar LoRa GPS System

This workspace now contains:

- `firmware/`: PlatformIO firmware for ESP32 slave collar and gateway.
- `web-app/`: Node.js web app with login code, user-device mapping, realtime map, 3-hour history, geofence, alerts, and gateway ingest API.
- Original Altium files are left untouched.

## Hardware pin map status

The schematic file was parsed from `Thiet_bi_giam_sat_IOT.SchDoc`. It identifies the MCU component as `ESP32-WROOM-32D`, while the requested target is `ESP32-S3-WROOM-1 N16R8`. Because those pinouts are not the same, all firmware pins are centralized in:

`firmware/include/config.h`

Extracted labels from the schematic:

| Function | Schematic label | Current default GPIO |
| --- | --- | --- |
| LoRa SCK | `SCK_LORA_0` | 18 |
| LoRa MISO | `MISO_LORA_0` | 19 |
| LoRa MOSI | `MOSI_LORA_0` | 22 |
| LoRa NSS | `NSS_LORA_0` | 32 |
| LoRa RESET | `RESET_LORA_0` | 23 |
| LoRa DIO0 | `TSEN_LORA_0` | 12 |
| GPS TX -> ESP RX | `RX2_ESP` | 16 |
| ESP TX -> GPS RX | `TX2_ESP` | 17 |
| SIM TX -> ESP RX | `RX1_ESP` | 4 |
| ESP TX -> SIM RX | `TX1_ESP` | 5 |
| SIM RESET | `RESET_SIM` | 27 |
| Battery ADC | not confirmed | 34 |

Confirm these pins against the final ESP32-S3 schematic before flashing real hardware.

## Firmware

Install PlatformIO, then from `firmware/`:

```powershell
pio run -e slave
pio run -e gateway
```

Upload:

```powershell
pio run -e slave -t upload
pio run -e gateway -t upload
```

Important settings in `firmware/include/config.h`:

- `LORA_FREQ_MHZ`, `LORA_SF`, `LORA_BW_KHZ`, `LORA_TX_POWER_DBM`
- `SLAVE_SLEEP_SECONDS`
- `SERVER_URL`
- `GATEWAY_TOKEN`
- `SIM_APN`
- `OWNER_PHONE`
- `GEOFENCE_RADIUS_M`

Slave behavior:

1. Wake every 30 minutes.
2. Wait for GPS fix.
3. Read battery percent.
4. Send JSON payload by LoRa.
5. Enter deep sleep.

Gateway behavior:

1. Listen for LoRa packets.
2. Read gateway GPS when available, otherwise use configured fallback coordinates.
3. Calculate distance by haversine.
4. POST data to web server through A7680C AT HTTP.
5. Poll Render for gateway commands.
6. Send SMS through A7680C when the web server returns an alert command.

## Web app

No npm packages are required.

```powershell
cd web-app
npm start
```

Open:

```text
http://localhost:8080
```

Default farmer login code:

```text
888888
```

Default gateway token:

```text
dev-gateway-token
```

Use environment variables for deployment:

```powershell
$env:PORT="8080"
$env:IOT_GATEWAY_TOKEN="change-this-token"
$env:IOT_ADMIN_TOKEN="change-this-admin-token"
$env:DATA_FILE="C:\tmp\cattle-db.json"
npm start
```

For Render, use the root `render.yaml`. It points Render at `web-app/`, uses `npm start`, and stores the JSON database at `/var/data/db.json` on a persistent disk. The Blueprint uses a `starter` web service because Render persistent disks are for paid web services; if you switch to a free instance, the JSON database will be ephemeral.

## Gateway ingest API

Endpoint:

```text
POST /api/ingest
Authorization: Bearer <IOT_GATEWAY_TOKEN>
Content-Type: application/json
```

Example:

```json
{
  "gatewayId": "gateway-888888",
  "deviceId": "B0:A1:C2:D3:E4:F5",
  "lat": 10.77755,
  "lng": 106.70124,
  "battery": 86,
  "distanceM": 87,
  "gatewayLat": 10.776889,
  "gatewayLng": 106.700806,
  "rssi": -92,
  "snr": 8.5,
  "seq": 1,
  "fix": true
}
```

## User and device provisioning

Data is stored in `web-app/data/db.json`.

Normal farmers can register from the web UI with only:

- `Mã trang trại`: 6 digits.
- `Mã ID vòng cổ`: ESP32 MAC/device ID.

Provision by API:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:8080/api/provision `
  -Headers @{ "X-Admin-Token" = "dev-admin-token" } `
  -ContentType "application/json" `
  -Body '{"loginCode":"123456","name":"Trang trai 123456","phone":"+84000000000","devices":["AA:BB:CC:DD:EE:FF"]}'
```

The mapping is:

```text
User loginCode (6 digits) -> user.devices[] -> collar MAC/deviceId
```

When the gateway posts a `deviceId`, the server finds the owning user by this list. A farmer only sees devices assigned to their login code.

## Gateway command API

When geofence or low-battery rules are violated, the server queues a `send_sms` command for the gateway.

Gateway polls:

```text
GET /api/gateway/commands?gatewayId=gateway-888888
Authorization: Bearer <IOT_GATEWAY_TOKEN>
```

Gateway acknowledges after sending SMS:

```text
POST /api/gateway/commands/<commandId>/ack
Authorization: Bearer <IOT_GATEWAY_TOKEN>
```
