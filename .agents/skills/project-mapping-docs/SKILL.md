---
name: project-mapping-docs
description: >-
  Master repository map, documentation ontology, and invariant verification for CineCraft AI.
  Use when orienting on the codebase, checking project status in PROGRESS.md,
  referencing docs/ROADMAP.md, or enforcing the 7 non-negotiable engineering invariants.
---

# Project Mapping & Documentation Ontology: CineCraft AI

This skill provides an authoritative index of all canonical documents, architectural specifications, and mechanical gates in CineCraft AI.

## 1. Single Source of Truth Map

| Question | Canonical File | Rule |
| :--- | :--- | :--- |
| **Agent Brain & Working Memory** | `AGENTS.md` | Read fully before writing code. Enforces multi-agent rules. |
| **Live Project Status** | `PROGRESS.md` | Single live tracker. Never create duplicate checklists. |
| **Phased Implementation Plan** | `docs/ROADMAP.md` | Strict acceptance criteria. Tasks sequence R0 through R8. |
| **Audit of Real vs. Faked Code** | `docs/GAP_ANALYSIS.md` | Ground truth evidence with file:line pointers. |
| **Architecture Decision Records** | `docs/DECISIONS.md` | Format: ADR-001 to ADR-009. New decisions added here. |
| **Append-Only Session Log** | `docs/WORKLOG.md` | End every session with a handoff entry. |
| **AI Agent Tool Contract** | `docs/AGENT_TOOLS.md` | Formal JSON-schema tool specifications. |
| **System Architecture Target** | `docs/ARCHITECTURE.md` | High-level data flows and component hierarchy. |

## 2. The 7 Non-Negotiable Engineering Invariants

1. **Rational Time Arithmetic**:
   - All temporal calculations use `RationalTime { value: bigint | number, rate: number }`.
   - Never accumulate floating-point seconds on cut points (prevents single-frame black flashes on export).
2. **Non-Destructive Editorial Model**:
   - Source media files on disk are NEVER mutated. Edits are purely instructions in project JSON.
3. **Command Pattern for Every Mutation**:
   - UI handlers cannot write directly to the Zustand store. All mutations push onto the transactional undo/redo stack.
4. **Audio is the Master Clock**:
   - Video frames are slaved to hardware audio DMA sample counts (48kHz) to eliminate VFR drift.
5. **No Mock Data on the Main Execution Path**:
   - Production execution mode (`live`) MUST throw `NotImplementedError` or return `Err` if a feature is unbuilt. Mocks are restricted to opt-in `demo` mode for unit tests only.
6. **Zero-Copy Frame Lifetime**:
   - Every `VideoFrame` and GPU texture must be released immediately after submission (RAII pattern).
7. **Real WGSL Shaders or Nothing**:
   - A render pass must compile a real shader module with valid entry points. Empty pipelines are forbidden.

## 3. Pre-Commit Mechanical Verification Gate

Before any commit or PR is considered done, you MUST verify mechanically:
```bash
npm test                # Runs verify-invariants.mjs + 31 Vitest suites
npm run build           # TypeScript typecheck + Vite production bundle
npm run lint            # ESLint static analysis
cd src-tauri && cargo check  # Rust backend compilation (if src-tauri touched)
```
If a test or invariant fails, never bypass it or mark the task complete. Fix the underlying root cause.
