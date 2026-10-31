# Stop every Bridge demo server on this laptop (platform on 3000, local company services on 4001-4003).
Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
  Where-Object { $_.CommandLine -match 'src[\\/]server\.ts' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
# Anything still listening on our ports (netstat sees listeners Get-NetTCPConnection can miss).
foreach ($p in 3000, 4001, 4002, 4003) {
  netstat -ano | Select-String ":$p\s.*LISTENING" | ForEach-Object {
    $owner = ($_.ToString().Trim() -split '\s+')[-1]
    Stop-Process -Id $owner -Force -ErrorAction SilentlyContinue
  }
}
Start-Sleep -Milliseconds 800
foreach ($p in 3000, 4001, 4002, 4003) {
  "{0}: {1}" -f $p, $(if (netstat -ano | Select-String ":$p\s.*LISTENING") { "still up" } else { "stopped" })
}
