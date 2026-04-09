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
    Write-Host "--- Configuring paths in $($pthFile.Name)..."
    $content = Get-Content $pthFile.FullName
    
    # Ensure Lib/site-packages and import site are present
    $newLines = @()
    foreach ($line in $content) {
        if ($line -notmatch "import site" -and $line -notmatch "Lib/site-packages") {
            $newLines += $line
        }
    }
    $newLines += "Lib/site-packages"
    $newLines += "import site"
    
    $newLines | Set-Content $pthFile.FullName -Force
}

# 3. Install PIP
$pythonExe = Join-Path $installPath "python.exe"
$hasPip = $false
try {
    & $pythonExe -m pip --version | Out-Null
    $hasPip = $true
} catch {
    $hasPip = $false
}

if (-not $hasPip) {
    Write-Host "--- Installing PIP..."
    $pipScript = Join-Path $installPath "get-pip.py"
    Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $pipScript
    & $pythonExe $pipScript | Out-Host
    Remove-Item $pipScript
} else {
    Write-Host "--- PIP already installed."
}

# 4. Install Dependencies with CUDA
Write-Host "--- Installing build requirements (cmake, scikit-build-core)..."
& $pythonExe -m pip install cmake scikit-build-core setuptools wheel

Write-Host "--- Installing backend dependencies (FastAPI, llama-cpp-python with CUDA)..."
$env:CMAKE_ARGS = "-DGGML_CUDA=on"
& $pythonExe -m pip install -r $requirementsFile --no-cache-dir

# 5. Model Weights
Write-Host "--- Downloading Model Weights (Gemma 4 MoE / Gemma 2 9B)..."
$modelDir = Join-Path $installPath "models"
if (-not (Test-Path $modelDir)) { New-Item -ItemType Directory -Path $modelDir -Force }

Write-Host "--- Running model downloader (Gemma 4 26B A4B-it)..."
& $pythonExe "scripts\download_weights.py"

# 6. Verification
Write-Host "--- Verifying CUDA support and model presence..."
$pythonVerification = @"
import sys
import os
try:
    import llama_cpp
    from llama_cpp.llama_chat_format import LlamaMLProjector
    print(f'Python version: {sys.version}')
    print('SUCCESS: llama-cpp-python loaded.')
    model_path = os.path.join(r'$modelDir', 'gemma-4-moe.gguf')
    mmproj_path = os.path.join(r'$modelDir', 'mmproj-gemma-4.gguf')
    if os.path.exists(model_path):
         print(f'SUCCESS: Model found at {model_path}')
    else:
         print(f'FAILURE: Model weight missing at {model_path}')
         sys.exit(1)
    if os.path.exists(mmproj_path):
         print(f'SUCCESS: Vision projector found at {mmproj_path}')
    else:
         print(f'WARNING: Vision projector missing at {mmproj_path}')
except Exception as e:
    print(f'FAILURE: {e}')
    sys.exit(1)
"@
& $pythonExe -c $pythonVerification

Write-Host ">>> Setup Complete!"
