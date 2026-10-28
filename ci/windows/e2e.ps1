# End-to-end check of type-keys.ps1: type into another process's console and read back what it received.
$ErrorActionPreference = 'Stop'
$out = Join-Path $env:RUNNER_TEMP 'typed.json'
Remove-Item $out -ErrorAction SilentlyContinue
$reader = Start-Process node -ArgumentList @("$PSScriptRoot\reader.js", $out) -PassThru
Start-Sleep -Seconds 3
$steps = '[[0.3,"\u0003"],[0.3,"/compact hi"],[0.5,"\r"],[0.5,"\r"]]'
$b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($steps))
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\..\..\hooks\type-keys.ps1" -Steps $b64 -Pids "$($reader.Id)"
if ($LASTEXITCODE -ne 0) { throw "type-keys.ps1 exited $LASTEXITCODE (could not attach to the console)" }
$reader.WaitForExit(20000) | Out-Null
$got = Get-Content $out -Raw | ConvertFrom-Json
Write-Host "received: $([Text.RegularExpressions.Regex]::Escape($got))"
if ($got -ne "$([char]3)/compact hi`r`r") { throw "unexpected input: $got" }
Write-Host 'ok'
