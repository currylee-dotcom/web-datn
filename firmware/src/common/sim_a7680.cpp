#include "sim_a7680.h"

SimA7680::SimA7680(HardwareSerial& serial) : serial_(serial) {}

void SimA7680::begin(int rxPin, int txPin, uint32_t baud, int resetPin) {
  if (resetPin >= 0) {
    pinMode(resetPin, OUTPUT);
    digitalWrite(resetPin, HIGH);
  }
  serial_.begin(baud, SERIAL_8N1, rxPin, txPin);
}

bool SimA7680::waitReady(uint32_t timeoutMs) {
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    if (sendCommand("AT", "OK", 1000)) {
      sendCommand("ATE0", "OK", 1000);
      return true;
    }
    delay(500);
  }
  return false;
}

bool SimA7680::configurePacketData(const char* apn) {
  sendCommand("AT+CFUN=1", "OK", 5000);
  sendCommand("AT+CPIN?", "READY", 3000);
  sendCommand("AT+CGATT=1", "OK", 10000);
  String cmd = "AT+CGDCONT=1,\"IP\",\"";
  cmd += apn;
  cmd += "\"";
  return sendCommand(cmd, "OK", 3000);
}

bool SimA7680::postJson(const char* url, const String& json, const char* bearerToken) {
  sendCommand("AT+HTTPTERM", "OK", 1000);
  if (!sendCommand("AT+HTTPINIT", "OK", 3000)) return false;
  if (!sendCommand("AT+HTTPPARA=\"CID\",1", "OK", 2000)) return false;

  String urlCmd = "AT+HTTPPARA=\"URL\",\"";
  urlCmd += url;
  urlCmd += "\"";
  if (!sendCommand(urlCmd, "OK", 3000)) return false;
  if (!sendCommand("AT+HTTPPARA=\"CONTENT\",\"application/json\"", "OK", 2000)) return false;

  if (bearerToken != nullptr && strlen(bearerToken) > 0) {
    String tokenCmd = "AT+HTTPPARA=\"USERDATA\",\"Authorization: Bearer ";
    tokenCmd += bearerToken;
    tokenCmd += "\"";
    sendCommand(tokenCmd, "OK", 2000);
  }

  String dataCmd = "AT+HTTPDATA=" + String(json.length()) + ",10000";
  if (!sendCommand(dataCmd, "DOWNLOAD", 3000)) return false;
  serial_.print(json);
  if (!waitFor("OK", 12000)) return false;
  if (!sendCommand("AT+HTTPACTION=1", "+HTTPACTION:", 30000)) return false;
  sendCommand("AT+HTTPTERM", "OK", 2000);
  return true;
}

bool SimA7680::sendSms(const char* phone, const String& text) {
  if (phone == nullptr || strlen(phone) == 0) {
    return false;
  }
  if (!sendCommand("AT+CMGF=1", "OK", 2000)) return false;

  String cmd = "AT+CMGS=\"";
  cmd += phone;
  cmd += "\"";
  if (!sendCommand(cmd, ">", 5000)) return false;
  serial_.print(text);
  serial_.write(0x1A);
  return waitFor("OK", 30000);
}

String SimA7680::readUntil(uint32_t timeoutMs) {
  String out;
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    while (serial_.available()) {
      out += (char)serial_.read();
    }
    delay(5);
  }
  return out;
}

bool SimA7680::sendCommand(const String& command, const char* expect, uint32_t timeoutMs) {
  while (serial_.available()) {
    serial_.read();
  }
  serial_.println(command);
  return waitFor(expect, timeoutMs);
}

bool SimA7680::waitFor(const char* expect, uint32_t timeoutMs) {
  String buffer;
  uint32_t start = millis();
  while (millis() - start < timeoutMs) {
    while (serial_.available()) {
      char c = (char)serial_.read();
      buffer += c;
      if (buffer.indexOf(expect) >= 0) {
        return true;
      }
      if (buffer.indexOf("ERROR") >= 0) {
        Serial.print("SIM ERROR: ");
        Serial.println(buffer);
        return false;
      }
    }
    delay(10);
  }
  Serial.print("SIM timeout waiting for ");
  Serial.println(expect);
  Serial.println(buffer);
  return false;
}

