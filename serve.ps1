<#
  Mini serveur web local pour Veille techno (aucune installation requise).
  Usage : powershell -ExecutionPolicy Bypass -File serve.ps1 [-Port 8080]
#>
param([int]$Port = 8080)
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Veille techno disponible sur http://localhost:$Port/  (Ctrl+C pour arreter)"
$types = @{ '.html' = 'text/html; charset=utf-8'; '.js' = 'application/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json'; '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.ico' = 'image/x-icon' }
try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    try {
      $path = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
      if (-not $path) { $path = 'index.html' }
      # Actualisation des donnees du tenant a la demande (bouton "Recharger" de la page) :
      # relance collect-tenant.ps1 (certificat local) puis renvoie data/tenant.js au format JSON
      if ($path -eq 'api/tenant') {
        if (-not (Test-Path (Join-Path $root 'tenant.config.json'))) { $ctx.Response.StatusCode = 404; continue }
        Write-Host "$(Get-Date -Format 'HH:mm:ss') Actualisation des donnees du tenant..."
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $root 'collect-tenant.ps1') | Out-Host
        $js = [IO.File]::ReadAllText((Join-Path $root 'data\tenant.js'), [Text.Encoding]::UTF8)
        $json = $js -replace '^\s*window\.TENANT\s*=\s*', '' -replace ';\s*$', ''
        $bytes = [Text.Encoding]::UTF8.GetBytes($json)
        $ctx.Response.ContentType = 'application/json; charset=utf-8'
        $ctx.Response.Headers.Add('Cache-Control', 'no-store')
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
        continue
      }
      $file = [IO.Path]::GetFullPath((Join-Path $root $path))
      if ($file.StartsWith($root) -and (Test-Path $file -PathType Leaf)) {
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $ctx.Response.ContentType = if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' }
        # Icones : mises en cache (evite qu'elles clignotent a chaque rafraichissement) ; le reste est toujours revalide
        $cache = if ($ext -eq '.svg' -or $ext -eq '.png' -or $ext -eq '.ico') { 'public, max-age=86400' } else { 'no-cache' }
        $ctx.Response.Headers.Add('Cache-Control', $cache)
        $ctx.Response.ContentLength64 = $bytes.Length
        $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      }
      else { $ctx.Response.StatusCode = 404 }
    }
    catch { Write-Host "Erreur : $($_.Exception.Message)" }
    finally { try { $ctx.Response.Close() } catch {} }
  }
}
finally { $listener.Stop() }
