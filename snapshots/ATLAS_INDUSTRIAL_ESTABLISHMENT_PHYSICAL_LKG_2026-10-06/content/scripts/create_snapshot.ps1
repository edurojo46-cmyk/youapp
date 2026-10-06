$snapDir = "YOUAPP_IP_SNAPSHOT_V2"
$zipFile = "YOUAPP_IP_SNAPSHOT_V2.zip"

Write-Host "Creating Snapshot directory..."
if (Test-Path $snapDir) { Remove-Item -Recurse -Force $snapDir }
if (Test-Path $zipFile) { Remove-Item -Force $zipFile }

New-Item -ItemType Directory -Path "$snapDir\SOURCE" -Force | Out-Null
New-Item -ItemType Directory -Path "$snapDir\DATABASE" -Force | Out-Null
New-Item -ItemType Directory -Path "$snapDir\MIGRATIONS" -Force | Out-Null
New-Item -ItemType Directory -Path "$snapDir\DOCS" -Force | Out-Null
New-Item -ItemType Directory -Path "$snapDir\TESTS" -Force | Out-Null
New-Item -ItemType Directory -Path "$snapDir\GIT_HISTORY" -Force | Out-Null

# 1. Source (Clean code without node_modules or secrets)
Copy-Item -Recurse -Force src "$snapDir\SOURCE\src"
Copy-Item -Recurse -Force public "$snapDir\SOURCE\public"
Copy-Item package.json "$snapDir\SOURCE\"
Copy-Item package-lock.json "$snapDir\SOURCE\"
Copy-Item index.html "$snapDir\SOURCE\"
Copy-Item vite.config.ts "$snapDir\SOURCE\"
Copy-Item tsconfig*.json "$snapDir\SOURCE\"

# 2. Database & Migrations
Copy-Item supabase_schema.sql "$snapDir\DATABASE\" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force supabase\migrations "$snapDir\MIGRATIONS\" -ErrorAction SilentlyContinue

# 3. Docs
Copy-Item PROPUESTA_COMERCIAL_Y_PITCH_YOUAPP.md "$snapDir\DOCS\" -ErrorAction SilentlyContinue
Copy-Item README.md "$snapDir\DOCS\" -ErrorAction SilentlyContinue
Copy-Item SNAPSHOT_HISTORY.md "$snapDir\"
Copy-Item SNAPSHOT_HISTORY.md "$snapDir\DOCS\"

# 4. Tests
Copy-Item -Recurse -Force tests "$snapDir\TESTS\" -ErrorAction SilentlyContinue
Copy-Item test_*.ts "$snapDir\TESTS\" -ErrorAction SilentlyContinue
Copy-Item benchmarkRunner.ts "$snapDir\TESTS\" -ErrorAction SilentlyContinue

# 5. Git History Exports
git log --all --decorate --oneline > "$snapDir\GIT_HISTORY\git-log.txt"
git status > "$snapDir\GIT_HISTORY\git-status.txt"
git rev-parse HEAD > "$snapDir\GIT_HISTORY\git-commit-hash.txt"
git tag --list > "$snapDir\GIT_HISTORY\git-tags.txt"

Write-Host "Compressing to $zipFile..."
Compress-Archive -Path "$snapDir\*" -DestinationPath $zipFile -Force

Write-Host "Calculating SHA-256..."
$hash = (Get-FileHash -Path $zipFile -Algorithm SHA256).Hash
Write-Host "SHA-256: $hash"
$hash | Out-File -FilePath "SHA256.txt" -Encoding utf8
$hash | Out-File -FilePath "$snapDir\SHA256.txt" -Encoding utf8

Write-Host "Done!"
