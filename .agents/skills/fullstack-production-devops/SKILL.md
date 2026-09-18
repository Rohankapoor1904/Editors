---
name: fullstack-production-devops
description: >-
  Master skill for full-stack software engineering, production readiness, CI/CD automation, and DevOps.
  Use when setting up multi-platform CI pipelines, architecting clean layer boundaries,
  managing package dependencies, conducting vulnerability audits, and preparing production releases.
---

# Master Skill: Full-Stack Production Engineering & DevOps

This skill synthesizes production engineering best practices from `claude-full-stack-2.0` and enterprise software delivery guidelines.

---

## 1. Clean Layered Architecture (Separation of Concerns)

Every robust application should maintain strict separation between presentation, application logic, and infrastructure:

```text
┌─────────────────────────────────────────────────────────────┐
│  Presentation Layer (React, Vue, Svelte, Desktop UI)       │
│  - Zero business logic; pure view components & event dispatch│
└──────────────────────────────┬──────────────────────────────┘
                               │ Dispatches Commands / Actions
┌──────────────────────────────▼──────────────────────────────┐
│  Application & Service Layer (Orchestration & State Store)  │
│  - Command bus, undo/redo stack, workflow coordinators      │
└──────────────────────────────┬──────────────────────────────┘
                               │ Invokes Domain Operations
┌──────────────────────────────▼──────────────────────────────┐
│  Domain Core (Entities, Math Primitives, Invariants)        │
│  - Pure functions, RationalTime, business rules             │
└──────────────────────────────┬──────────────────────────────┘
                               │ Implements Data Access
┌──────────────────────────────▼──────────────────────────────┐
│  Infrastructure / Native / Persistence                      │
│  - Tauri Rust IPC, SQLite, WebGPU, WebAudio, File I/O       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Production CI/CD Matrix & Automated Gates

A production repository must enforce automated validation in `.github/workflows/ci.yml`:

```yaml
name: CI Pipeline

on:
  pull_request:
    branches: [main]
  push:
    branches: [main]

jobs:
  verify:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

---

## 3. Dependency & Security Audits

- **Zero Unaudited Packages**:
  - Run `npm audit --audit-level=high` and `cargo audit` in CI.
  - Pin exact versions in `package-lock.json` and `Cargo.lock`.
  - Prefer small, focused libraries over monolithic kitchen-sink frameworks.
- **Production Asset Optimization**:
  - Code splitting: Dynamic `import()` for heavy routes, models, or modal dialogs.
  - Tree shaking: Ensure bundler (Vite / Webpack) tree-shakes unused icons, lodash utilities, or shader helpers.

---

## 4. Error Boundaries & Production Telemetry

1. **React Error Boundaries**:
   - Wrap major UI panels (Monitor, Timeline, Inspector) in independent `ErrorBoundary` components.
   - If a shader or timeline error occurs, only that panel shows an honest crash card with a "Reset Component" button, leaving the rest of the application responsive and user data uncorrupted.
2. **Structured Logging**:
   - Format logs as JSON with timestamp, log level, component name, and context metadata.
   - Strip all sensitive data (PII, file paths with user names, credentials) before output.
