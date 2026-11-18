param([switch]$Install)
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$installRoot = Join-Path $env:LOCALAPPDATA 'CodegraphLemonberry'
$packageRoot = Join-Path $installRoot 'node_modules/@lemonberrylabs/codegraph'
$cli = Join-Path $installRoot 'node_modules/.bin/codegraph.cmd'
if ($Install -or !(Test-Path $cli)) {
    & npm install --prefix $installRoot '@lemonberrylabs/codegraph@0.1.0'
    if ($LASTEXITCODE -ne 0) { throw 'CodeGraph installation failed' }
}
# Upstream 0.1.0 compares Windows backslash paths with TypeScript slash paths.
# Normalize only the installed analyzer; application source is unaffected.
$analyzer = Join-Path $packageRoot 'dist/src/analyzer/typescript/ts-analyzer.js'
$content = [IO.File]::ReadAllText($analyzer)
$content = $content.Replace('absoluteFiles.includes(sf.fileName)', 'absoluteFiles.some(f => resolve(f) === resolve(sf.fileName))')
$content = $content.Replace('const relPath = relative(this.config.projectRoot, sourceFile.fileName);', 'const relPath = relative(this.config.projectRoot, sourceFile.fileName).split(String.fromCharCode(92)).join("/");')
[IO.File]::WriteAllText($analyzer, $content)
$out = Join-Path $repo 'docs/architecture/codegraph'
New-Item -ItemType Directory -Force $out | Out-Null
& $cli analyze -l typescript -r $repo -i 'apps/adviser/src/**/*.ts' 'apps/adviser/src/**/*.tsx' 'apps/adviser/App.tsx' 'apps/adviser/index.ts' 'services/adviser-backend/src/**/*.ts' 'services/adviser-backend/scripts/**/*.mjs' 'tools/*.mjs' -x '**/*.test.ts' '**/*.spec.ts' -e 'apps/adviser/App.tsx' 'apps/adviser/src/AdviserApp.tsx' 'services/adviser-backend/src/server/http-app.ts' -o (Join-Path $out 'typescript.json')
if ($LASTEXITCODE -ne 0) { throw 'TypeScript analysis failed' }
& $cli analyze -l python -r (Join-Path $repo 'tools/data-pipeline') -i 'lua_pipeline/**/*.py' 'scripts/**/*.py' -e 'lua_pipeline/__main__.py' 'scripts/warehouse.py' -o (Join-Path $out 'python.json')
if ($LASTEXITCODE -ne 0) { throw 'Python analysis failed' }
foreach ($name in @('typescript', 'python')) {
    $graph = Get-Content (Join-Path $out "$name.json") -Raw | ConvertFrom-Json
    if ($graph.metadata.totalFiles -eq 0 -or $graph.nodes.Count -eq 0) { throw "Empty $name graph" }
    $graph.metadata | Select-Object language,totalFiles,totalFunctions,totalEdges
}
