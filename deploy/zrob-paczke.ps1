# Buduje paczkę do wgrania na serwer: deploy\konfigurator.tar.gz
# Bez node_modules, filmów i Twoich lokalnych danych (konta, wyceny, sesje, poczta, klucze).
$ErrorActionPreference = 'Stop'
$zrodlo = Split-Path -Parent $PSScriptRoot
$tmp = Join-Path $env:TEMP "konfigurator-paczka"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
$cel = Join-Path $tmp 'konfigurator'
New-Item -ItemType Directory -Force "$cel\data" | Out-Null

foreach ($p in 'server.js', 'package.json', 'package-lock.json', 'README.md') { Copy-Item "$zrodlo\$p" $cel }
foreach ($d in 'lib', 'public', 'scripts') { Copy-Item -Recurse "$zrodlo\$d" "$cel\$d" }
New-Item -ItemType Directory -Force "$cel\deploy" | Out-Null
foreach ($p in 'install.sh', 'wlacz-funnel.sh', 'konfigurator.service', 'konfigurator.env.przyklad', 'INSTRUKCJA.md') { Copy-Item "$zrodlo\deploy\$p" "$cel\deploy" }

# Dane wspólne (cennik, reguły, katalogi PDF) – bez danych osobowych
foreach ($p in 'produkty.json', 'reguly.json', 'katalogi.json') {
  if (Test-Path "$zrodlo\data\$p") { Copy-Item "$zrodlo\data\$p" "$cel\data" }
}
if (Test-Path "$zrodlo\data\katalogi") { Copy-Item -Recurse "$zrodlo\data\katalogi" "$cel\data\katalogi" }

# Skrypty .sh muszą mieć końce linii LF (Linux)
Get-ChildItem "$cel\deploy\*.sh" | ForEach-Object {
  $t = [IO.File]::ReadAllText($_.FullName) -replace "`r`n", "`n"
  [IO.File]::WriteAllText($_.FullName, $t, (New-Object Text.UTF8Encoding $false))
}

$wynik = Join-Path $PSScriptRoot 'konfigurator.tar.gz'
if (Test-Path $wynik) { Remove-Item -Force $wynik }
tar -czf $wynik -C $tmp konfigurator
Remove-Item -Recurse -Force $tmp
$mb = [math]::Round((Get-Item $wynik).Length / 1MB, 1)
Write-Output "Gotowe: $wynik ($mb MB)"
