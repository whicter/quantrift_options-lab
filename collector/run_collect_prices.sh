#!/bin/sh

RUNTIME="/Users/congrenhan/.quantrift_options_collector"
cd "$RUNTIME"
mkdir -p "$RUNTIME/logs"

LOG="$RUNTIME/logs/collect_prices.launchd.log"
ERR="$RUNTIME/logs/collect_prices.launchd.err.log"

echo "$(date '+%Y-%m-%d %H:%M:%S %Z') launchd collect_prices start" >> "$LOG"

"$RUNTIME/venv/bin/python" -u "$RUNTIME/collect_prices.py" >> "$LOG" 2>> "$ERR"
status=$?

echo "$(date '+%Y-%m-%d %H:%M:%S %Z') launchd collect_prices exit status=$status" >> "$LOG"
exit "$status"
