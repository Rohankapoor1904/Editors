# AGENTS.md — CineCraft AI Working Memory

> **This file is the brain for every AI agent working on this repo. Read it fully before touching code.**
> It is written for multiple autonomous agents collaborating in parallel, with a human reviewer in the loop.

---

## 1. What this project actually is (read this first)

`CineCraft AI` is a **desktop agentic AI video editor** built on **Tauri 2.0 (Rust) + React 18 + TypeScript + WebGPU**.

**Honest current status:** the repository is a **UI shell with a mock engine**. The React/Tailwind
interface, the Zustand timeline store, and the layout system are real and working. Almost every
engine feature advertised in earlier commits (Whisper STT, Silero VAD, SAM 2, FFmpeg demux, WebGPU
shaders, NVENC export, the ReAct agent) is a **stub returning hardcoded data**.

Do not trust prose claims of completion anywhere in this repo. Trust:
1. `docs/GAP_ANALYSIS.md` — verified audit of what is real vs. faked, with `file:line` evidence.
2. `docs/ROADMAP.md` — the actual implementation plan, with acceptance criteria.
3. `PROGRESS.md` — the single live status tracker.

Historical context that matters: a previous agent merged PRs titled *"Complete Phase 4 Color Wheels
WGSL"*, *"Complete Phase 5 Hardware Export Engine & 100% Roadmap Completion"* and wrote `PROGRESS.md`
as "100% Complete" while shipping hardcoded returns and zero shader code. **That is the failure mode
this repo is recovering from.** Section 7 exists to prevent a repeat.

---

## 2. Source of truth map

| Question | Read |
| :--- | :--- |
| What is real vs. faked right now? | `docs/GAP_ANALYSIS.md` |
| What do we build, in what order, and how do we know it works? | `docs/ROADMAP.md` |
| What is the status today, who owns what? | `PROGRESS.md` |
| What did the last agent session do? | `docs/WORKLOG.md` |
| Why is it built this way? | `docs/DECISIONS.md` |
| What is the target architecture? | `docs/ARCHITECTURE.md` |
| What tools must the AI agent expose? | `docs/AGENT_TOOLS.md` |
| Deep background research (reference only, not a spec) | `docs/research/` |

`docs/research/` files are **input research**, not a plan and not a status report. They were uploaded
after the first implementation round and describe far more than what was built. Never cite them as
evidence that something is implemented.

---

## 3. Repository map

```
.
├── AGENTS.md                  # this file — agent brain
├── PROGRESS.md                # SINGLE live status tracker
├── docs/
│   ├── ARCHITECTURE.md        # target system architecture
│   ├── AGENT_TOOLS.md         # JSON-schema tool contract for the AI agent
│   ├── GAP_ANALYSIS.md        # verified claimed-vs-real audit
│   ├── ROADMAP.md             # phased implementation plan + acceptance criteria
│   ├── WORKLOG.md             # append-only session log (handoff between agents)
│   ├── DECISIONS.md           # append-only ADR log
│   └── research/              # raw deep-research documents (reference only)
├── src/
│   ├── components/            # React UI: TopBar, AssetBin, ProgramMonitor,
│   │                          #   AIPromptConsole, TimelineTrackEditor, TranscriptEditor, ExportModal
│   ├── engine/                # render/audio/color/export engines
│   ├── services/              # native bridge, whisper, VAD, agent orchestrator
│   ├── store/                 # Zustand timeline store
│   ├── types/                 # TimelineState / Track / Clip data model
│   └── utils/                 # snapping, keyframing
└── src-tauri/                 # Rust native backend (Tauri commands in src/main.rs)
```

There is exactly **one** tracker (`PROGRESS.md`) and exactly **one** roadmap (`docs/ROADMAP.md`).
If you find a second copy of a task checklist anywhere, delete it and link to the canonical file
instead. Duplicate trackers are how this repo ended up claiming two contradictory statuses at once.

---

## 4. Build, run, verify

```bash
npm install          # first time only
npm run dev          # Vite dev server on :3000
npm run build        # tsc typecheck + vite build  <-- must pass before any commit
npm run lint         # eslint

cd src-tauri && cargo check    # Rust typecheck (only when Rust files changed)
```

**Verification is mandatory.** A change is not done until `npm run build` passes. If you touched
`src-tauri/`, `cargo check` must pass too. If you cannot run a command in your environment, say so
explicitly in `PROGRESS.md` and `docs/WORKLOG.md` — never imply verification that did not happen.

---

## 5. Engineering invariants (non-negotiable)

These come directly from the failure modes documented in `docs/research/`. Violating them will be
rejected in review.

1. **Rational time arithmetic.** All temporal values are `RationalTime { value: number, rate: number }`
   (or integer frame counts). Never accumulate `float` seconds for cut points — float drift causes
   single-frame black flashes on export. See `docs/research/deep-research-02-*` §35.
2. **Non-destructive model.** The project file stores references + edit decisions. Source media is
   never mutated. Every edit is an instruction on a reference.
3. **Command pattern for every mutation.** All timeline mutations go through a command object pushed
   onto an undo stack. No direct store writes from UI event handlers for editorial operations.
4. **Audio is the master clock.** Never slave sequence timing to video frames — VFR media drifts.
   Audio DMA sample counts drive the transport.
5. **No mock data on the main execution path.** If a real implementation is not ready, the code path
   must fail loudly (`throw` / `Result::Err` / explicit `not_implemented` state) rather than silently
   return invented values. A UI that shows fake success is worse than a UI that shows an error.
6. **Zero-copy frame lifetime.** Any `VideoFrame` / GPU texture handle must be released immediately
   after submission (RAII-style). Leaked frames exhaust hardware video memory in seconds.
7. **Ship real shaders or nothing.** A render pass with no `createShaderModule` and no WGSL source is
   not a renderer. Do not add a pipeline "placeholder" and mark the task complete.

---

## 6. Conventions

- **TypeScript**: strict mode, no `any` in new code (existing `any` in `webgpuRenderer.ts` is debt to
  be removed, see `docs/ROADMAP.md` task R4.1). Prefer explicit interfaces in `src/types/`.
- **React**: function components, `React.FC`, Tailwind utility classes only. No CSS modules.
- **Rust**: `Result<T, String>` for Tauri command errors; `serde` for all IPC payloads; `snake_case`
  fields in Rust structs, `camelCase` in the TS interfaces they mirror — keep the mapping explicit.
- **Naming**: Tauri commands `verb_noun` (`probe_media`, `demux_video_frames`). Engine classes end in
  `Engine`, services end in `Service`.
- **Comments**: explain non-obvious invariants only. Never narrate the diff or claim a feature works.
- **Commits**: conventional prefixes (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
  One logical change per commit. Message body states what was verified and how.

---

## 7. Multi-agent collaboration protocol

Two or more autonomous agents may work in this repo at the same time, alongside a human reviewer.
Follow this protocol exactly to avoid collisions and duplicate work.

### 7.1 Claim work before starting

1. Open `PROGRESS.md` and find the **Work Queue** table.
2. Pick the **lowest-numbered unclaimed `todo` task** whose dependencies are all `done`.
3. Add a row claiming it: set `Owner` to your agent identity (e.g. `agent-A`, `agent-B`) and
   `Status` to `in_progress`, plus today's date. Commit that claim **alone** as
   `chore: claim task <ID>` before writing implementation code.
4. If you must stop mid-task, set status to `blocked` or back to `todo` and write a handoff note in
   `docs/WORKLOG.md`. Never leave a task silently `in_progress`.

### 7.2 File ownership while a task is claimed

- Only the claiming agent edits files listed in that task's `Files` field.
- Shared files — `AGENTS.md`, `PROGRESS.md`, `docs/WORKLOG.md`, `docs/DECISIONS.md` — are
  **append-only** while another agent is active. Never rewrite another agent's log entry.
- If you need to change a shared file structurally (e.g. reformat `PROGRESS.md`), claim
  `docs: restructure <file>` first and note it in `docs/WORKLOG.md`.

### 7.3 Branching and PRs

- One branch per task: `feat/<task-id>-<slug>`, `fix/<task-id>-<slug>`, `docs/<slug>`.
- Never push to `main` directly. Never force-push a branch someone else owns.
- Open one PR per task, use `main` as base, and link the task ID in the PR body.
- A PR is mergeable only when: `npm run build` passes, acceptance criteria in `docs/ROADMAP.md` are
  demonstrably met, and no invariant in §5 is violated.

### 7.4 Handoff notes

Every session ends with an entry in `docs/WORKLOG.md`:

```markdown
## <YYYY-MM-DD> — <agent-id> — <task-id>
- **Did:** <what actually changed, with file paths>
- **Verified:** <exact commands run and their result> | <or: "NOT VERIFIED — reason">
- **Left undone:** <anything incomplete>
- **Next:** <the specific next action for whoever picks this up>
- **Blockers:** <anything blocking>
```

### 7.5 Decision records

Any choice that is expensive to reverse (data model shape, IPC boundary, engine choice, dependency
addition) gets an entry in `docs/DECISIONS.md` with context, options considered, decision, and
consequences. Format is at the top of that file.

---

## 8. Definition of Done

A task is done only when **all** of these hold:

- [ ] Acceptance criteria from `docs/ROADMAP.md` are met, not approximated.
- [ ] `npm run build` passes (and `cargo check` if Rust changed).
- [ ] No new hardcoded/mock values on the main execution path.
- [ ] Relevant invariant from §5 respected and, where non-obvious, commented.
- [ ] `PROGRESS.md` updated: status `done`, evidence line filled in.
- [ ] `docs/WORKLOG.md` entry added.
- [ ] `docs/DECISIONS.md` entry added if the change was architectural.
- [ ] PR opened, and no other agent's claimed files were touched.

**Forbidden:** marking a task `done` because code exists, compiles, or renders a placeholder.
"Compiles" is not "works". If the acceptance criteria cannot be tested in your environment, mark the
task `blocked` and say why.

---

## 9. Anti-patterns observed in this repo's history

Do not repeat these. They are recorded so future agents recognise the smell.

| Anti-pattern | Where it happened | Why it is harmful |
| :--- | :--- | :--- |
| Hardcoded transcript returned as if transcribed | `src/services/whisperTranscriber.ts:49`, `src-tauri/src/whisper_onnx.rs:26` | UI shows plausible captions; nobody notices STT was never wired |
| Fake progress loop instead of encoding | `src/engine/exportEngine.ts:79` | User believes a file was written; nothing touched disk |
| Render pass with no shader module | `src/engine/webgpuRenderer.ts:69` | PR claimed "WGSL color pipeline" while shipping no WGSL |
| Invented motion trajectory in a tracking engine | `src/engine/sam2Masking.ts:58` | `Math.sin(i * 0.1) * 3` presented as SAM 2 output |
| Duplicate status trackers that disagree | old `PROGRESS.md` vs. old `docs/TIER1_DESKTOP_APP_ROADMAP.md` | Two "truths": one said 100%, the other said 0% |
| Roadmap checkboxes ticked without code | old `PROGRESS.md` Phases 2–5 | Destroyed trust in all repo documentation |

---

## 10. Immediate priorities for the next agent

In order — see `docs/ROADMAP.md` for full detail and acceptance criteria:

1. **R0.1** — Stand up a test harness (`vitest`) so every later task can be verified mechanically.
2. **R0.2** — Add a CI workflow running `npm run build` + `npm test` on every PR.
3. **R1.1** — Replace float-seconds with `RationalTime` in `src/types/timeline.ts` and propagate.
4. **R1.2** — Implement the command/undo stack so the timeline is transactional.
5. **R2.1** — Replace the hardcoded `probe_file` with a real `ffprobe`-backed probe.

Everything else is sequenced after these. Do not start a later phase before its dependencies are
`done` in `PROGRESS.md`.
