# Comprehensive Desktop App Control Test Suite for CineCraft AI
$baseUrl = "http://localhost:3000/api/agent"
$passCount = 0
$failCount = 0

function Assert-Test([string]$name, [bool]$condition, [string]$detail = "") {
    if ($condition) {
        $script:passCount++
        Write-Host "  [PASS] $name" -ForegroundColor Green
        if ($detail) { Write-Host "         -> $detail" -ForegroundColor Gray }
    } else {
        $script:failCount++
        Write-Host "  [FAIL] $name" -ForegroundColor Red
        if ($detail) { Write-Host "         -> $detail" -ForegroundColor Yellow }
    }
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  CINECRAFT AI STUDIO - DIRECT DESKTOP APP CONTROL TEST " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# TEST 1: Connectivity & App Health
Write-Host "[1/10] Checking Native Desktop App Connection..." -ForegroundColor White
$status = Invoke-RestMethod -Uri "$baseUrl/status" -Method Get
Assert-Test "Desktop App Connected" ($status.connected -eq $true) "AppName: $($status.appName), Last Heartbeat: $($status.lastHeartbeatMsAgo)ms ago"

# TEST 2: Add Media Clip to Timeline
Write-Host "`n[2/10] Testing Timeline Media Control (Add Clip)..." -ForegroundColor White
$body = @{ action = "add_sample_clip"; name = "Cinema_Take_4K_RAW.mov"; duration = 30 } | ConvertTo-Json -Compress
$res = Invoke-RestMethod -Uri "$baseUrl/action" -Method Post -Body $body -ContentType "application/json"
Assert-Test "Add Clip Action Executed" ($res.success -eq $true) "Clip Name: $($res.result.addedClip.name), Duration: 30s"

Start-Sleep -Milliseconds 600
$timeline = (Invoke-RestMethod -Uri "$baseUrl/status" -Method Get).state
Assert-Test "Timeline State Updated with 1 Clip" ($timeline.clipsCount -ge 1) "Total Clips on Timeline: $($timeline.clipsCount)"

# TEST 3: Playhead Transport Control
Write-Host "`n[3/10] Testing Playhead Transport Control (Seek)..." -ForegroundColor White
$body = @{ action = "seek"; seconds = 7.5 } | ConvertTo-Json -Compress
$res = Invoke-RestMethod -Uri "$baseUrl/action" -Method Post -Body $body -ContentType "application/json"
Start-Sleep -Milliseconds 500
$playhead = (Invoke-RestMethod -Uri "$baseUrl/status" -Method Get).state.playhead
Assert-Test "Seek Playhead to 7.5s" ($playhead.value -eq 7.5) "Current Playhead: $($playhead.value)s"

$body = @{ action = "seek"; seconds = 21.0 } | ConvertTo-Json -Compress
$res = Invoke-RestMethod -Uri "$baseUrl/action" -Method Post -Body $body -ContentType "application/json"
Start-Sleep -Milliseconds 500
$playhead = (Invoke-RestMethod -Uri "$baseUrl/status" -Method Get).state.playhead
Assert-Test "Seek Playhead to 21.0s" ($playhead.value -eq 21) "Current Playhead: $($playhead.value)s"

# TEST 4: Workspace Switching Control
Write-Host "`n[4/10] Testing Workspace Switching (Color, Audio, Export, AI, Edit)..." -ForegroundColor White
$workspaces = @("color", "audio", "export", "ai", "edit")
foreach ($ws in $workspaces) {
    $body = @{ action = "set_workspace"; workspace = $ws } | ConvertTo-Json -Compress
    $res = Invoke-RestMethod -Uri "$baseUrl/action" -Method Post -Body $body -ContentType "application/json"
    Start-Sleep -Milliseconds 400
    $activeWs = (Invoke-RestMethod -Uri "$baseUrl/status" -Method Get).state.activeWorkspace
    Assert-Test "Switched to '$ws' Workspace" ($activeWs -eq $ws) "Active Desktop View: $activeWs"
}

# TEST 5: AI Prompt - Social Auto-Reframe (9:16 Vertical Shorts)
Write-Host "`n[5/10] Testing AI Editorial Prompt (Auto-Reframe to 9:16 Shorts)..." -ForegroundColor White
$body = @{ prompt = "Change sequence aspect ratio to 9:16 vertical shorts and apply active speaker auto reframe" } | ConvertTo-Json -Compress
$res = Invoke-RestMethod -Uri "$baseUrl/prompt" -Method Post -Body $body -ContentType "application/json"
Start-Sleep -Milliseconds 500
$meta = (Invoke-RestMethod -Uri "$baseUrl/timeline" -Method Get).metadata
Assert-Test "Sequence Resized to 9:16 (1080x1920)" ($meta.width -eq 1080 -and $meta.height -eq 1920) "Dimensions: $($meta.width)x$($meta.height) @ $($meta.fps)fps"

# TEST 6: Direct Tool Invocations via Registry (Cinema 4K Resolution)
Write-Host "`n[6/10] Testing Direct Tool Invocation (sequence_set_aspect_ratio to Cinema 4K)..." -ForegroundColor White
$body = @{ tool = "sequence_set_aspect_ratio"; args = @{ width = 3840; height = 2160 } } | ConvertTo-Json -Compress
$res = Invoke-RestMethod -Uri "$baseUrl/tool" -Method Post -Body $body -ContentType "application/json"
Start-Sleep -Milliseconds 500
$meta = (Invoke-RestMethod -Uri "$baseUrl/timeline" -Method Get).metadata
Assert-Test "Direct Tool: Aspect Ratio Set to Cinema 4K (3840x2160)" ($meta.width -eq 3840 -and $meta.height -eq 2160) "Dimensions: $($meta.width)x$($meta.height)"

# TEST 7: AI Prompt - Kinetic Subtitles & Captions
Write-Host "`n[7/10] Testing AI Editorial Prompt (Add Kinetic Subtitles)..." -ForegroundColor White
$body = @{ prompt = "Add bold yellow captions with kinetic highlight" } | ConvertTo-Json -Compress
$res = Invoke-RestMethod -Uri "$baseUrl/prompt" -Method Post -Body $body -ContentType "application/json"
Assert-Test "Captions Tool Applied" ($res.success -eq $true) "Prompt: $($res.result.prompt), Commands: $($res.result.commandsCount)"

# TEST 8: AI Prompt - Silence Trimming & Ripple Edit
Write-Host "`n[8/10] Testing AI Editorial Prompt (Silence Removal)..." -ForegroundColor White
$body = @{ prompt = "Tighten timeline and ripple cut all silence gaps > 0.5s" } | ConvertTo-Json -Compress
$res = Invoke-RestMethod -Uri "$baseUrl/prompt" -Method Post -Body $body -ContentType "application/json"
Assert-Test "Silence Removal Prompt Executed" ($res.success -eq $true) "Logs: $($res.result.logs[0])"

# TEST 9: Non-Destructive Editorial History (Undo & Redo)
Write-Host "`n[9/10] Testing Undo / Redo Command History..." -ForegroundColor White
$body = @{ action = "undo" } | ConvertTo-Json -Compress
$res = Invoke-RestMethod -Uri "$baseUrl/action" -Method Post -Body $body -ContentType "application/json"
Assert-Test "Undo Command Executed" ($res.result.undone -eq $true) "History step successfully reverted"

$body = @{ action = "redo" } | ConvertTo-Json -Compress
$res = Invoke-RestMethod -Uri "$baseUrl/action" -Method Post -Body $body -ContentType "application/json"
Assert-Test "Redo Command Executed" ($res.result.redone -eq $true) "History step successfully restored"

# TEST 10: Full Timeline State Extraction
Write-Host "`n[10/10] Testing Full Timeline Data Extraction..." -ForegroundColor White
$tl = Invoke-RestMethod -Uri "$baseUrl/timeline" -Method Get
$tracksCount = $tl.timeline.tracks.Count
Assert-Test "Extracted Complete Timeline State" ($tracksCount -gt 0) "Tracks: $tracksCount, Metadata: $($tl.metadata.name)"

$summaryColor = if ($failCount -eq 0) { "Green" } else { "Red" }
Write-Host "  TEST SUMMARY: $passCount PASSED / $failCount FAILED" -ForegroundColor $summaryColor
Write-Host "========================================================`n" -ForegroundColor Cyan
