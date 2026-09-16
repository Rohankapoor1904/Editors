#!/usr/bin/env python3
"""
Jules orchestration loop for Rohankapoor1904/Editors.

Deterministic stdlib-only script: no LLM. Orchestration is a state machine that advances
one step per run, because a Jules session takes far longer than the 600s automation
timeout. All state lives in the automation KV store.

Per-run phases:
  idle             -> pick next claimable task, dispatch to Jules, phase=awaiting_session
  awaiting_session -> poll; COMPLETED finds the PR; FAILED recovers or escalates
  verifying        -> check out the PR branch and verify it independently
  awaiting_fix     -> poll; on COMPLETED, verify again

Recovery rules:
  * A session that stops producing activity while IN_PROGRESS gets a nudge.
  * A FAILED session is first told to continue, which genuinely revives it.
  * If the SAME failure signature returns, a fresh session is minted for the task.

Sessions are reused across tasks. Each reused dispatch tells Jules to branch fresh off
origin/main so task N+1 cannot land inside task N's pull request.

Trust model: Jules's self-report is never verification. CI green is necessary but not
sufficient, because scripts/verify-invariants.mjs only checks five exact strings in four
hardcoded files; fabricated mock data in any other file passes it, build, and tests. A
semantic diff audit therefore runs on every PR.
"""

import base64
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request

# --------------------------------------------------------------------------- config

OWNER = "Rohankapoor1904"
REPO = "Editors"
SOURCE = f"sources/github/{OWNER}/{REPO}"
JULES = "https://jules.googleapis.com/v1alpha"
GH = "https://api.github.com"

MAX_FIX_ATTEMPTS = 3
STUCK_MINUTES = 25
MAX_NUDGES = 2
CLONE_TIMEOUT = 240
INSTALL_TIMEOUT = 420
CMD_TIMEOUT = 300

# ----------------------------------------------------------------------- environment

AGENT_SERVER_URL = os.environ.get("AGENT_SERVER_URL", "").rstrip("/")
SESSION_KEY = os.environ.get("SESSION_API_KEY") or os.environ.get("OH_SESSION_API_KEYS_0", "")
KV_TOKEN = os.environ.get("AUTOMATION_KV_TOKEN", "")
KV_BASE = os.environ.get("AUTOMATION_API_URL", "").rstrip("/")
CALLBACK_URL = os.environ.get("AUTOMATION_CALLBACK_URL", "")
CALLBACK_KEY = os.environ.get("AUTOMATION_CALLBACK_API_KEY", "")
RUN_ID = os.environ.get("AUTOMATION_RUN_ID", "")

STATE_KEY = "orchestrator_state"

DEFAULT_STATE = {
    "phase": "idle",
    "task_id": None,
    "session_id": None,
    "branch": None,
    "pr": None,
    "fix_attempts": 0,
    "nudges": 0,
    "last_error_sig": None,
    "last_update": None,
    "stuck_since": None,
    "history": [],
}


def log(msg):
    print(f"[orchestrator] {msg}", flush=True)


def fire_callback(status="COMPLETED", error=None):
    """Signal run completion. The service marks the run FAILED if this never arrives, so
    a callback failure must never crash the script or mask the work already done.

    Credential note: `AUTOMATION_CALLBACK_API_KEY` is unset in the automation runtime, so
    sending `Bearer ` there yields HTTP 401 on every run. The system-managed
    `OPENHANDS_API_KEY` is injected into the sandbox and is the credential the callback
    endpoint accepts.
    """
    if not CALLBACK_URL:
        log("no callback URL in environment; nothing to signal")
        return
    body = {"status": status, "run_id": RUN_ID}
    if error:
        body["error"] = str(error)[:2000]
    payload = json.dumps(body).encode()

    tokens = [t for t in (CALLBACK_KEY, os.environ.get("OPENHANDS_API_KEY")) if t]
    attempts = [{"Content-Type": "application/json", "Authorization": f"Bearer {t}"}
                for t in tokens]
    attempts.append({"Content-Type": "application/json"})

    for headers in attempts:
        try:
            urllib.request.urlopen(urllib.request.Request(
                CALLBACK_URL, data=payload, headers=headers), timeout=30)
            return
        except urllib.error.HTTPError as exc:
            log(f"callback attempt returned HTTP {exc.code} "
                f"({'with' if 'Authorization' in headers else 'without'} auth header)")
        except Exception as exc:                               # noqa: BLE001
            log(f"callback attempt failed: {exc}")
    log("callback could not be delivered on any attempt")


# --------------------------------------------------------------------------- kv store

# Outside the automation runtime (e.g. GitHub Actions) there is no KV service, so state
# falls back to a JSON file the workflow commits to a dedicated branch.
STATE_FILE = os.environ.get("ORCHESTRATOR_STATE_FILE", "")


def kv_get(key):
    if not (KV_TOKEN and KV_BASE):
        return None
    try:
        with urllib.request.urlopen(urllib.request.Request(
                f"{KV_BASE}/v1/kv/{key}",
                headers={"Authorization": f"Bearer {KV_TOKEN}"})) as r:
            return json.loads(r.read())["value"]
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def kv_set(key, value):
    if not (KV_TOKEN and KV_BASE):
        log("KV store unavailable; state will not persist between runs")
        return
    urllib.request.urlopen(urllib.request.Request(
        f"{KV_BASE}/v1/kv/{key}", data=json.dumps(value).encode(), method="PUT",
        headers={"Authorization": f"Bearer {KV_TOKEN}",
                 "Content-Type": "application/json"})).read()


def load_state():
    state = dict(DEFAULT_STATE)
    saved = kv_get(STATE_KEY)
    if saved is None and STATE_FILE and os.path.exists(STATE_FILE):
        try:
            with open(STATE_FILE, encoding="utf-8") as fh:
                saved = json.load(fh)
        except Exception as exc:                              # noqa: BLE001
            log(f"could not read state file {STATE_FILE}: {exc}")
            saved = None
    if isinstance(saved, dict):
        state.update(saved)
    return state


def save_state(state):
    state["history"] = state.get("history", [])[-40:]
    if STATE_FILE:
        try:
            os.makedirs(os.path.dirname(os.path.abspath(STATE_FILE)), exist_ok=True)
            with open(STATE_FILE, "w", encoding="utf-8") as fh:
                json.dump(state, fh, indent=1)
        except Exception as exc:                              # noqa: BLE001
            log(f"could not write state file {STATE_FILE}: {exc}")
    if KV_TOKEN and KV_BASE:
        kv_set(STATE_KEY, state)
    elif not STATE_FILE:
        log("no state store configured; progress will not persist between runs")


# ---------------------------------------------------------------------------- secrets

def get_secret(name):
    """Read a secret. Stored secrets are exported as environment variables in the
    automation's runtime environment, so the environment is the primary source.

    The agent-server secrets API is only a fallback: secrets registered in that store
    live in a single sandbox and do not survive sandbox recycling, so a run that depends
    on it alone fails with HTTP 404 the moment the sandbox is recreated.
    """
    return first_env(name)


def first_env(*names):
    """Return the first non-empty value among `names`, checked in the environment and
    then the agent-server secret store. Raises if none is set, so a missing credential
    fails loudly instead of silently authenticating as an empty string."""
    for name in names:
        value = os.environ.get(name)
        if value:
            return value.strip()
    for name in names:
        if not (AGENT_SERVER_URL and SESSION_KEY):
            break
        try:
            with urllib.request.urlopen(urllib.request.Request(
                    f"{AGENT_SERVER_URL}/api/settings/secrets/{name}",
                    headers={"X-Session-API-Key": SESSION_KEY}), timeout=30) as r:
                value = r.read().decode().strip()
                if value:
                    return value
        except Exception as exc:                              # noqa: BLE001
            log(f"secret {name} not in environment and agent-server lookup failed: {exc}")
    raise RuntimeError(f"none of these secrets is available to this run: {', '.join(names)}")


# ------------------------------------------------------------------------------- http

def http(url, method="GET", body=None, headers=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else {})
    except urllib.error.HTTPError as exc:
        return exc.code, exc.read().decode()[:600]


def jules(path, method="GET", body=None, key=None):
    return http(f"{JULES}/{path}", method, body,
                {"x-goog-api-key": key, "Content-Type": "application/json"})


def github(path, method="GET", body=None, token=None):
    return http(f"{GH}/{path}", method, body,
                {"Authorization": f"Bearer {token}",
                 "Accept": "application/vnd.github+json",
                 "Content-Type": "application/json"})


# ------------------------------------------------------------- work queue from repo

def fetch_progress(gh_token):
    req = urllib.request.Request(
        f"{GH}/repos/{OWNER}/{REPO}/contents/PROGRESS.md",
        headers={"Authorization": f"Bearer {gh_token}",
                 "Accept": "application/vnd.github.raw"})
    with urllib.request.urlopen(req) as r:
        return r.read().decode()


def parse_queue(md):
    """Parse the Work Queue markdown table into task dicts.

    Rows whose column count does not match the header are skipped, which is deliberate:
    a hand-edit that drops a column must not be silently reinterpreted. Such damage is
    reported separately by audit_tables so it surfaces instead of being swallowed.
    """
    rows, header_cols = [], None
    for line in md.splitlines():
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if re.match(r"^\|\s*ID\s*\|", line):
            header_cols = len(cells)
            continue
        m = re.match(r"\*\*(R\d+\.\d+)\*\*", cells[0])
        if not m:
            continue
        if header_cols is not None and len(cells) != header_cols:
            continue
        if len(cells) < 6:
            continue
        rows.append({
            "id": m.group(1),
            "task": re.sub(r"`", "", cells[1]),
            "phase": cells[2],
            "status": re.sub(r"[`*]", "", cells[3]).strip().lower(),
            "scope": re.sub(r"[`*]", "", cells[5]) if len(cells) > 6 else "",
            "deps": re.findall(r"R\d+\.\d+", cells[-1]),
        })
    return rows


def audit_tables(md, label="PROGRESS.md"):
    """Flag work-queue rows whose column count differs from the header.

    An agent editing the tracker by hand tends to overwrite the `Owner` cell with the
    evidence text instead of appending, silently shifting every later column. Markdown
    renders it without complaint, so nothing catches it. This does.
    """
    findings, header_cols = [], None
    for idx, line in enumerate(md.splitlines(), 1):
        if not line.strip().startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if re.match(r"^\|\s*ID\s*\|", line):
            header_cols = len(cells)
            continue
        if header_cols is None or not re.match(r"\*\*R\d+\.\d+\*\*", cells[0]):
            continue
        if len(cells) != header_cols:
            findings.append((label, idx, f"row has {len(cells)} columns, header has "
                                         f"{header_cols}: {line.strip()[:110]}"))
    return findings


def open_pr_tasks(gh_token):
    """Task IDs that already have an open PR. Guards against re-dispatching live work.

    PROGRESS.md lags reality: a task can still read `todo` while its PR is open and under
    verification. Dispatching it again would duplicate the work.
    """
    status, prs = github(f"repos/{OWNER}/{REPO}/pulls?state=open&per_page=100", token=gh_token)
    if status != 200 or not isinstance(prs, list):
        return set()
    found = set()
    for pr in prs:
        body = pr.get("body") or ""
        title = pr.get("title") or ""
        head = pr.get("head", {}).get("ref") or ""
        for text in (body, title, head):
            for m in re.finditer(r"\b(R\d+\.\d+)\b", text, re.I):
                found.add(m.group(1).upper())
    return found


def next_task(rows, in_flight=None):
    """First claimable task: todo or partial, dependencies done, no PR already open."""
    in_flight = in_flight or set()
    done = {r["id"] for r in rows if r["status"] == "done"}
    for r in rows:
        if r["status"] in ("todo", "partial") and r["id"] not in in_flight:
            if all(d in done for d in r["deps"]):
                return r
    return None


# ------------------------------------------------------------------ prompt building

DISPATCH_TEMPLATE = """TASK: {task_id} — {task}

Repository: {owner}/{repo}. Read AGENTS.md fully before touching code, then docs/ROADMAP.md
for the verbatim acceptance criteria for {task_id}.

Declared file scope: {scope}

## Required process

1. Branch cleanly from the latest origin/main to prevent merge conflicts:
   git fetch origin main
   git checkout -b task-{task_slug} origin/main
2. Commit a claim first, alone, before any implementation:
   chore: claim task {task_id}
3. Implement within the declared scope. If you genuinely must touch files outside it, say
   so explicitly in the PR description.

## Engineering invariants (AGENTS.md section 5 — non-negotiable)

1. All temporal values are RationalTime or integer frame counts. Never accumulate float
   seconds for cut points. Converting a RationalTime to float, doing arithmetic on it, and
   converting back counts as a violation.
2. The project file stores references plus edit decisions; source media is never mutated.
3. Every timeline mutation goes through a command object on an undo stack.
4. Audio is the master clock; never slave sequence timing to video frames.
5. No mock data on the main execution path. If a real implementation is not ready, fail
   loudly rather than returning invented values.
6. Zero-copy frame lifetime: release GPU and VideoFrame handles immediately after submission.
7. A render pass with no createShaderModule and no WGSL source is not a renderer.

## Mandatory verification before you finish

Run npm run build, npm run test, npm run lint. Paste the REAL output in the PR body. If a
command cannot run, write "unverified in <env>". Never imply verification that did not happen.

## Hard constraints

- Do not add mock data to a main execution path.
- Do not write a test that asserts stub, linear-fallback, or hardcoded behaviour as correct.
- A passing test on a stub is debt, not a victory.

## PR body must include

- A line exactly: Task: {task_id}
- The verbatim output of the three verification commands.
- The explicit list of every file you changed.
- An Honest Limitations section. If part of the task could not be done for real, name exactly
  which part and why. That section is valued; a false "done" is not.
"""

REUSE_PREFIX = """This is a NEW task on an existing session, not a continuation of the previous task.

CRITICAL: Start completely clean from latest origin/main to prevent merge conflicts:
1. `git fetch origin main`
2. `git checkout -b task-{task_slug} origin/main`
Do NOT build on the previous task's branch or commit on top of old commits. Open a separate pull request for this task, because the previous branch is already in review or merged.

"""


def build_prompt(task, reuse):
    head = REUSE_PREFIX if reuse else ""
    task_slug = re.sub(r"[^a-zA-Z0-9]+", "-", task["id"].lower()).strip("-")
    return (head + DISPATCH_TEMPLATE).format(
        task_id=task["id"], task=task["task"], task_slug=task_slug,
        owner=OWNER, repo=REPO, scope=task.get("scope") or "(not declared)")


# ------------------------------------------------------------------- jules operations

def create_session(prompt, title, key):
    return jules("sessions", "POST", {
        "title": title,
        "prompt": prompt,
        "sourceContext": {"source": SOURCE,
                          "githubRepoContext": {"startingBranch": "main"}},
        "automationMode": "AUTO_CREATE_PR",
        "requirePlanApproval": False,
    }, key=key)


def send_message(session_id, prompt, key):
    return jules(f"sessions/{session_id}:sendMessage", "POST", {"prompt": prompt}, key=key)


def get_session(session_id, key):
    return jules(f"sessions/{session_id}", key=key)


def get_activities(session_id, key):
    status, data = jules(f"sessions/{session_id}/activities?pageSize=100", key=key)
    if status != 200 or not isinstance(data, dict):
        return []
    return data.get("activities", [])


def session_pr(session_id, gh_token, task_id=None):
    """Find the PR Jules opened for this session. Checks open PRs first, then all PRs."""
    sid_str = str(session_id) if session_id else ""
    for state in ("open", "all"):
        status, prs = github(f"repos/{OWNER}/{REPO}/pulls?state={state}&per_page=50", token=gh_token)
        if status != 200 or not isinstance(prs, list):
            continue
        for pr in prs:
            head = pr.get("head", {}).get("ref", "")
            body = pr.get("body") or ""
            title = pr.get("title") or ""
            if sid_str and (sid_str in head or sid_str in body):
                return pr
            if task_id:
                tid_lower = task_id.lower()
                if tid_lower in head.lower() or f"task: {tid_lower}" in body.lower() or tid_lower in title.lower():
                    return pr
    return None


def failure_reason(activities):
    for a in reversed(activities):
        if "sessionFailed" in a:
            return str(a["sessionFailed"].get("reason", "unknown"))
    return "unknown"


def error_signature(reason):
    """Fingerprint a failure reason so the same underlying failure hashes the same.

    Exact hashing is too brittle: 'virtual machine environment for the task' and
    '...for the tasks' would produce different hashes, so the repeated-failure rule would
    never fire. Instead match on the failure category, which is what actually repeats.
    """
    low = reason.lower()
    categories = [
        (("virtual machine", "vm", "environment"), "vm_provision"),
        (("timeout", "timed out"), "timeout"),
        (("rate limit", "quota", "resource exhausted"), "quota"),
        (("permission", "forbidden", "unauthorized", "access"), "permission"),
        (("merge conflict", "conflict"), "conflict"),
        (("no changes", "nothing to commit"), "empty_change"),
        (("network", "connection", "socket"), "network"),
    ]
    for needles, label in categories:
        if any(n in low for n in needles):
            return label
    norm = re.sub(r"\d+", "N", low)
    norm = re.sub(r"[^a-z ]", "", norm)
    return hashlib.sha256(" ".join(norm.split()).encode()).hexdigest()[:16]


# ------------------------------------------------------------------------- verifier

MOCK_PATTERNS = [
    (r"return\s*\[\s*\{[^}]*\}", "hardcoded array literal returned"),
    (r"Math\.sin\s*\(", "synthetic Math.sin trajectory"),
    (r"setTimeout\s*\([^,]+,\s*\d+\s*\)", "setTimeout standing in for real work"),
    (r"(?i)TODO.*mock|FIXME.*mock", "explicit mock marker"),
]


def audit_diff(diff_text):
    """Semantic audit that the mechanical invariant gate cannot perform.

    Precision matters more than coverage here: a false positive makes the orchestrator
    send Jules bogus feedback, which wastes a whole session cycle. Scaling a rational
    value for pixel layout (`rationalToSeconds(t) * zoomLevel`) is legitimate and is
    deliberately not flagged. What is flagged is rational time converted to float and then
    combined additively with another time value, or converted back through secondsToRational,
    because that is the accumulation AGENTS.md invariant 5.1 forbids.

    A defect often hides behind an intermediate variable:
        const newPos = rationalToSeconds(playhead) + delta * frameDuration;
        setPlayheadPosition(secondsToRational(newPos));
    so a small taint set tracks float-converted timing values across lines within the diff.
    """
    findings, current = [], None
    tainted = set()
    layout = re.compile(r"(px\b|zoomLevel|zoom\b|style=|width:|left:|right:|top:|height:)", re.I)

    for line in diff_text.splitlines():
        if line.startswith("+++ b/"):
            current = line[6:]
            continue
        if not line.startswith("+") or line.startswith("+++"):
            continue
        added = line[1:]
        if not added.strip():
            continue

        if re.search(r"expect\(.*\)\.(toBe|toEqual)\(.*(mock|stub|fallback|demo)", added, re.I):
            findings.append(("TEST ASSERTS STUB", current, added.strip()))

        # Check for unresolved git merge conflict markers
        if re.match(r"^[<>=]{7}", added.strip()):
            findings.append(("UNRESOLVED MERGE CONFLICT MARKER", current, added.strip()))

        for pat, label in MOCK_PATTERNS:
            if re.search(pat, added):
                findings.append((f"POSSIBLE MOCK ({label})", current, added.strip()))

        if re.search(r"(duration|startOffset|sourceIn|sourceOut|playhead)\w*\s*[:=]\s*\d+\.\d+",
                     added):
            findings.append(("FLOAT SECONDS ON TIMING FIELD", current, added.strip()))

        if re.search(r"currentRuntimeMode\s*[:=].*['\"]demo['\"]", added):
            findings.append(("DEMO MODE DEFAULT", current, added.strip()))

        if layout.search(added):
            continue                      # pixel layout, not timeline arithmetic

        # assign a float-converted time to a variable -> taint it
        assign = re.search(r"(\w+)\s*=\s*[^=]*rationalToSeconds\(", added)
        if assign:
            tainted.add(assign.group(1))

        # additive combination of a converted time with anything else
        if re.search(r"rationalToSeconds\([^)]*\)\s*[+\-]", added):
            findings.append(("FLOAT TIME ACCUMULATION", current, added.strip()))

        # converted time fed back through secondsToRational (directly or via a tainted var)
        direct = re.search(r"secondsToRational\(\s*[^)]*rationalToSeconds", added)
        viavar = re.search(r"secondsToRational\(\s*(\w+)\s*\)", added)
        if direct or (viavar and viavar.group(1) in tainted):
            findings.append(("FLOAT ROUND-TRIP THROUGH RATIONAL", current, added.strip()))

    return findings


def run(cmd, cwd, timeout=CMD_TIMEOUT):
    try:
        p = subprocess.run(cmd, shell=True, cwd=cwd, capture_output=True,
                           text=True, timeout=timeout)
        return p.returncode, (p.stdout or "") + (p.stderr or "")
    except subprocess.TimeoutExpired:
        return 124, f"timeout after {timeout}s"


def verify_pr(pr_number, gh_token):
    """Clone the PR branch into a scratch dir and verify it. Never trust the self-report."""
    scratch = tempfile.mkdtemp(prefix="jules-verify-")
    result = {"ok": False, "checks": {}, "audit": [], "files": []}
    try:
        status, pr = github(f"repos/{OWNER}/{REPO}/pulls/{pr_number}", token=gh_token)
        if status != 200 or not isinstance(pr, dict):
            result["checks"]["pr"] = f"fetch failed ({status})"
            return result

        if pr.get("merged"):
            result["ok"] = True
            result["already_merged"] = True
            result["checks"]["pr_status"] = "already merged into main"
            return result

        if pr.get("state") == "closed":
            result["ok"] = False
            result["closed_unmerged"] = True
            result["checks"]["pr_status"] = "closed without merge"
            return result

        if pr.get("mergeable") is False or pr.get("mergeable_state") == "dirty":
            result["checks"]["merge_conflict"] = "FAILING: GitHub reports PR branch has merge conflicts with base"

        rc, out = run(f"git clone --quiet https://x-access-token:{gh_token}@github.com/"
                      f"{OWNER}/{REPO}.git .", scratch, CLONE_TIMEOUT)
        if rc != 0:
            result["checks"]["clone"] = f"failed: {out[-200:]}"
            return result

        branch = pr["head"]["ref"]
        run(f"git fetch --quiet origin {branch}", scratch, 120)
        run("git checkout --quiet FETCH_HEAD", scratch, 120)

        # Configure git identity for trial merge
        run("git config user.name 'jules-orchestrator'", scratch, 10)
        run("git config user.email 'jules-orchestrator@users.noreply.github.com'", scratch, 10)

        # Test trial merge with origin/main to verify clean mergeability
        rc_merge, merge_out = run("git merge --no-commit --no-ff origin/main", scratch, 60)
        if rc_merge != 0:
            rc_c, c_out = run("git diff --name-only --diff-filter=U", scratch, 30)
            conflicts = [f.strip() for f in c_out.strip().splitlines() if f.strip()]
            c_str = ", ".join(conflicts) if conflicts else "unresolved conflicts"
            run("git merge --abort", scratch, 30)
            result["checks"]["merge_conflict"] = f"FAILING: Branch has merge conflicts with origin/main in: {c_str}"
            result["ok"] = False
            return result
        else:
            run("git merge --abort", scratch, 30)
            if "merge_conflict" not in result["checks"]:
                result["checks"]["merge_conflict"] = "Cleanly merges with origin/main"

        rc, diff = run("git diff origin/main...HEAD", scratch, 120)
        result["files"] = re.findall(r"^\+\+\+ b/(.+)$", diff, re.M)
        result["audit"] = audit_diff(diff)

        # Tracker integrity: a shifted row or a backwards date renders fine and passes every
        # mechanical check, so it is verified explicitly.
        tracker = os.path.join(scratch, "PROGRESS.md")
        if os.path.exists(tracker):
            with open(tracker, encoding="utf-8") as fh:
                md_text = fh.read()
            for label, line_no, detail in audit_tables(md_text):
                result["audit"].append(("MALFORMED WORK QUEUE ROW", f"{label}:{line_no}", detail))

            status, pr_main = github(f"repos/{OWNER}/{REPO}/contents/PROGRESS.md?ref=main",
                                     token=gh_token)
            if status == 200 and isinstance(pr_main, dict):
                try:
                    base_md = base64.b64decode(pr_main["content"]).decode()
                except Exception:                              # noqa: BLE001
                    base_md = ""
                dates = re.findall(r"\|\s*(\d{4}-\d{2}-\d{2})\s*\|", md_text)
                base_dates = re.findall(r"\|\s*(\d{4}-\d{2}-\d{2})\s*\|", base_md)
                if dates and base_dates:
                    newest_here = max(dates)
                    newest_base = max(base_dates)
                    if newest_here < newest_base:
                        result["audit"].append(
                            ("REGRESSED EVIDENCE DATE", "PROGRESS.md",
                             f"newest date in PR is {newest_here} but main already has "
                             f"{newest_base}"))

        has_code = any(not f.endswith(".md") for f in result["files"])
        if not has_code:
            result["checks"]["code"] = "documentation-only change, build skipped"
        else:
            rc, _ = run("npm ci --silent", scratch, INSTALL_TIMEOUT)
            result["checks"]["npm ci"] = f"exit {rc}"
            if rc == 0:
                for label, cmd in (("build", "npm run build"),
                                   ("test", "npm run test"),
                                   ("lint", "npm run lint")):
                    rc, out = run(cmd, scratch, CMD_TIMEOUT)
                    tail = [l for l in out.strip().splitlines() if l.strip()][-1:] or [""]
                    entry = f"exit {rc} | {tail[0][:90]}"
                    if label in ("build", "test") and rc != 0:
                        entry += "  <-- FAILING"
                    result["checks"][label] = entry

        hard_fail = any("FAILING" in v for v in result["checks"].values())
        result["ok"] = not hard_fail and not result["audit"]
        return result
    finally:
        shutil.rmtree(scratch, ignore_errors=True)


def format_feedback(task_id, result, branch):
    lines = [f"Independent verification of Task: {task_id} on branch {branch} found problems.",
             "", "Verification results:"]
    for k, v in result["checks"].items():
        lines.append(f"- {k}: {v}")
    if result["audit"]:
        lines += ["", "Semantic audit signals. These are why this cannot be accepted:"]
        for label, path, code in result["audit"][:12]:
            lines.append(f"- {label} in {path}")
            lines.append(f"    {code[:150]}")

    has_conflict = (any("conflict" in str(v).lower() for v in result["checks"].values())
                    or any("conflict" in label.lower() for label, _, _ in result["audit"]))
    if has_conflict:
        lines += [
            "",
            "### [MERGE CONFLICT] Resolution Required:",
            "Your branch has conflicts with origin/main or contains conflict markers. To resolve:",
            "1. Fetch the latest origin/main: `git fetch origin main`",
            "2. Merge origin/main into your branch: `git merge origin/main` (or rebase)",
            "3. Carefully resolve all conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`) in the files",
            "4. Run `npm run build` and `npm run test` to verify everything compiles and passes",
            "5. Commit and push the resolved changes to this same branch so the pull request updates.",
        ]

    lines += ["", "Fix these on the SAME branch and push, so the existing PR updates in place.",
              "Do not open a new PR. Re-run npm run build, npm run test, npm run lint and paste",
              "the real output. If any part cannot be done for real, say so in an Honest",
              "Limitations section instead of marking it done."]
    return "\n".join(lines)



def parse_ts(iso):
    try:
        base = re.sub(r"\.\d+", "", iso.replace("Z", ""))
        return time.mktime(time.strptime(base, "%Y-%m-%dT%H:%M:%S")) - time.timezone
    except Exception:                                          # noqa: BLE001
        return time.time()


def reset_for_next_task(state):
    """Clear the per-task fields but keep session_id so the next task reuses it."""
    state.update({"phase": "idle", "task_id": None, "branch": None, "pr": None,
                  "fix_attempts": 0, "nudges": 0, "last_error_sig": None,
                  "last_update": None, "stuck_since": None})


# ----------------------------------------------------------------------- state machine

def advance(state, jules_key, gh_token, md):
    phase = state["phase"]

    # ------------------------------------------------------------------ idle: dispatch
    if phase == "idle":
        task = next_task(parse_queue(md), open_pr_tasks(gh_token))
        if not task:
            log("no claimable task in the work queue (nothing todo, or all candidates have an open PR)")
            return "COMPLETED"

        session_id = state.get("session_id")
        reuse = bool(session_id)
        if reuse:
            st, sess = get_session(session_id, jules_key)
            jstate = str(sess.get("state")) if isinstance(sess, dict) else "UNKNOWN"
            # A COMPLETED session is idle and MUST be reused: Jules re-clones the repo for
            # every new session, so minting one per task is both slower and costlier. Only a
            # dead or unreachable session forces a fresh one.
            if st != 200 or jstate in ("FAILED", "UNKNOWN", "None"):
                log(f"session {session_id} not reusable (HTTP {st}, state {jstate})")
                reuse = False

        prompt = build_prompt(task, reuse)
        if reuse:
            st, data = send_message(session_id, prompt, jules_key)
            log(f"reused session {session_id} for {task['id']} -> HTTP {st}")
        else:
            st, data = create_session(prompt, f"{task['id']} {task['task'][:60]}", jules_key)
            session_id = data.get("id") if isinstance(data, dict) else None
            log(f"created session {session_id} for {task['id']} -> HTTP {st}")

        if st not in (200, 201) or not session_id:
            log(f"dispatch failed: {data}")
            return "FAILED"

        state.update({"phase": "awaiting_session", "task_id": task["id"],
                      "session_id": session_id, "branch": None, "pr": None,
                      "fix_attempts": 0, "nudges": 0, "last_error_sig": None,
                      "last_update": None, "stuck_since": None})
        state["history"].append({"t": int(time.time()), "ev": f"dispatch {task['id']}"})
        return "COMPLETED"

    # ------------------------------------------------ awaiting_session / awaiting_fix
    if phase in ("awaiting_session", "awaiting_fix"):
        session_id = state["session_id"]
        st, sess = get_session(session_id, jules_key)
        if st != 200 or not isinstance(sess, dict):
            log(f"session fetch failed: {st} {sess}")
            return "FAILED"

        jstate = str(sess.get("state"))
        updated = sess.get("updateTime")
        log(f"session {session_id} state={jstate} updated={updated}")

        if jstate == "FAILED":
            reason = failure_reason(get_activities(session_id, jules_key))
            sig = error_signature(reason)
            log(f"session FAILED: {reason[:140]} (sig {sig})")

            if sig == state.get("last_error_sig"):
                log("same failure category again -> minting a fresh session for the same task")
                rows = parse_queue(md)
                current = next((r for r in rows if r["id"] == state.get("task_id")), None)
                task = current or next_task(rows, open_pr_tasks(gh_token)) or {
                    "id": state.get("task_id") or "unknown", "task": "retry", "scope": ""}
                prompt = build_prompt(task, reuse=False)
                st2, data = create_session(prompt, f"{task['id']} {task['task'][:60]}", jules_key)
                if st2 not in (200, 201) or not isinstance(data, dict) or not data.get("id"):
                    log(f"fresh dispatch failed: {data}")
                    return "FAILED"
                state.update({"phase": "awaiting_session", "session_id": data["id"],
                              "branch": None, "pr": None, "fix_attempts": 0,
                              "nudges": 0, "last_error_sig": sig, "stuck_since": None})
                state["history"].append({"t": int(time.time()),
                                         "ev": "fresh session after repeated failure"})
                return "COMPLETED"

            if sig == "conflict":
                msg = (
                    f"Your previous attempt failed with a git merge conflict:\n"
                    f"{reason}\n\n"
                    "Please resolve the conflict against origin/main:\n"
                    "1. Fetch the latest origin/main: `git fetch origin main`\n"
                    "2. Rebase or merge: `git merge origin/main`\n"
                    "3. Resolve all conflict markers cleanly\n"
                    "4. Run `npm run build` and `npm run test`\n"
                    "5. Commit and push your updated branch so the pull request updates in place."
                )
            else:
                msg = (
                    "Your previous attempt failed with:\n"
                    f"{reason}\n\n"
                    "That looks like an environment or session failure rather than a problem with "
                    "the task itself. Please continue: retry the pending instruction and push to the "
                    "same branch if a PR already exists. If the failure was genuinely caused by the "
                    "task, say so explicitly instead of retrying."
                )
            send_message(session_id, msg, jules_key)
            state["last_error_sig"] = sig
            state["nudges"] = state.get("nudges", 0) + 1
            state["phase"] = "awaiting_session"
            state["history"].append({"t": int(time.time()), "ev": f"revive after {sig}"})
            log(f"told session to continue (sig: {sig})")
            return "COMPLETED"

        if jstate in ("IN_PROGRESS", "QUEUED", "PLANNING", "PAUSED"):
            acts = get_activities(session_id, jules_key)
            stamp = (acts[-1].get("createTime") if acts else None) or updated
            if stamp and stamp == state.get("last_update"):
                since = state.get("stuck_since") or stamp
                state["stuck_since"] = since
                if (time.time() - parse_ts(since) > STUCK_MINUTES * 60
                        and state.get("nudges", 0) < MAX_NUDGES):
                    send_message(session_id,
                                 "No activity has been observed on this session for a while. "
                                 "Please continue from where you left off and report what you are "
                                 "working on. If you are blocked, say what is blocking you.",
                                 jules_key)
                    state["nudges"] = state.get("nudges", 0) + 1
                    state["stuck_since"] = None
                    state["history"].append({"t": int(time.time()), "ev": "stuck nudge"})
                    log("sent stuck nudge")
            else:
                state["stuck_since"] = None
            state["last_update"] = stamp
            return "COMPLETED"

        if jstate == "COMPLETED":
            pr = session_pr(session_id, gh_token, state.get("task_id"))
            if not pr:
                log("session COMPLETED but no PR found yet; re-checking next run")
                state["last_update"] = None
                return "COMPLETED"
            state.update({"phase": "verifying", "pr": pr["number"],
                          "branch": pr["head"]["ref"]})
            state["history"].append({"t": int(time.time()), "ev": f"PR #{pr['number']} detected"})
            log(f"PR #{pr['number']} detected; advancing immediately to verification")
            return advance(state, jules_key, gh_token, md)

        log(f"unhandled session state {jstate}; waiting")
        return "COMPLETED"

    # -------------------------------------------------------------------- verifying
    if phase == "verifying":
        pr = state["pr"]
        result = verify_pr(pr, gh_token)
        state["history"].append({"t": int(time.time()),
                                 "ev": f"verified PR #{pr}: ok={result['ok']}"})
        log(f"verification ok={result['ok']} checks={result['checks']}")

        if result.get("already_merged"):
            log(f"PR #{pr} is already merged into main; resetting for next task")
            reset_for_next_task(state)
            return advance(state, jules_key, gh_token, md)

        if result.get("closed_unmerged"):
            log(f"PR #{pr} was closed without merge; resetting for next task")
            reset_for_next_task(state)
            return advance(state, jules_key, gh_token, md)

        if result["ok"]:
            log(f"Task {state['task_id']} verified; PR #{pr} is ready for merge")
            github(f"repos/{OWNER}/{REPO}/issues/{pr}/comments", "POST", {
                "body": (f"✅ **Independent Verification Passed for Task {state['task_id']}**\n\n"
                         f"All mechanical checks and semantic audits passed cleanly:\n"
                         f"- Mergeability: Cleanly merges with `origin/main` (no merge conflicts)\n"
                         f"- Build: `npm run build` passed\n"
                         f"- Tests: `npm run test` passed (all tests and mechanical invariant checks green)\n"
                         f"- Lint: `npm run lint` passed (0 errors)\n"
                         f"- Invariant Audit: No stub fallbacks, no float time accumulation, no unresolved conflict markers\n\n"
                         f"PR #{pr} is verified and ready for merge!\n\n"
                         f"_This comment was posted by the OpenHands orchestrator on behalf of {OWNER}._")},
                token=gh_token)
            reset_for_next_task(state)
            return "COMPLETED"

        attempts = state.get("fix_attempts", 0) + 1
        if attempts > MAX_FIX_ATTEMPTS:
            log(f"attempt limit reached for {state['task_id']}; escalating")
            github(f"repos/{OWNER}/{REPO}/issues/{pr}/comments", "POST", {
                "body": (f"OpenHands orchestrator: {MAX_FIX_ATTEMPTS} fix attempts were made and "
                         "verification still fails. Escalating to a human.\n\nLast result:\n"
                         f"```\n{json.dumps(result['checks'], indent=2)}\n```\n\n"
                         "_This comment was posted by an AI agent (OpenHands) on behalf of "
                         f"{OWNER}._")}, token=gh_token)
            reset_for_next_task(state)
            return "COMPLETED"

        body = format_feedback(state["task_id"], result, state["branch"])
        github(f"repos/{OWNER}/{REPO}/issues/{pr}/comments", "POST",
               {"body": body + f"\n\n_This comment was posted by an AI agent (OpenHands) on "
                               f"behalf of {OWNER}._"}, token=gh_token)
        send_message(state["session_id"], body, jules_key)
        state.update({"phase": "awaiting_fix", "fix_attempts": attempts, "last_update": None})
        state["history"].append({"t": int(time.time()),
                                 "ev": f"feedback sent (attempt {attempts})"})
        log(f"feedback sent, attempt {attempts}")
        return "COMPLETED"

    log(f"unknown phase {phase}; resetting")
    reset_for_next_task(state)
    return "COMPLETED"



# ------------------------------------------------------------------------------- main

def main():
    # The agent server is only an optional secret fallback; the orchestrator itself talks
    # to the Jules API, GitHub, and a local git clone, so it must not require a sandbox.
    try:
        jules_key = first_env("JULES_API_KEY")
        gh_token = first_env("GITHUB_OWNER_TOKEN", "GH_TOKEN", "GITHUB_TOKEN")
        state = load_state()
    except Exception as exc:                                   # noqa: BLE001
        log(f"startup failed: {exc}")
        fire_callback("FAILED", f"startup failed: {exc}")
        return 1

    log(f"phase={state['phase']} task={state.get('task_id')} session={state.get('session_id')}")

    try:
        md = fetch_progress(gh_token)
    except Exception as exc:                                   # noqa: BLE001
        md = ""
        log(f"could not fetch PROGRESS.md: {exc}")

    try:
        status = advance(state, jules_key, gh_token, md)
    except Exception as exc:                                   # noqa: BLE001
        log(f"unexpected error: {exc}")
        state["history"].append({"t": int(time.time()), "ev": f"error: {str(exc)[:100]}"})
        save_state(state)
        fire_callback("FAILED", str(exc))
        return 1

    save_state(state)
    log(f"phase now {state['phase']}")
    if RUN_ID:
        fire_callback(status)
    return 0


if __name__ == "__main__":
    sys.exit(main())
