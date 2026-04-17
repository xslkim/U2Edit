#Requires -Version 5.1
<#
.SYNOPSIS
  编译 LWB UI Editor（Tauri），生成 release 可执行文件与安装包。

.DESCRIPTION
  依次执行：依赖安装（可选）→ pnpm tauri build。
  产物默认位于 src-tauri\target\release\ 与 src-tauri\target\release\bundle\

.PARAMETER DebugBuild
  使用 debug 配置构建（更快，体积更大），对应 cargo debug 与 target\debug\

.PARAMETER SkipInstall
  跳过 pnpm install

.EXAMPLE
  .\scripts\build.ps1

.EXAMPLE
  .\scripts\build.ps1 -DebugBuild

.EXAMPLE
  .\scripts\build.ps1 -SkipInstall
#>
param(
    [switch]$DebugBuild,
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

if ($null -eq (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Error '未找到 pnpm。请先安装 Node.js 20+ 并启用 pnpm（见 README）。'
    exit 1
}
if ($null -eq (Get-Command cargo -ErrorAction SilentlyContinue)) {
    Write-Error '未找到 cargo。请安装 Rust stable 并确保 rustc/cargo 在 PATH 中。'
    exit 1
}

if (-not $SkipInstall) {
    Write-Host '>>> pnpm install' -ForegroundColor Cyan
    pnpm install
}

$tauriArgs = @('tauri', 'build')
if ($DebugBuild) {
    $tauriArgs += '--debug'
}

Write-Host ">>> pnpm $($tauriArgs -join ' ')" -ForegroundColor Cyan
pnpm @tauriArgs

$target = if ($DebugBuild) { 'debug' } else { 'release' }
$exeDir = Join-Path $RepoRoot "src-tauri\target\$target"
$bundleDir = Join-Path $exeDir 'bundle'

Write-Host ''
Write-Host '构建完成。' -ForegroundColor Green
Write-Host "  可执行文件目录: $exeDir"
if (Test-Path $bundleDir) {
    Write-Host "  安装包/分发目录: $bundleDir"
}
