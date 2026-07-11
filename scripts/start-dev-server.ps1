[CmdletBinding()]
param(
  [switch]$Clean,
  [switch]$CheckOnly,
  [switch]$NoPause
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$DevHost = "127.0.0.1"
$DevPort = 4321
$ProjectPorts = @($DevPort)
$ScriptName = "dev"
if ($Clean) {
  $ScriptName = "dev:clean"
}

try {
  $Host.UI.RawUI.WindowTitle = "WZVico Blog Dev Server"
} catch {
  # Some hosts do not expose a writable console title.
}

function Write-Section {
  param([string]$Title)

  Write-Host ""
  Write-Host "== $Title ==" -ForegroundColor Cyan
}

function Normalize-ForMatch {
  param([AllowNull()][string]$Text)

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  return $Text.Replace("/", "\").ToLowerInvariant()
}

function Get-ProcessIndex {
  $processIndex = @{}

  try {
    Get-CimInstance Win32_Process | ForEach-Object {
      $processIndex[[int]$_.ProcessId] = $_
    }
  } catch {
    Write-Warning "Could not read full process command lines. Project matching will fall back to configured ports. Reason: $($_.Exception.Message)"
  }

  return $processIndex
}

function Get-ProcessLabel {
  param(
    [int]$ProcessId,
    [hashtable]$ProcessIndex
  )

  if ($ProcessIndex.ContainsKey($ProcessId) -and $ProcessIndex[$ProcessId].Name) {
    return $ProcessIndex[$ProcessId].Name
  }

  $process = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
  if ($process) {
    return $process.ProcessName
  }

  return "unknown"
}

function Get-ProcessCommandLine {
  param(
    [int]$ProcessId,
    [hashtable]$ProcessIndex
  )

  if ($ProcessIndex.ContainsKey($ProcessId) -and $ProcessIndex[$ProcessId].CommandLine) {
    return $ProcessIndex[$ProcessId].CommandLine
  }

  return ""
}

function Test-ProjectProcess {
  param(
    [int]$ProcessId,
    [hashtable]$ProcessIndex,
    [string]$Root
  )

  if ($ProcessIndex.Count -eq 0) {
    return $false
  }

  $rootText = Normalize-ForMatch $Root
  $nodeModulesText = Normalize-ForMatch (Join-Path $Root "node_modules")
  $currentProcessId = $ProcessId

  for ($depth = 0; $depth -lt 8 -and $currentProcessId -gt 0; $depth++) {
    if (-not $ProcessIndex.ContainsKey($currentProcessId)) {
      return $false
    }

    $process = $ProcessIndex[$currentProcessId]
    $processText = Normalize-ForMatch (($process.CommandLine, $process.ExecutablePath, $process.Name) -join " ")

    if ($processText.Contains($rootText) -or $processText.Contains($nodeModulesText)) {
      return $true
    }

    $currentProcessId = [int]$process.ParentProcessId
  }

  return $false
}

function Shorten-Text {
  param(
    [AllowNull()][string]$Text,
    [int]$MaxLength = 120
  )

  if ([string]::IsNullOrWhiteSpace($Text)) {
    return ""
  }

  $singleLine = ($Text -replace "\s+", " ").Trim()
  if ($singleLine.Length -le $MaxLength) {
    return $singleLine
  }

  return $singleLine.Substring(0, $MaxLength - 3) + "..."
}

function Get-ConfiguredProjectPorts {
  param(
    [string]$Root,
    [int]$DefaultPort
  )

  $ports = @($DefaultPort)
  $packageJsonPath = Join-Path $Root "package.json"

  if (-not (Test-Path $packageJsonPath)) {
    return @($ports | Sort-Object -Unique)
  }

  try {
    $packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
    if ($packageJson.scripts) {
      foreach ($script in $packageJson.scripts.PSObject.Properties) {
        $scriptText = [string]$script.Value

        foreach ($match in [regex]::Matches($scriptText, "--port\s+(\d{2,5})")) {
          $ports += [int]$match.Groups[1].Value
        }

        foreach ($match in [regex]::Matches($scriptText, "(?:localhost|127\.0\.0\.1|\[::1\]):(\d{2,5})")) {
          $ports += [int]$match.Groups[1].Value
        }
      }
    }
  } catch {
    Write-Warning "Could not inspect package.json for configured ports. Reason: $($_.Exception.Message)"
  }

  return @($ports | Sort-Object -Unique)
}

function Get-ProjectListeners {
  param(
    [string]$Root,
    [int[]]$KnownProjectPorts
  )

  $processIndex = Get-ProcessIndex
  $listeners = @()
  $netstatLines = & netstat -ano -p TCP

  foreach ($line in $netstatLines) {
    $parts = $line.Trim() -split "\s+"
    if ($parts.Count -lt 5 -or $parts[0] -ne "TCP" -or $parts[3] -ne "LISTENING") {
      continue
    }

    $localAddress = $parts[1]
    $portMatch = [regex]::Match($localAddress, ":(\d+)$")
    if (-not $portMatch.Success) {
      continue
    }

    $port = [int]$portMatch.Groups[1].Value
    $processId = [int]$parts[4]
    $isProjectProcess = Test-ProjectProcess -ProcessId $processId -ProcessIndex $processIndex -Root $Root
    $isKnownProjectPort = $KnownProjectPorts -contains $port

    if (-not $isProjectProcess -and -not $isKnownProjectPort) {
      continue
    }

    $scope = "project"
    if (-not $isProjectProcess -and $port -eq $DevPort) {
      $scope = "dev-port"
    } elseif (-not $isProjectProcess) {
      $scope = "configured-port"
    }

    $listeners += [pscustomobject]@{
      Port = $port
      Address = $localAddress
      PID = $processId
      Process = Get-ProcessLabel -ProcessId $processId -ProcessIndex $processIndex
      Scope = $scope
      Command = Shorten-Text (Get-ProcessCommandLine -ProcessId $processId -ProcessIndex $processIndex)
    }
  }

  return @($listeners | Sort-Object Port, PID, Address)
}

function Show-ProjectPorts {
  param([string]$Title)

  Write-Section $Title
  $rows = @(Get-ProjectListeners -Root $ProjectRoot -KnownProjectPorts $ProjectPorts)

  if ($rows.Count -eq 0) {
    Write-Host "No project-related or configured listening ports found. Configured ports: $($ProjectPorts -join ', ')." -ForegroundColor Green
    return @()
  }

  $rows |
    Select-Object Port, Address, PID, Process, Scope |
    Format-Table -AutoSize |
    Out-Host

  $commandRows = @($rows | Where-Object { $_.Command })
  if ($commandRows.Count -gt 0) {
    Write-Host "Process commands:"
    foreach ($row in $commandRows) {
      Write-Host ("  PID {0}: {1}" -f $row.PID, $row.Command)
    }
  }

  return @($rows)
}

function Wait-BeforeExit {
  if (-not $NoPause) {
    Write-Host ""
    Read-Host "Press Enter to close this window" | Out-Null
  }
}

Set-Location $ProjectRoot
$ProjectPorts = @(Get-ConfiguredProjectPorts -Root $ProjectRoot -DefaultPort $DevPort)

Write-Section "WZVico Blog Dev Server"
Write-Host "Project root: $ProjectRoot"
Write-Host "Command: npm run $ScriptName"
Write-Host "URL: http://${DevHost}:$DevPort/"
Write-Host "Configured ports: $($ProjectPorts -join ', ')"

if (-not (Test-Path (Join-Path $ProjectRoot "node_modules"))) {
  Write-Warning "node_modules was not found. If startup fails, run npm install in the project root first."
}

$npmCommand = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
if (-not $npmCommand) {
  $npmCommand = Get-Command "npm" -ErrorAction SilentlyContinue
}

if (-not $npmCommand) {
  Write-Error "npm was not found. Install Node.js 22.12+ or make sure npm is available in PATH."
}

$startupRows = @(Show-ProjectPorts "Port Check Before Startup")
$targetRows = @($startupRows | Where-Object { $_.Port -eq $DevPort })
$projectTargetRows = @($targetRows | Where-Object { $_.Scope -eq "project" })

if ($CheckOnly) {
  Wait-BeforeExit
  exit 0
}

if ($projectTargetRows.Count -gt 0) {
  Write-Warning "This project already appears to be running on port $DevPort. A second dev server was not started."
  Write-Host "Open: http://${DevHost}:$DevPort/"
  Wait-BeforeExit
  exit 0
}

if ($targetRows.Count -gt 0) {
  Write-Warning "Port $DevPort is already occupied. Startup was stopped to avoid a hidden conflict."
  Write-Host "Check the PID above, stop that service if appropriate, then double-click Start-DevServer.cmd again."
  Wait-BeforeExit
  exit 1
}

Write-Section "Starting"
Write-Host "Press Ctrl+C to stop the dev server. Port state will be shown again after it exits."

$exitCode = 0
try {
  & $npmCommand.Source run $ScriptName
  if ($null -ne $LASTEXITCODE) {
    $exitCode = $LASTEXITCODE
  }
} finally {
  Show-ProjectPorts "Port State After Dev Server Exit" | Out-Null
  Wait-BeforeExit
}

exit $exitCode
