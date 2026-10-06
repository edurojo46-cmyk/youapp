$sourceZip = "c:\Users\Eduardo\YOUAPP\YOUAPP_IP_SNAPSHOT_V2.zip"
$sourceDir = "c:\Users\Eduardo\YOUAPP\YOUAPP_IP_SNAPSHOT_V2"

Write-Host "Verificando archivo fuente..."
if (!(Test-Path $sourceZip)) {
    Write-Host "ERROR: No se encuentra $sourceZip"
    exit 1
}

Write-Host "Fuente encontrada: $sourceZip (" + (Get-Item $sourceZip).Length + " bytes)"

# 1. Copia en Escritorio directo y en la carpeta YOUAPP_IP_SNAPSHOT_V22
$desktop = [Environment]::GetFolderPath("Desktop")
Write-Host "Copiando a Escritorio: $desktop"
Copy-Item -Force $sourceZip $desktop
Copy-Item -Force "c:\Users\Eduardo\YOUAPP\SHA256.txt" $desktop

$folderV22 = Join-Path $desktop "YOUAPP_IP_SNAPSHOT_V22"
if (!(Test-Path $folderV22)) { New-Item -ItemType Directory -Path $folderV22 -Force | Out-Null }
Copy-Item -Force $sourceZip $folderV22
Copy-Item -Recurse -Force "$sourceDir\*" $folderV22
Copy-Item -Force "c:\Users\Eduardo\YOUAPP\SHA256.txt" $folderV22

# 2. Copia en OneDrive (si existe)
$userProfile = $env:USERPROFILE
$oneDrive = Join-Path $userProfile "OneDrive"
if (Test-Path $oneDrive) {
    Write-Host "Copiando a OneDrive: $oneDrive"
    Copy-Item -Force $sourceZip $oneDrive
    Copy-Item -Force "c:\Users\Eduardo\YOUAPP\SHA256.txt" $oneDrive
}

# 3. Detectar pendrives o discos externos (D:, E:, F:, G:)
$drives = Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Name -notin @('C', 'Temp') }
foreach ($d in $drives) {
    $driveRoot = $d.Root
    Write-Host "Unidad externa detectada: $driveRoot"
    try {
        Copy-Item -Force $sourceZip $driveRoot
        Copy-Item -Force "c:\Users\Eduardo\YOUAPP\SHA256.txt" $driveRoot
        Write-Host "¡Copiado con éxito a $driveRoot!"
    } catch {
        Write-Host "No se pudo escribir en $driveRoot"
    }
}

Write-Host "=== ARCHIVOS DISPONIBLES Y RUTAS EXACTAS ==="
Write-Host "1. En tu Escritorio:" (Join-Path $desktop "YOUAPP_IP_SNAPSHOT_V2.zip")
Write-Host "2. En tu carpeta de Escritorio:" (Join-Path $folderV22 "YOUAPP_IP_SNAPSHOT_V2.zip")
Write-Host "3. En el proyecto:" $sourceZip
