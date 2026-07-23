# GitHub Copilot Agent Instructions

## Dependency Support Status Checks

**Before adding, updating, or reviewing any dependency, always verify its support status.** This applies to all dependency types:

### Node.js Runtime
- Check the [Node.js Release Schedule](https://nodejs.org/en/about/previous-releases) to confirm the version in `Dockerfile` and any `pkg` build targets are on an **Active LTS** or **Maintenance LTS** release.
- Node versions in **End-of-Life (EOL)** status must not be used. Update to the current Active LTS.
- `pkg` build target strings (e.g. `node22-linux-x64`) must match the chosen Node LTS major version.

### npm Packages (`package.json`)
- Run `npm outdated` to identify packages behind their latest release.
- Run `npm audit` to check for known security vulnerabilities. Address **critical** and **high** severity issues immediately. Evaluate **moderate** and **low** issues for risk.
- Verify each package is actively maintained:
  - Check the package's GitHub repository for recent activity (commits, releases, open issues).
  - Check npm for deprecation notices (`npm show <package>`).
  - Packages that are **deprecated**, **unmaintained**, or whose latest version still contains unpatched critical CVEs should be replaced with a maintained alternative.
- When updating a package across a **major version boundary**, review the changelog or migration guide for breaking API changes and update call sites accordingly.

### GitHub Actions
- Pin each `uses:` step to the **latest major version tag** (e.g. `actions/checkout@v4`).
- Review the [GitHub Actions Marketplace](https://github.com/marketplace?type=actions) or the action's releases page periodically for new major versions.
- Avoid using `@main` or unpinned SHA refs in production workflows.

### Docker Base Images
- Use the **latest stable** image for the chosen major version (e.g. `node:22-bookworm-slim`).
- Prefer `slim` variants to minimise attack surface.
- Do not use images tagged only as `latest` in the `Dockerfile` — always include the major version so updates are intentional.

### Workflow for Dependency Updates
1. Identify outdated/EOL/vulnerable dependencies using the tools above.
2. Check the advisory database ([GitHub Advisory Database](https://github.com/advisories), [NIST NVD](https://nvd.nist.gov/)) for CVE details.
3. Update the version range in `package.json` (or the image tag in `Dockerfile`).
4. Run `npm install` to regenerate `package-lock.json`.
5. Run `npm run dist` (TypeScript build) to confirm no compilation errors.
6. Run `npm audit` again to confirm vulnerability count has decreased.
7. Commit all changed files (`package.json`, `package-lock.json`, `Dockerfile`, any source fixes).
