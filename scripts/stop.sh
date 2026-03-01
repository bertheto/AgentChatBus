#!/bin/bash
# stop.sh
# Immediately stop AgentChatBus without restarting (Linux/Mac).
# Usage:  bash scripts/stop.sh
# Usage (custom port):  PORT=8080 bash scripts/stop.sh

set -e

# Default values
PORT="${PORT:-39765}"

# Change to script directory
cd "$(dirname "$0")/.."

echo "🛑 Stopping AgentChatBus (port $PORT)..."

# Kill any Python processes running src.main
found=false
if pkill -f "src.main"; then
    found=true
fi

# Also free the port in case a stray process is still holding it
pid=$(lsof -ti:$PORT 2>/dev/null)
if [ -n "$pid" ]; then
    kill -9 "$pid" 2>/dev/null || true
    found=true
fi

if [ "$found" = true ]; then
    echo "✅ AgentChatBus stopped."
else
    echo "ℹ️  No AgentChatBus process found on port $PORT."
fi