1. **Fix Invariant Violation**: In `src/components/TimelineTrackEditor.tsx`, replace the float arithmetic (`secondsToRational(rationalToSeconds(clip.startOffset) + splitTimeOffset)`) with rational arithmetic. Convert `splitTimeOffset` to a rational using `secondsToRational(splitTimeOffset)` and add it using `addRational`.
2. **Fix Redo Bug**: In `src/core/commands/edits.ts`, the commands that generate new IDs (like `SplitCommand`, `RippleDeleteCommand`, and `OverwriteCommand` generating `${c.id}_split_${Date.now()}`) should generate them in the constructor or lazily cache them in `apply` so subsequent `redo`s (which call `apply` again) yield the same clip IDs.
3. Apply these fixes using `replace_with_git_merge_diff`.
4. Run tests and lint again.
5. Request a second code review.
