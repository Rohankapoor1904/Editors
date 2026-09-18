---
name: vibe-coding-methodology
description: >-
  Master methodology for disciplined AI-assisted software development and professional vibe-coding.
  Use when guiding users or AI agents from raw natural language intent into rigorous, production-grade
  software through living specifications, tight feedback loops, and scope discipline.
---

# Master Skill: Disciplined "Vibe-Coding" & Spec-Driven Development

This skill implements the principles of the **Vibe-Coding Guide** (`vadim-works/vibe-coding-guide`), turning casual natural language development into a disciplined, high-velocity software engineering process.

---

## 1. What is Professional Vibe-Coding?

Casual vibe-coding relies on dumping long prompts into chat windows and blindly accepting generated code, leading to spaghetti architectures, broken dependencies, and phantom features.

**Professional Vibe-Coding** is intent-driven, specification-grounded development where:
1. **The Human** directs intent, scope, user experience, and trade-off decisions.
2. **The AI Agent** handles boilerplate, mechanical implementation, type systems, and test coverage.
3. **The Repository** acts as the persistent brain: all context, rules, and specifications live in code and markdown, never in ephemeral chat memory.

---

## 2. The Tight 6-Stage Development Loop

Every feature, fix, or enhancement must cycle through these 6 stages:

```text
Intent (User Prompt)
  │
  ▼
[1. Scope Discipline]  ──► Solve ONE problem well. Keep the blast radius minimal.
  │
  ▼
[2. Propose & Agree]   ──► AI generates plan / diff preview. Confirm before writing code.
  │
  ▼
[3. Implementation]    ──► Write clean, typed, idiomatic code respecting repo conventions.
  │
  ▼
[4. Verification]      ──► Execute mechanical tests, invariant scripts, and typechecks.
  │
  ▼
[5. Living Docs Update]──► Update specs, PROGRESS.md, and append session handoff notes.
  │
  ▼
[6. Atomic Commit]     ──► Commit one logical change with conventional prefix (feat:, fix:).
```

---

## 3. Ground Rules & Best Practices

### Rule 1: Context Lives in the Repo, Not in the Chat
- Never leave critical architectural decisions, API schemas, or business logic buried in chat messages.
- If a decision is made, immediately persist it into a markdown document in `docs/` or `.agents/rules/`.
- Future agents will read the repo files, not past chat sessions.

### Rule 2: Plan Confirmation Before File Mutation
- When handling complex requests, the AI must formulate an implementation plan and wait for confirmation.
- The plan must state:
  - Exact files to create or modify.
  - Dependencies to install or configure.
  - Potential breaking changes or tradeoffs.
  - Exact verification commands to be executed.

### Rule 3: Single-Problem Focus (Anti-Distraction)
- Do not refactor unrelated subsystems while implementing a feature.
- Do not build multiple features in parallel.
- If a bug or debt is discovered during feature work:
  - Log it as an issue or `todo` in `PROGRESS.md`.
  - Stay focused on completing the claimed task first.

### Rule 4: Progressive Disclosure
- Keep prompts and documentation modular.
- Avoid stuffing entire codebases into prompts. Use indexed skills and cheatsheets loaded on demand.
