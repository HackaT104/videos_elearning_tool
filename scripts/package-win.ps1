# Dựng bộ cài Windows (Course-Video-Studio-Setup-<phiên bản>.exe + latest.json) vào thư mục dist\.
# Chạy trên Windows: pnpm run package:win   (cần Inno Setup 6: choco install innosetup -y, hoặc tải tại https://jrsoftware.org)
# CI (.github/workflows/release.yml) gọi cùng script này.
param(
  [switch]$SkipInstall,
  [string]$Notes = ""
)
$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Node.js portable đi kèm bộ cài – ghim phiên bản + SHA-256 (https://nodejs.org/dist/v<ver>/SHASUMS256.txt)
$NodeVersion = "22.23.3"
$NodeSha256 = "2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71"

$Root = Split-Path -Parent $PSScriptRoot
Set-Location $Root
$Version = (Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json).version
$VersionNum = $Version -replace '[-+].*$', ''
$Repo = if ($env:CVS_UPDATE_REPO) { $env:CVS_UPDATE_REPO } else { "HackaT104/videos_elearning_tool" }
$Build = Join-Path $Root "packaging\windows\build"
$Payload = Join-Path $Build "payload"
$Dist = Join-Path $Root "dist"
function Step($s) { Write-Host "`n== $s" -ForegroundColor Cyan }
function Check($what) { if ($LASTEXITCODE -ne 0) { throw "$what lỗi (mã $LASTEXITCODE)" } }

Step "Phiên bản $Version"
if (-not $SkipInstall) {
  Step "Cài thư viện (pnpm install --frozen-lockfile)"
  $env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = "1"
  pnpm install --frozen-lockfile; Check "pnpm install"
}
Step "Dựng giao diện"
pnpm --filter @cvs/web build; Check "Dựng giao diện"

Step "Gom payload"
if (Test-Path $Build) { Remove-Item -Recurse -Force $Build }
node packaging/windows/stage.mjs --out (Join-Path $Payload "app"); Check "stage.mjs"

Step "Node.js $NodeVersion portable"
$Zip = Join-Path $Build "node.zip"
Invoke-WebRequest "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip" -OutFile $Zip -UseBasicParsing
$Hash = (Get-FileHash $Zip -Algorithm SHA256).Hash.ToLower()
if ($Hash -ne $NodeSha256) { throw "SHA-256 của Node.js không khớp: $Hash" }
Expand-Archive $Zip -DestinationPath $Build -Force
Move-Item (Join-Path $Build "node-v$NodeVersion-win-x64") (Join-Path $Payload "node")

Step "Inno Setup"
$Iscc = @(
  "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe",
  "$env:ProgramFiles\Inno Setup 6\ISCC.exe",
  "$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe"
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $Iscc) { $Iscc = (Get-Command iscc.exe -ErrorAction SilentlyContinue).Source }
if (-not $Iscc) { throw "Chưa có Inno Setup 6 (choco install innosetup -y, hoặc https://jrsoftware.org/isdl.php)" }
New-Item -ItemType Directory -Force $Dist | Out-Null
& $Iscc "/DAppVersion=$Version" "/DAppVersionNum=$VersionNum" "/DPayload=$Payload" "/O$Dist" (Join-Path $Root "packaging\windows\CourseVideoStudio.iss"); Check "ISCC"

$Name = "Course-Video-Studio-Setup-$Version.exe"
$Setup = Join-Path $Dist $Name
$Sha = (Get-FileHash $Setup -Algorithm SHA256).Hash.ToLower()
$Latest = [ordered]@{ version = $Version; url = "https://github.com/$Repo/releases/download/v$Version/$Name"; sha256 = $Sha; notes = $Notes } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $Dist "latest.json"), $Latest, (New-Object System.Text.UTF8Encoding $false))
Step "Xong: $Setup ($([math]::Round((Get-Item $Setup).Length / 1MB)) MB, SHA-256 $Sha) + dist\latest.json"
