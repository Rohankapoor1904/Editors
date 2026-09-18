---
name: repository-structure-hygiene
description: >-
  Master skill for repository organization, directory layouts, Git conventions, and documentation hygiene.
  Use when structuring new or existing projects, configuring .gitignore, enforcing commit conventions,
  and maintaining long-term repository health across teams of human and AI contributors.
---

# Master Skill: Repository Structure, Git & Documentation Hygiene

This skill defines the structural standards and repository hygiene protocols necessary to keep codebases clean, maintainable, and legible for both human developers and autonomous AI agents.

---

## 1. Canonical Repository Directory Layout

A standard, production-grade project follows a predictable, navigable directory hierarchy:

```text
.
├── .agents/                 # AI agent workspace skills, rules, and runbooks
│   ├── skills/              # Modular task cheatsheets (SKILL.md)
│   └── rules/               # Contextual style and architectural rules
├── .github/                 # Workflows (CI/CD, automated testing, agent dispatch)
├── docs/                    # Living specifications, ADRs, roadmaps, and research
│   ├── ARCHITECTURE.md      # Target system blueprints
│   ├── DECISIONS.md         # Architecture Decision Records (ADRs)
│   ├── GAP_ANALYSIS.md      # Ground truth claimed-vs-real audits
│   ├── ROADMAP.md           # Phased feature specs with acceptance criteria
│   └── WORKLOG.md           # Append-only multi-agent session log
├── src/                     # Application source code
│   ├── components/          # Reusable UI components
│   ├── core/                # Domain models, commands, and math primitives
│   ├── engine/              # Compute engines, renderers, audio DSP
│   ├── services/            # External bridges, API clients, agent orchestrators
│   ├── store/               # Application state stores
│   └── types/               # TypeScript interfaces and type definitions
├── tests/ (or __tests__/)   # Test suites mirroring src/ structure
├── scripts/                 # Invariant verification and operational scripts
├── PROGRESS.md              # Single source of truth live status tracker
├── AGENTS.md (or GEMINI.md) # Agent working memory, rules, and core invariants
└── README.md                # Project onboarding and public overview
```

---

## 2. Conventional Commit Standards

Every commit must use a standard prefix that communicates the nature of the change:

- **`feat:`** A new user-facing feature or capability.
- **`fix:`** A bug fix or defect resolution.
- **`docs:`** Documentation-only changes (README, WORKLOG, ADRs).
- **`test:`** Adding or refactoring tests with zero production code changes.
- **`refactor:`** Code changes that neither fix bugs nor add features.
- **`perf:`** Performance optimizations.
- **`chore:`** Build process, package updates, task claiming, or repo maintenance.

### One Logical Change Per Commit:
- Never combine a task claim with implementation code.
- Never mix documentation rewrites with structural refactoring in the same commit.

---

## 3. Branching & Pull Request Protocols

1. **Short-Lived Feature Branches**:
   - Format: `feat/<task-id>-<slug>` (e.g. `feat/r8-1-ffmpeg-export`) or `fix/<slug>`.
   - Never develop directly on `main`.
2. **PR Quality Checklist**:
   - [ ] PR title follows conventional commit format.
   - [ ] PR description links the task ID from `PROGRESS.md`.
   - [ ] All automated tests and invariant checks pass in CI.
   - [ ] No extraneous debug files, logs, or temporary caches committed.

---

## 4. Gitignore & Artifact Hygiene

Ensure `.gitignore` rigorously excludes:
- Build output directories (`dist/`, `build/`, `out/`, `target/`).
- Package manager dependencies (`node_modules/`, `vendor/`).
- Environment secrets and credential files (`.env*`, `*.pem`, `*.key`).
- OS-specific metadata files (`.DS_Store`, `Thumbs.db`).
- Large transient binary files, test audio/video recordings (`*.mp4`, `*.wav` above 10MB).
