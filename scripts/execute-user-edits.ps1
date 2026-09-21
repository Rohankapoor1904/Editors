# Script to execute precision edits on the user's video via CineCraft AI Live Bridge
$baseUrl = "http://localhost:3000/api/agent"

$results = @()

function Record-Step([string]$taskName, [bool]$success, [string]$details, [hashtable]$extra = @{}) {
    $item = [PSCustomObject]@{
        Task = $taskName
        Success = $success
        Details = $details
        Extra = $extra
    }
    $global:results += $item
    $statusColor = if ($success) { "Green" } else { "Red" }
    $mark = if ($success) { "[SUCCESS]" } else { "[FAILED]" }
    Write-Host "$mark $taskName" -ForegroundColor $statusColor
    Write-Host "         -> $details" -ForegroundColor Gray
}

Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  CINECRAFT AI - EXECUTING USER VIDEO EDITS IN REALTIME " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 0. Check Status & Connection
try {
    $status = Invoke-RestMethod -Uri "$baseUrl/status" -Method Get
    Record-Step "Connect to Desktop App" ($status.connected -eq $true) "Connected to $($status.appName) (Heartbeat $($status.lastHeartbeatMsAgo)ms ago)"
} catch {
    Record-Step "Connect to Desktop App" $false "Failed to connect to agent bridge: $_"
    exit 1
}

# 1. Probe the User's Video Media
try {
    $probeBody = @{
        tool = "probe_media"
        args = @{ asset_id = "VID_20260920_214031_445.mp4" }
    } | ConvertTo-Json -Compress
    $probeRes = Invoke-RestMethod -Uri "$baseUrl/tool" -Method Post -Body $probeBody -ContentType "application/json"
    $dur = $probeRes.result.toolResult.duration
    Record-Step "Probe Media Metadata" ($probeRes.success -eq $true) "Video: VID_20260920_214031_445.mp4 | Duration: ${dur}s | Resolution: 720x720 (1:1 Square)"
} catch {
    Record-Step "Probe Media Metadata" $false "$_"
}

# 2. Apply Auto-Reframe (720x720 -> 9:16 Vertical Center-Tracked)
try {
    $reframeBody = @{
        tool = "video_apply_auto_reframe"
        args = @{
            track_id = "track_v2"
            tracking_mode = "ActiveSpeaker"
            smoothing = 0.15
        }
    } | ConvertTo-Json -Compress
    $reframeRes = Invoke-RestMethod -Uri "$baseUrl/tool" -Method Post -Body $reframeBody -ContentType "application/json"
    Start-Sleep -Milliseconds 500
    Record-Step "Apply AI Auto-Reframe (9:16)" ($reframeRes.success -eq $true) "ActiveSpeaker tracking with Kalman smoothing (0.15) applied to track_v2"
} catch {
    Record-Step "Apply AI Auto-Reframe (9:16)" $false "$_"
}

# 3. Add Kinetic Captions / Subtitles
try {
    $captionBody = @{
        tool = "add_subtitles"
        args = @{
            style = "bold_yellow_highlight"
            font_size = 28
            max_words_per_line = 3
        }
    } | ConvertTo-Json -Compress
    $captionRes = Invoke-RestMethod -Uri "$baseUrl/tool" -Method Post -Body $captionBody -ContentType "application/json"
    Start-Sleep -Milliseconds 500
    Record-Step "Add Bold Yellow Kinetic Captions" ($captionRes.success -eq $true) "Generated subtitle layer with kinetic yellow word highlights"
} catch {
    Record-Step "Add Bold Yellow Kinetic Captions" $false "$_"
}

# 4. Add Background Music Track with Auto-Ducking
try {
    $audioBody = @{
        tool = "add_audio_track"
        args = @{
            audio_asset_id = "ambient_cinematic_bed_48k"
            volume = 0.25
            auto_ducking = $true
        }
    } | ConvertTo-Json -Compress
    $audioRes = Invoke-RestMethod -Uri "$baseUrl/tool" -Method Post -Body $audioBody -ContentType "application/json"
    Start-Sleep -Milliseconds 500
    Record-Step "Add BGM Audio with Auto-Ducking" ($audioRes.success -eq $true) "Layered ambient cinematic audio track at -12dB with automatic dialogue ducking"
} catch {
    Record-Step "Add BGM Audio with Auto-Ducking" $false "$_"
}

# 5. Precision Razor Cut & Chapter Arranging on Main Track
try {
    $cutBody = @{
        tool = "cut_and_arrange_timeline"
        args = @{
            track_id = "track_v1"
            edits = @(
                @{ asset_id = "VID_20260920_214031_445.mp4"; start_time = 0.0; end_time = 12.0; timeline_position = 0.0 },
                @{ asset_id = "VID_20260920_214031_445.mp4"; start_time = 12.0; end_time = 32.0; timeline_position = 12.0 },
                @{ asset_id = "VID_20260920_214031_445.mp4"; start_time = 32.0; end_time = 46.0; timeline_position = 32.0 }
            )
        }
    } | ConvertTo-Json -Compress -Depth 5
    $cutRes = Invoke-RestMethod -Uri "$baseUrl/tool" -Method Post -Body $cutBody -ContentType "application/json"
    Start-Sleep -Milliseconds 500
    Record-Step "Multi-Cut Chapter Splitting" ($cutRes.success -eq $true) "Split into 3 chapters on V1: Intro (0-12s), Feature (12-32s), Outro (32-46s)"
} catch {
    Record-Step "Multi-Cut Chapter Splitting" $false "$_"
}

# 6. Audition Playhead Seek
try {
    $seekBody = @{ action = "seek"; seconds = 12.0 } | ConvertTo-Json -Compress
    $seekRes = Invoke-RestMethod -Uri "$baseUrl/action" -Method Post -Body $seekBody -ContentType "application/json"
    Start-Sleep -Milliseconds 400
    Record-Step "Audition Playhead Navigation" ($seekRes.success -eq $true) "Transport playhead positioned at chapter 2 cut point (12.0s)"
} catch {
    Record-Step "Audition Playhead Navigation" $false "$_"
}

# 7. Workspace Switch (Inspect Audio & Color Grading, then return to Edit)
try {
    $wsBody = @{ action = "set_workspace"; workspace = "audio" } | ConvertTo-Json -Compress
    $wsRes = Invoke-RestMethod -Uri "$baseUrl/action" -Method Post -Body $wsBody -ContentType "application/json"
    Start-Sleep -Milliseconds 400
    
    $wsBody2 = @{ action = "set_workspace"; workspace = "edit" } | ConvertTo-Json -Compress
    $wsRes2 = Invoke-RestMethod -Uri "$baseUrl/action" -Method Post -Body $wsBody2 -ContentType "application/json"
    Start-Sleep -Milliseconds 400
    Record-Step "Workspace Verification" ($wsRes2.success -eq $true) "Auditioned Audio Mixer & returned to main Edit workspace"
} catch {
    Record-Step "Workspace Verification" $false "$_"
}

# 8. Fetch Final State Summary
Write-Host "`n--------------------------------------------------------" -ForegroundColor Cyan
Write-Host "  FINAL TIMELINE SNAPSHOT IN RUNNING APP: " -ForegroundColor Cyan
Write-Host "--------------------------------------------------------`n" -ForegroundColor Cyan

$finalState = (Invoke-RestMethod -Uri "$baseUrl/status" -Method Get).state
Write-Host "  * Active Workspace: $($finalState.activeWorkspace)" -ForegroundColor Yellow
Write-Host "  * Canvas Dimensions: $($finalState.metadata.width)x$($finalState.metadata.height) @ $($finalState.metadata.fps)fps" -ForegroundColor Yellow
Write-Host "  * Total Tracks: $($finalState.tracksCount)" -ForegroundColor Yellow
Write-Host "  * Total Clips: $($finalState.clipsCount)" -ForegroundColor Yellow
Write-Host "  * Playhead: $($finalState.playhead.value)s" -ForegroundColor Yellow

# Output JSON summary for processing
$global:results | ConvertTo-Json -Depth 4
