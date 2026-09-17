$ErrorActionPreference = 'Stop'
$workDir = 'C:/Users/Happy/OneDrive/Desktop/trading-platform.clg/.freebuff/worktrees/870dad5f-5512-4300-b091-3c2c3e653fd3'
$log = 'C:/Users/Happy/OneDrive/Desktop/trading-platform.clg/.freebuff/preview-870dad5f-5512-4300-b091-3c2c3e653fd3.log'
$logErr = 'C:/Users/Happy/OneDrive/Desktop/trading-platform.clg/.freebuff/preview-870dad5f-5512-4300-b091-3c2c3e653fd3.log.err'
$p = Start-Process -FilePath 'node' -ArgumentList 'server-v2.js' -WorkingDirectory $workDir -RedirectStandardOutput $log -RedirectStandardError $logErr -WindowStyle Hidden -PassThru
Write-Output $p.Id
