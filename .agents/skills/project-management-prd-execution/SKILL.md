---
name: project-management-prd-execution
description: >-
  Master playbook for product requirements, agile project management, and roadmap execution.
  Use when writing PRDs, decomposing epics into atomic tasks, mapping critical dependencies,
  managing feature flags (trunk-based development), and executing zero-downtime releases.
---

# Master Playbook: PRD to Production, Project Management & Roadmap Execution

This skill establishes the product and project management framework that bridges raw user requirements with disciplined, deterministic software engineering.

---

## 1. Actionable PRD Template (AI-Executable Specification)

A Product Requirements Document (PRD) must be unambiguous, falsifiable, and structured so both human developers and autonomous AI agents can execute without guesswork:

```markdown
# PRD: [Feature / Product Name]

## 1. Problem Statement & User Value
- What exact user friction or business need does this address?
- What happens if we do NOT build this?

## 2. In-Scope vs. Out-of-Scope (Strict Non-Goals)
- **In-Scope:** [Concrete deliverables for this release]
- **Out-of-Scope:** [Explicit list of deferred features to prevent scope creep]

## 3. User Stories & Acceptance Criteria (Given / When / Then)
- **Story 1:** As a [user role], I want [capability] so that [benefit].
  - *Given* [pre-conditions]
  - *When* [user action / API call]
  - *Then* [expected state change and UI feedback]

## 4. Technical Constraints & Invariants
- Latency bounds, memory limits, required data contracts, backwards compatibility.

## 5. Success Metrics (KPIs)
- Falsifiable metrics (e.g., export time < 10s, zero crash reports, > 95% test coverage).
```

---

## 2. Work Breakdown Structure (WBS) & Task Sizing

Decompose large initiatives into fine-grained atomic units:

```text
Initiative / Theme
     │
     ▼
Epic (Major milestone: e.g. "Hardware Encoding Pipeline")
     │
     ▼
User Story (User-visible deliverable: e.g. "NVENC Encoder Detection")
     │
     ▼
Atomic Task (1 to 3 engineering hours: e.g. "Implement probe_encoders Tauri command in Rust")
```

### The 3-Hour Atomic Task Rule:
- If a task is estimated to take > 3 hours, it is an Epic in disguise. Break it down further into discrete, testable sub-tasks.
- Every atomic task MUST specify its explicit prerequisites (`Depends On: [Task-X]`).

---

## 3. Dependency Mapping & The Critical Path

1. **Topological Ordering**: Sequence tasks so that dependency foundations (database tables, interfaces, test harnesses) are built and verified before UI panels or consumers.
2. **Blocker Resolution Protocol**:
   - When a task is blocked by an upstream defect or missing API:
     - Mark status as `blocked` in `PROGRESS.md`.
     - Document the blocker with file and line references in `docs/WORKLOG.md`.
     - Pivot to the next unblocked task on the critical path.

---

## 4. Zero-Downtime Release & Migration Strategies

1. **Trunk-Based Development & Feature Flags**:
   - Avoid long-lived feature branches that diverge and create merge conflicts.
   - Merge small, incremental PRs directly into `main` behind feature flags:
     ```typescript
     if (featureFlags.isEnabled('NEW_EXPORT_PIPELINE', user)) {
       return runHardwareExport(timeline);
     }
     return runLegacyExport(timeline);
     ```

2. **Expand / Contract Database Migrations**:
   - Phase 1 (Expand): Add new columns or tables alongside existing schema. Make fields nullable.
   - Phase 2 (Dual-Write): Application writes to both old and new schema.
   - Phase 3 (Backfill): Migrate historical data in background batches.
   - Phase 4 (Contract): Remove old columns/tables once 100% of traffic uses new schema.

3. **Rollback Playbook**:
   - Every deployment must have a pre-tested 1-click rollback command or blue/green switch.
