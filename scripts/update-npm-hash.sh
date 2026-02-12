#!/usr/bin/env bash
# Update the npmDepsHash in flake.nix to match current package-lock.json

set -euo pipefail

cd "$(dirname "$0")/.."

echo "Calculating npmDepsHash from package-lock.json..."

# Use nix-prefetch-npm-deps (should be available in dev shell)
if ! command -v prefetch-npm-deps &> /dev/null; then
    echo "Error: prefetch-npm-deps not found"
    echo "Run this script from within 'nix develop' or install prefetch-npm-deps"
    exit 1
fi

# Calculate the hash
HASH=$(prefetch-npm-deps package-lock.json 2>&1)

echo "New npmDepsHash: $HASH"

# Update flake.nix
sed -i "s|npmDepsHash = \"sha256-.*\";|npmDepsHash = \"$HASH\";|g" flake.nix

echo "✓ Updated flake.nix with new npmDepsHash"
echo ""
echo "You can now commit the changes:"
echo "  git add flake.nix"
echo "  git commit -m 'chore: update npmDepsHash'"
