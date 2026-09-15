## What this PR does

<!-- One or two sentences. What behaviour changes for a user? -->

## Task

<!-- Task ID from docs/ROADMAP.md, e.g. R0.1. If there is no task ID, explain why. -->

## Verification

Paste the **real** command output. Do not summarise. Do not omit failures.

```
$ npm run build
<output>

$ npm run test
<output>

$ npm run lint
<output>
```

## What is NOT verified

<!--
REQUIRED. Every PR must answer this.

If everything is verified, write "Nothing — all paths verified by the commands above."

If something could not be verified, name it and give the reason (no Rust toolchain, no GPU,
no fixture, etc.). "Not verified" is a passing answer in this repo. A blank section is not.
-->

## Definition of Done check

<!-- See AGENTS.md §8. Tick only what is genuinely true. -->

- [ ] Callable from the UI or a public API — not merely defined
- [ ] Call sites exist and `grep` proves it (no orphaned/dead code)
- [ ] A test exercises the real path with real inputs and outputs
- [ ] `npm run build`, `npm run test`, `npm run lint` all pass, output quoted above
- [ ] No fabricated data remains on this path
- [ ] Remaining limitations recorded in `docs/GAP_ANALYSIS.md`

## Status changes

<!-- Tick at most one. If you ticked the first box, justify it. -->

- [ ] This completes a roadmap task and I have updated `PROGRESS.md` (state which row)
- [ ] This is partial progress; `PROGRESS.md` records the task as `partial` or `stub`
- [ ] This is docs/tooling only and does not change task status

## Scope discipline

- [ ] I did not mark any task `real` that I cannot prove with a command
- [ ] I did not add a dependency that is unused
- [ ] I did not return more realistic fake data in place of an implementation
- [ ] I did not edit files owned by another agent (see `docs/WORKLOG.md` claims)
- [ ] `package-lock.json` is either unchanged or only changed by a real dependency change

---

<!--
If the premise of the requested work turned out to be false, say so plainly above.
Reporting "this is not implemented, here is what it would take" is a successful PR here.
Collaborating agent? See AGENTS.md §10.
-->
