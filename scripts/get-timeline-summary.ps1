$timeline = (Invoke-RestMethod -Uri 'http://localhost:3000/api/agent/timeline')
Write-Host "`n========================================================" -ForegroundColor Cyan
Write-Host "  CURRENT TIMELINE STATUS IN LIVE DESKTOP APP " -ForegroundColor Cyan
Write-Host "========================================================`n" -ForegroundColor Cyan

Write-Host "Project Name : $($timeline.metadata.name)"
Write-Host "Dimensions   : $($timeline.metadata.width)x$($timeline.metadata.height) @ $($timeline.metadata.fps)fps"
Write-Host "Playhead     : $($timeline.playhead.value)s"
Write-Host "Workspace    : $($timeline.activeWorkspace)"
Write-Host "`nTracks & Clips:" -ForegroundColor Yellow

foreach ($track in $timeline.timeline.tracks) {
    Write-Host "  Track: $($track.name) [$($track.id)] ($($track.type))" -ForegroundColor White
    if ($track.clips.Count -eq 0) {
        Write-Host "    (No clips)" -ForegroundColor DarkGray
    } else {
        foreach ($clip in $track.clips) {
            Write-Host "    - Clip: $($clip.name)" -ForegroundColor Green
            Write-Host "      ID: $($clip.id) | Duration: $($clip.duration.value)s | Offset: $($clip.startOffset.value)s | In: $($clip.sourceIn.value)s -> Out: $($clip.sourceOut.value)s" -ForegroundColor Gray
        }
    }
}
Write-Host ""
