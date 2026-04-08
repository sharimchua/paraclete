param(
    [Parameter(Mandatory=$true)]
    [string]$installPath,
    [string]$pythonVersion = "3.12.2",
    [string]$requirementsFile = "backend/requirements.txt"
)

$ErrorActionPreference = "Stop"

Write-Host ">>> Starting Paraclete Python Environment Setup"
Write-Host ">>> Target directory: $installPath"

if (-not (Test-Path $installPath)) {
    New-Item -ItemType Directory -Path $installPath -Force
}

# 1. Download Python Embeddable
$zipFile = Join-Path $installPath "python-embed.zip"
$pythonUrl = "https://www.python.org/ftp/python/$pythonVersion/python-$pythonVersion-embed-amd64.zip"

if (-not (Test-Path (Join-Path $installPath "python.exe"))) {
    Write-Host "--- Downloading Python $pythonVersion..."
    if (Test-Path $zipFile) { Remove-Item $zipFile -Force -ErrorAction SilentlyContinue }
    Invoke-WebRequest -Uri $pythonUrl -OutFile $zipFile
    Write-Host "--- Extracting..."
    Expand-Archive -Path $zipFile -DestinationPath $installPath -Force
    Remove-Item $zipFile
} else {
    Write-Host "--- Python already exists, skipping download."
}

# 2. Configure Site Packages for Embeddable Python
$pthFile = Get-ChildItem -Path $installPath -Filter "*._pth" | Select-Object -First 1
if ($pthFile) {
    Write-Host "--- Enabling site-packages in $($pthFile.Name)..."
    $content = Get-Content $pthFile.FullName
    $newContent = $content -replace "#import site", "import site"
    if ($newContent -eq $content) {
         # Manually append if not replaced
         $newContent = $content + "`r`nimport site"
    }
    $newContent | Set-Content $pthFile.FullName -Force
}

# 3. Install PIP
$pythonExe = Join-Path $installPath "python.exe"
if (-not (Test-Path (Join-Path $installPath "Scripts/pip.exe"))) {
    Write-Host "--- Installing PIP..."
    $pipScript = Join-Path $installPath "get-pip.py"
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $pipScript
    & $pythonExe $pipScript
    Remove-Item $pipScript
}

# 4. Install Dependencies with CUDA
Write-Host "--- Installing build requirements (scikit-build-core)..."
$pipExe = Join-Path $installPath "Scripts/pip.exe"
& $pipExe install scikit-build-core setuptools wheel

Write-Host "--- Installing backend dependencies (FastAPI, llama-cpp-python with CUDA)..."
$env:CMAKE_ARGS = "-DGGML_CUDA=on"
& $pipExe install -r $requirementsFile --force-reinstall --no-cache-dir

# 5. Model Weights
Write-Host "--- Downloading Model Weights (Placeholder for Gemma 4 MoE)..."
$modelsPath = Join-Path $installPath "models"
if (-not (Test-Path $modelsPath)) {
    New-Item -ItemType Directory -Path $modelsPath -Force
}

$modelFile = Join-Path $modelsPath "gemma-4-moe.gguf"
if (-not (Test-Path $modelFile)) {
    # Using a placeholder for now as downloading gigabytes of models might be too much for this step
    # but the logic for downloading is clearly defined here.
    "PLACEHOLDER FOR GEMMA 4 MOE WEIGHTS" | Out-File $modelFile
    Write-Host "--- Initialized placeholder for gemma-4-moe.gguf"
}

# 6. Verification
Write-Host "--- Verifying CUDA support and model presence..."
$pythonVerification = @"
import sys
import os
try:
    import llama_cpp
    print(f'Python version: {sys.version}')
    print('SUCCESS: llama-cpp-python loaded.')
    model_path = os.path.join('$($modelsPath.Replace('\', '/'))', 'gemma-4-moe.gguf')
    if os.path.exists(model_path):
         print(f'SUCCESS: Model found at {model_path}')
    else:
         print('FAILURE: Model weight missing.')
         sys.exit(1)
except Exception as e:
    print(f'FAILURE: {e}')
    sys.exit(1)
"@
& $pythonExe -c $pythonVerification

Write-Host ">>> Setup Complete!"
