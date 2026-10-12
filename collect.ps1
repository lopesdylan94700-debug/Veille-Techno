<#
  Veille techno - collecteur de sources
  Compatible Windows PowerShell 5.1 et PowerShell 7 (GitHub Actions).
  Produit :
    data/snapshot.js     -> window.SNAPSHOT (Learn What's new, blogs, Graph, Partner Center, cycle de vie, Apple/Android,
                            organismes : MSRC, CNIL, ANSSI, CIS)
    data/mc-fallback.js  -> window.MC_FALLBACK (copie du Message Center / Roadmap pour usage hors-ligne)
    data/eol-fallback.js -> window.EOL_FALLBACK (copie endoflife.date)
  La page recharge elle-meme le Message Center, la Roadmap et endoflife.date en direct quand c'est possible.
#>
param(
  [int]$FeedMaxDays = 365,
  [int]$GraphMaxDays = 120,
  [int]$MsrcDays = 90,
  [int]$CnilPages = 7
)

$ErrorActionPreference = 'Continue'
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
$ProgressPreference = 'SilentlyContinue'

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$dataDir = Join-Path $root 'data'
if (-not (Test-Path $dataDir)) { New-Item -ItemType Directory -Path $dataDir | Out-Null }

$en = [Globalization.CultureInfo]::GetCultureInfo('en-US')
$fr = [Globalization.CultureInfo]::GetCultureInfo('fr-FR')
$now = [DateTime]::UtcNow
$items = New-Object System.Collections.ArrayList
$report = New-Object System.Collections.ArrayList

function Get-Text([string]$url) {
  $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 60 -Headers @{ 'User-Agent' = 'Mozilla/5.0 (compatible; VeilleTechno/1.0; +powershell)' }
  $bytes = $r.RawContentStream.ToArray()
  return [Text.Encoding]::UTF8.GetString($bytes).TrimStart([char]0xFEFF)
}

function Strip-Html([string]$html) {
  if (-not $html) { return '' }
  $t = $html -replace '(?s)<(script|style)[^>]*>.*?</\1>', ' '
  $t = $t -replace '<br\s*/?>', ' ' -replace '</(p|div|li|h\d)>', ' '
  $t = $t -replace '<[^>]+>', ''
  $t = [System.Net.WebUtility]::HtmlDecode($t)
  return ($t -replace '\s+', ' ').Trim()
}

function Cut([string]$s, [int]$n) {
  if (-not $s) { return '' }
  if ($s.Length -le $n) { return $s }
  return $s.Substring(0, $n).TrimEnd() + [char]0x2026
}

function To-Iso($d) { if ($null -eq $d) { return $null }; return $d.ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ') }

function Parse-Date([string]$s) {
  if (-not $s) { return $null }
  $s = $s.Trim()
  $dto = [DateTimeOffset]::MinValue
  if ([DateTimeOffset]::TryParse($s, $en, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$dto)) { return $dto.UtcDateTime }
  $t = $s -replace '\s(PDT)$', ' -07:00' -replace '\s(PST)$', ' -08:00' -replace '\s(EDT)$', ' -04:00' -replace '\s(EST)$', ' -05:00' -replace '\s(GMT|UTC|UT|Z)$', ' +00:00'
  if ([DateTimeOffset]::TryParse($t, $en, [Globalization.DateTimeStyles]::AssumeUniversal, [ref]$dto)) { return $dto.UtcDateTime }
  $formats = @('MMMM d, yyyy', 'MMMM d yyyy', 'MMMM yyyy', 'MMM yyyy', 'd MMM yyyy', 'd MMMM yyyy', 'MMM d, yyyy')
  $d = [DateTime]::MinValue
  if ([DateTime]::TryParseExact($s, [string[]]$formats, $en, [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal, [ref]$d)) { return $d }
  # Dates en francais (ANSSI, CNIL) : "9 octobre 2026", "Publie le 1er juin 2026"
  $f = ($s -replace '^(Publi\S+ le|Mis \S+ jour le)\s+', '' -replace '\b1er\b', '1').Trim()
  if ([DateTime]::TryParseExact($f, [string[]]@('d MMMM yyyy', 'dd MMMM yyyy'), $fr, [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal, [ref]$d)) { return $d }
  return $null
}

function Add-Item($source, $label, $title, $url, $date, $summary, $tags, $services, $kind, $deadline) {
  if (-not $title) { return }
  [void]$items.Add([ordered]@{
      id       = ('{0}|{1}|{2}' -f $source, (To-Iso $date), (Cut $title 80))
      source   = $source
      label    = $label
      title    = $title
      url      = $url
      date     = (To-Iso $date)
      deadline = (To-Iso $deadline)
      summary  = (Cut $summary 700)
      tags     = @($tags | Where-Object { $_ })
      services = @($services | Where-Object { $_ })
      kind     = $kind
    })
}

function Log($name, $count, $err) {
  [void]$report.Add([ordered]@{ name = $name; count = $count; error = $err })
  if ($err) { Write-Host ("  [ERREUR] {0} : {1}" -f $name, $err) -ForegroundColor Yellow }
  else { Write-Host ("  [OK] {0} : {1} element(s)" -f $name, $count) -ForegroundColor Green }
}

# ---------------------------------------------------------------- Flux RSS / Atom
function Read-Feed($name, $url, $source, $label, $services, $includeRe, $maxDays) {
  try {
    [xml]$x = Get-Text $url
    $before = $items.Count
    $limit = $now.AddDays(-$maxDays)
    $entries = @()
    if ($x.rss) {
      foreach ($i in @($x.rss.channel.item)) {
        $entries += [pscustomobject]@{ title = [string]$i.title; link = [string]$i.link; date = [string]$i.pubDate; desc = [string]$i.description; cats = @($i.category | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.'#text' } }) }
      }
    }
    elseif ($x.feed) {
      foreach ($e in @($x.feed.entry)) {
        $t = if ($e.title -is [string]) { $e.title } else { $e.title.'#text' }
        $l = ($e.link | Where-Object { $_.rel -eq 'alternate' -or -not $_.rel } | Select-Object -First 1).href
        $d = if ($e.published) { $e.published } else { $e.updated }
        $c = if ($e.summary) { if ($e.summary -is [string]) { $e.summary } else { $e.summary.'#text' } } elseif ($e.content) { if ($e.content -is [string]) { $e.content } else { $e.content.'#text' } } else { '' }
        $entries += [pscustomobject]@{ title = [string]$t; link = [string]$l; date = [string]$d; desc = [string]$c; cats = @() }
      }
    }
    foreach ($e in $entries) {
      $title = (Strip-Html $e.title)
      if ($includeRe -and ($title -notmatch $includeRe)) { continue }
      $d = Parse-Date $e.date
      if ($d -and $d -lt $limit) { continue }
      Add-Item $source $label $title $e.link $d (Strip-Html $e.desc) $e.cats $services 'news' $null
    }
    Log $name ($items.Count - $before) $null
  }
  catch { Log $name 0 $_.Exception.Message }
}

# ---------------------------------------------------------------- Pages "What's new" Learn
function Get-Attr([string]$tag, [string]$attr) {
  $m = [regex]::Match($tag, $attr + '="([^"]*)"')
  if ($m.Success) { return $m.Groups[1].Value }; return $null
}

function Split-Blocks([string]$html, [string]$tag) {
  $heads = [regex]::Matches($html, "(?s)(<$tag[^>]*>)(.*?)</$tag>")
  $out = @()
  for ($j = 0; $j -lt $heads.Count; $j++) {
    $hd = $heads[$j]
    $bStart = $hd.Index + $hd.Length
    $bEnd = if ($j + 1 -lt $heads.Count) { $heads[$j + 1].Index } else { $html.Length }
    $out += [pscustomobject]@{ text = (Strip-Html $hd.Groups[2].Value); id = (Get-Attr $hd.Groups[1].Value 'id'); body = $html.Substring($bStart, $bEnd - $bStart) }
  }
  return $out
}

function Read-Learn($name, $url, $services) {
  try {
    $html = Get-Text $url
    $before = $items.Count
    foreach ($stop in @('id="ms--additional-resources', '<footer', 'id="ms--content-well-notification')) {
      $k = $html.IndexOf($stop)
      if ($k -gt 0) { $html = $html.Substring(0, $k) }
    }
    $h2s = [regex]::Matches($html, '(?s)(<h2[^>]*>)(.*?)</h2>')
    for ($i = 0; $i -lt $h2s.Count; $i++) {
      $h2 = $h2s[$i]
      $start = $h2.Index + $h2.Length
      $end = if ($i + 1 -lt $h2s.Count) { $h2s[$i + 1].Index } else { $html.Length }
      $sec = $html.Substring($start, $end - $start)
      $heading = Strip-Html $h2.Groups[2].Value
      $clean = ($heading -replace '^\s*Week of\s+', '' -replace '\(.*?\)', '').Trim()
      $date = Parse-Date $clean
      if (-not $date) { continue }
      $anchor = Get-Attr $h2.Groups[1].Value 'id'
      $secUrl = if ($anchor) { "$url#$anchor" } else { $url }

      $found = @()
      $level = if ($sec -match '<h4') { 'h4' } elseif ($sec -match '<h3') { 'h3' } else { 'li' }
      if ($level -eq 'li' -and $sec -match '<tbody' -and $sec -notmatch '<li') {
        # Format tableau (ex. Defender for Endpoint : Type | Feature | Preview/GA | Description)
        foreach ($tr in [regex]::Matches($sec, '(?s)<tr>(.*?)</tr>')) {
          $cells = @([regex]::Matches($tr.Groups[1].Value, '(?s)<td[^>]*>(.*?)</td>') | ForEach-Object { $_.Groups[1].Value })
          if ($cells.Count -lt 2) { continue }
          $ti = if ($cells.Count -ge 4) { 1 } else { 0 }
          $a = [regex]::Match($cells[$ti], 'href="([^"]+)"')
          $link = $secUrl
          if ($a.Success) { $link = $a.Groups[1].Value; if ($link.StartsWith('/')) { $link = 'https://learn.microsoft.com' + $link } }
          $tg = @(); if ($cells.Count -ge 4) { $tg = @((Strip-Html $cells[0]), (Strip-Html $cells[2])) }
          $found += [pscustomobject]@{ title = (Strip-Html $cells[$ti]); body = $cells[$cells.Count - 1]; cat = ($tg -join ' / '); anchor = $link }
        }
      }
      elseif ($level -eq 'li') {
        foreach ($li in [regex]::Matches($sec, '(?s)<li[^>]*>(.*?)</li>')) {
          $found += [pscustomobject]@{ title = $null; body = $li.Groups[1].Value; cat = $null; anchor = $secUrl }
        }
      }
      else {
        $tag = if ($sec -match '<h3') { 'h3' } else { 'h4' }
        foreach ($b in (Split-Blocks $sec $tag)) {
          $hUrl = if ($b.id) { "$url#$($b.id)" } else { $secUrl }
          $lead = $b.body.TrimStart()
          if ($tag -eq 'h3' -and $lead -match '^<h4') {
            # h3 = categorie, h4 = elements (ex. Intune)
            foreach ($s in (Split-Blocks $b.body 'h4')) {
              $sUrl = if ($s.id) { "$url#$($s.id)" } else { $hUrl }
              $found += [pscustomobject]@{ title = $s.text; body = $s.body; cat = $b.text; anchor = $sUrl }
            }
          }
          elseif ($lead -match '^<(ul|ol)') {
            # h3 = categorie, puces = elements (ex. Purview)
            foreach ($li in [regex]::Matches($b.body, '(?s)<li[^>]*>(.*?)</li>')) {
              $found += [pscustomobject]@{ title = $null; body = $li.Groups[1].Value; cat = $b.text; anchor = $hUrl }
            }
          }
          else {
            $found += [pscustomobject]@{ title = $b.text; body = $b.body; cat = $null; anchor = $hUrl }
          }
        }
      }

      foreach ($f in $found) {
        $tags = @()
        if ($f.cat) { $tags += $f.cat }
        # Metadonnees Entra : <p><strong>Type:</strong> ...<br><strong>Service category:</strong> ...</p>
        $meta = [regex]::Match($f.body, '(?s)<p>\s*<strong>Type:</strong>.*?</p>')
        $bodyHtml = $f.body
        if ($meta.Success) {
          foreach ($k in @('Type', 'Service category')) {
            $mm = [regex]::Match($meta.Value, $k + ':</strong>\s*([^<]+)')
            if ($mm.Success) { $tags += (Strip-Html $mm.Groups[1].Value) }
          }
          $bodyHtml = $f.body.Remove($meta.Index, $meta.Length)
        }
        $bodyText = Strip-Html $bodyHtml
        $title = $f.title
        if (-not $title) {
          if ($bodyText.Length -lt 25) { continue }
          $dot = $bodyText.IndexOf('. ')
          $title = if ($dot -gt 20 -and $dot -lt 200) { $bodyText.Substring(0, $dot) } else { Cut $bodyText 180 }
        }
        if ($title -match '^(In this article|Feedback|Additional resources)$') { continue }
        Add-Item 'learn' "What's new" $title $f.anchor $date $bodyText $tags $services 'news' $null
      }
    }
    Log $name ($items.Count - $before) $null
  }
  catch { Log $name 0 $_.Exception.Message }
}

# ---------------------------------------------------------------- Cycle de vie Microsoft (Learn)
function Read-Lifecycle([int]$year) {
  $name = "Cycle de vie Microsoft $year"
  try {
    $url = "https://learn.microsoft.com/en-us/lifecycle/end-of-support/end-of-support-$year"
    $html = Get-Text $url
    $before = $items.Count
    $labels = @{ 'product-retirements' = 'Retrait du produit'; 'end-of-servicing' = 'Fin de maintenance'; 'products-reaching-end-of-support' = 'Fin de support'; 'products-moving-to-extended-support' = 'Passage au support etendu' }
    $h2s = [regex]::Matches($html, '(?s)<h2 id="([^"]+)"[^>]*>(.*?)</h2>')
    for ($i = 0; $i -lt $h2s.Count; $i++) {
      $id = $h2s[$i].Groups[1].Value
      if (-not $labels.ContainsKey($id)) { continue }
      $start = $h2s[$i].Index
      $end = if ($i + 1 -lt $h2s.Count) { $h2s[$i + 1].Index } else { $html.Length }
      $sec = $html.Substring($start, $end - $start)
      foreach ($row in [regex]::Matches($sec, '(?s)<tr>\s*<td>(.*?)</td>\s*<td>(.*?)</td>')) {
        $d = Parse-Date (Strip-Html $row.Groups[2].Value)
        if (-not $d) { continue }
        $links = [regex]::Matches($row.Groups[1].Value, '(?s)<a href="([^"]+)"[^>]*>(.*?)</a>')
        if ($links.Count -gt 0) {
          foreach ($a in $links) {
            $href = $a.Groups[1].Value -replace '\?branch=live', ''
            if ($href.StartsWith('/')) { $href = 'https://learn.microsoft.com' + $href }
            $prod = Strip-Html $a.Groups[2].Value
            Add-Item 'lifecycle' 'Cycle de vie Microsoft' $prod $href $null ("{0} : {1}" -f $labels[$id], $prod) @($labels[$id]) @() 'lifecycle' $d
          }
        }
        else {
          foreach ($p in ($row.Groups[1].Value -split '<br\s*/?>')) {
            $prod = Strip-Html $p
            if ($prod) { Add-Item 'lifecycle' 'Cycle de vie Microsoft' $prod "$url#$id" $null ("{0} : {1}" -f $labels[$id], $prod) @($labels[$id]) @() 'lifecycle' $d }
          }
        }
      }
    }
    Log $name ($items.Count - $before) $null
  }
  catch { Log $name 0 $_.Exception.Message }
}

# ---------------------------------------------------------------- Microsoft Graph changelog
function Read-Graph {
  try {
    [xml]$x = Get-Text 'https://developer.microsoft.com/en-us/graph/changelog/rss'
    $before = $items.Count
    $limit = $now.AddDays(-$GraphMaxDays)
    foreach ($i in @($x.rss.channel.item)) {
      $d = Parse-Date ([string]$i.pubDate)
      if ($d -and $d -lt $limit) { continue }
      $cats = @($i.category | ForEach-Object { if ($_ -is [string]) { $_ } else { $_.'#text' } })
      $ver = if ($cats -contains 'beta') { 'beta' } else { 'v1.0' }
      $text = Strip-Html ([string]$i.description)
      $title = "Graph $ver - $($i.title) : " + (Cut $text 150)
      Add-Item 'graph' 'Graph changelog' $title 'https://developer.microsoft.com/en-us/graph/changelog' $d $text @($ver, [string]$i.title) @('Microsoft Graph') 'news' $null
    }
    Log 'Microsoft Graph changelog' ($items.Count - $before) $null
  }
  catch { Log 'Microsoft Graph changelog' 0 $_.Exception.Message }
}

# ---------------------------------------------------------------- Partner Center : annonces mensuelles (prix, offres, facturation)
function Read-PartnerCenter([int]$months = 12) {
  $before = $items.Count
  $errors = @()
  $start = (Get-Date -Day 1)
  for ($m = 0; $m -lt $months; $m++) {
    $d = $start.AddMonths(-$m)
    $slug = '{0}-{1}' -f $d.Year, $d.ToString('MMMM', $en).ToLower()
    $url = "https://learn.microsoft.com/en-us/partner-center/announcements/$slug"
    try { $html = Get-Text $url } catch { if ($m -gt 0) { $errors += $slug }; continue }
    foreach ($stop in @('id="ms--additional-resources', '<footer')) { $k = $html.IndexOf($stop); if ($k -gt 0) { $html = $html.Substring(0, $k) } }
    foreach ($b in (Split-Blocks $html 'h2')) {
      if (-not $b.id -or $b.id -match '^(ms--|feedback)') { continue }
      $dm = [regex]::Match($b.body, '<strong>Date</strong>\s*:\s*([^<]+)')
      $date = if ($dm.Success) { Parse-Date (Strip-Html $dm.Groups[1].Value) } else { $d }
      if (-not $date) { $date = $d }
      $ws = [regex]::Match($b.body, '<strong>Workspace</strong>\s*:\s*([^<]+)')
      $body = [regex]::Replace($b.body, '(?s)<ul>\s*<li><strong>Date</strong>.*?</ul>', ' ')
      $tags = @('Partner Center'); if ($ws.Success) { $tags += (Strip-Html $ws.Groups[1].Value) }
      Add-Item 'partner' 'Partner Center' $b.text "$url#$($b.id)" $date (Strip-Html $body) $tags @() 'news' $null
    }
  }
  Log 'Partner Center - annonces' ($items.Count - $before) $(if ($errors.Count) { 'pages introuvables : ' + ($errors -join ', ') } else { $null })
}

# ---------------------------------------------------------------- Organismes : MSRC, CNIL, ANSSI, CIS

# MSRC - Security Update Guide (API officielle Microsoft) : CVE des produits suivis
$MsrcProducts = '(?i)windows|win32|office|\bword\b|excel|powerpoint|outlook|onenote|visio|\baccess\b|publisher|exchange|sharepoint|teams|onedrive|\bedge\b|entra|azure ad|active directory|intune|defender|sentinel|purview|\b365\b|copilot|kerberos|ntlm|lsass|bitlocker|hyper-v|remote desktop|graph|bookings|authenticator|android|\bios\b|\bmac\b|macos|role:'

function Read-Msrc {
  $before = $items.Count
  try {
    $since = $now.AddDays(-$MsrcDays).ToString('yyyy-MM-ddT00:00:00Z')
    $url = "https://api.msrc.microsoft.com/sug/v2.0/en-US/vulnerability?`$orderBy=releaseDate%20desc&`$filter=releaseDate%20ge%20$since"
    $guard = 0
    while ($url -and $guard -lt 40) {
      $guard++
      $j = (Get-Text $url) | ConvertFrom-Json
      foreach ($v in @($j.value)) {
        if ($v.isMariner) { continue }
        # CVE emises par d'autres autorites (ex. Chrome pour le moteur Chromium d'Edge : plus d'un millier par trimestre, sans gravite Microsoft)
        if ($v.issuingCna -and $v.issuingCna -ne 'Microsoft') { continue }
        $component = [string]$v.tag
        $title = [string]$v.cveTitle
        if (("$title $component") -notmatch $MsrcProducts) { continue }
        # Positions fixes : [0] type, [1] gravite, [2] composant
        $sev = if ($v.severity) { [string]$v.severity } else { '-' }
        $comp = if ($component) { $component } else { '-' }
        $tags = @('CVE', $sev, $comp)
        if ($v.baseScore) { $tags += ('CVSS ' + $v.baseScore) }
        if ($v.exploited -eq 'Yes') { $tags += 'Exploitee' }
        if ($v.publiclyDisclosed -eq 'Yes') { $tags += 'Divulguee' }
        $sum = Strip-Html ([string]$v.description)
        if ($v.impact) { $sum = "Impact : $($v.impact). $sum" }
        Add-Item 'msrc' 'MSRC' ("$($v.cveNumber) - $title") ("https://msrc.microsoft.com/update-guide/vulnerability/" + $v.cveNumber) (Parse-Date ([string]$v.releaseDate)) $sum $tags @() 'org' $null
      }
      $url = $j.'@odata.nextLink'
    }
    Log 'MSRC - Security Update Guide' ($items.Count - $before) $null
  }
  catch { Log 'MSRC - Security Update Guide' ($items.Count - $before) $_.Exception.Message }
}

# CNIL : actualites liees a Microsoft 365 (cloud, outils collaboratifs, messagerie, transferts de donnees...)
$CnilM365 = '(?i)microsoft|office 365|\b365\b|\bteams\b|copilot|outlook|azure|onedrive|sharepoint|exchange|\bcloud\b|informatique en nuage|suites? (collaborative|bureautique)|outils? collaboratifs?|messagerie|visioconf|transferts? de donn|data privacy framework|souverainet|h\S+bergement'

function Read-Cnil {
  $before = $items.Count
  $errs = 0
  for ($p = 0; $p -lt $CnilPages; $p++) {
    $url = if ($p -eq 0) { 'https://www.cnil.fr/fr/actualites' } else { "https://www.cnil.fr/fr/actualites?page=$p" }
    try { $html = Get-Text $url } catch { $errs++; continue }
    foreach ($r in [regex]::Matches($html, '(?s)<div id="list-item-\d+"(.*?)<div id="grid-item-')) {
      $v = $r.Groups[1].Value
      $a = [regex]::Match($v, '(?s)<h3 class=.ctn-gen-liste-titre.>\s*<a href="([^"]+)"[^>]*>(.*?)</a>')
      if (-not $a.Success) { continue }
      $title = Strip-Html $a.Groups[2].Value
      $intro = Strip-Html ([regex]::Match($v, "(?s)<div class='introduction'>(.*?)</div>").Groups[1].Value)
      if (("$title $intro") -notmatch $CnilM365) { continue }
      $date = Parse-Date (Strip-Html ([regex]::Match($v, "(?s)<p class='date'>(.*?)</p>").Groups[1].Value))
      $tag = (Strip-Html ([regex]::Match($v, '(?s)<div class="tag-item">(.*?)</div>').Groups[1].Value)) -replace '^#', ''
      $href = $a.Groups[1].Value; if ($href.StartsWith('/')) { $href = 'https://www.cnil.fr' + $href }
      Add-Item 'cnil' 'CNIL' $title $href $date $intro @('Actualite', $tag) @() 'org' $null
    }
  }
  Log 'CNIL - actualites liees a Microsoft 365' ($items.Count - $before) $(if ($errs) { "$errs page(s) en erreur" } else { $null })
}

function Read-Anssi {
  $before = $items.Count
  try {
    $html = Get-Text 'https://messervices.cyber.gouv.fr/guides'
    foreach ($c in [regex]::Matches($html, '<dsfr-card ([^>]+)>')) {
      $attrs = $c.Groups[1].Value
      $title = [System.Net.WebUtility]::HtmlDecode((Get-Attr $attrs 'title'))
      $href = Get-Attr $attrs 'href'
      if (-not $title -or -not $href) { continue }
      $date = Parse-Date ([System.Net.WebUtility]::HtmlDecode((Get-Attr $attrs 'detailend')))
      $coll = [System.Net.WebUtility]::HtmlDecode((Get-Attr $attrs 'detailstart'))
      Add-Item 'anssi' 'ANSSI' $title ('https://messervices.cyber.gouv.fr' + $href) $date $coll @('Guide', $coll) @() 'org' $null
    }
  }
  catch { Log 'ANSSI - guides' 0 $_.Exception.Message }
  try {
    [xml]$x = Get-Text 'https://cyber.gouv.fr/actualites/rss'
    foreach ($i in @($x.rss.channel.item)) {
      Add-Item 'anssi' 'ANSSI' (Strip-Html ([string]$i.title)) ([string]$i.link) (Parse-Date ([string]$i.pubDate)) (Strip-Html ([string]$i.description)) @('Actualite') @() 'org' $null
    }
  }
  catch { Log 'ANSSI - actualites' 0 $_.Exception.Message }
  Log 'ANSSI - guides et actualites' ($items.Count - $before) $null
}

function Read-Cis {
  $before = $items.Count
  try {
    [xml]$x = Get-Text 'https://www.cisecurity.org/feed/'
    $limit = $now.AddDays(-$FeedMaxDays)
    foreach ($i in @($x.rss.channel.item | Where-Object { $_.title -match 'Benchmarks? .*Update' })) {
      $d = Parse-Date ([string]$i.pubDate)
      if ($d -and $d -lt $limit) { continue }
      $post = [string]$i.link
      try { $page = Get-Text $post } catch { continue }
      $seen = @{}
      foreach ($m in [regex]::Matches((Strip-Html $page), 'CIS [A-Z][A-Za-z0-9 .\-/&()+]{2,90}? Benchmark v\d+(\.\d+)*')) {
        $name = $m.Value
        # Ne garder que le dernier "CIS ..." (le texte qui precede, ex. "CIS Build Kits Released Last Month", est un intertitre)
        $k = $name.LastIndexOf('CIS ')
        if ($k -gt 0) { $name = $name.Substring($k) }
        if ($seen.ContainsKey($name)) { continue }
        $seen[$name] = $true
        $ver = [regex]::Match($name, 'v\d+(\.\d+)*$').Value
        Add-Item 'cis' 'CIS' $name $post $d ("Publie dans : " + [string]$i.title) @('Benchmark', $ver) @() 'org' $null
      }
    }
    Log 'CIS - benchmarks' ($items.Count - $before) $null
  }
  catch { Log 'CIS - benchmarks' 0 $_.Exception.Message }
}

# ---------------------------------------------------------------- Windows release health : problemes connus des mises a jour
$winIssues = [ordered]@{}
function Read-WindowsHealth {
  $pages = [ordered]@{
    'Windows 11 26H2' = 'status-windows-11-26h2'; 'Windows 11 25H2' = 'status-windows-11-25h2'; 'Windows 11 24H2' = 'status-windows-11-24h2'
    'Windows 11 23H2' = 'status-windows-11-23h2'; 'Windows 10 22H2' = 'status-windows-10-22h2'
    'Windows Server 2025' = 'status-windows-server-2025'; 'Windows Server 2022' = 'status-windows-server-2022'
  }
  $errs = @()
  foreach ($ver in $pages.Keys) {
    $url = "https://learn.microsoft.com/en-us/windows/release-health/$($pages[$ver])"
    try { $html = Get-Text $url } catch { $errs += $ver; continue }
    # Details de chaque probleme (section "Issue details")
    $details = @{}
    $di = $html.IndexOf('id="issue-details"')
    if ($di -gt 0) {
      $parts = [regex]::Split($html.Substring($di), '<div id="(\d+)msgdesc"></div>')
      for ($k = 1; $k -lt $parts.Count - 1; $k += 2) {
        $body = $parts[$k + 1]
        $cut = $body.IndexOf('Back to top'); if ($cut -gt 0) { $body = $body.Substring(0, $cut) }
        $plat = ''
        $pm = [regex]::Match($body, '(?s)Affected platforms:.*?<ul>(.*?)</ul>')
        if ($pm.Success) { $plat = (([regex]::Matches($pm.Groups[1].Value, '(?s)<li[^>]*>(.*?)</li>') | ForEach-Object { Strip-Html $_.Groups[1].Value }) -join ' | ') }
        $txtHtml = [regex]::Replace($body, '(?s)^.*?</table>', '')
        $txtHtml = [regex]::Replace($txtHtml, '(?s)<p[^>]*>\s*<strong>Affected platforms:.*$', '')
        $details[$parts[$k]] = @{ text = (Cut (Strip-Html $txtHtml) 1400); platforms = $plat }
      }
    }
    # Tableau "Known issues"
    $ki = $html.IndexOf('id="known-issues"')
    $kEnd = if ($di -gt $ki) { $di } else { $html.Length }
    if ($ki -lt 0) { continue }
    $table = $html.Substring($ki, $kEnd - $ki)
    foreach ($row in [regex]::Matches($table, '(?s)<tr><td><div id="(\d+)msg"></div>(.*?)</tr>')) {
      $id = $row.Groups[1].Value
      $cells = [regex]::Matches('<td>' + $row.Groups[2].Value, '(?s)<td[^>]*>(.*?)</td>')
      if ($cells.Count -lt 4) { continue }
      $c0 = $cells[0].Groups[1].Value
      $title = Strip-Html ([regex]::Match($c0, '(?s)<b>(.*?)</b>').Groups[1].Value)
      $summary = Strip-Html ([regex]::Replace($c0, '(?s)<a[^>]*>.*?</a>', ''))
      $orig = $cells[1].Groups[1].Value
      $kb = [regex]::Match($orig, 'KB\d+').Value
      $build = Strip-Html ([regex]::Match($orig, '(?s)^(.*?)<br').Groups[1].Value)
      $origDate = [regex]::Match($orig, '\d{4}-\d{2}-\d{2}').Value
      $stCell = $cells[2].Groups[1].Value
      $status = Strip-Html ([regex]::Match($stCell, '(?s)^(.*?)(<br|$)').Groups[1].Value)
      $fixKb = [regex]::Match($stCell, 'KB\d+').Value
      $updated = [regex]::Match($cells[3].Groups[1].Value, '\d{4}-\d{2}-\d{2}').Value
      if ($winIssues.Contains($id)) {
        $e = $winIssues[$id]
        if ($e.versions -notcontains $ver) { $e.versions += $ver }
        # Completer les informations absentes de la premiere page (ex. KB "N/A" sur une version)
        if (-not $e.kb -and $kb) { $e.kb = $kb; $e.build = $build; $e.origDate = $origDate }
        if (-not $e.fixKb -and $fixKb) { $e.fixKb = $fixKb }
        continue
      }
      $d = $details[$id]
      $winIssues[$id] = [ordered]@{
        id = $id; title = $title; summary = $summary; versions = @($ver); status = $status
        build = $build; kb = $kb; origDate = $origDate; fixKb = $fixKb; updated = $updated
        details = $(if ($d) { $d.text } else { '' }); platforms = $(if ($d) { $d.platforms } else { '' })
        url = "$url#$($id)msgdesc"
      }
    }
  }
  Log 'Windows release health - problemes connus' $winIssues.Count $(if ($errs.Count) { 'pages en erreur : ' + ($errs -join ', ') } else { $null })
}

# ---------------------------------------------------------------- Apple : mises a jour de securite
function Read-AppleSecurity {
  try {
    $html = Get-Text 'https://support.apple.com/en-us/100100'
    $before = $items.Count
    $n = 0
    foreach ($row in [regex]::Matches($html, '(?s)<tr>(.*?)</tr>')) {
      $cells = [regex]::Matches($row.Groups[1].Value, '(?s)<td[^>]*>(.*?)</td>')
      if ($cells.Count -lt 3) { continue }
      $nameHtml = $cells[0].Groups[1].Value
      $nameText = Strip-Html (($nameHtml -replace '(?s)<div class="note.*', ''))
      if ($nameText -notmatch 'iOS|iPadOS|macOS|Safari|visionOS') { continue }
      $d = Parse-Date (Strip-Html $cells[2].Groups[1].Value)
      $a = [regex]::Match($nameHtml, 'href="([^"]+)"')
      $link = if ($a.Success) { $a.Groups[1].Value } else { 'https://support.apple.com/en-us/100100' }
      $note = if ($nameHtml -match 'no published CVE') { 'Pas de CVE publiee.' } else { 'Mise a jour de securite (CVE corrigees).' }
      Add-Item 'apple' 'Apple' ("Mise a jour de securite : $nameText") $link $d ("$note Appareils : " + (Strip-Html $cells[1].Groups[1].Value)) @('Securite') @() 'release' $null
      $n++; if ($n -ge 60) { break }
    }
    Log 'Apple - mises a jour de securite' ($items.Count - $before) $null
  }
  catch { Log 'Apple - mises a jour de securite' 0 $_.Exception.Message }
}

Write-Host "Veille techno - collecte des sources ($((Get-Date).ToString('dd/MM/yyyy HH:mm')))" -ForegroundColor Cyan

# --- What's new (Learn)
Write-Host "Pages What's new (Microsoft Learn)"
Read-Learn "What's new - Microsoft Entra" 'https://learn.microsoft.com/en-us/entra/fundamentals/whats-new' @('Microsoft Entra')
Read-Learn "What's new - Microsoft Intune" 'https://learn.microsoft.com/en-us/intune/intune-service/fundamentals/whats-new' @('Microsoft Intune')
Read-Learn "What's new - Defender for Endpoint" 'https://learn.microsoft.com/en-us/defender-endpoint/whats-new-in-microsoft-defender-endpoint' @('Microsoft Defender for Endpoint')
Read-Learn "What's new - Defender for Office 365" 'https://learn.microsoft.com/en-us/defender-office-365/defender-for-office-365-whats-new' @('Microsoft Defender for Office 365')
Read-Learn "What's new - Defender for Identity" 'https://learn.microsoft.com/en-us/defender-for-identity/whats-new' @('Microsoft Defender for Identity')
Read-Learn "What's new - Defender for Cloud Apps" 'https://learn.microsoft.com/en-us/defender-cloud-apps/release-notes' @('Microsoft Defender for Cloud Apps')
Read-Learn "What's new - Defender XDR" 'https://learn.microsoft.com/en-us/defender-xdr/whats-new' @('Microsoft Defender XDR')
Read-Learn "What's new - Microsoft Sentinel" 'https://learn.microsoft.com/en-us/azure/sentinel/whats-new' @('Microsoft Sentinel')
Read-Learn "What's new - Microsoft Purview" 'https://learn.microsoft.com/en-us/purview/whats-new' @('Microsoft Purview')

# --- Blogs
Write-Host "Blogs Microsoft / Tech Community"
$tc = 'https://techcommunity.microsoft.com/t5/s/gxcuf89792/rss/board?board.id='
Read-Feed 'Blog Microsoft Entra' ($tc + 'microsoft-entra-blog') 'blog' 'Blog Tech Community' @('Microsoft Entra') $null $FeedMaxDays
Read-Feed 'Blog Intune Customer Success' ($tc + 'IntuneCustomerSuccess') 'blog' 'Blog Tech Community' @('Microsoft Intune') $null $FeedMaxDays
Read-Feed 'Blog Defender for Endpoint' ($tc + 'MicrosoftDefenderATPBlog') 'blog' 'Blog Tech Community' @('Microsoft Defender for Endpoint') $null $FeedMaxDays
Read-Feed 'Blog Defender for Office 365' ($tc + 'MicrosoftDefenderforOffice365Blog') 'blog' 'Blog Tech Community' @('Microsoft Defender for Office 365') $null $FeedMaxDays
Read-Feed 'Blog Defender XDR' ($tc + 'MicrosoftThreatProtectionBlog') 'blog' 'Blog Tech Community' @('Microsoft Defender XDR') $null $FeedMaxDays
Read-Feed 'Blog Microsoft Sentinel' ($tc + 'MicrosoftSentinelBlog') 'blog' 'Blog Tech Community' @('Microsoft Sentinel') $null $FeedMaxDays
Read-Feed 'Blog Microsoft Purview' ($tc + 'microsoft-purview-blog') 'blog' 'Blog Tech Community' @('Microsoft Purview') $null $FeedMaxDays
Read-Feed 'Blog Microsoft Security (Tech Community)' ($tc + 'microsoft-security-blog') 'blog' 'Blog Tech Community' @() $null $FeedMaxDays
Read-Feed 'Blog SharePoint' ($tc + 'SPBlog') 'blog' 'Blog Tech Community' @('SharePoint Online') $null $FeedMaxDays
Read-Feed 'Blog Exchange' ($tc + 'Exchange') 'blog' 'Blog Tech Community' @('Exchange Online') $null $FeedMaxDays
Read-Feed 'Blog Microsoft Teams' ($tc + 'MicrosoftTeamsBlog') 'blog' 'Blog Tech Community' @('Microsoft Teams') $null $FeedMaxDays
Read-Feed 'Blog OneDrive' ($tc + 'OneDriveBlog') 'blog' 'Blog Tech Community' @('Microsoft OneDrive') $null $FeedMaxDays
Read-Feed 'Blog Microsoft 365' ($tc + 'microsoft_365blog') 'blog' 'Blog Tech Community' @('Microsoft 365 suite') $null $FeedMaxDays
Read-Feed 'Blog Windows IT Pro' ($tc + 'windows-itpro-blog') 'blog' 'Blog Tech Community' @('Windows') $null $FeedMaxDays
Read-Feed 'Microsoft Security Blog' 'https://www.microsoft.com/en-us/security/blog/feed/' 'blog' 'Microsoft Security Blog' @() $null $FeedMaxDays
Read-Feed 'Microsoft 365 Blog' 'https://www.microsoft.com/en-us/microsoft-365/blog/feed/' 'blog' 'Microsoft 365 Blog' @('Microsoft 365 suite') $null $FeedMaxDays

# --- Graph
Write-Host "Microsoft Graph"
Read-Graph

# --- Partner Center (prix, offres, facturation)
Write-Host "Partner Center (annonces mensuelles)"
Read-PartnerCenter 12

# --- Organismes
Write-Host "Organismes (MSRC, CNIL, ANSSI, CIS)"
Read-Msrc
Read-Cnil
Read-Anssi
Read-Cis

# --- Apple / Android
Write-Host "Windows release health"
Read-WindowsHealth

Write-Host "Apple / Android"
Read-Feed 'Apple - sorties logicielles' 'https://developer.apple.com/news/releases/rss/releases.rss' 'apple' 'Apple' @() '^(iOS|iPadOS|macOS)\b' $FeedMaxDays
Read-Feed 'Apple - actualites developpeurs' 'https://developer.apple.com/news/rss/news.rss' 'apple' 'Apple' @() $null $FeedMaxDays
Read-AppleSecurity
Read-Feed 'Android Developers Blog' 'https://android-developers.googleblog.com/feeds/posts/default' 'android' 'Android' @('Android') '(?i)android 1\d|QPR|beta|security|enterprise|release|Play Integrity|privacy|policy|deprecat' $FeedMaxDays

# --- Cycle de vie
Write-Host "Cycle de vie Microsoft (fins de support)"
$y = (Get-Date).Year
foreach ($yy in @(($y - 1), $y, ($y + 1), ($y + 2))) { Read-Lifecycle $yy }

# ---------------------------------------------------------------- Mon tenant (script dedie, aussi appele par serve.ps1)
Write-Host "Mon tenant (Message Center et etat des services via Microsoft Graph)"
& (Join-Path $root 'collect-tenant.ps1')

# ---------------------------------------------------------------- Ecriture
$utf8 = New-Object System.Text.UTF8Encoding $false
$snapshot = [ordered]@{ generated = (To-Iso $now); report = $report; items = $items; windowsIssues = @($winIssues.Values) }
$json = $snapshot | ConvertTo-Json -Depth 6 -Compress
[IO.File]::WriteAllText((Join-Path $dataDir 'snapshot.js'), "window.SNAPSHOT = $json;", $utf8)
Write-Host ("snapshot.js : {0} elements" -f $items.Count) -ForegroundColor Cyan

Write-Host "Copie hors-ligne du Message Center / Roadmap (mc.merill.net)"
try {
  $mc = Get-Text 'https://mc.merill.net/messages-index.json'
  [IO.File]::WriteAllText((Join-Path $dataDir 'mc-fallback.js'), "window.MC_FALLBACK = { generated: '$(To-Iso $now)', items: $mc };", $utf8)
  Write-Host '  [OK] mc-fallback.js' -ForegroundColor Green
}
catch { Write-Host "  [ERREUR] Message Center : $($_.Exception.Message)" -ForegroundColor Yellow }

Write-Host "Copie hors-ligne endoflife.date"
$eolParts = @()
foreach ($p in @('ios', 'ipados', 'macos', 'android', 'windows')) {
  try { $eolParts += ('"{0}": {1}' -f $p, (Get-Text "https://endoflife.date/api/v1/products/$p/")) } catch { Write-Host "  [ERREUR] endoflife $p" -ForegroundColor Yellow }
}
[IO.File]::WriteAllText((Join-Path $dataDir 'eol-fallback.js'), "window.EOL_FALLBACK = { generated: '$(To-Iso $now)', products: {" + ($eolParts -join ',') + "} };", $utf8)
Write-Host '  [OK] eol-fallback.js' -ForegroundColor Green
Write-Host "Termine." -ForegroundColor Cyan
