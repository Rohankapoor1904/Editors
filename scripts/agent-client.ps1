param(
    [string]$Prompt = "",
    [string]$Action = "",
    [string]$Workspace = "",
    [double]$Seconds = -1,
    [string]$Tool = "",
    [string]$ArgsJson = "{}"
)

$baseUrl = "http://localhost:3000/api/agent"

if ($Prompt) {
    $payload = @{ prompt = $Prompt } | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri "$baseUrl/prompt" -Method Post -Body $payload -ContentType "application/json"
    return $response
}

if ($Action) {
    $dict = @{ action = $Action }
    if ($Workspace) { $dict["workspace"] = $Workspace }
    if ($Seconds -ge 0) { $dict["seconds"] = $Seconds }
    $payload = $dict | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri "$baseUrl/action" -Method Post -Body $payload -ContentType "application/json"
    return $response
}

if ($Tool) {
    $argsObj = ConvertFrom-Json $ArgsJson
    $payload = @{ tool = $Tool; args = $argsObj } | ConvertTo-Json -Compress
    $response = Invoke-RestMethod -Uri "$baseUrl/tool" -Method Post -Body $payload -ContentType "application/json"
    return $response
}

# Default: get status
$status = Invoke-RestMethod -Uri "$baseUrl/status"
return $status
