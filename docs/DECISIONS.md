# DECISIONS — Architecture Decision Records

Append-only. **Add new records at the top.** One record per decision that is expensive to reverse:
data model shape, IPC boundary, engine choice, dependency addition, process change.

A decision record is required before (not after) implementing the change, and must be linked from
the `PROGRESS.md` row for the task.

Format:

```markdown
## ADR-<n>: <short title>
- **Date:** <YYYY-MM-DD>
- **Status:** proposed | accepted | superseded by ADR-<m>
- **Task:** <roadmap task ID>
- **Context:** <what forced a decision>
- **Options considered:** <option — tradeoff>
- **Decision:** <what was chosen>
- **Consequences:** <what becomes easy, what becomes hard, what is now locked in>
```

---

## ADR-006: Single tracker, single roadmap

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** docs consolidation
- **Context:** Two files tracked project status and disagreed. `PROGRESS.md` declared "ALL PHASES
  COMPLETED … 100%" while `docs/TIER1_DESKTOP_APP_ROADMAP.md` marked the same tasks `[ ]` unchecked.
  A reader's perceived status depended on which file they opened first, which directly enabled the
  false-completion problem documented in `docs/GAP_ANALYSIS.md` §3.
- **Options considered:**
  - Keep both and reconcile later — rejected: the divergence *is* the failure mode; deferring repeats it.
  - Keep the roadmap file as the tracker and delete `PROGRESS.md` — rejected: `PROGRESS.md` is the
    file contributors already look at, and it is the right place for ownership/evidence columns.
  - One tracker (`PROGRESS.md`) + one plan (`docs/ROADMAP.md`) with a strict division of duties —
    chosen.
- **Decision:** `PROGRESS.md` is the **only** file where status is recorded. `docs/ROADMAP.md` defines
  what to build and how it is verified, and is never ticked. The duplicate
  `docs/TIER1_DESKTOP_APP_ROADMAP.md` was deleted. `AGENTS.md` §3 instructs agents to delete any
  future duplicate checklist rather than maintain it.
- **Consequences:** One place to look for truth; roadmap edits cannot silently imply progress.
  Cost: contributors who bookmarked the old roadmap file lose it — acceptable, it was wrong.

---

## ADR-005: Enforce a status vocabulary instead of "done"

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** process
- **Context:** `done` was self-assigned whenever a file with a plausible name existed, producing the
  11 stubs catalogued in `docs/GAP_ANALYSIS.md` §2.2.
- **Options considered:**
  - Keep binary done/todo with stronger review — rejected: the failure was in the self-assessment,
    not the reviewing.
  - Four-value vocabulary `real` / `partial` / `stub` / `missing` plus a mandatory evidence line and
    the Definition of Done in `AGENTS.md` §8 — chosen.
- **Decision:** Every feature row in `PROGRESS.md` carries a status from that vocabulary and, when
  `real`, the exact command or test that proves it. `done` is reserved for tasks whose
  roadmap acceptance criteria were executed.
- **Consequences:** Status becomes falsifiable. Cost: writing an evidence line per row — deliberate
  friction that makes unsupported claims visually obvious.

---

## ADR-004: Verification infrastructure before any feature work

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** R0.1, R0.2, R0.4
- **Context:** The repo has zero tests and no CI, so 11 stubs and numerous inert UI surfaces shipped
  undetected across 12 merged PRs. Any feature built next would be equally unverifiable.
- **Options considered:**
  - Start with the highest-value engine feature (WebGPU renderer) — rejected: still unverifiable,
    repeats the cycle.
  - Add tests + CI first, even though it delays visible progress — chosen.
- **Decision:** Phase R0 blocks all other phases. `vitest` + `@testing-library/react`, a CI workflow
  running build/test/lint (and `cargo check`), and an explicit `demo`/`live` runtime mode so stubs
  cannot silently masquerade as implementations.
- **Consequences:** Slower first visible feature, but every later claim is mechanically checkable.
  Cost: the existing codebase must be made to build and typecheck cleanly, which will surface
  previously hidden breakage.

---

## ADR-003: Rational time as the temporal primitive

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** R1.1
- **Context:** `Clip` and `TimelineState` store durations and offsets as `number` seconds. Research
  §35 documents that float accumulation over long sequences causes single-frame black flashes on
  export. The current model cannot represent frame-exact cut points.
- **Options considered:**
  - Keep floats and round at render time — rejected: rounding errors are unbounded over long timelines
    and hide the defect until export.
  - Integer frame counts only — rejected: sequences mix rates (23.976 video, 48kHz audio), so a single
    frame unit is wrong.
  - `RationalTime { value, rate }` (the OpenTimelineIO model the research recommends) — chosen.
- **Decision:** All temporal values become `RationalTime`. Convert to floats only at the GPU/DSP edge.
- **Consequences:** Exact arithmetic, lossless JSON interchange later. Cost: a wide migration touching
  the store, every component that reads time, and all tests — which is why it is the first code task
  after verification exists.

---

## ADR-002: Keep Tauri 2.0 + React + WebGPU; do not migrate to a native C++/Qt stack

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** architecture
- **Context:** Research §29/§25 presents native (C++/Qt/Metal/Vulkan) and web-tech (TS/WebGPU/WASM)
  architectures. The existing codebase is TypeScript + Tauri, and the UI shell is the one part that
  genuinely works.
- **Options considered:**
  - Rewrite in C++/Qt for raw performance — rejected: discards the working UI, requires a team the
    project does not have, and the research itself lists the web architecture as viable.
  - Keep TS + Tauri, moving compute-heavy work into Rust/Tauri commands and WGSL shaders — chosen.
- **Decision:** Presentation and editorial state stay in TypeScript; decode, ASR/VAD, and export run
  in Rust behind Tauri commands; compositing and color run in WGSL. Rust also gives us the `RationalTime`
  and command-stack target the research specifies.
- **Consequences:** The existing UI investment is preserved and heavy compute is still native. Cost:
  every AI model must be reachable from Rust or WASM, and the JS/Rust type boundary must be kept
  explicit (`snake_case` ↔ `camelCase` per `AGENTS.md` §6).

---

## ADR-001: Facts over claims in all project documentation

- **Date:** 2025-09-15
- **Status:** accepted
- **Task:** process
- **Context:** PR #7 was titled "Complete Phase 5 Hardware Export Engine & 100% Roadmap Completion"
  and merged while the export path was a `setTimeout` loop and the renderer had no shader. Trust in
  every document had to be rebuilt from the source upward.
- **Options considered:**
  - Soften the old docs and move on — rejected: leaves the misinformation in place.
  - Publish a full evidence-backed gap analysis, then rewrite the tracker from verified reality —
    chosen.
- **Decision:** `docs/GAP_ANALYSIS.md` records the claimed-vs-real state with `file:line` evidence,
  including the audit's own verification gaps. `PROGRESS.md` was rewritten from the audit, not from
  the previous tracker. `AGENTS.md` documents the anti-patterns by name.
- **Consequences:** Honest baseline; a new agent cannot be misled by historical optimism. Cost: the
  project's apparent completion drops from 100% to roughly the UI shell, which is the accurate figure.
