---
name: agent-autonomous-collaboration
description: >-
  Master playbook for autonomous AI agent collaboration (OpenHands, Google Jules, Claude, Antigravity).
  Use when coordinating multiple AI agents on a shared repository, defining task claiming protocols,
  preventing race conditions, enforcing handoff logs, and avoiding agent anti-patterns.
---

# Master Skill: Autonomous AI Agent Collaboration & Operating Protocol

This skill defines the multi-agent collaboration protocol synthesized from leading AI agent frameworks (`awesome-ai-agent-skills`, `ai-workspace-archive`, and production agent orchestrators). It governs how autonomous agents (OpenHands, Jules, Claude Code, Antigravity, SWE-bench runners) must collaborate on codebases without stepping on each other or compromising code integrity.

---

## 1. The Core Law of Agent Iteration (Mechanical Gates)

> **Mechanical Gates Law:** Autonomous AI agents never iterate on prose prompts or rubber-stamp LLM reviews alone. Agents only iterate authentically when a mechanical gate exits with a non-zero error (`exit 1`).

- **Stage-Based Pipeline Vulnerability**: Stage-based agents (like Google Jules: Plan → Batch Edit → LLM Critique → PR) will approve stubs and mocks if code compiles (`exit 0`).
- **Enforcement**: Always bind invariant tests (e.g. `scripts/verify-invariants.mjs`) directly into `npm test` or `cargo test`. If an agent leaves a stub or introduces fake data, the mechanical gate MUST fail immediately, forcing the agent into an authentic **Edit → Fail → Debug → Pass** engineering loop.

---

## 2. Multi-Agent Task Claiming & Ownership Protocol

When multiple autonomous agents collaborate on a repository:

### Step 1: Claim Before Modifying
1. Open the canonical status tracker (`PROGRESS.md` or issue board).
2. Find the lowest-numbered unclaimed `todo` task whose dependencies are `done`.
3. Set `Owner` to your agent ID (e.g., `agent-openhands`, `agent-jules`, `antigravity`) and status to `in_progress`.
4. Commit that single line claim first (`chore: claim task <ID>`) to establish branch/lock ownership before touching source code.

### Step 2: File Ownership Boundaries
- The claiming agent exclusively edits files listed in the task's scope.
- Shared memory files (`PROGRESS.md`, `docs/WORKLOG.md`, `docs/DECISIONS.md`) are **append-only**. Never rewrite, reorder, or overwrite another agent's log entry.
- If blocked mid-task, set status to `blocked` or revert to `todo` with an explicit reason in `docs/WORKLOG.md`. Never abandon a task silently in `in_progress`.

### Step 3: Git Branch & PR Hygiene
- Branch naming convention: `feat/<task-id>-<slug>`, `fix/<task-id>-<slug>`, `docs/<slug>`.
- Never commit directly to `main`.
- Open 1 PR per task targeting `main`. PR is mergeable only when mechanical verification passes cleanly.

---

## 3. Session Handoff Log Standard (`docs/WORKLOG.md`)

Every agent session MUST conclude by appending a standardized handoff entry:

```markdown
## <YYYY-MM-DD> — <agent-id> — <task-id>
- **Did:** <Specific code changes and created files>
- **Verified:** <Exact terminal commands executed and verbatim output: build, test, lint>
- **Left undone:** <Explicit gaps, future dependencies, or deferred items>
- **Next:** <The exact next chronological task for whoever picks this up>
- **Blockers:** <None | Description of external blocker>
```

### Date Sanity Guardrail:
- Never hallucinate dates from pre-training cutoff (e.g. 2024). Read the host system clock or git log timestamp before writing entries.

---

## 4. Universal Agent Anti-Patterns (Zero Tolerance)

| Prohibited Anti-Pattern | Why It Is Rejected | Required Behavior |
| :--- | :--- | :--- |
| **Silent Mock on Main Path** | Masquerades as functional code; hides missing features | Throw `NotImplementedError` or return `Result::Err` in live mode |
| **Fake Progress / Sleep Loop** | Pretends to process work without touching disk/hardware | Drive progress by actual byte counts or worker events |
| **Testing a Stub as Correct** | OpenHands/Claude writing tests asserting a stub is done | Tests must assert real behavioral semantics and acceptance criteria |
| **Scope Creep / Yes-Man Bias**| Agreeing to infinite features without completing existing scope | Reject distractions; keep focus strictly on the claimed task |
| **Chat-Only Context Dumping** | Explaining architecture in chat without writing files | Persist all architecture and decisions in repository markdown files |
