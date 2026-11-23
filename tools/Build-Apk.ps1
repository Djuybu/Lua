param([Parameter(Mandatory=$true)][string]$ApiUrl)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$app = Join-Path $repo 'apps/adviser'
$uri = [Uri]$ApiUrl
if (-not $uri.IsAbsoluteUri -or $uri.Scheme -notin @('http','https') -or $uri.UserInfo) { throw 'Use an HTTP(S) API base URL without credentials.' }
$jdkCandidates = @($env:JAVA_HOME, "$env:USERPROFILE/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2", 'C:/Program Files/Android/Android Studio/jbr')
$jdk = $jdkCandidates | Where-Object { $_ -and (Test-Path -LiteralPath (Join-Path $_ 'lib/jvm.cfg')) -and (Test-Path -LiteralPath (Join-Path $_ 'bin/javac.exe')) } | Select-Object -First 1
if (-not $jdk) { throw 'A working JDK 17+ is required.' }
$env:JAVA_HOME = $jdk
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = "$env:LOCALAPPDATA/Android/Sdk" }
$env:EXPO_PUBLIC_API_URL = $ApiUrl.TrimEnd('/')
$env:NODE_ENV = 'production'
$out = Join-Path $repo 'artifacts/android'
New-Item -ItemType Directory -Path $out -Force | Out-Null
Push-Location $app
try {
  & npx.cmd expo prebuild --platform android --no-install
  if ($LASTEXITCODE) { throw 'Expo prebuild failed.' }
  $sdkPath = $env:ANDROID_HOME.Replace('\','/')
  [IO.File]::WriteAllText((Join-Path $app 'android/local.properties'), "sdk.dir=$sdkPath`n")
  & ./android/gradlew.bat -p android :app:assembleRelease '-PreactNativeArchitectures=arm64-v8a,x86_64' --console=plain --max-workers=4
  if ($LASTEXITCODE) { throw 'Gradle APK build failed.' }
  $source = Join-Path $app 'android/app/build/outputs/apk/release/app-release.apk'
  $hash = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant()
  $target = Join-Path $out ("lua-adviser-" + $hash.Substring(0,12) + '.apk')
  if (-not (Test-Path -LiteralPath $target)) { Copy-Item -LiteralPath $source -Destination $target }
  if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $hash) { throw 'APK copy hash mismatch.' }
  @{ apk=$target; sha256=$hash; apiUrl=$env:EXPO_PUBLIC_API_URL; signing='Android debug certificate, internal distribution'; architectures=@('arm64-v8a','x86_64'); builtAt=(Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'build.json') -Encoding utf8
  Write-Host "APK: $target"
  Write-Host "SHA256: $hash"
} finally { Pop-Location }
