<#
  Veille techno - collecte des donnees de VOTRE tenant (Microsoft Graph)
  - Message Center du tenant, etat des services, incidents/avis (en cours + modifies depuis 30 jours)
  - Seules les API Service Communications (/admin/serviceAnnouncement/...) sont appelees.
  - Resultat : data/tenant.js
  Deux modes d'authentification :
  1. Poste local : tenant.config.json (tenantId, clientId, certThumbprint) + certificat avec cle privee
     dans Cert:\CurrentUser\My ou Cert:\LocalMachine\My.
  2. GitHub Actions : variables TENANT_ID et CLIENT_ID + federation d'identite (jeton OIDC GitHub,
     aucun secret stocke). Le workflow doit avoir la permission "id-token: write".
  Variable TENANT_MESSAGES=false : n'inclut pas les messages du Message Center (seulement l'etat des services).
  Appele par collect.ps1 et par serve.ps1 (bouton "Recharger" de la page).
#>
$ErrorActionPreference = 'Continue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $root 'data'
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }
$now = [DateTime]::UtcNow

function To-Iso($d) { if ($null -eq $d) { return $null }; return $d.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }
function Cut([string]$s, [int]$n) { if (-not $s) { return '' }; if ($s.Length -le $n) { return $s }; return $s.Substring(0, $n).TrimEnd() + [char]0x2026 }
function Strip-Html([string]$html) {
  if (-not $html) { return '' }
  $t = $html -replace '(?s)<(script|style)[^>]*>.*?</\1>', ' '
  $t = $t -replace '<br\s*/?>', ' ' -replace '</(p|div|li|h\d)>', ' '
  $t = $t -replace '<[^>]+>', ''
  $t = [System.Net.WebUtility]::HtmlDecode($t)
  return ($t -replace '\s+', ' ').Trim()
}
function B64Url([byte[]]$b) { [Convert]::ToBase64String($b).TrimEnd('=').Replace('+', '-').Replace('/', '_') }

function Get-GraphToken($cfg) {
  $tokenUrl = "https://login.microsoftonline.com/$($cfg.tenantId)/oauth2/v2.0/token"
  # Mode GitHub Actions : le jeton OIDC de GitHub sert d'assertion (federation configuree sur l'application Entra)
  if (-not $cfg.certThumbprint) {
    if (-not $env:ACTIONS_ID_TOKEN_REQUEST_URL) { throw 'ni certificat ni jeton GitHub OIDC disponible (permission id-token: write ?)' }
    $oidc = (Invoke-RestMethod -Uri ($env:ACTIONS_ID_TOKEN_REQUEST_URL + '&audience=api://AzureADTokenExchange') -Headers @{ Authorization = "bearer $env:ACTIONS_ID_TOKEN_REQUEST_TOKEN" }).value
    $body = @{ client_id = $cfg.clientId; scope = 'https://graph.microsoft.com/.default'; grant_type = 'client_credentials'
      client_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'; client_assertion = $oidc }
    return (Invoke-RestMethod -Method Post -Uri $tokenUrl -Body $body).access_token
  }
  # Mode poste local : assertion signee avec le certificat
  $cert = Get-ChildItem Cert:\CurrentUser\My, Cert:\LocalMachine\My -ErrorAction SilentlyContinue | Where-Object { $_.Thumbprint -eq $cfg.certThumbprint -and $_.HasPrivateKey } | Select-Object -First 1
  if (-not $cert) { throw "certificat $($cfg.certThumbprint) introuvable (ou sans cle privee)" }
  $t = [int][double]::Parse((Get-Date -UFormat %s))
  $hdr = @{ alg = 'RS256'; typ = 'JWT'; x5t = (B64Url $cert.GetCertHash()) } | ConvertTo-Json -Compress
  $pl = @{ aud = "https://login.microsoftonline.com/$($cfg.tenantId)/oauth2/v2.0/token"; iss = $cfg.clientId; sub = $cfg.clientId; jti = [guid]::NewGuid().ToString(); nbf = $t - 60; exp = $t + 600 } | ConvertTo-Json -Compress
  $unsigned = (B64Url ([Text.Encoding]::UTF8.GetBytes($hdr))) + '.' + (B64Url ([Text.Encoding]::UTF8.GetBytes($pl)))
  $rsa = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
  $sig = $rsa.SignData([Text.Encoding]::UTF8.GetBytes($unsigned), [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
  $body = @{ client_id = $cfg.clientId; scope = 'https://graph.microsoft.com/.default'; grant_type = 'client_credentials'
    client_assertion_type = 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer'; client_assertion = ($unsigned + '.' + (B64Url $sig)) }
  return (Invoke-RestMethod -Method Post -Uri $tokenUrl -Body $body).access_token
}

function Get-GraphAll($url, $headers) {
  $out = @()
  $guard = 0
  while ($url -and $guard -lt 50) {
    $guard++
    $r = Invoke-RestMethod -Uri $url -Headers $headers
    $out += @($r.value)
    $url = $r.'@odata.nextLink'
  }
  return $out
}

$cfgPath = Join-Path $root 'tenant.config.json'
if (Test-Path $cfgPath) { $cfg = Get-Content $cfgPath -Raw | ConvertFrom-Json }
elseif ($env:TENANT_ID -and $env:CLIENT_ID) { $cfg = [pscustomobject]@{ tenantId = $env:TENANT_ID; clientId = $env:CLIENT_ID; certThumbprint = $null } }
else { Write-Host '  (ni tenant.config.json ni variables TENANT_ID / CLIENT_ID : collecte du tenant ignoree)'; return }
$includeMessages = $env:TENANT_MESSAGES -ne 'false'

$result = [ordered]@{ generated = (To-Iso $now); messagesPublished = $includeMessages; messages = @(); health = $null; issues = $null; issuesError = $null; error = $null }
try {
  $h = @{ Authorization = 'Bearer ' + (Get-GraphToken $cfg) }
  # Sans $top : la pagination (@odata.nextLink) ramene tous les messages
  $msgs = if ($includeMessages) { Get-GraphAll 'https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/messages' $h } else { @() }
  foreach ($m in $msgs) {
    $result.messages += [ordered]@{
      id = $m.id; title = $m.title; category = $m.category; severity = $m.severity; major = [bool]$m.isMajorChange
      start = $m.startDateTime; end = $m.endDateTime; modified = $m.lastModifiedDateTime; actionBy = $m.actionRequiredByDateTime
      services = @($m.services); tags = @($m.tags); body = (Cut (Strip-Html ([string]$m.body.content)) 1500)
    }
  }
  Write-Host ("  [OK] Mon tenant - Message Center : {0} element(s)" -f $result.messages.Count) -ForegroundColor Green
  try {
    # Etat de chaque service + incidents/avis en cours ou modifies dans les 30 derniers jours
    $ov = Get-GraphAll 'https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/healthOverviews' $h
    $result.health = @($ov | ForEach-Object { [ordered]@{ service = $_.service; status = $_.status } })
    $limit = $now.AddDays(-30)
    $iss = Get-GraphAll 'https://graph.microsoft.com/v1.0/admin/serviceAnnouncement/issues' $h
    $result.issues = @($iss | Where-Object { -not $_.isResolved -or ([DateTime]$_.lastModifiedDateTime).ToUniversalTime() -ge $limit } | ForEach-Object {
        $last = $_.posts | Sort-Object { [DateTime]$_.createdDateTime } | Select-Object -Last 1
        [ordered]@{ id = $_.id; title = $_.title; service = $_.service; feature = $_.feature; featureGroup = $_.featureGroup
          status = $_.status; classification = $_.classification; resolved = [bool]$_.isResolved
          start = $_.startDateTime; end = $_.endDateTime; modified = $_.lastModifiedDateTime
          impact = (Cut ([string]$_.impactDescription) 400)
          lastPost = $(if ($last) { Cut (Strip-Html ([string]$last.description.content)) 1500 } else { '' })
          posts = @($_.posts).Count }
      })
    Write-Host ("  [OK] Mon tenant - sante des services : {0} service(s), {1} incident(s)/avis" -f $result.health.Count, $result.issues.Count) -ForegroundColor Green
  }
  catch {
    $result.issuesError = 'Permission ServiceHealth.Read.All manquante ou refusee'
    Write-Host '  [INFO] Sante des services : ajoutez la permission ServiceHealth.Read.All a l''application pour l''activer' -ForegroundColor DarkYellow
  }
}
catch {
  $result.error = $_.Exception.Message
  Write-Host "  [ERREUR] Mon tenant : $($_.Exception.Message)" -ForegroundColor Yellow
}
$json = $result | ConvertTo-Json -Depth 6 -Compress
[IO.File]::WriteAllText((Join-Path $dataDir 'tenant.js'), "window.TENANT = $json;", (New-Object System.Text.UTF8Encoding $false))
