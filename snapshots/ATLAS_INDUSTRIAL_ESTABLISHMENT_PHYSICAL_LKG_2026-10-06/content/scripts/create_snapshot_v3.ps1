$ErrorActionPreference = "Stop"
$snapshotDir = "YOUAPP_IP_SNAPSHOT_V3"
$zipName = "YOUAPP_IP_SNAPSHOT_V3.zip"

Write-Host "===================================================="
Write-Host "CREANDO SNAPSHOT INMUTABLE: $snapshotDir"
Write-Host "===================================================="

if (Test-Path $snapshotDir) {
    Remove-Item -Recurse -Force $snapshotDir
}
if (Test-Path $zipName) {
    Remove-Item -Force $zipName
}

New-Item -ItemType Directory -Path "$snapshotDir/SOURCE" | Out-Null
New-Item -ItemType Directory -Path "$snapshotDir/DATABASE" | Out-Null
New-Item -ItemType Directory -Path "$snapshotDir/MIGRATIONS" | Out-Null
New-Item -ItemType Directory -Path "$snapshotDir/DOCS" | Out-Null
New-Item -ItemType Directory -Path "$snapshotDir/TESTS" | Out-Null
New-Item -ItemType Directory -Path "$snapshotDir/GIT_HISTORY" | Out-Null

Copy-Item -Recurse -Force "src" "$snapshotDir/SOURCE/"
Copy-Item -Recurse -Force "public" "$snapshotDir/SOURCE/"
Get-ChildItem -Path "." | Where-Object { 
    !$_.PSIsContainer -and ($_.Name -match '\.(json|ts|html|css|config\..*|env\..*)$') -and ($_.Name -notmatch 'package-lock') 
} | ForEach-Object {
    Copy-Item $_.FullName "$snapshotDir/SOURCE/"
}
Copy-Item "package.json" "$snapshotDir/SOURCE/"

if (Test-Path "supabase/migrations") {
    Copy-Item -Recurse -Force "supabase/migrations/*" "$snapshotDir/MIGRATIONS/"
}
if (Test-Path "supabase") {
    Copy-Item -Recurse -Force "supabase" "$snapshotDir/DATABASE/"
}

Get-ChildItem -Path "." -Filter "*.md" | ForEach-Object {
    Copy-Item $_.FullName "$snapshotDir/DOCS/"
}
Get-ChildItem -Path "." -Filter "*.txt" | ForEach-Object {
    Copy-Item $_.FullName "$snapshotDir/DOCS/"
}

if (Test-Path "src/test") {
    Copy-Item -Recurse -Force "src/test/*" "$snapshotDir/TESTS/"
}
Get-ChildItem -Path "scripts" -Filter "*test*" | ForEach-Object {
    Copy-Item $_.FullName "$snapshotDir/TESTS/"
}

git log --all --decorate --oneline -n 50 > "$snapshotDir/GIT_HISTORY/git-log.txt"
git status > "$snapshotDir/GIT_HISTORY/git-status.txt"
git rev-parse HEAD > "$snapshotDir/GIT_HISTORY/git-commit-hash.txt"
git tag --list > "$snapshotDir/GIT_HISTORY/git-tags.txt"

Copy-Item "SNAPSHOT_HISTORY.md" "$snapshotDir/SNAPSHOT_HISTORY.md"

Write-Host "Comprimiendo archivo ZIP..."
Compress-Archive -Path "$snapshotDir\*" -DestinationPath $zipName -CompressionLevel Optimal -Force

$hashObj = Get-FileHash -Path $zipName -Algorithm SHA256
$sha256 = $hashObj.Hash
$sha256 | Out-File -FilePath "$snapshotDir/SHA256.txt" -Encoding ascii
$sha256 | Out-File -FilePath "SHA256_V3.txt" -Encoding ascii

Write-Host "SNAPSHOT CREADO CON EXITO:"
Write-Host "   Archivo: $zipName"
Write-Host "   SHA-256: $sha256"

$desktop = [Environment]::GetFolderPath('Desktop')
$desktopFolder = Join-Path $desktop "YOUAPP_IP_SNAPSHOT_V3"
if (!(Test-Path $desktopFolder)) { New-Item -ItemType Directory -Path $desktopFolder -Force | Out-Null }

Copy-Item -Recurse -Force "$snapshotDir\*" $desktopFolder
Copy-Item -Force $zipName $desktopFolder
Copy-Item -Force $zipName $desktop
Copy-Item -Force "SHA256_V3.txt" $desktopFolder
Write-Host "   [1] Guardado en Escritorio ($desktopFolder)"

$oneDrive = [Environment]::GetEnvironmentVariable('OneDrive')
if ($oneDrive -and (Test-Path $oneDrive)) {
    Copy-Item -Force $zipName $oneDrive
    Write-Host "   [2] Guardado en OneDrive ($oneDrive)"
}

Write-Host "   [3] Guardado en PC de desarrollo (Raiz del proyecto)"
Write-Host "===================================================="
