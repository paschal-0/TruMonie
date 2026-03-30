$ErrorActionPreference = 'Stop'

$backendDir = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
Set-Location $backendDir

$env:POSTGRES_HOST = 'localhost'
$env:POSTGRES_PORT = '5432'
$env:POSTGRES_USER = 'postgres'
$env:POSTGRES_PASSWORD = 'postgres'
$env:POSTGRES_DB = 'trumonie'
$env:POSTGRES_SSL = 'false'

$env:REDIS_HOST = 'localhost'
$env:REDIS_PORT = '6379'
$env:REDIS_PASSWORD = ''

$env:JWT_SECRET = 'dev_jwt_secret'
$env:JWT_EXPIRES_IN = '3600s'
$env:REFRESH_JWT_SECRET = 'dev_refresh_secret'
$env:REFRESH_JWT_EXPIRES_IN = '7d'

$env:PII_ENCRYPTION_KEY = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
$env:KYC_VENDOR_API_KEY = 'stub'

$env:DEFAULT_PAYMENT_PROVIDER = 'internal'
$env:DEFAULT_BILLS_PROVIDER = 'stub'
$env:DEFAULT_KYC_PROVIDER = 'stub'
$env:DEFAULT_FX_PROVIDER = 'stub'
$env:DEFAULT_CARDS_PROVIDER = 'stub'
$env:DEFAULT_OTP_PROVIDER = 'internal'
$env:DEFAULT_NOTIFICATION_PROVIDER = 'internal'

$env:PORT = '3000'
$env:NODE_ENV = 'development'

$sysEnvPath = Join-Path $backendDir '.qa-system-accounts.env'
if (Test-Path $sysEnvPath) {
  Get-Content $sysEnvPath | ForEach-Object {
    if ($_ -match '^(?<key>[A-Z0-9_]+)=(?<value>.+)$') {
      [Environment]::SetEnvironmentVariable($Matches['key'], $Matches['value'])
    }
  }
}

npm run start:dev
