<#
.SYNOPSIS
    DineBox 扫码点餐本地环境运维脚本（MySQL + Redis + RustFS + API + Web + Admin）。

.DESCRIPTION
    封装 scripts/docker-compose.yml 的常用操作：启动、停止、重启、重置、构建、日志、
    状态、进入 MySQL 客户端、重新执行初始化 SQL、拉取镜像。

    dev 模式：仅用容器运行 MySQL / Redis / RustFS，再在本机启动 API（3100）、
    顾客 H5（3001）与商家端（3002），便于热更新开发。

.PARAMETER Action
    要执行的操作，默认 status：
      up        启动目标服务并等待健康检查（应用镜像会重新构建）
      down      停止并移除全部容器（保留数据卷）
      restart   重启目标服务
      reset     删除数据卷后重新启动全部服务（会清空数据库与对象存储，需确认）
      build     重新构建 API / Web / Admin 镜像
      logs      查看目标服务日志
      cli       进入 MySQL 命令行
      status    查看容器状态与访问地址
      init      删除业务库并重新执行建表 SQL 与演示数据（需确认）
      pull      拉取 MySQL / Redis / RustFS 基础镜像
      dev       启动基础服务后，在本机运行 pnpm dev（三端热更新）

.PARAMETER Target
    操作目标，默认 all（仅容器相关操作使用）：
      mysql / redis / rustfs / api / web / admin / all

.PARAMETER Force
    reset / init 跳过二次确认；build 禁用缓存。

.PARAMETER Follow
    logs 是否持续跟踪输出。

.PARAMETER Tail
    logs 显示的最后行数，默认 200。

.PARAMETER TimeoutSeconds
    up 等待健康检查的超时秒数，默认 120。

.PARAMETER NoWait
    up 启动后不等待健康检查。

.EXAMPLE
    pwsh ./manage.ps1 up

.EXAMPLE
    pwsh ./manage.ps1 up -Target mysql

.EXAMPLE
    pwsh ./manage.ps1 logs -Target api -Follow

.EXAMPLE
    pwsh ./manage.ps1 init -Force

.EXAMPLE
    pwsh ./manage.ps1 dev
#>
#Requires -Version 7.0
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('up', 'down', 'restart', 'reset', 'build', 'logs', 'cli', 'status', 'init', 'pull', 'dev')]
    [string]$Action = 'status',

    [ValidateSet('mysql', 'redis', 'rustfs', 'api', 'web', 'admin', 'all')]
    [string]$Target = 'all',

    [switch]$Force,
    [switch]$Follow,

    [ValidateRange(1, 10000)]
    [int]$Tail = 200,

    [ValidateRange(5, 600)]
    [int]$TimeoutSeconds = 120,

    [switch]$NoWait
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$ScriptRoot = $PSScriptRoot
$ComposeFile = Join-Path $ScriptRoot 'scripts/docker-compose.yml'
$EnvFile = Join-Path $ScriptRoot 'scripts/.env'
$InitDir = Join-Path $ScriptRoot 'scripts/init'
$MonorepoRoot = Join-Path $ScriptRoot 'dinebox-monorepo'

$ContainerNames = @{
    mysql  = 'dinebox-mysql'
    redis  = 'dinebox-redis'
    rustfs = 'dinebox-rustfs'
    api    = 'dinebox-api'
    web    = 'dinebox-web'
    admin  = 'dinebox-admin'
}

$AppServices = @('api', 'web', 'admin')
$AllServices = @('mysql', 'redis', 'rustfs', 'api', 'web', 'admin')

function Get-EnvSetting {
    param(
        [Parameter(Mandatory)][string]$Key,
        [Parameter(Mandatory)][string]$Default
    )
    if (-not (Test-Path -LiteralPath $EnvFile)) {
        return $Default
    }
    foreach ($line in Get-Content -LiteralPath $EnvFile -Encoding UTF8) {
        if ($line -match "^\s*$([Regex]::Escape($Key))\s*=\s*(.*)\s*$") {
            $value = $Matches[1].Trim().Trim('"').Trim("'")
            if ($value) { return $value }
        }
    }
    return $Default
}

$DbName = Get-EnvSetting -Key 'MYSQL_DATABASE' -Default 'dinebox'
$DbRootPassword = Get-EnvSetting -Key 'MYSQL_ROOT_PASSWORD' -Default '123456'
$DbUser = Get-EnvSetting -Key 'MYSQL_USER' -Default 'dinebox'
$DbPassword = Get-EnvSetting -Key 'MYSQL_PASSWORD' -Default '123456'
$ApiPort = Get-EnvSetting -Key 'API_PORT' -Default '3100'
$WebPort = Get-EnvSetting -Key 'WEB_PORT' -Default '8090'
$AdminPort = Get-EnvSetting -Key 'ADMIN_PORT' -Default '8091'
$MySqlPort = Get-EnvSetting -Key 'MYSQL_PORT' -Default '3307'
$RedisPort = Get-EnvSetting -Key 'REDIS_PORT' -Default '6380'
$S3Port = Get-EnvSetting -Key 'S3_PORT' -Default '9100'
$S3ConsolePort = Get-EnvSetting -Key 'S3_CONSOLE_PORT' -Default '9101'
$H5PublicUrl = Get-EnvSetting -Key 'H5_PUBLIC_URL' -Default 'http://localhost:8090'

function Assert-Prerequisites {
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        throw '未找到 docker 命令，请先安装并启动 Docker Desktop。'
    }
    if (-not (Test-Path -LiteralPath $ComposeFile)) {
        throw "未找到 compose 文件：$ComposeFile"
    }
    & docker compose version *> $null
    if ($LASTEXITCODE -ne 0) {
        throw '当前 docker 不支持 compose v2，请升级 Docker Desktop。'
    }
}

function Invoke-Compose {
    param([Parameter(Mandatory)][string[]]$ComposeArgs)
    & docker compose --file $ComposeFile @ComposeArgs
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose $($ComposeArgs -join ' ') 执行失败（退出码 $LASTEXITCODE）。"
    }
}

function Get-TargetServices {
    if ($Target -eq 'all') { return $AllServices }
    return @($Target)
}

function Confirm-Action {
    param([Parameter(Mandatory)][string]$Message)
    if ($Force) { return $true }
    $answer = Read-Host "$Message`n输入 YES 继续"
    return $answer -ceq 'YES'
}

function Show-Addresses {
    Write-Host ''
    Write-Host 'DineBox 访问地址' -ForegroundColor Cyan
    Write-Host "  顾客 H5        http://localhost:$WebPort/?tk=<桌台二维码令牌>"
    Write-Host "  商家管理/收银  http://localhost:$AdminPort"
    Write-Host "  API            http://localhost:$ApiPort  （文档 /api/docs，健康检查 /health）"
    Write-Host "  RustFS 控制台  http://localhost:$S3ConsolePort"
    Write-Host "  MySQL          localhost:$MySqlPort  （库 $DbName，账号 $DbUser）"
    Write-Host "  Redis          localhost:$RedisPort"
    Write-Host ''
    Write-Host "  二维码 H5 地址（H5_PUBLIC_URL）：$H5PublicUrl"
    Write-Host '  手机扫码需把 H5_PUBLIC_URL 改为店内主机局域网 IP，如 http://192.168.1.10:8090'
    Write-Host '  演示账号：admin / 123456（管理员），cashier01 / 123456（收银员）'
    Write-Host ''
}

function Wait-MySqlReady {
    Write-Host '等待 MySQL 就绪…'
    for ($i = 0; $i -lt 60; $i += 1) {
        & docker exec $ContainerNames.mysql mysqladmin ping -h 127.0.0.1 -uroot -p"$DbRootPassword" --silent *> $null
        if ($LASTEXITCODE -eq 0) {
            Write-Host 'MySQL 已就绪。' -ForegroundColor Green
            return
        }
        Start-Sleep -Seconds 2
    }
    throw 'MySQL 启动超时，请查看 docker compose logs mysql。'
}

function Invoke-SqlFile {
    param(
        [Parameter(Mandatory)][string]$LocalPath,
        [Parameter(Mandatory)][string]$RemotePath,
        [string]$Database = ''
    )
    & docker cp $LocalPath "$($ContainerNames.mysql):$RemotePath"
    if ($LASTEXITCODE -ne 0) { throw "复制 SQL 文件失败：$LocalPath" }
    $dbArg = if ($Database) { $Database } else { '' }
    & docker exec -i $ContainerNames.mysql sh -c "mysql -uroot -p$DbRootPassword --default-character-set=utf8mb4 $dbArg < $RemotePath"
    if ($LASTEXITCODE -ne 0) { throw "执行 SQL 失败：$LocalPath" }
}

function Invoke-Up {
    $services = Get-TargetServices
    $args = @('up', '-d', '--build')
    if (-not $NoWait) {
        $args += @('--wait', '--wait-timeout', "$TimeoutSeconds")
    }
    if ($Target -ne 'all') { $args += $services }
    Invoke-Compose -ComposeArgs $args
    Show-Addresses
}

function Invoke-Init {
    if (-not (Confirm-Action '将删除业务库并重新执行建表与演示数据，所有订单/菜品/账号将被清空。')) {
        Write-Host '已取消。' -ForegroundColor Yellow
        return
    }
    Invoke-Compose -ComposeArgs @('up', '-d', '--wait', '--wait-timeout', "$TimeoutSeconds", 'mysql')
    Wait-MySqlReady

    Write-Host "删除数据库 $DbName …"
    & docker exec -i $ContainerNames.mysql mysql -uroot -p"$DbRootPassword" -e "DROP DATABASE IF EXISTS ``$DbName``;"
    if ($LASTEXITCODE -ne 0) { throw '删除数据库失败。' }

    Write-Host '执行 01-schema.sql …'
    Invoke-SqlFile -LocalPath (Join-Path $InitDir '01-schema.sql') -RemotePath '/tmp/01-schema.sql'
    Write-Host '执行 02-demo-data.sql …'
    Invoke-SqlFile -LocalPath (Join-Path $InitDir '02-demo-data.sql') -RemotePath '/tmp/02-demo-data.sql' -Database $DbName

    Write-Host ''
    Write-Host '数据库已重建：20 张表 + 菜品/桌台/打印机 + 近 7 天演示订单。' -ForegroundColor Green
    Write-Host '演示账号：admin / 123456，cashier01 / 123456'
    Write-Host '如 API 正在运行，无需重启；连接池会自动使用新数据。'
}

function Invoke-Dev {
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw '未找到 pnpm 命令，请先安装 Node.js 并执行 corepack enable。'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $MonorepoRoot 'package.json'))) {
        throw "未找到 monorepo 目录：$MonorepoRoot"
    }
    Invoke-Compose -ComposeArgs @('up', '-d', '--wait', '--wait-timeout', "$TimeoutSeconds", 'mysql', 'redis', 'rustfs')

    $apiEnv = Join-Path $MonorepoRoot 'apps/api/.env'
    if (-not (Test-Path -LiteralPath $apiEnv)) {
        Copy-Item -LiteralPath (Join-Path $MonorepoRoot 'apps/api/.env.example') -Destination $apiEnv
        Write-Host '已复制 apps/api/.env.example → apps/api/.env' -ForegroundColor Green
    }

    if (-not (Test-Path -LiteralPath (Join-Path $MonorepoRoot 'node_modules'))) {
        Write-Host '安装依赖 …'
        Push-Location $MonorepoRoot
        try { & pnpm install; if ($LASTEXITCODE -ne 0) { throw 'pnpm install 失败。' } }
        finally { Pop-Location }
    }

    Write-Host ''
    Write-Host "开发模式：API http://localhost:3100，H5 http://localhost:3001，商家端 http://localhost:3002" -ForegroundColor Cyan
    Write-Host '按 Ctrl+C 结束三端进程（基础服务容器保持运行，可用 manage.ps1 down 停止）。'
    Push-Location $MonorepoRoot
    try { & pnpm dev }
    finally { Pop-Location }
}

Assert-Prerequisites

switch ($Action) {
    'up' { Invoke-Up }
    'down' {
        Invoke-Compose -ComposeArgs @('down', '--remove-orphans')
        Write-Host '容器已停止，数据卷保留。' -ForegroundColor Green
    }
    'restart' {
        $services = Get-TargetServices
        if ($Target -eq 'all') {
            Invoke-Compose -ComposeArgs @('restart')
        }
        else {
            Invoke-Compose -ComposeArgs (@('restart') + $services)
        }
        Write-Host '已重启。' -ForegroundColor Green
    }
    'reset' {
        if (-not (Confirm-Action '将删除 MySQL / Redis / RustFS 数据卷并重建全部服务，数据不可恢复。')) {
            Write-Host '已取消。' -ForegroundColor Yellow
            return
        }
        Invoke-Compose -ComposeArgs @('down', '-v', '--remove-orphans')
        $script:Target = 'all'
        Invoke-Up
    }
    'build' {
        $services = if ($Target -eq 'all') { $AppServices } else { Get-TargetServices }
        $args = @('build')
        if ($Force) { $args += '--no-cache' }
        Invoke-Compose -ComposeArgs ($args + $services)
        Write-Host '镜像构建完成。' -ForegroundColor Green
    }
    'logs' {
        $services = Get-TargetServices
        $args = @('logs', '--tail', "$Tail")
        if ($Follow) { $args += '-f' }
        if ($Target -ne 'all') { $args += $services }
        Invoke-Compose -ComposeArgs $args
    }
    'cli' {
        Invoke-Compose -ComposeArgs @('exec', 'mysql', 'mysql', "-u$DbUser", "-p$DbPassword", $DbName)
    }
    'status' {
        Invoke-Compose -ComposeArgs @('ps')
        Show-Addresses
    }
    'init' { Invoke-Init }
    'pull' {
        Invoke-Compose -ComposeArgs @('pull', 'mysql', 'redis', 'rustfs')
        Write-Host '基础镜像已更新；应用镜像请执行 pwsh ./manage.ps1 build。' -ForegroundColor Green
    }
    'dev' { Invoke-Dev }
}
