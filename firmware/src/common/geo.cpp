#include "geo.h"

#include <Arduino.h>

double haversineMeters(double lat1, double lng1, double lat2, double lng2) {
  constexpr double earthRadiusM = 6371000.0;
  double phi1 = radians(lat1);
  double phi2 = radians(lat2);
  double dphi = radians(lat2 - lat1);
  double dlambda = radians(lng2 - lng1);

  double a = sin(dphi / 2) * sin(dphi / 2) +
             cos(phi1) * cos(phi2) * sin(dlambda / 2) * sin(dlambda / 2);
  double c = 2 * atan2(sqrt(a), sqrt(1 - a));
  return earthRadiusM * c;
}

