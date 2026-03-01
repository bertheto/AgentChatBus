#!/bin/bash
# restart.sh
# One-shot restart script for AgentChatBus (Linux/Mac).
# Usage (from project root):  bash scripts/restart.sh
# Usage (custom port):        LISTEN_HOST=0.0.0.0 PORT=8080 bash scripts/restart.sh
# Usage (network access):     LISTEN_HOST=0.0.0.0 bash scripts/restart.sh  # Exposes to network (USE WITH CAUTION!)

set -e

# Default values
LISTEN_HOST="${LISTEN_HOST:-0.0.0.0}"
PORT="${PORT:-39765}"

# Change to script directory
cd "$(dirname "$0")/.."

echo "🛑 Stopping AgentChatBus (port $PORT)..."

# Kill any Python processes running src.main
pkill -f "src.main" || true

# Also free the port in case a stray process is still holding it
lsof -ti:$PORT | xargs kill -9 2>/dev/null || true

sleep 0.8

echo "🚀 Starting AgentChatBus on ${LISTEN_HOST}:${PORT}..."
if [ "$LISTEN_HOST" = "0.0.0.0" ]; then
    echo "⚠️  WARNING: Binding to 0.0.0.0 exposes the API to all network interfaces!"
    echo "   This may allow unauthorized access from other machines on your network."
    echo "   For local-only access, use LISTEN_HOST=127.0.0.1"
fi

export AGENTCHATBUS_HOST="$LISTEN_HOST"
export AGENTCHATBUS_PORT="$PORT"
.venv/bin/python -m src.main