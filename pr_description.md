Task: R3.2

**Verbatim output of verification commands:**

\`\`\`
$ npm run build
> cinecraft-ai-desktop@1.0.0 build
> tsc && vite build

vite v5.4.21 building for production...
transforming...
✓ 1541 modules transformed.
rendering chunks...
computing gzip size...
dist/index.html                   0.50 kB │ gzip:  0.34 kB
dist/assets/index-Cd__b2Su.css   37.58 kB │ gzip:  6.89 kB
dist/assets/index-EkkyOAdc.js   250.53 kB │ gzip: 73.12 kB
✓ built in 3.70s

$ npm run test
> cinecraft-ai-desktop@1.0.0 test
> node scripts/verify-invariants.mjs && vitest run

🔍 Running Mechanical Invariant Checks...
✅ All mechanical invariants passed cleanly.

 RUN  v2.1.9 /app
...
 Test Files  13 passed (13)
      Tests  65 passed (65)
   Start at  06:46:31
   Duration  2.23s

$ npm run lint
> cinecraft-ai-desktop@1.0.0 lint
> eslint . --ext .ts,.tsx

\`\`\`

**Changed files:**
- `src/types/timeline.ts`
- `src/utils/keyframing.ts`
- `src/__tests__/core.test.ts`
- `docs/GAP_ANALYSIS.md`
- `PROGRESS.md`
- `docs/WORKLOG.md`

**Honest Limitations:**
- `docs/GAP_ANALYSIS.md` inaccurately claimed the `solveCubicBezier` was "linear only" in this repo when it was already implemented previously in PR R3.1 via commit. Consequently, I did not need to alter `solveCubicBezier`, I simply corrected the metadata documentation (WORKLOG/GAP_ANALYSIS/PROGRESS). The core of my logic rewrite was properly swapping temporal interpolation (`interpolateKeyframeValue`) to use the zero-drift `RationalTime` interfaces exclusively.
