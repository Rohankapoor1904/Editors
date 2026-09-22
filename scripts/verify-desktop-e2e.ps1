# Desktop End-to-End Verification Script for CineCraft AI (Task R23.5)
# Launches native desktop app, discovers sidecar port+token, connects via HTTP with Bearer token,
# executes prompts/tools, and asserts timeline state mutations on the live Tauri host.

$ErrorActionPreference = "Stop"
$appPath = "$PSScriptRoot\..\src-tauri\target\debug\cinecraft-ai-desktop.exe"
$discoveryFiles = @(
    "$PSScriptRoot\..\src-tauri\target\bridge_info.json",
    "$env:TEMP\cinecraft_bridge_info.json",
    "$PSScriptRoot\..\target\bridge_info.json"
)

# 1. Clean previous discovery files & kill old instances
foreach ($file in $discoveryFiles) {
    if (Test-Path $file) { Remove-Item -Force $file }
}
Get-Process -Name "cinecraft-ai-desktop" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  CINECRAFT AI - DESKTOP END-TO-END VERIFICATION (R23.5) " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

# 2. Launch the application
Write-Host "[1/6] Launching native desktop application..." -ForegroundColor Yellow
$proc = Start-Process -FilePath $appPath -PassThru
if (-not $proc -or $proc.HasExited) {
    throw "Failed to start desktop application at $appPath"
}
Write-Host "      -> Process PID: $($proc.Id)" -ForegroundColor Gray

# 3. Wait for discovery file
Write-Host "[2/6] Waiting for native sidecar to bind and write bridge_info.json..." -ForegroundColor Yellow
$info = $null
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt 20) {
    foreach ($file in $discoveryFiles) {
        if (Test-Path $file) {
            try {
                $raw = Get-Content -Raw $file -ErrorAction SilentlyContinue
                if ($raw -and $raw.Trim().Length -gt 0) {
                    $parsed = $raw | ConvertFrom-Json
                    if ($parsed.port -and $parsed.token) {
                        $info = $parsed
                        Write-Host "      -> Discovered sidecar via $file" -ForegroundColor Gray
                        break
                    }
                }
            } catch {}
        }
    }
    if ($info) { break }
    Start-Sleep -Milliseconds 500
}

if (-not $info) {
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
    throw "Sidecar discovery timed out after 20 seconds. Bridge info was not generated."
}

$port = $info.port
$token = $info.token
$baseUrl = "http://127.0.0.1:$port/api/agent"
$headers = @{
    "Authorization" = "Bearer $token"
    "Accept"        = "application/json"
    "Content-Type"  = "application/json"
}

Write-Host "      -> Native Sidecar Base URL: $baseUrl" -ForegroundColor Green
Write-Host "      -> Token: $($token.Substring(0, 8))..." -ForegroundColor Green

try {
    # 4. Probe status
    Write-Host "`n[3/6] Probing /status on native sidecar..." -ForegroundColor Yellow
    $status = Invoke-RestMethod -Uri "$baseUrl/status" -Method Get
    Write-Host "      -> Bridge: $($status.bridge), AuthRequired: $($status.authRequired)" -ForegroundColor Gray
    if ($status.bridge -ne "native-sidecar") {
        throw "Unexpected bridge type: $($status.bridge)"
    }

    # Wait briefly for WebView2 frontend to boot and send its initial heartbeat
    Write-Host "      -> Waiting for frontend to connect via heartbeat..." -ForegroundColor Gray
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $connected = $false
    while ($sw.Elapsed.TotalSeconds -lt 25) {
        $status = Invoke-RestMethod -Uri "$baseUrl/status" -Method Get
        if ($status.connected -eq $true) {
            $connected = $true
            Write-Host "      -> Frontend connected successfully! Last heartbeat: $($status.lastHeartbeatMsAgo)ms ago" -ForegroundColor Green
            break
        }
        Start-Sleep -Milliseconds 600
    }

    # 5. Connect agent
    Write-Host "`n[4/6] Connecting external agent via POST /connect..." -ForegroundColor Yellow
    $connectBody = @{ model = "Antigravity-E2E-Agent"; agent = "Desktop Verification Suite" } | ConvertTo-Json
    $connRes = Invoke-RestMethod -Uri "$baseUrl/connect" -Method Post -Headers $headers -Body $connectBody
    Write-Host "      -> Connect response: $($connRes.message)" -ForegroundColor Gray
    if ($connRes.success -ne $true) {
        throw "Agent connection failed: $($connRes | ConvertTo-Json)"
    }

    # 6. Verify Initial Timeline
    $initialTimeline = Invoke-RestMethod -Uri "$baseUrl/timeline" -Method Get
    Write-Host "      -> Initial timeline: $($initialTimeline.metadata.width)x$($initialTimeline.metadata.height) @ $($initialTimeline.metadata.fps)fps" -ForegroundColor Gray

    # 7. Execute AI Prompt and verify timeline mutation
    Write-Host "`n[5/6] Executing editorial prompt via POST /prompt..." -ForegroundColor Yellow
    $promptBody = @{ prompt = "Change sequence aspect ratio to 9:16 vertical shorts" } | ConvertTo-Json
    $promptRes = Invoke-RestMethod -Uri "$baseUrl/prompt" -Method Post -Headers $headers -Body $promptBody
    Write-Host "      -> Prompt executed: Success=$($promptRes.success), ID=$($promptRes.id)" -ForegroundColor Gray
    if ($promptRes.success -ne $true) {
        throw "Prompt execution failed: $($promptRes | ConvertTo-Json)"
    }

    # Assert timeline state mutated to 9:16
    Start-Sleep -Milliseconds 600
    $mutatedTimeline = Invoke-RestMethod -Uri "$baseUrl/timeline" -Method Get
    Write-Host "      -> Mutated timeline: $($mutatedTimeline.metadata.width)x$($mutatedTimeline.metadata.height) @ $($mutatedTimeline.metadata.fps)fps" -ForegroundColor Green
    if ($mutatedTimeline.metadata.width -ne 1080 -or $mutatedTimeline.metadata.height -ne 1920) {
        throw "Timeline dimensions did not mutate to 1080x1920! Got $($mutatedTimeline.metadata.width)x$($mutatedTimeline.metadata.height)"
    }
    Write-Host "      -> [PASS] Timeline mutated to 9:16 vertical shorts (1080x1920)!" -ForegroundColor Green

    # 8. Execute direct tool and verify mutation to 4K
    Write-Host "`n[6/6] Executing direct tool via POST /tool (Cinema 4K 3840x2160)..." -ForegroundColor Yellow
    $toolBody = @{
        tool = "sequence_set_aspect_ratio"
        args = @{ width = 3840; height = 2160 }
    } | ConvertTo-Json
    $toolRes = Invoke-RestMethod -Uri "$baseUrl/tool" -Method Post -Headers $headers -Body $toolBody
    Write-Host "      -> Tool executed: Success=$($toolRes.success), ID=$($toolRes.id)" -ForegroundColor Gray
    if ($toolRes.success -ne $true) {
        throw "Tool execution failed: $($toolRes | ConvertTo-Json)"
    }

    Start-Sleep -Milliseconds 600
    $finalTimeline = Invoke-RestMethod -Uri "$baseUrl/timeline" -Method Get
    Write-Host "      -> Final timeline: $($finalTimeline.metadata.width)x$($finalTimeline.metadata.height)" -ForegroundColor Green
    if ($finalTimeline.metadata.width -ne 3840 -or $finalTimeline.metadata.height -ne 2160) {
        throw "Timeline dimensions did not mutate to 3840x2160! Got $($finalTimeline.metadata.width)x$($finalTimeline.metadata.height)"
    }
    Write-Host "      -> [PASS] Timeline mutated to Cinema 4K (3840x2160)!" -ForegroundColor Green

    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host "  R23.5 DESKTOP END-TO-END VERIFICATION: SUCCESS!       " -ForegroundColor Green
    Write-Host "========================================================`n" -ForegroundColor Green

} finally {
    Write-Host "Stopping desktop application process..." -ForegroundColor Gray
    $proc | Stop-Process -Force -ErrorAction SilentlyContinue
    foreach ($file in $discoveryFiles) {
        if (Test-Path $file) { Remove-Item -Force $file -ErrorAction SilentlyContinue }
    }
}
