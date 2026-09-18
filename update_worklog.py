import sys

new_entry = """## 2024-10-25 — Jules — R6.6
- **Did:** Implemented Kalman filter smoothing for subject trajectory tracking in `src/engine/autoReframe.ts`. Added strict crop constraints to guarantee the subject is always kept inside the crop window, completing R6.6 acceptance criteria. Added tests in `src/__tests__/autoReframe.test.ts`. Updated `PROGRESS.md`.
- **Verified:** `npm run build` (success), `npm run test` (success 25 suites, 117 passing), `npm run lint` (success). Visual layout changes not applicable (pure engine logic).
- **Left undone:** The 1D Kalman filter only tracks subject X position. If vertical tracking/panning becomes a requirement in the future, it will need to be extended to a 2D filter (X, Y).
- **Next:** Proceed with R6.7 (Kinetic captions).
- **Blockers:** None.

"""

with open('docs/WORKLOG.md', 'r') as f:
    content = f.read()

with open('docs/WORKLOG.md', 'w') as f:
    f.write(new_entry + content)
