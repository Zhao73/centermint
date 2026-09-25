#!/bin/sh
# Copy the built site (repo root, minus sources and tooling) into deploy/dist and publish it to centermint.app.
set -e
cd "$(dirname "$0")/.."
python3 tools/build.py >/dev/null
rm -rf deploy/dist && mkdir -p deploy/dist
rsync -a --exclude '.git' --exclude '.qa' --exclude 'tools' --exclude 'deploy' --exclude 'node_modules' \
  --exclude '*.md' --exclude 'CNAME' --exclude '.gitignore' --exclude '__pycache__' --exclude '.DS_Store' ./ deploy/dist/
cd deploy && npx -y wrangler deploy
