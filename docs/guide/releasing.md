# Releasing

## Version tagging

Respite follows [Semantic Versioning](https://semver.org). To cut a release:

```bash
# 1. Update the version in src-tauri/tauri.conf.json and src-tauri/Cargo.toml
#    (and package.json if you want them in sync)

# 2. Commit the version bump
git add -A
git commit -m "chore: bump version to v1.2.0"

# 3. Tag and push
git tag v1.2.0
git push origin main --tags
```

## What the workflow does

Pushing a `v*` tag triggers `.github/workflows/release.yml`:

1. Checks out the code and installs Rust + Node.js
2. Runs `npm test` — the release is blocked if any test fails
3. Runs `tauri build --target universal-apple-darwin` to produce an Apple-Silicon-and-Intel universal DMG
4. Creates a **draft** GitHub Release with the DMG attached and installation instructions in the body

Review and publish the draft release from the GitHub web UI when you're ready.

## Signing & notarization

The current workflow uses ad-hoc signing (`-`). Recipients must right-click → Open on first launch.

To enable notarization (removes the Gatekeeper prompt entirely), add these secrets to the repository:

| Secret | Description |
|---|---|
| `APPLE_ID` | Your Apple ID email |
| `APPLE_PASSWORD` | App-specific password |
| `APPLE_TEAM_ID` | Your Developer Team ID |

And add the signing identity to `tauri.conf.json`:

```json
"macOS": {
  "signingIdentity": "Developer ID Application: Your Name (TEAMID)"
}
```
