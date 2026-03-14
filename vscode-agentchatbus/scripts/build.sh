#!/bin/bash

# Build and package AgentChatBus with version bumping
# Usage: ./build.sh [patch|minor|major|none]

BUMP=${1:-patch}

# Move to extension root
cd "$(dirname "$0")/.."

echo "--- AgentChatBus Extension Builder ---"

if [ "$BUMP" != "none" ]; then
    echo "Bumping version ($BUMP)..."
    npm version $BUMP --no-git-tag-version || exit 1
fi

echo "Compiling TypeScript..."
npm run compile || exit 1

mkdir -p dist
VERSION=$(node -p "require('./package.json').version")
VSIX_PATH="dist/agentchatbus-$VERSION.vsix"

echo "Packaging VSIX..."
npx vsce package --out "$VSIX_PATH" || exit 1

echo -e "\nSuccessfully built: $VSIX_PATH"
echo "To install in VS Code: code --install-extension $VSIX_PATH"
echo "To install in Cursor: cursor --install-extension $VSIX_PATH"
