# Deployment security review - 2026-10-23

The [Render eMudhra advisory](https://render.com/docs/advisory-emudhra) applies to build-time HTTPS downloads even though this app makes no outbound API requests at runtime. HTTPX is installed for tests/benchmarking, so its Certifi trust bundle is covered too. No host trust settings, application behavior, account permissions or deployment were changed by this review.

## Container changes

- Pin the existing Debian-based frontend stage to `node:22.23.4-bookworm-slim`. This is a [published Node security release](https://nodejs.org/en/blog/release/v22.23.4) and [official Docker tag](https://raw.githubusercontent.com/docker-library/official-images/master/library/node). The checkout did not use Alpine.
- Pin the runtime to `python:3.12.15-slim-trixie`, matching the current Debian family behind `python:3.12-slim`. Both are listed in the [official Python image catalog](https://raw.githubusercontent.com/docker-library/official-images/master/library/python).
- Refresh each image's CA package before downloads and reject versions below Debian's security updates: Bookworm `20250419~deb12u2`; Trixie `20250419+deb13u1`. See the [Debian security tracker](https://security-tracker.debian.org/tracker/source-package/ca-certificates) and [Bookworm update](https://tracker.debian.org/news/1813406/accepted-ca-certificates-20250419deb12u2-source-into-oldstable-security/).
- Upgrade pip to `26.2.2`, whose [changelog](https://pip.pypa.io/en/stable/news/#v26-2-2) confirms vendored Certifi `2026.10.19`. The bootstrap command uses pip's `legacy-certs` path with an explicit, freshly patched Debian bundle to avoid combining it with old bundled roots. This does not disable TLS verification or persist a trust override. See [pip certificate options](https://pip.pypa.io/en/stable/topics/https-certificates/).
- Require application Certifi `2026.10.19` during image installation and assert both bundle versions. [Published package](https://pypi.org/project/certifi/2026.10.19/). Direct application requirements otherwise remain unchanged.

## Verification and deployment gate

Build with `docker build --pull --no-cache -t acme-salary .` to refresh the base images and cached package layers; [Docker documents why both flags matter](https://docs.docker.com/build/building/best-practices/#rebuild-your-images-often). On Render, use a fresh build or clear its build cache before redeploying.

No Docker or Podman executable was available during this review. Image builds, registry pulls, installed container package versions, and rejection of the advisory's two test endpoints have **not** been verified. Do not describe the image as deployment-verified until these checks pass. For certificate testing, use clients inside the resulting image, keep TLS verification enabled, and require a certificate-verification failure rather than treating DNS/timeouts as success. Render's advisory lists both endpoint URLs. No production HTTP client currently exists in this app.

Local inspection found Python `3.12.14`, Node `24.19.0`, application Certifi `2026.10.19`, and pip `25.0.1` with vendored Certifi `2024.08.30`. These local versions do not validate the proposed container. No local dependency downloads or host updates were performed.

Local regression checks passed: 63 backend tests, 46 frontend tests, TypeScript/Vite production build, `git diff --check`, shell syntax for all six Docker `RUN` instructions, and CA-version comparison checks that reject old package versions. These are not a substitute for a container build.

Local verification after these changes: 63 backend tests and 46 frontend tests passed, as did the TypeScript/Vite build, whitespace checks, Docker RUN shell syntax checks, CA version-floor comparisons and the offline pip-bootstrap trust-configuration check. These are not substitutes for building and running the image. Production npm audit on 23 October 2026 reported zero known vulnerabilities; it is not a security guarantee.
