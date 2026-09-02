$PSScriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Definition
python "$PSScriptRoot\run.py" @args
