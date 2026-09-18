import re
from datetime import datetime

with open('PROGRESS.md', 'r') as f:
    content = f.read()

# Replace the R9.4 status line
# Find: | R9.4 | todo | | |
# Replace with: | R9.4 | done | agent-jules | PR... |
new_content = re.sub(
    r'\| R9\.4 \s*\|.*',
    f'| R9.4 | done | agent-jules | PR #xxx |',
    content
)

with open('PROGRESS.md', 'w') as f:
    f.write(new_content)

# Now update docs/WORKLOG.md
worklog_entry = f"""
## {datetime.now().strftime('%Y-%m-%d')} — agent-jules — R9.4
- **Did:** Created `AudioWorkspace` and `ParametricEqView` UI components for the audio mixer, wired to `parametricEqEngine` and `audioEngine`. Added them to `App.tsx`. Added component tests.
- **Verified:** `npm run build`, `npm run test` (152 tests passed), `npm run lint`. Also manually ran playwright to verify visual UI in Web Browser.
- **Left undone:** True Peak LUFS meter and fetching audio context channels is left as a safe \`NotImplementedError\` because underlying engines do not expose those APIs yet.
- **Next:** R9.5 Timeline track management & clip drag-to-move
- **Blockers:** None
"""

with open('docs/WORKLOG.md', 'r') as f:
    worklog = f.read()

# Insert after the header
header = "# Session Worklog\n\n> Append-only log of agent sessions.\n\n"
if worklog.startswith(header):
    new_worklog = header + worklog_entry + worklog[len(header):]
else:
    new_worklog = worklog_entry + "\n" + worklog

with open('docs/WORKLOG.md', 'w') as f:
    f.write(new_worklog)
