# Versioning and Release — Design

**Date:** 2026-05-20
**Status:** Approved
**Owner:** OrenVill

## Goal

Establish a low-ceremony, automated versioning and release pipeline for `mcp-explorer` so that:

- Every commit on `main` contributes to the next release without per-commit overhead.
- Released versions are visible (git tag + GitHub Release + CHANGELOG).
- A future decision to publish to npm is a one-line change, not a re-architecture.

## Constraints

- **Solo maintainer, single package, GitHub-hosted.** Avoid tooling that assumes a team workflow (changesets per-PR files, etc.).
- **Conventional Commits already in use.** History shows `feat(scope):`, `docs:`, `test(scope):`, `fix:`. Automation should consume that signal directly.
- **npm name conflict.** `mcp-explorer` on the npm registry is held by an unrelated placeholder (`0.0.1`, `UNLICENSED`). We will **not** publish to npm in this iteration. The release pipeline must not require an `NPM_TOKEN` to function.
- **Pre-1.0.** Breaking changes may land in minor bumps. The `0.1.0` → `0.2.0` boundary is not a stability guarantee.

## Approach

### Versioning

- SemVer 2.0, source of truth is `package.json#version`.
- `release-please` (Google's GitHub Action) parses Conventional Commit messages on `main` and proposes the next version.
- `feat:` → minor, `fix:`/`perf:`/`refactor:` → patch, `feat!:` or `BREAKING CHANGE:` footer → major (or pre-1.0 minor — release-please respects the pre-1.0 contract).
- Other types (`docs:`, `chore:`, `test:`, `ci:`) appear in the changelog but do not bump the version on their own.

### Release flow

1. Commits land on `main` via PR (or direct push).
2. The `release-please` action runs on every push to `main`.
3. It maintains a single open "Release PR" that:
   - Bumps `package.json#version`.
   - Regenerates `CHANGELOG.md`.
   - Updates `.release-please-manifest.json`.
4. Merging the Release PR causes release-please to:
   - Create the git tag (`vX.Y.Z`).
   - Create a GitHub Release with the changelog section as the body.
5. A second job in the same workflow, gated on `release_created == true`, builds the production bundle and uploads `dist.tgz` as a release asset.

### CI

A separate workflow (`ci.yml`) runs on every PR and every push to `main`:

- Node 20 LTS, `npm ci`.
- `npm run lint` → `npm run build` → `npm test`.
- Single job, single Node version. We can matrix later if needed.

### npm publishing (deferred)

Not part of this iteration. When we decide to publish, the change is:

1. Pick a name. Options:
   - Scope under the user's npm namespace: `@orenvill/mcp-explorer`.
   - Rename the package and update the `bin` entry.
2. Add an `NPM_TOKEN` repository secret.
3. Add a `publish` step to `release.yml`, gated on `release_created == true`, after the artifact-upload step.

Documenting this in the design so the eventual change is mechanical, not architectural.

## Files added

| Path | Purpose |
|---|---|
| `release-please-config.json` | release-please behavior (package type, changelog sections, pre-1.0 handling). |
| `.release-please-manifest.json` | Tracks the last-released version (`0.1.0` initially). |
| `.github/workflows/ci.yml` | Lint + build + test on PR and push to main. |
| `.github/workflows/release.yml` | release-please + artifact upload on push to main. |
| `CHANGELOG.md` | Created empty; release-please populates it on the first release. |

## Out of scope

- npm publishing (deferred — documented path above).
- Pre-release channels (`next`, `beta`). Single `latest` channel is sufficient for a solo pre-1.0 project.
- Signed tags / provenance. Can be layered on later if/when we publish to npm.
- Multi-Node-version matrix in CI. Add when we have a reason to.

## First release

After merging this PR, release-please will open a Release PR that proposes `0.2.0` (the existing `main` has many `feat:` commits since `0.1.0`). The maintainer can:

- Edit the changelog inline in the Release PR before merging.
- Or close the Release PR and tag manually if a different version is desired — release-please will reopen with adjusted state on the next push.
