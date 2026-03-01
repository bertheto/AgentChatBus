#!/bin/bash
# restart-127.0.0.1.sh
# One-shot restart script for AgentChatBus (Linux/Mac, localhost only).
# Usage (from project root):  bash scripts/restart-127.0.0.1.sh
# Usage (custom port):        PORT=8080 bash scripts/restart-127.0.0.1.sh
#
# This script binds to 127.0.0.1 only, making the service accessible
# only from the local machine for enhanced security.

set -e

# Default values
LISTEN_HOST="${LISTEN_HOST:-127.0.0.1}"
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
echo "🔒 Binding to 127.0.0.1 (localhost only) - Service will not be accessible from other machines."

export AGENTCHATBUS_HOST="$LISTEN_HOST"
export AGENTCHATBUS_PORT="$PORT"
.venv/bin/python -m src.main