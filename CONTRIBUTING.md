# Contributing to Radian

## Development Setup

```bash
npm install
npm test
npm run build
```

For Nix users:

```bash
nix develop
npm install
npm test
```

## Pull Requests

- Write tests for new features
- Ensure `npm test` and `npm run build` pass
- Update documentation as needed

## Dependency Updates

### Automated (Dependabot)

When Dependabot creates a PR updating npm dependencies, the `update-npm-hash` workflow automatically:

1. Detects changes to `package.json` or `package-lock.json`
2. Calculates the new `npmDepsHash` for the Nix build
3. Updates `flake.nix` and commits to the PR

**No manual intervention needed** — the workflow runs automatically.

### Manual Dependency Updates

If you're manually updating dependencies:

1. Update `package.json` and run `npm install` to update `package-lock.json`
2. Update the Nix hash:
   ```bash
   nix develop
   ./scripts/update-npm-hash.sh
   ```
3. Commit both `package-lock.json` and `flake.nix`

### Why is this needed?

The Nix build uses `buildNpmPackage`, which requires a content hash (`npmDepsHash`) of the `node_modules` dependencies. When dependencies change, this hash must be updated to match.

Without the correct hash, the `nix-build` CI job fails with:

```
ERROR: npmDepsHash is out of date
The package-lock.json in src is not the same as the in /nix/store/...
```

## Testing Nix Builds Locally

```bash
# Build with Nix
nix build .#radian

# Run the result
./result/bin/radian

# Run flake checks
nix flake check
```

## Questions?

Open an issue or reach out to the maintainers.
