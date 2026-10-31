# Stop every Bridge demo server started with start-all.sh.
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'tsx' -and $_.CommandLine -match 'server\.ts|preflight' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
foreach ($p in 3000, 4001, 4002, 4003) {
  "{0}: {1}" -f $p, $(if (Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue) { "still up" } else { "stopped" })
}
