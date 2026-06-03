# Web App - Hệ thống giám sát gia súc

Ứng dụng Node.js thuần, không cần framework build. Mục tiêu là deploy thẳng lên Render sau khi push GitHub.

## Chạy local

```powershell
npm start
```

Mở `http://localhost:8080`.

Mã trang trại demo: `888888`

## Deploy Render

Repo đã có `render.yaml` ở thư mục gốc. Khi tạo Render Blueprint, service sẽ dùng:

- Root Directory: `web-app`
- Build Command: `npm install`
- Start Command: `npm start`
- Data file: `/var/data/db.json`

`render.yaml` dùng web service `starter` vì Render chỉ hỗ trợ persistent disk cho service trả phí. Nếu đổi sang free instance, dữ liệu trong file JSON sẽ mất sau restart/redeploy.

Biến môi trường cần giữ bí mật:

- `IOT_GATEWAY_TOKEN`: token để Gateway gửi dữ liệu và nhận lệnh.
- `IOT_ADMIN_TOKEN`: token provision/admin.
- `GATEWAY_COMMAND_URL`: tùy chọn, URL HTTP công khai của Gateway nếu có. Nếu không có, Gateway poll `/api/gateway/commands`.

## API Gateway gửi dữ liệu

```http
POST /api/ingest
Authorization: Bearer <IOT_GATEWAY_TOKEN>
Content-Type: application/json
```

```json
{
  "gatewayId": "gateway-888888",
  "deviceId": "B0:A1:C2:D3:E4:F5",
  "lat": 10.77755,
  "lng": 106.70124,
  "battery": 86,
  "gatewayLat": 10.776889,
  "gatewayLng": 106.700806,
  "rssi": -92,
  "snr": 8.5,
  "seq": 1,
  "fix": true
}
```

## Gateway nhận lệnh cảnh báo

Gateway có thể poll:

```http
GET /api/gateway/commands?gatewayId=gateway-888888
Authorization: Bearer <IOT_GATEWAY_TOKEN>
```

Sau khi đã gửi SMS bằng A7680C, Gateway xác nhận:

```http
POST /api/gateway/commands/<commandId>/ack
Authorization: Bearer <IOT_GATEWAY_TOKEN>
Content-Type: application/json
```

```json
{ "ok": true }
```

## Luồng người dùng

- Đăng ký thiết bị: nhập mã trang trại 6 số và mã ID vòng cổ.
- Nhập thêm bò: giữ nguyên mã trang trại, xóa mã vòng cổ.
- Hoàn thành: đăng nhập thẳng vào dashboard của mã trang trại vừa đăng ký.
- Dashboard chỉ hiển thị thiết bị thuộc mã trang trại đang đăng nhập.
