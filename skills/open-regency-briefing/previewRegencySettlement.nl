---
description: Ask the installed Regency worker for a read-only projection on one exact persisted basis.
args:
  realm: string
  basis: string
  months: Horizon
returns: RegencyForecast | null
---
Call regencyForecast.preview with the exact realm, basis and months. Return the result unchanged.
