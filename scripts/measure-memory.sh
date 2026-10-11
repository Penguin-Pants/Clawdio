#!/usr/bin/env bash
# Milestone 0 idle memory on Linux (P3.5, D28): the sum of PSS over the app process tree,
# WebKit processes included. Each Library mode runs RUNS times; the value per mode is the
# median. The gate value is the worst mode. Needs a display (use xvfb-run on CI).
# Usage: scripts/measure-memory.sh <app binary> [output.json]
# Environment: RUNS (default 3), STARTUP_SECONDS (default 15), IDLE_SECONDS (default 60).
set -euo pipefail

BINARY=${1:?usage: measure-memory.sh <app binary> [output.json]}
OUTPUT=${2:-memory-linux.json}
RUNS=${RUNS:-3}
STARTUP_SECONDS=${STARTUP_SECONDS:-15}
IDLE_SECONDS=${IDLE_SECONDS:-60}
MODES=(tree columns topBottom)

# The app process and all its descendants.
tree_pids() {
  local root=$1
  local pids=("$root") index=0
  while [ "$index" -lt "${#pids[@]}" ]; do
    local parent=${pids[$index]}
    for child in $(ps -o pid= --ppid "$parent" 2>/dev/null); do pids+=("$child"); done
    index=$((index + 1))
  done
  echo "${pids[@]}"
}

# PSS in kB of one process.
pss_kb() {
  awk '/^Pss:/ { print $2; exit }' "/proc/$1/smaps_rollup" 2>/dev/null || echo 0
}

median() {
  printf '%s\n' "$@" | sort -n | awk '{ v[NR] = $1 } END { print v[int((NR + 1) / 2)] }'
}

json_runs=()
json_modes=()
worst=0
for mode in "${MODES[@]}"; do
  totals=()
  for run in $(seq 1 "$RUNS"); do
    CLAWDIO_MEASURE_MODE=$mode "$BINARY" >/dev/null 2>&1 &
    app=$!
    sleep $((STARTUP_SECONDS + IDLE_SECONDS))
    processes=()
    total=0
    for pid in $(tree_pids "$app"); do
      name=$(tr -d '\n' < "/proc/$pid/comm" 2>/dev/null || echo gone)
      kb=$(pss_kb "$pid")
      total=$((total + kb))
      processes+=("{\"pid\":$pid,\"name\":\"$name\",\"pssKb\":$kb}")
    done
    pkill -TERM -P "$app" 2>/dev/null || true
    kill "$app" 2>/dev/null || true
    wait "$app" 2>/dev/null || true
    totals+=("$total")
    json_runs+=("{\"mode\":\"$mode\",\"run\":$run,\"totalKb\":$total,\"processes\":[$(IFS=,; echo "${processes[*]}")]}")
    echo "$mode run $run: $((total / 1024)) MB" >&2
  done
  value=$(median "${totals[@]}")
  [ "$value" -gt "$worst" ] && worst=$value
  json_modes+=("\"$mode\":$value")
done

kernel=$(uname -r)
os=$(. /etc/os-release && echo "$PRETTY_NAME")
memory=$(awk '/^MemTotal:/ { print $2 }' /proc/meminfo)
cpus=$(nproc)
webkit=$(pkg-config --modversion webkit2gtk-4.1 2>/dev/null || echo unknown)
cat > "$OUTPUT" <<JSON
{
  "os": "linux",
  "metric": "sum of PSS over the app process tree (D28)",
  "environment": {"system": "$os", "kernel": "$kernel", "memTotalKb": $memory, "cpus": $cpus, "webkitgtk": "$webkit", "display": "${DISPLAY:-none}"},
  "settings": {"runs": $RUNS, "startupSeconds": $STARTUP_SECONDS, "idleSeconds": $IDLE_SECONDS},
  "medianKbPerMode": {$(IFS=,; echo "${json_modes[*]}")},
  "gateKb": $worst,
  "runs": [$(IFS=,; echo "${json_runs[*]}")]
}
JSON
echo "gate value: $((worst / 1024)) MB (worst mode median)" >&2
