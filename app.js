/* Veille techno — application cliente
   Sources en direct (CORS) : mc.merill.net (Message Center + Roadmap M365), endoflife.date (OS).
   Sources collectées par collect.ps1 : data/snapshot.js (Learn What's new, blogs, Graph, cycle de vie, Apple/Android).
   Navigation : #<onglet>/<produit>/<fonctionnalité>  (ex. #news/intune/autopilot) */
(function () {
  'use strict';

  const LIVE_MC = 'https://mc.merill.net/messages-index.json';
  const LIVE_EOL = 'https://endoflife.date/api/v1/products/';
  const EOL_PRODUCTS = ['ios', 'ipados', 'macos', 'android', 'windows'];
  const REFRESH_MS = 30 * 60 * 1000;
  const PAGE = 120;
  const PER_SECTION = 6;
  const DAY = 86400000;

  // ------------------------------------------------------------------ Produits et fonctionnalités
  // F(id, nom, icône, regex sur titre + tags + services, noms de services du Message Center)
  const F = (id, name, icon, re, svc) => ({ id, name, icon, re, svc: svc || [] });
  const MS_APPS = /\b(outlook|teams|edge|authenticator|onedrive|word|excel|powerpoint|copilot|defender|company portal|intune app)\b/i;

  const PRODUCTS = [
    { id: 'entra', name: 'Microsoft Entra', group: 'Identité & appareils', icon: 'entra', color: '#0a6ed1',
      svc: ['microsoft entra', 'microsoft entra id', 'azure active directory', 'azure ad'],
      re: /\b(entra|azure ad|azure active directory|conditional access|authenticator|passkeys?|mfa|multi-?factor|sspr|self-service password|privileged identity|pim|global secure access|external id|id governance|identity governance|entitlement management|access reviews?|workload identit\w*|verified id|fido2|sms (sign-in|authentication|otp)|email one-time passcode|b2b|b2c)\b/i,
      features: [
        F('ca', 'Accès conditionnel', 'f-conditional-access', /conditional access|token protection|continuous access|\bCAE\b|authentication context|named locations?/i),
        F('auth', 'Authentification & MFA', 'f-keys', /\b(mfa|multi-?factor|authenticator|passkeys?|fido2?|sms|voice|passwords?|passwordless|sspr|self-service password|certificate-based|cba|temporary access pass|authentication (methods?|strengths?)|kerberos|windows hello|one-time passcode|otp|sign-in experience)\b/i),
        F('idp', 'ID Protection', 'f-id-protection', /identity protection|id protection|risky (users?|sign-ins?)|risk-based|user risk|sign-in risk/i),
        F('pim', 'Privileged Identity Management', 'f-pim', /privileged identity|\bPIM\b|just-in-time|privileged access/i),
        F('gov', 'ID Governance', 'f-governance', /governance|access reviews?|entitlement|access packages?|lifecycle workflows?/i),
        F('ext', 'External ID & B2B', 'f-external-id', /external id|\bb2b\b|\bb2c\b|guests?|cross-tenant|external (users?|collaboration|identities)|federation/i),
        F('gsa', 'Global Secure Access', 'f-gsa', /global secure access|internet access|private access|\bGSA\b|network access|secure web gateway|\bZTNA\b/i),
        F('connect', 'Entra Connect & provisioning', 'f-entra-connect', /entra connect|cloud sync|connect sync|hybrid|provisioning|\bSCIM\b|workday|successfactors|on-premises/i),
        F('verified', 'Verified ID', 'f-verified-id', /verified id|verifiable credential|face check/i),
        F('apps', 'Applications & Workload ID', 'f-workload', /workload identit|app registrations?|service principals?|managed identit|enterprise app|\bSAML\b|\bOIDC\b|oauth|application proxy|app gallery|single sign-on|\bSSO\b|consent/i),
        F('agents', 'Agent ID & IA', 'f-copilot', /\bagents?\b|agent id|agent 365|copilot/i),
        F('roles', 'Rôles & administration', 'f-roles', /\broles?\b|administrative units?|\bRBAC\b|admin center|custom security attributes|tenant/i),
        F('devices', 'Appareils', 'f-devices', /\bdevices?\b|device join|registration|platform sso|\bLAPS\b/i),
        F('logs', 'Journaux & supervision', 'f-monitor', /\blogs?\b|audit|workbooks?|diagnostic|monitor|health|recommendations|secure score/i)
      ] },
    { id: 'intune', name: 'Microsoft Intune', group: 'Identité & appareils', icon: 'intune', color: '#0b8fc7',
      svc: ['microsoft intune'],
      re: /\b(intune|windows autopilot|autopilot (device|profiles?|deployment|reset|v\d)|endpoint privilege management|company portal|remote help|cloud pki|enterprise app management|app protection polic\w*|mobile application management|endpoint analytics|co-management|configuration manager|configmgr|sccm|settings catalog)\b/i,
      features: [
        F('autopilot', 'Windows Autopilot', 'f-enrollment', /windows autopilot|autopilot (device|profiles?|deployment|reset|v\d)|device preparation|enrollment status page|\bOOBE\b/i),
        F('configmgr', 'Configuration Manager', 'f-devices', /configuration manager|configmgr|\bSCCM\b|\bMECM\b|co-management|tenant attach/i),
        F('epm', 'Endpoint Privilege Management', 'f-roles', /endpoint privilege|\bEPM\b|elevation|admin rights/i),
        F('remotehelp', 'Remote Help', null, /remote help/i),
        F('cloudpki', 'Cloud PKI & certificats', 'f-keys', /cloud pki|\bPKI\b|\bSCEP\b|\bPKCS\b|certificates?/i),
        F('eam', 'Enterprise App Management', 'f-app-protection', /enterprise app (management|catalog)|\bEAM\b|app catalog/i),
        F('analytics', 'Advanced Analytics & rapports', 'f-endpoint-analytics', /advanced analytics|endpoint analytics|device query|resource performance|anomal|battery health|reports?|reporting|monitor and troubleshoot/i),
        F('copilot', 'Security Copilot & IA', 'f-copilot', /copilot|\bAI\b|\bagents?\b/i),
        F('apps', 'Gestion des applications', 'f-app-protection', /app protection|\bMAM\b|app management|\bapps?\b|win32|\bLOB\b|\bVPP\b|managed (apps?|browser)|edge for business|store app|application/i),
        F('config', 'Configuration des appareils', 'f-device-config', /settings catalog|configuration (profiles?|polic\w+)|device configuration|templates?|\bADMX\b|declarative|\bDDM\b/i),
        F('compliance', 'Conformité', 'f-compliance', /complian|health attestation/i),
        F('security', 'Sécurité des appareils', 'f-security-baselines', /security|baselines?|bitlocker|filevault|defender|firewall|antivirus|attack surface|\bASR\b|\bLAPS\b|encryption|account protection/i),
        F('enroll', 'Inscription des appareils', 'f-enrollment', /enroll|onboard|\bADE\b|automated device|work profile|fully managed|corporate-owned|android enterprise|apple business/i),
        F('updates', 'Mises à jour Windows', 'f-windows-device', /updates?\b|autopatch|hotpatch|drivers?|\bWUfB\b/i),
        F('manage', 'Gestion des appareils', 'f-devices', /device management|remote actions?|wipe|retire|inventory|scope tags?|\bRBAC\b|multi-admin approval|\broles?\b|tenant|clean-?up|rename/i)
      ] },
    { id: 'windows', name: 'Windows', group: 'Identité & appareils', icon: 'windows', color: '#2a5fbf',
      svc: ['windows', 'windows autopatch', 'windows 365'],
      re: /\b(windows (1[01]|server|update|autopatch|hello|365|insider|lts\w*|security update)|autopatch|hotpatch|wufb|wsus|secure boot|windows release health|bitlocker|lsass|kerberos|ntlm)\b/i,
      features: [
        F('w365', 'Windows 365 & Cloud PC', null, /windows 365|cloud pc|virtual desktop|\bAVD\b/i),
        F('server', 'Windows Server', null, /\bserver\b/i),
        F('updates', 'Windows Update & Autopatch', 'f-windows-device', /updates?\b|autopatch|hotpatch|\bWSUS\b|\bWUfB\b|drivers?|servicing|\bpatch|\bKB\d/i),
        F('security', 'Sécurité', 'f-security-baselines', /security|bitlocker|secure boot|kerberos|\bNTLM\b|\bLSASS\b|credential|defender|smart app|certificates?|\bTPM\b|hello/i),
        F('versions', 'Versions & cycle de vie', null, /\b2\dH[12]\b|version|end of (support|servicing)|\bLTSC\b|\bLTSB\b|fin de support|publiée|enterprise|education|\bhome\b|\bpro\b/i),
        F('mgmt', 'Gestion & déploiement', 'f-devices', /group policy|deploy|management|autopilot|imaging|\bWDS\b|\bMDT\b|provisioning|recall|settings/i)
      ] },
    { id: 'defender', name: 'Microsoft Defender', group: 'Sécurité', icon: 'defender', color: '#3b3fb6',
      svc: ['microsoft defender xdr', 'microsoft 365 defender', 'microsoft defender for endpoint', 'microsoft defender for office 365', 'exchange online protection', 'microsoft defender for identity', 'microsoft defender for cloud apps', 'microsoft cloud app security'],
      re: /\b(defender|mde|mdo|mdi|mdca|advanced hunting|unified (soc|security operations)|security operations center|exposure management|threat analytics|attack disruption|security copilot|attack surface reduction|endpoint detection|edr|tamper protection|safe links|safe attachments|anti-?phish\w*|anti-?spam|anti-?malware|quarantine|exchange online protection|eop|attack simulation|priority accounts?|user reported|zero-hour auto purge|tenant allow\/block|dmarc|dkim|cloud app security|casb|app governance|shadow it)\b/i,
      features: [
        F('mde', 'Defender for Endpoint', null, /defender for endpoint|\bMDE\b|defender for business|defender vulnerability management|attack surface reduction|endpoint detection|\bEDR\b|defender antivirus|tamper protection|device control|network protection|\bWSL\b|linux|macos|android|\bios\b/i, ['microsoft defender for endpoint']),
        F('mdo', 'Defender for Office 365', null, /defender for office|\bMDO\b|safe links|safe attachments|anti-?phish\w*|anti-?spam|anti-?malware|quarantine|exchange online protection|\bEOP\b|attack simulation|priority accounts?|user report\w*|zero-hour auto purge|impersonation|tenant allow\/block|\bDMARC\b|\bDKIM\b|email|teams/i, ['microsoft defender for office 365', 'exchange online protection']),
        F('mdi', 'Defender for Identity', 'f-id-protection', /defender for identity|\bMDI\b|sensor|active directory|domain controller|identity security/i, ['microsoft defender for identity']),
        F('mdca', 'Defender for Cloud Apps', null, /defender for cloud apps|\bMDCA\b|cloud app security|\bCASB\b|app governance|shadow it|session control|saas/i, ['microsoft defender for cloud apps', 'microsoft cloud app security']),
        F('xdr', 'Defender XDR & portail', null, /defender xdr|microsoft 365 defender|defender portal|advanced hunting|incidents?|alerts?|unified (soc|security operations)|security operations center|\bISOC\b|attack disruption|custom detection|automated investigation/i, ['microsoft defender xdr', 'microsoft 365 defender']),
        F('expo', 'Exposure & vulnérabilités', null, /exposure management|vulnerabilit|attack paths?|secure score|critical assets?|\bEASM\b|posture/i),
        F('ti', 'Threat Intelligence', null, /threat intelligence|threat analytics|indicators?|\bIOCs?\b/i),
        F('copilot', 'Security Copilot & IA', 'f-copilot', /security copilot|copilot|\bagents?\b|\bAI\b/i)
      ] },
    { id: 'sentinel', name: 'Microsoft Sentinel', group: 'Sécurité', icon: 'sentinel', color: '#1f6f8b',
      svc: ['microsoft sentinel'],
      re: /\b(sentinel|siem)\b/i,
      features: [
        F('portal', 'Portail Defender (unifié)', 'defender', /defender portal|unified|\bISOC\b|security operations|\bXDR\b/i),
        F('lake', 'Data lake & stockage', null, /data lake|\blake\b|\btiers?\b|table management|retention|archive|storage|cost|billing|pricing/i),
        F('connectors', 'Connecteurs de données', null, /connectors?|ingest|codeless|\bCCF\b|data collection|syslog|\bCEF\b|\bAMA\b/i),
        F('analytics', 'Détections & analytics', null, /analytics rules?|detections?|\bUEBA\b|anomal|fusion|alerts?|incidents?|mitre/i),
        F('soar', 'Automatisation (SOAR)', null, /playbooks?|automation|logic apps?|\bSOAR\b/i),
        F('hunting', 'Hunting & KQL', null, /hunting|\bKQL\b|quer(y|ies)|notebooks?|jupyter|\bgraph\b/i),
        F('asim', 'ASIM & schémas', null, /\bASIM\b|schemas?|normaliz|parsers?/i),
        F('content', 'Content hub & solutions', null, /content hub|solutions?|workbooks?|templates?/i),
        F('copilot', 'IA & Copilot', 'f-copilot', /copilot|\bAI\b|\bagents?\b|\bMCP\b/i)
      ] },
    { id: 'purview', name: 'Microsoft Purview', group: 'Sécurité', icon: 'purview', color: '#8a3d9e',
      svc: ['microsoft purview', 'azure information protection'],
      re: /\b(purview|data loss prevention|dlp|sensitivity labels?|e-?discovery|retention (polic\w*|labels?)|insider risk|communication compliance|information protection|information barriers|compliance manager|audit (logs?|premium|standard)|records management|data lifecycle management|customer key|double key|message encryption|dspm)\b/i,
      features: [
        F('dlp', 'Data Loss Prevention', null, /data loss prevention|\bDLP\b/i),
        F('mip', 'Information Protection & étiquettes', 'f-information-protection', /information protection|sensitivity labels?|\blabels?\b|\bMIP\b|\bAIP\b|classif|sensitive info|trainable/i),
        F('edisc', 'eDiscovery', null, /e-?discovery|content search|legal hold|review set/i),
        F('audit', 'Audit', 'f-monitor', /\baudit/i),
        F('irm', 'Insider Risk', null, /insider risk|adaptive protection/i),
        F('cc', 'Communication Compliance', null, /communication compliance/i),
        F('dlm', 'Rétention & Records', null, /retention|records management|data lifecycle|disposition|\bDLM\b/i),
        F('cm', 'Compliance Manager', 'f-compliance-mgr', /compliance manager|assessments?|regulat/i),
        F('dspm', 'DSPM & IA', 'f-copilot', /\bDSPM\b|\bAI\b|copilot|\bagents?\b|posture/i),
        F('gov', 'Gouvernance des données', null, /data (map|catalog|quality|governance|estate)|unified catalog|governance|lineage|\bscan/i),
        F('ib', 'Information Barriers', null, /information barriers?/i),
        F('enc', 'Chiffrement', 'f-keys', /encrypt|customer key|double key|\bOME\b|\bRMS\b/i)
      ] },
    { id: 'sharepoint', name: 'SharePoint', group: 'Microsoft 365', icon: 'sharepoint', color: '#03787c',
      svc: ['sharepoint online', 'sharepoint', 'sharepoint syntex', 'sharepoint premium'],
      re: /\b(sharepoint|syntex|viva connections)\b/i,
      features: [
        F('embedded', 'SharePoint Embedded', null, /embedded|containers?/i),
        F('premium', 'SharePoint Premium & Syntex', null, /premium|syntex|esignature|translation|autofill|content (processing|assembly)|archive/i),
        F('copilot', 'Copilot & agents', 'f-copilot', /copilot|\bagents?\b|\bAI\b/i),
        F('sharing', 'Partage & accès externe', null, /\bshar(e|es|ed|ing)\b|external|guests?|one-time passcode|\bOTP\b|\blinks?\b|\bB2B\b/i),
        F('search', 'Recherche', null, /search/i),
        F('sites', 'Sites, pages & actualités', null, /\bsites?\b|\bpages?\b|\bnews\b|\bhubs?\b|viva connections|brand|themes?|web parts?/i),
        F('lists', 'Listes & bibliothèques', null, /\blists?\b|librar(y|ies)|documents?|\bfiles?\b|versions?|metadata/i),
        F('admin', 'Administration & gouvernance', 'f-roles', /admin|governance|polic(y|ies)|restricted|\bSAM\b|storage|tenant|powershell|migration/i)
      ] },
    { id: 'exchange', name: 'Exchange Online & Outlook', group: 'Microsoft 365', icon: 'exchange', color: '#0f63b4',
      svc: ['exchange online', 'outlook', 'exchange'],
      re: /\b(exchange|outlook|mailbox(es)?|mail flow|transport rules?|smtp( auth)?|ews|basic auth(entication)?|distribution (lists?|groups?)|bookings)\b/i,
      features: [
        F('api', 'API, EWS & PowerShell', 'f-powershell', /\bEWS\b|powershell|cmdlets?|\bREST\b|\bgraph\b|\bAPI\b|\bIMAP\b|\bPOP\b|basic auth|SMTP AUTH|oauth|-credential/i),
        F('copilot', 'Copilot', 'f-copilot', /copilot|\bAI\b|\bagents?\b/i),
        F('outlook', 'Outlook', 'f-outlook', /outlook/i),
        F('flow', 'Flux de messagerie', null, /mail flow|transport|connectors?|routing|relay|alias|sending|\bsend\b|\bDMARC\b|\bDKIM\b|\bSPF\b|domains?|recipient limits?|throttl/i),
        F('mbx', 'Boîtes aux lettres & calendrier', null, /mailbox|calendar|\brooms?\b|resources?|archive|shared|distribution|\bgroups?\b|contacts?|bookings/i)
      ] },
    { id: 'onedrive', name: 'OneDrive', group: 'Microsoft 365', icon: 'onedrive', color: '#1279d4',
      svc: ['microsoft onedrive', 'onedrive for business', 'onedrive'],
      re: /\bonedrive\b/i,
      features: [
        F('copilot', 'Copilot', 'f-copilot', /copilot|\bAI\b|\bagents?\b/i),
        F('sync', 'Synchronisation', null, /\bsync|client|known folder|files on-demand|\bmac\b|windows/i),
        F('sharing', 'Partage', null, /\bshar(e|es|ed|ing)\b|\blinks?\b|external/i),
        F('storage', 'Stockage & sauvegarde', null, /storage|backup|archive|restore|quota|retention/i),
        F('admin', 'Administration', 'f-roles', /admin|polic(y|ies)|governance|migration|tenant/i)
      ] },
    { id: 'teams', name: 'Microsoft Teams', group: 'Microsoft 365', icon: 'teams', color: '#5b5fc7',
      svc: ['microsoft teams'],
      re: /\b(Microsoft Teams|Teams (Rooms|Phone|Premium|admin|meetings?|chats?|channels?|app|client|calling|webinars?|town halls?|devices?)|in Teams|Teams:)/,
      features: [
        F('copilot', 'Copilot & agents', 'f-copilot', /copilot|\bagents?\b|\bAI\b|facilitator/i),
        F('rooms', 'Teams Rooms & appareils', null, /\brooms\b|\bdevices?\b|displays?|panels?|headsets?|\bMTR\b/i),
        F('phone', 'Téléphonie', null, /phone|calling|\bcalls?\b|\bPSTN\b|voice|queues?|auto attendants?|voicemail/i),
        F('meetings', 'Réunions & événements', null, /meetings?|webinars?|town halls?|events?|recordings?|transcri|\blive\b|recap|breakout|lobby/i),
        F('chat', 'Chat & canaux', null, /chats?|channels?|messages?|posts?|reactions?|emoji|threads?|communities/i),
        F('apps', 'Applications & plateforme', null, /\bapps?\b|bots?|workflows?|\bSDK\b|\btabs?\b|extensions?/i),
        F('admin', 'Administration & sécurité', 'f-roles', /admin|polic(y|ies)|external access|federation|security|compliance|guests?|tenant|retention|powershell/i)
      ] },
    { id: 'm365', name: 'Suite Microsoft 365 & Copilot', group: 'Microsoft 365', icon: 'm365', color: '#c2410c',
      svc: ['microsoft 365 apps', 'microsoft 365 suite', 'microsoft 365 for the web', 'microsoft copilot (microsoft 365)', 'microsoft 365 copilot chat', 'microsoft 365 app', 'microsoft 365', 'planner', 'microsoft viva', 'microsoft forms', 'microsoft stream', 'project for the web', 'word', 'excel', 'powerpoint', 'onenote', 'microsoft 365 admin center', 'microsoft clipchamp', 'universal print', 'microsoft bookings', 'sway', 'microsoft loop', 'work iq'],
      re: /\b(microsoft 365 (apps|copilot|admin center|app|suite)|m365 copilot|copilot chat|office (2016|2019|2021|2024|ltsc)|excel|powerpoint|onenote|microsoft planner|planner:|viva|microsoft forms|microsoft loop|clipchamp|microsoft stream|microsoft word)\b/i,
      features: [
        F('copilot', 'Microsoft 365 Copilot', 'f-copilot', /copilot|\bagents?\b|work iq|researcher|analyst|\bAI\b/i, ['microsoft copilot (microsoft 365)', 'microsoft 365 copilot chat']),
        F('office', 'Applications Office', 'f-office-apps', /\bword\b|excel|powerpoint|onenote|office|apps for enterprise|\bLTSC\b|publisher|\baccess\b|visio/i, ['word', 'excel', 'powerpoint', 'onenote', 'microsoft 365 apps']),
        F('planner', 'Planner & Project', null, /planner|project/i, ['planner', 'project for the web']),
        F('viva', 'Viva', null, /viva|glint|engage|pulse/i, ['microsoft viva']),
        F('loop', 'Loop, Forms, Stream & Clipchamp', 'f-loop', /\bloop\b|forms|stream|clipchamp|whiteboard|sway/i, ['microsoft loop', 'microsoft forms', 'microsoft stream', 'microsoft clipchamp', 'sway']),
        F('edge', 'Microsoft Edge', null, /\bedge\b/i),
        F('admin', "Centre d'administration", 'f-roles', /admin|targeted release|tenant|message center|service health|reports?/i, ['microsoft 365 admin center'])
      ] },
    { id: 'pricing', name: 'Évolution des prix', group: 'Prix & licences', icon: 'pricing', color: '#0e7490', msOnly: true, summarySources: ['partner'],
      // Texte complet des annonces Partner Center : vocabulaire strictement tarifaire
      summaryRe: /\b(price|prices|pricing|price ?list|currency|exchange rates?|discount(s|ed)?|promotional pricing|usage-based billing|pay-as-you-go)\b/i,
      exclude: /\b(dynamics 365|business central|field service|supply chain)\b/i,
      svc: [],
      re: /\b(prices?|pricing|priced|tarif\w*|price lists?|currency|exchange rates?|usage-based billing|pay-as-you-go|metered billing|monthly billing|billing (changes?|model|plans?)|promo\w*|discount\w*|no additional cost|at no (extra|additional) cost|free of charge|now included|(is|are) included (as part of|in|with)|included at no)\b/i,
      features: [
        F('increase', 'Hausses & changements de prix', 'f-cost-alerts', /pric(e|ing) (increases?|rises?|uplift|adjustments?|alignment|changes?|updates?|precision)|pricing and packaging|prices? (will )?(increase|rise|change)|higher prices?|cost increase|new prices? (for|on)/i),
        F('included', 'Inclusions sans surcoût', 'f-savings', /now included|(is|are) included (as part of|in|with)|included at no|no additional cost|at no (extra|additional) cost|free of charge|\bfree\b/i),
        F('promo', 'Promotions & remises', 'f-marketplace', /promo\w*|discount\w*|incentive|offer (ends|extended)|limited-time/i),
        F('currency', 'Devises & taux de change', null, /currency|exchange rates?|local (price|currency)|harmoniz/i),
        F('billing', 'Facturation & usage', 'f-subscriptions', /usage-based|pay-as-you-go|metered|billing|monthly (billing|commitment|term)|annual (commitment|term)|consumption|spending limits?/i),
        F('newoffer', 'Nouvelles offres & tarifs', 'f-cost-analysis', /new (pricing|prices?|offers?|plans?|skus?)|introduc|launch|priced at|price lists?|pricing (for|of|details)/i),
        F('copilot', 'Copilot & IA', 'f-copilot', /copilot|\bagents?\b|\bAI\b/i)
      ] },
    { id: 'licensing', name: 'Licences Microsoft 365', group: 'Prix & licences', icon: 'licensing', color: '#a16207',
      svc: [], msOnly: true,
      // Dynamics 365 / Power Platform hors périmètre (« purchase order », « subscription billing »… y sont fonctionnels)
      exclude: /\b(dynamics 365|business central|power (apps|automate|bi|pages|platform)|dataverse|copilot studio|field service|supply chain)\b/i,
      re: /\b(licen[cs]\w*|skus?|pricing|prices?( change| increase| update)?|subscriptions? (plans?|changes?|renewal)|e[357]|business (premium|standard|basic)|frontline (worker )?licen\w*|add-ons?|trial licen\w*|new commerce|nce|billing|self-service purchase|pay-as-you-go|plan changes?)\b/i,
      features: [
        F('copilot', 'Licences Copilot', 'f-copilot', /copilot/i),
        F('enterprise', 'Plans Entreprise (E3/E5/E7)', null, /\bE[357]\b|enterprise|\bA[35]\b|\bG[35]\b/i),
        F('business', 'Plans Business', null, /business (premium|standard|basic)|\bSMB\b/i),
        F('frontline', 'Frontline (F1/F3)', null, /\bF[13]\b|frontline/i),
        F('price', 'Prix & facturation', null, /prices?|pricing|billing|commerce|purchas|\bNCE\b|pay-as-you-go|subscriptions?|renewal/i),
        F('addons', 'Add-ons & options', null, /add-ons?|\bsuite\b|plan 2|\bP2\b|premium/i),
        F('trial', 'Essais', null, /trials?/i)
      ] },
    { id: 'graph', name: 'Microsoft Graph', group: 'Développement', icon: 'graph', color: '#b4235a',
      svc: ['microsoft graph'], msOnly: true,
      re: /\b(microsoft graph|graph api|graph powershell|azure ad graph|msonline|azuread (powershell|module)|powershell module|ews api|apis?)\b/i,
      features: [
        F('tools', 'PowerShell, SDK & outils', 'f-powershell', /powershell|\bSDK\b|toolkit|explorer|\bCLI\b|msonline|azuread module/i),
        F('identity', 'Identité & accès', 'f-roles', /identity|access|\bauth|applications?|directory|\busers?\b|\bgroups?\b|service principal|entra/i),
        F('devices', 'Appareils & applications', 'f-devices', /devices?|intune|\bapps?\b|cloud pc|windows/i),
        F('security', 'Sécurité & conformité', 'f-security-baselines', /security|alerts?|incidents?|threat|compliance|ediscovery|purview|labels?|records/i),
        F('teamwork', 'Teams & communications', null, /teamwork|teams|chats?|channels?|meetings?|\bcalls?\b|communications|presence/i),
        F('files', 'Fichiers & sites', null, /\bfiles?\b|\bdrive|sharepoint|\bsites?\b|\blists?\b|onedrive|storage|containers?/i),
        F('mail', 'Messagerie & calendrier', null, /\bmail|calendar|outlook|contacts?|exchange|messages?/i),
        F('tasks', 'Tâches & plans', null, /tasks?|\bplans?\b|planner|to ?do/i),
        F('reports', 'Rapports & usage', null, /reports?|usage|insights|analytics/i)
      ] },
    { id: 'android', name: 'Android', group: 'Mobilité & OS', icon: 'android', color: '#2e7d32',
      svc: ['android'],
      re: /\bandroid\b/i,
      features: [
        F('enterprise', 'Android Enterprise & gestion', 'f-android-device', /enterprise|work profile|intune|managed|\bAOSP\b|zebra|dedicated|company portal|\bCOPE\b|\bMDM\b/i),
        F('msapps', 'Applications Microsoft', null, MS_APPS),
        F('security', 'Sécurité', 'f-security-baselines', /security|bulletin|\bpatch|play integrity|privacy|vulnerab/i),
        F('versions', 'Versions Android', null, /android \d+|release|\bQPR\b|beta|fin de support|disponible|version/i)
      ] },
    { id: 'ios', name: 'iOS / iPadOS', group: 'Mobilité & OS', icon: 'ios', color: '#4b5563',
      svc: ['ios', 'ipados'],
      re: /\b(iOS|iPadOS|iPhone|iPad)\b/,
      features: [
        F('mgmt', 'Gestion (MDM / Intune)', 'f-enrollment', /intune|\bMDM\b|\bADE\b|enroll|declarative|\bDDM\b|supervis|managed|\bVPP\b|apple business|company portal/i),
        F('msapps', 'Applications Microsoft', null, MS_APPS),
        F('security', 'Mises à jour de sécurité', 'f-security-baselines', /sécurité|securite|security|\bCVE/i),
        F('versions', 'Versions iOS / iPadOS', null, /(iOS|iPadOS) \d|beta|disponible|fin de support|release/i)
      ] },
    { id: 'macos', name: 'macOS', group: 'Mobilité & OS', icon: 'macos', color: '#374151',
      svc: ['macos'],
      re: /\b(macOS|Mac|MacBook)\b/,
      features: [
        F('mgmt', 'Gestion (MDM / Intune)', 'f-enrollment', /intune|\bMDM\b|platform sso|enroll|declarative|\bDDM\b|filevault|managed|gatekeeper|full disk access|system extension/i),
        F('msapps', 'Applications Microsoft', null, MS_APPS),
        F('security', 'Mises à jour de sécurité', 'f-security-baselines', /sécurité|securite|security|\bCVE/i),
        F('versions', 'Versions macOS', null, /macOS( \w+)? \d|beta|disponible|fin de support|release/i)
      ] },
    { id: 'applebusiness', name: 'Apple Business', group: 'Mobilité & OS', icon: 'applebusiness', color: '#111827',
      svc: ['apple business'],
      re: /\b(Apple Business( Manager)?|Apple School Manager|ABM|Automated Device Enrollment|ADE|Volume Purchase|VPP|Managed Apple (IDs?|Accounts?)|declarative device management|DDM|Platform SSO|User Enrollment|Account-driven)\b/,
      features: [
        F('ade', 'Inscription automatisée (ADE)', 'f-enrollment', /automated device enrollment|\bADE\b|enrollment|account-driven/i),
        F('vpp', 'Apps & VPP', 'f-app-protection', /\bVPP\b|volume purchase|apps and books|\bapps?\b/i),
        F('accounts', 'Comptes Apple gérés', null, /managed apple (ids?|accounts?)|federat/i),
        F('ddm', 'DDM & Platform SSO', 'f-device-config', /declarative|\bDDM\b|platform sso|\bPSSO\b/i),
        F('abm', 'Apple Business / School Manager', null, /apple business|apple school|\bABM\b|\bASM\b/i)
      ] }
  ];
  const PROD = Object.fromEntries(PRODUCTS.map(p => [p.id, p]));

  // Publications des organismes (ANSSI, CNIL en français ; CIS en anglais) : mots-clés bilingues par produit
  const ORG_RE = {
    entra: /\b(entra|azure|active directory|annuaires?|authentification|multifacteur|mfa|identités?)\b/i,
    intune: /\b(intune|endpoint manager|gestion des terminaux|mdm)\b/i,
    windows: /\b(windows|active directory|postes? de travail|postes clients|hyper-v|bitlocker|kerberos|ntlm|produits microsoft)\b/i,
    defender: /\bdefender\b/i,
    sentinel: /\bsentinel\b/i,
    purview: /\b(purview|information protection)\b/i,
    sharepoint: /\bsharepoint\b/i,
    exchange: /\b(exchange|outlook|messagerie)\b/i,
    onedrive: /\bonedrive\b/i,
    teams: /\bteams\b/i,
    m365: /\b(microsoft 365|office 365|m365|microsoft office|office|edge|copilot|word|excel|powerpoint|produits microsoft)\b/i,
    graph: /\bmicrosoft graph\b/i,
    android: /\b(android|pixel|t[ée]l[ée]phones? mobiles?|smartphones?|ordiphones?)\b/i,
    ios: /\b(ios|ipados|iphone|ipad|produits apple|t[ée]l[ée]phones? mobiles?|smartphones?|ordiphones?)\b/i,
    macos: /\b(macos|mac os|produits apple|safari)\b/i,
    applebusiness: /\b(apple business|apple school|abm)\b/i
  };
  // CVE du MSRC (titre + composant Microsoft, en anglais)
  const MSRC_RE = {
    entra: /\b(entra|azure ad|azure active directory|active directory|authenticator|ad fs|adfs)\b/i,
    intune: /\b(intune|company portal|endpoint manager|configuration manager)\b/i,
    windows: /\b(windows|win32k?|role:|hyper-v|bitlocker|kerberos|ntlm|lsass|remote desktop|active directory)\b/i,
    defender: /\bdefender\b/i,
    sentinel: /\bsentinel\b/i,
    purview: /\bpurview\b/i,
    sharepoint: /\bsharepoint\b/i,
    exchange: /\b(exchange|outlook)\b/i,
    onedrive: /\bonedrive\b/i,
    teams: /\bteams\b/i,
    m365: /\b(office|word|excel|powerpoint|onenote|visio|microsoft access|publisher|edge|copilot|microsoft 365|bookings|loop|forms|planner)\b/i,
    graph: /\bgraph\b/i,
    android: /\bandroid\b/i,
    ios: /\bios\b/i,
    macos: /\b(mac|macos)\b/i
  };
  const ORG_SOURCES = ['msrc', 'cnil', 'anssi', 'cis'];
  const OTHER = { id: 'other', name: 'Autres', icon: null };
  const featureOf = (pid, fid) => fid === 'other' ? OTHER : (PROD[pid] && PROD[pid].features.find(f => f.id === fid)) || null;

  const SOURCES = [
    { id: 'tenant', name: 'Mon tenant' },
    { id: 'mc', name: 'Message Center (public)' },
    { id: 'roadmap', name: 'Roadmap M365' },
    { id: 'learn', name: "What's new (Learn)" },
    { id: 'blog', name: 'Blogs' },
    { id: 'graph', name: 'Graph changelog' },
    { id: 'partner', name: 'Partner Center' },
    { id: 'msrc', name: 'MSRC' },
    { id: 'cnil', name: 'CNIL' },
    { id: 'anssi', name: 'ANSSI' },
    { id: 'cis', name: 'CIS' },
    { id: 'os', name: 'Apple / Android / OS' },
    { id: 'lifecycle', name: 'Cycle de vie Microsoft' }
  ];
  const sourceGroup = s => (s === 'apple' || s === 'android' || s === 'eol') ? 'os' : s;

  const PERIODS = [
    { id: '1', name: "Aujourd'hui" }, { id: '7', name: '7 jours' }, { id: '30', name: '30 jours' },
    { id: '90', name: '3 mois' }, { id: '365', name: '12 mois' }, { id: 'all', name: 'Tout' }, { id: 'custom', name: 'Personnalisée' }
  ];
  // Tranches d'échéance (onglet Fins de vie) : combinables, comme les sources
  const HORIZONS = [
    { id: 'past', name: 'Passées (6 mois)' }, { id: 'm3', name: 'Moins de 3 mois' }, { id: 'm12', name: '3 à 12 mois' },
    { id: 'later', name: 'Plus de 12 mois' }, { id: 'nodate', name: 'Date non précisée' }
  ];

  const RETIRE_RE = /\b(retir(e|es|ed|ing|ement|ements)|deprecat\w*|end of (support|life|servicing|sale)|end-of-(life|support)|no longer (be )?(supported|available)|sunset\w*|discontinu\w*|phas(e|ing) out|will be removed|being removed|removal of|removing|will stop (working|supporting)|reaches end|fin de (support|vie))\b/i;

  const MONTHS = { jan: 0, january: 0, feb: 1, february: 1, mar: 2, march: 2, apr: 3, april: 3, may: 4, jun: 5, june: 5, jul: 6, july: 6, aug: 7, august: 7, sep: 8, sept: 8, september: 8, oct: 9, october: 9, nov: 10, november: 10, dec: 11, december: 11 };
  const MON = 'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const DATE_RES = [
    { re: new RegExp('\\b(' + MON + ')\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(20\\d\\d)\\b', 'gi'), f: m => [m[3], MONTHS[m[1].toLowerCase()], +m[2], 'day'] },
    { re: new RegExp('\\b(\\d{1,2})\\s+(' + MON + ')\\.?,?\\s+(20\\d\\d)\\b', 'gi'), f: m => [m[3], MONTHS[m[2].toLowerCase()], +m[1], 'day'] },
    { re: /\b(20\d\d)-(\d\d)-(\d\d)\b/g, f: m => [m[1], +m[2] - 1, +m[3], 'day'] },
    { re: new RegExp('\\b(' + MON + ')\\.?,?\\s+(20\\d\\d)\\b', 'gi'), f: m => [m[2], MONTHS[m[1].toLowerCase()], 1, 'month'] }
  ];

  // ------------------------------------------------------------------ État
  const store = (k, v) => { try { if (v === undefined) return JSON.parse(localStorage.getItem('veille.' + k)); localStorage.setItem('veille.' + k, JSON.stringify(v)); } catch (e) { return null; } };
  const defaults = () => ({ period: '30', from: '', to: '', dl: HORIZONS.map(h => h.id), sources: SOURCES.map(s => s.id), actionOnly: false, retireOnly: false, groupBy: 'feature', msrcCritical: true, q: '' });
  let state = Object.assign(defaults(), store('state2') || {});
  state.q = '';
  // Une source ajoutée depuis la dernière visite est activée par défaut
  const knownSources = state.seenSources || ['mc', 'roadmap', 'learn', 'blog', 'graph', 'os', 'lifecycle'];
  SOURCES.forEach(s => { if (!knownSources.includes(s.id) && !state.sources.includes(s.id)) state.sources.push(s.id); });
  state.seenSources = SOURCES.map(s => s.id);
  // Nouveau fonctionnement des filtres de sources (bouton « Toutes ») : on repart de toutes les sources une fois
  if (!state.srcV2) { state.sources = SOURCES.map(s => s.id); state.srcV2 = true; }
  // Ancien filtre d'échéances (horizon + « inclure les passées ») remplacé par des tranches combinables
  if (!Array.isArray(state.dl) || !state.dl.length) state.dl = HORIZONS.map(h => h.id);
  delete state.horizon; delete state.showPast;
  let tab = 'news', product = null, feature = null;
  let limit = PAGE;
  let ALL = [];
  let mcRaw = null, mcInfo = { live: false, at: null, error: null };
  let eolRaw = {}, eolInfo = { live: false, at: null, error: null };
  const snapshot = window.SNAPSHOT || { items: [], report: [], generated: null };
  let TENANT = window.TENANT || null;
  // Actualisation du tenant possible uniquement via le serveur local (serve.ps1 / Lancer-Veille.cmd), qui détient le certificat
  const IS_LOCAL_SERVER = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
  // - serveur local : relance la collecte (api/tenant)
  // - site hébergé (Azure Web App) : relit data/tenant.js, régénéré par GitHub Actions à chaque déploiement
  const TENANT_API = IS_LOCAL_SERVER ? 'api/tenant' : (/^https?:$/.test(location.protocol) ? 'data/tenant.js' : null);
  const TENANT_REFRESH_MS = (IS_LOCAL_SERVER ? 5 : 10) * 60 * 1000;
  let tenantInfo = { loading: false, live: false, error: null };

  const $ = s => document.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDay = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
  const fmtShort = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  const fmtMonth = d => d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const fmtTime = d => d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const toDate = s => { if (!s) return null; const d = new Date(s); return isNaN(d) ? null : d; };
  const hashFor = (t, p, f) => '#' + t + (p ? '/' + p + (f ? '/' + f : '') : '');

  function iconHtml(name, color, label, cls) {
    if (name) return '<img class="' + (cls || 'ico') + '" src="icons/' + esc(name) + '.svg" alt="" decoding="async">';
    return '<span class="' + (cls || 'ico') + ' dot" style="--c:' + (color || 'var(--muted)') + '">' + esc((label || '?').replace(/^(Microsoft |Defender for )/, '').charAt(0)) + '</span>';
  }

  // ------------------------------------------------------------------ Normalisation
  function matchProducts(it) {
    const svc = it.svcLower;
    const ms = !['apple', 'android'].includes(it.source);
    const out = [];
    if (it.kind === 'org') {
      const table = it.source === 'msrc' ? MSRC_RE : ORG_RE;
      const text = it.source === 'msrc' ? it.title + ' ' + ((it.tags || [])[2] || '') : it.title;
      const found = PRODUCTS.filter(p => table[p.id] && table[p.id].test(text)).map(p => p.id);
      // CNIL : collecte déjà limitée aux sujets Microsoft 365 → rattachée à la suite Microsoft 365
      if (it.source === 'cnil' && !found.includes('m365')) found.unshift('m365');
      return found;
    }
    for (const p of PRODUCTS) {
      if (p.msOnly && !ms) continue;
      if (p.exclude && p.exclude.test(it.title)) continue;
      if (p.svc.some(s => svc.includes(s)) || p.re.test(it.title) ||
        (p.summarySources && p.summarySources.includes(it.source) && (p.summaryRe || p.re).test(it.summary || ''))) out.push(p.id);
    }
    return out;
  }

  // Tags génériques du Message Center / Roadmap : ils ne disent rien de la fonctionnalité
  const GENERIC_TAG = /^(admin impact|user impact|new feature|feature update|updated message|general availability|worldwide.*|gcc.*|dod|preview|retirement|targeted release|rolling out|launched|in development|current channel|cancelled|deferred feature|gdpr|data privacy|version|fin de support|beta|v1\.0)$/i;

  function matchFeatures(p, it) {
    const text = it.title + ' | ' + (it.tags || []).filter(t => !GENERIC_TAG.test(t)).join(' | ');
    let list = p.features.filter(f => f.svc.some(s => it.svcLower.includes(s)) || f.re.test(text)).map(f => f.id);
    if (!list.length && it.summary) list = p.features.filter(f => f.re.test(it.summary)).map(f => f.id);
    return list.length ? list : ['other'];
  }

  function extractDeadline(text, published) {
    if (!text) return null;
    const min = published ? published.getTime() - 7 * DAY : 0;
    const max = (published ? published.getTime() : Date.now()) + 5 * 365 * DAY;
    const found = [];
    const used = [];
    for (const { re, f } of DATE_RES) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        if (used.some(([a, b]) => m.index < b && m.index + m[0].length > a)) continue;
        used.push([m.index, m.index + m[0].length]);
        const [y, mo, d, precision] = f(m);
        if (mo === undefined) continue;
        const dt = new Date(+y, mo, d);
        if (dt.getTime() >= min && dt.getTime() <= max) found.push({ date: dt, precision });
      }
    }
    if (!found.length) return null;
    found.sort((a, b) => b.date - a.date);
    return found[0];
  }

  function finalize(it) {
    it.svcLower = (it.services || []).map(s => String(s).toLowerCase().trim());
    it.products = matchProducts(it);
    it.feat = {};
    // Publications des organismes : rattachées au produit seulement (pas aux fonctionnalités Microsoft)
    for (const pid of it.products) it.feat[pid] = it.kind === 'org' ? ['other'] : matchFeatures(PROD[pid], it);
    const tagsTxt = (it.tags || []).join(' ');
    const retireTag = (it.tags || []).some(t => /^(retirement|deprecated)$/i.test(t));
    it.retire = it.kind !== 'org' && (it.kind === 'lifecycle' || retireTag || RETIRE_RE.test(it.title) ||
      ((it.category === 'planForChange' || /plan for change/i.test(tagsTxt)) && RETIRE_RE.test(it.summary || '')));
    if (it.retire && !it.deadline) {
      const dl = extractDeadline(it.title, it.date) || extractDeadline(it.summary, it.date);
      if (dl) { it.deadline = dl.date; it.precision = dl.precision; }
    }
    if (it.deadline && !it.precision) it.precision = 'day';
    it.search = (it.title + ' ' + (it.summary || '') + ' ' + (it.ref || '') + ' ' + (it.services || []).join(' ') + ' ' + tagsTxt).toLowerCase();
    return it;
  }

  function fromMc(r) {
    const isRm = r.Source === 'roadmap';
    const num = String(r.Id || '').replace(/^\D+/, '');
    const tags = r.Tags || [];
    const status = isRm ? (tags.find(t => /^(In development|Rolling out|Launched|Cancelled)$/i.test(t)) || '') : '';
    return {
      id: 'mc|' + r.Id, ref: r.Id,
      source: isRm ? 'roadmap' : 'mc',
      label: isRm ? 'Roadmap M365' : 'Message Center',
      title: r.Title || r.Id,
      url: r.Url || ('https://mc.merill.net/message/' + r.Id),
      official: isRm ? 'https://www.microsoft.com/microsoft-365/roadmap?id=' + num : 'https://admin.microsoft.com/Adminportal/Home#/MessageCenter/:/messages/' + r.Id,
      date: toDate(r.StartDateTime), updated: toDate(r.LastModifiedDateTime),
      summary: r.Summary || '', tags, services: r.Services || [],
      category: r.Category, major: !!r.IsMajorChange, status,
      kind: isRm ? 'roadmap' : 'news'
    };
  }

  function fromSnapshot(r) {
    return {
      id: r.id, source: r.source, label: r.label, title: r.title, url: r.url,
      date: toDate(r.date), deadline: toDate(r.deadline), summary: (r.summary || '').replace(/^Publie dans/, 'Publié dans'),
      tags: r.tags || [], services: r.services || [], kind: r.kind,
      orgType: r.kind === 'org' ? (r.tags || [])[0] : null
    };
  }

  const EOL_SVC = { ios: 'iOS', ipados: 'iPadOS', macos: 'macOS', android: 'Android', windows: 'Windows' };
  function fromEol() {
    const out = [];
    const now = Date.now();
    for (const p of EOL_PRODUCTS) {
      const res = eolRaw[p] && eolRaw[p].result;
      if (!res) continue;
      for (const r of res.releases || []) {
        const label = /^(windows|ios|ipados|macos|android)/i.test(r.label) ? r.label : (EOL_SVC[p] + ' ' + r.label);
        const page = (res.links && res.links.html) || ('https://endoflife.date/' + p);
        const eol = toDate(r.eolFrom);
        if (eol && eol.getTime() > now - 400 * DAY && eol.getTime() < now + 3 * 365 * DAY) {
          out.push({ id: 'eol|' + p + '|' + r.name, source: 'eol', label: 'endoflife.date', title: label + ' — fin de support', url: page,
            date: null, deadline: eol, precision: 'day', summary: 'Fin de support / de mises à jour de sécurité pour ' + label + (r.latest ? '. Dernière version : ' + r.latest.name + '.' : '.'),
            tags: ['Fin de support'], services: [EOL_SVC[p]], kind: 'lifecycle' });
        }
        if (p !== 'windows' && r.latest && r.latest.date) {
          const d = toDate(r.latest.date);
          if (d && d.getTime() > now - 365 * DAY) {
            out.push({ id: 'eolrel|' + p + '|' + r.latest.name, source: 'eol', label: 'endoflife.date', title: EOL_SVC[p] + ' ' + r.latest.name + ' disponible', url: r.latest.link || page,
              date: d, summary: 'Dernière version de la branche ' + label + '.', tags: ['Version'], services: [EOL_SVC[p]], kind: 'release' });
          }
        }
        if (p === 'windows' && r.releaseDate) {
          const d = toDate(r.releaseDate);
          if (d && d.getTime() > now - 365 * DAY) {
            out.push({ id: 'eolwin|' + r.name, source: 'eol', label: 'endoflife.date', title: label + ' publiée', url: page, date: d,
              summary: 'Nouvelle version de fonctionnalités Windows (' + label + ').', tags: ['Version'], services: ['Windows'], kind: 'release' });
          }
        }
      }
    }
    return out;
  }

  // Message Center de votre tenant (data/tenant.js, collecté via Microsoft Graph)
  function fromTenant(m) {
    return {
      id: 'tn|' + m.id, ref: m.id, source: 'tenant', label: 'Mon tenant',
      title: String(m.title || m.id).replace(/^\(Updated\)\s*/i, ''),
      url: 'https://admin.microsoft.com/Adminportal/Home#/MessageCenter/:/messages/' + m.id,
      date: toDate(m.start), updated: toDate(m.modified),
      summary: m.body || '', tags: m.tags || [], services: m.services || [],
      category: m.category, major: !!m.major, kind: 'news',
      deadline: toDate(m.actionBy), precision: m.actionBy ? 'day' : undefined, actionBy: !!m.actionBy,
      wasUpdated: /^\(Updated\)/i.test(m.title || '')
    };
  }

  function rebuild() {
    const tenantMsgs = (TENANT && TENANT.messages) || [];
    const inTenant = new Set(tenantMsgs.map(m => m.id));
    // Un message présent dans votre tenant remplace sa copie de l'archive publique
    const mc = (mcRaw || []).filter(r => !inTenant.has(r.Id)).map(fromMc);
    const snap = (snapshot.items || []).map(fromSnapshot);
    ALL = tenantMsgs.map(fromTenant).concat(mc, snap, fromEol()).map(finalize).filter(it => it.products.length);
    markNew();
    render();
  }

  // ------------------------------------------------------------------ « Nouveau depuis ma dernière visite »
  // Chaque élément reçoit une date de première apparition (mémorisée dans le navigateur).
  // Est « nouveau » ce qui est apparu après le début de la visite précédente.
  const keyOf = it => it.ref || it.id;
  let prevVisit = 0, firstSeen = null;
  (function initVisit() {
    try {
      const s = sessionStorage.getItem('veille.prevVisit');
      if (s !== null) prevVisit = +s;
      else {
        prevVisit = +(store('lastVisit') || 0);
        sessionStorage.setItem('veille.prevVisit', String(prevVisit));
        store('lastVisit', Date.now());
      }
    } catch (e) { prevVisit = 0; }
    firstSeen = store('firstSeen');
  })();

  function markNew() {
    const nowMin = Math.floor(Date.now() / 60000);
    const firstRun = !firstSeen;
    if (firstRun) firstSeen = {};
    let changed = firstRun;
    for (const it of ALL) {
      const k = keyOf(it);
      if (firstSeen[k] === undefined) { firstSeen[k] = firstRun ? 0 : nowMin; changed = true; }
      it.isNew = prevVisit > 0 && firstSeen[k] * 60000 > prevVisit;
    }
    if (changed) store('firstSeen', firstSeen);
  }

  function markAllSeen() {
    prevVisit = Date.now();
    try { sessionStorage.setItem('veille.prevVisit', String(prevVisit)); } catch (e) { }
    store('lastVisit', prevVisit);
    ALL.forEach(it => { it.isNew = false; });
    state.newOnly = false;
    save();
    render();
  }

  // ------------------------------------------------------------------ Filtres
  function inPeriod(d) {
    if (state.period === 'all') return true;
    if (!d) return false;
    if (state.period === 'custom') {
      const f = state.from ? new Date(state.from + 'T00:00:00') : null;
      const t = state.to ? new Date(state.to + 'T23:59:59') : null;
      return (!f || d >= f) && (!t || d <= t);
    }
    const days = +state.period;
    const since = days === 1 ? startOfDay(new Date()) : new Date(Date.now() - days * DAY);
    return d >= since;
  }

  // level : 'all' = tous les filtres, 'product' = sans produit ni fonctionnalité, 'feature' = sans fonctionnalité
  function baseFilter(it, level) {
    if (level !== 'product' && product) {
      if (!it.products.includes(product)) return false;
      if (level !== 'feature' && feature && !it.feat[product].includes(feature)) return false;
    }
    if (tab !== 'roadmap' && !state.sources.includes(sourceGroup(it.source))) return false;
    if (state.newOnly && !it.isNew) return false;
    if (state.q) {
      const words = state.q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.every(w => it.search.includes(w))) return false;
    }
    return true;
  }

  // Tranche d'échéance d'un retrait (null = hors périmètre : échu depuis plus de 6 mois, ou annonce sans date de plus d'un an)
  function deadlineBucket(it) {
    const now = Date.now(), today = startOfDay(new Date()).getTime();
    if (!it.deadline) return it.date && it.date.getTime() > now - 365 * DAY ? 'nodate' : null;
    const t = it.deadline.getTime();
    if (t < today) return t >= now - 180 * DAY ? 'past' : null;
    if (t < now + 90 * DAY) return 'm3';
    if (t < now + 365 * DAY) return 'm12';
    return 'later';
  }

  function tabFilter(it) {
    if (tab === 'news') {
      if (it.kind === 'lifecycle' || it.kind === 'org') return false;
      if (!inPeriod(it.date)) return false;
      if (state.actionOnly && !(it.category === 'planForChange' || it.major || it.retire || it.actionBy)) return false;
      if (state.retireOnly && !it.retire) return false;
      return true;
    }
    if (tab === 'retire') {
      if (!it.retire) return false;
      const b = deadlineBucket(it);
      return !!b && state.dl.includes(b);
    }
    if (tab === 'roadmap') return it.source === 'roadmap' && inPeriod(it.date);
    if (tab === 'org') {
      if (it.kind !== 'org' || !inPeriod(it.date)) return false;
      if (state.msrcCritical && it.source === 'msrc' && !(it.tags[1] === 'Critical' || it.tags.includes('Exploitee'))) return false;
      return true;
    }
    if (tab === 'os') return (it.kind === 'release' || it.source === 'apple' || it.source === 'android') && it.date && it.date.getTime() > Date.now() - 120 * DAY;
    return false;
  }

  const visible = () => ALL.filter(it => baseFilter(it, 'all') && tabFilter(it));

  // ------------------------------------------------------------------ Barre produits & menu latéral
  function productCounts() {
    const c = { _all: 0, _new: {} };
    if (tab === 'health') {
      // Onglet État des services : nombre d'incidents / avis en cours par produit
      for (const i of activeIssues()) { c._all++; for (const p of issueProducts(i)) c[p] = (c[p] || 0) + 1; }
      const winOpenCount = (snapshot.windowsIssues || []).filter(w => !/^Resolved/i.test(w.status)).length;
      c.windows = (c.windows || 0) + winOpenCount;
      c._all += winOpenCount;
      return c;
    }
    for (const it of ALL) {
      if (!baseFilter(it, 'product') || !tabFilter(it)) continue;
      c._all++;
      for (const p of it.products) { c[p] = (c[p] || 0) + 1; if (it.isNew) c._new[p] = (c._new[p] || 0) + 1; }
      if (it.isNew) c._new._all = (c._new._all || 0) + 1;
    }
    return c;
  }

  // Nouveaux éléments par onglet (pastilles de la barre d'onglets), hors filtre produit
  function newCountsByTab() {
    const saved = tab, out = {};
    for (const t of ['news', 'retire', 'roadmap', 'org']) {
      tab = t;
      out[t] = ALL.filter(it => it.isNew && tabFilter(it)).length;
    }
    tab = saved;
    return out;
  }

  function featureCounts() {
    const c = { _all: 0 };
    if (!product) return c;
    for (const it of ALL) {
      if (!baseFilter(it, 'feature') || !tabFilter(it)) continue;
      c._all++;
      for (const f of it.feat[product]) c[f] = (c[f] || 0) + 1;
    }
    return c;
  }

  // Menu en accordéon : un seul produit déplié à la fois ; recliquer sur le produit ouvert revient à « Tout voir »
  let lastOpen = null;
  function renderSidebar(counts) {
    const CHEVRON = '<svg class="chev" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M9 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const nw = n => n ? '<span class="nw" title="' + n + ' nouveau(x) depuis votre dernière visite">+' + n + '</span>' : '';
    let html = '<a class="prod all' + (!product ? ' on' : '') + '" href="' + hashFor(tab) + '"><span class="ico grid" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="nm">Tout voir</span>' + nw(counts._new._all) + '<span class="ct">' + (counts._all || 0) + '</span></a>';
    let group = '';
    const fc = product ? featureCounts() : null;
    for (const p of PRODUCTS) {
      if (p.group !== group) { group = p.group; html += '<div class="group-title">' + esc(group) + '</div>'; }
      const open = product === p.id;
      html += '<div class="acc' + (open ? ' open' : '') + '">' +
        '<a class="prod head' + (open ? ' on' : '') + '" href="' + (open ? hashFor(tab) : hashFor(tab, p.id)) + '" aria-expanded="' + open + '" title="' + (open ? 'Replier' : 'Déplier ' + esc(p.name)) + '">' +
        iconHtml(p.icon) + '<span class="nm">' + esc(p.name) + '</span>' + nw(counts._new[p.id]) + '<span class="ct">' + (counts[p.id] || 0) + '</span>' + CHEVRON + '</a>';
      if (open && tab !== 'org' && tab !== 'health') {
        html += '<div class="feats' + (lastOpen !== p.id ? ' anim' : '') + '">' +
          '<a class="prod feat' + (!feature ? ' on' : '') + '" href="' + hashFor(tab, p.id) + '"><span class="nm">Toutes les fonctionnalités</span><span class="ct">' + (fc._all || 0) + '</span></a>';
        for (const f of p.features.concat(OTHER)) {
          const n = fc[f.id] || 0;
          if (f.id === 'other' && !n) continue;
          html += '<a class="prod feat' + (feature === f.id ? ' on' : '') + (n ? '' : ' zero') + '" href="' + hashFor(tab, p.id, f.id) + '">' + iconHtml(f.icon, p.color, f.name) +
            '<span class="nm">' + esc(f.name) + '</span><span class="ct">' + n + '</span></a>';
        }
        html += '</div>';
      }
      html += '</div>';
    }
    const side = $('#sidebar');
    const keep = side.scrollTop;
    $('#sideContent').innerHTML = html;
    side.scrollTop = keep;
    // Produit nouvellement ouvert : le ramener dans la zone visible du menu
    if (product && lastOpen !== product) {
      const head = side.querySelector('.acc.open');
      if (head) {
        const top = head.offsetTop - side.offsetTop, bottom = top + head.offsetHeight;
        if (top < side.scrollTop || bottom > side.scrollTop + side.clientHeight) side.scrollTop = Math.max(0, top - 60);
      }
    }
    lastOpen = product;
  }

  // ------------------------------------------------------------------ Filtres (rendu)
  // Sources proposées dans l'onglet courant
  function tabSources() {
    return SOURCES.filter(s => tab === 'org' ? ORG_SOURCES.includes(s.id) : !ORG_SOURCES.includes(s.id) && (tab === 'retire' || s.id !== 'lifecycle'));
  }

  function chip(id, name, on, extra) {
    return '<button class="chip' + (on ? ' on' : '') + '" data-v="' + esc(id) + '" aria-pressed="' + on + '">' + esc(name) + (extra || '') + '</button>';
  }

  function renderFilters() {
    $('#periodChips').innerHTML = PERIODS.map(p => chip(p.id, p.name, state.period === p.id)).join('');
    $('#customRange').hidden = state.period !== 'custom';
    $('#from').value = state.from; $('#to').value = state.to;
    // Tranches d'échéance : « Toutes » actif tant qu'aucune tranche n'est choisie (comptes selon les autres filtres)
    const dlCount = {};
    if (tab === 'retire') {
      for (const it of ALL) {
        if (!it.retire || !baseFilter(it, 'all')) continue;
        const b = deadlineBucket(it); if (b) dlCount[b] = (dlCount[b] || 0) + 1;
      }
    }
    const dlAll = HORIZONS.every(h => state.dl.includes(h.id));
    $('#horizonChips').innerHTML = chip('all', 'Toutes', dlAll, '<span class="n">' + HORIZONS.reduce((n, h) => n + (dlCount[h.id] || 0), 0) + '</span>') +
      HORIZONS.map(h => chip(h.id, h.name, !dlAll && state.dl.includes(h.id), '<span class="n">' + (dlCount[h.id] || 0) + '</span>')).join('');
    const srcCount = {};
    for (const it of ALL) {
      if (!tabFilter(it) || (product && !it.products.includes(product)) || (product && feature && !it.feat[product].includes(feature))) continue;
      const g = sourceGroup(it.source); srcCount[g] = (srcCount[g] || 0) + 1;
    }
    // « Toutes » actif tant qu'aucune source n'est choisie ; sinon seules les sources choisies sont surlignées
    const srcList = tabSources();
    const allOn = srcList.every(s => state.sources.includes(s.id));
    const total = srcList.reduce((n, s) => n + (srcCount[s.id] || 0), 0);
    $('#sourceChips').innerHTML = chip('all', 'Toutes', allOn, '<span class="n">' + total + '</span>') +
      srcList.map(s => chip(s.id, s.name, !allOn && state.sources.includes(s.id), '<span class="n">' + (srcCount[s.id] || 0) + '</span>')).join('');
    $('#flagChips').innerHTML = tab === 'org'
      ? '<span class="seg-label">Vulnérabilités MSRC :</span>' + chip('msrc-crit', 'Critiques & exploitées', state.msrcCritical) + chip('msrc-all', 'Toutes', !state.msrcCritical)
      : chip('action', 'Action requise / changement à prévoir', state.actionOnly) + chip('retire', 'Retraits & dépréciations uniquement', state.retireOnly);
    $('#periodRow').hidden = tab === 'retire' || tab === 'os';
    $('#horizonRow').hidden = tab !== 'retire';
    $('#sourceRow').hidden = tab === 'os' || tab === 'roadmap';
    $('#flagRow').hidden = tab !== 'news' && tab !== 'org';
    document.querySelector('.filters').hidden = tab === 'os' || tab === 'health';
    document.querySelector('.result-bar').hidden = tab === 'os' || tab === 'health';
    renderNewBar();
    const gt = $('#groupToggle');
    gt.hidden = !(product && !feature && tab === 'news');
    gt.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.g === state.groupBy));
  }

  // Bandeau « N nouveaux depuis votre dernière visite » (onglets de liste)
  function renderNewBar() {
    const bar = $('#newBar');
    if (tab === 'os' || tab === 'health' || !prevVisit) { bar.hidden = true; return; }
    const saved = state.newOnly;
    state.newOnly = false;
    const n = ALL.filter(it => it.isNew && baseFilter(it, 'all') && tabFilter(it)).length;
    state.newOnly = saved;
    if (!n && !saved) { bar.hidden = true; return; }
    const since = new Date(prevVisit);
    bar.hidden = false;
    bar.innerHTML = '<span class="nb-dot" aria-hidden="true"></span><span><strong>' + n + ' nouveauté' + (n > 1 ? 's' : '') + '</strong> depuis votre dernière visite (' + fmtShort(since) + ' à ' + fmtTime(since) + ')</span>' +
      '<button class="chip' + (saved ? ' on' : '') + '" data-new="only">' + (saved ? 'Afficher tout' : 'Voir uniquement les nouveautés') + '</button>' +
      '<button class="link-btn" data-new="seen">Tout marquer comme vu</button>';
  }

  // ------------------------------------------------------------------ Éléments
  function crumbs(it) {
    const order = product ? [product].concat(it.products.filter(p => p !== product)) : it.products;
    const parts = order.slice(0, 3).map(pid => {
      const f = featureOf(pid, it.feat[pid][0]);
      return '<a href="' + hashFor(tab, pid) + '">' + esc(PROD[pid].name) + '</a>' +
        (f && f.id !== 'other' ? '<span class="sep">›</span><a class="tag" href="' + hashFor(tab, pid, f.id) + '">' + esc(f.name) + '</a>' : '');
    });
    return '<div class="crumbs">' + parts.join('<span class="sep dot">·</span>') + '</div>';
  }

  const CAT = { planForChange: ['Changement à prévoir', 'plan'], preventOrFixIssue: ['Prévenir / corriger', 'plan'], stayInformed: ['Pour information', ''] };
  const ORG_TYPE = { Guide: ['Guide', 'major'], Actualite: ['Actualité', ''], Benchmark: ['Benchmark', 'ok'] };
  const SEVERITY = { Critical: ['Critique', 'deadline'], Important: ['Importante', 'retire'], Moderate: ['Modérée', 'plan'], Low: ['Faible', ''] };
  const STATUS = { 'In development': ['En développement', 'major'], 'Rolling out': ['En déploiement', 'ok'], 'Launched': ['Lancé', 'ok'], 'Cancelled': ['Annulé', ''] };

  function deadlineText(it) {
    if (!it.deadline) return '';
    return it.precision === 'month' ? fmtMonth(it.deadline) : fmtShort(it.deadline);
  }

  function metaLine(it, showDate) {
    const parts = [];
    if (it.isNew) parts.push('<span class="badge new">Nouveau</span>');
    parts.push('<span class="src' + (it.source === 'tenant' ? ' tenant' : '') + '">' + esc(it.label) + '</span>');
    if (showDate && it.date) parts.push('<span class="date">' + fmtShort(it.date) + '</span>');
    if (it.ref) parts.push('<a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.ref) + ' ↗</a>');
    if (it.official) parts.push('<a href="' + esc(it.official) + '" target="_blank" rel="noopener">' + (it.source === 'roadmap' ? 'Roadmap officielle ↗' : 'Ouvrir dans mon tenant ↗') + '</a>');
    if (it.category && CAT[it.category]) parts.push('<span class="badge ' + CAT[it.category][1] + '">' + CAT[it.category][0] + '</span>');
    if (it.status && STATUS[it.status]) parts.push('<span class="badge ' + STATUS[it.status][1] + '">' + STATUS[it.status][0] + '</span>');
    if (it.major) parts.push('<span class="badge major">Changement majeur</span>');
    if (it.orgType === 'CVE') {
      // tags : ['CVE', gravité, composant, 'CVSS x.x', 'Exploitee'?, 'Divulguee'?]
      const sev = SEVERITY[it.tags[1]] || [it.tags[1], ''];
      if (sev[0]) parts.push('<span class="badge ' + sev[1] + '">' + esc(sev[0]) + '</span>');
      if (it.tags.includes('Exploitee')) parts.push('<span class="badge deadline">Exploitée activement</span>');
      if (it.tags.includes('Divulguee')) parts.push('<span class="badge plan">Divulguée publiquement</span>');
      const cvss = it.tags.find(t => /^CVSS /.test(t));
      if (cvss) parts.push('<span>' + esc(cvss) + '</span>');
      if (it.tags[2] && it.tags[2] !== '-') parts.push('<span>' + esc(it.tags[2]) + '</span>');
    } else if (it.orgType && ORG_TYPE[it.orgType]) {
      const [lab, cls] = ORG_TYPE[it.orgType];
      parts.push('<span class="badge ' + cls + '">' + lab + (it.orgType === 'Benchmark' && it.tags[1] ? ' ' + esc(it.tags[1]) : '') + '</span>');
      if ((it.source === 'anssi' || it.source === 'cnil') && it.tags[1]) parts.push('<span>' + esc(it.tags[1]) + '</span>');
    }
    if (it.retire) parts.push('<span class="badge retire">Retrait / dépréciation</span>');
    if (it.deadline) parts.push('<span class="badge deadline">' + (it.actionBy ? 'Action requise avant le ' : 'Échéance : ') + esc(deadlineText(it)) + '</span>');
    if (it.updated && it.date && it.updated - it.date > 2 * DAY) parts.push('<span>mis à jour le ' + fmtShort(it.updated) + '</span>');
    return '<div class="meta">' + parts.join('') + '</div>';
  }

  function itemHtml(it, showDate) {
    return '<article class="item' + (it.retire ? ' ret' : '') + (it.isNew ? ' is-new' : '') + '"><h3><a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.title) + '</a></h3>' +
      metaLine(it, showDate) + crumbs(it) + (it.summary ? '<p class="summary" title="Cliquer pour déplier">' + esc(it.summary) + '</p>' : '') + '</article>';
  }

  function moreBtn(rest) { return rest > 0 ? '<button class="more" id="moreBtn">Afficher plus (' + rest + ' restants)</button>' : ''; }

  function renderByDate(items, emptyMsg) {
    items.sort((a, b) => (b.date || 0) - (a.date || 0));
    let html = '', cur = '';
    for (const it of items.slice(0, limit)) {
      const key = it.date ? startOfDay(it.date).toDateString() : 'none';
      if (key !== cur) {
        if (cur) html += '</div>';
        cur = key;
        html += '<div class="group"><h2 class="day">' + (it.date ? esc(fmtDay(it.date)) : 'Sans date') + '</h2>';
      }
      html += itemHtml(it);
    }
    if (cur) html += '</div>';
    if (!items.length) return '<p class="empty">' + emptyMsg + '</p>';
    return html + moreBtn(items.length - limit);
  }

  // Vue « par fonctionnalité » : une section par fonctionnalité, chaque élément dans sa fonctionnalité principale
  function renderByFeature(items) {
    const p = PROD[product];
    const groups = {};
    for (const it of items) { const f = it.feat[product][0]; (groups[f] = groups[f] || []).push(it); }
    let html = '';
    for (const f of p.features.concat(OTHER)) {
      const list = groups[f.id];
      if (!list) continue;
      list.sort((a, b) => (b.date || 0) - (a.date || 0));
      html += '<section class="fsec"><h2>' + iconHtml(f.icon, p.color, f.name) + '<a href="' + hashFor(tab, product, f.id) + '">' + esc(f.name) + '</a><span class="n">' + list.length + '</span></h2>' +
        list.slice(0, PER_SECTION).map(it => itemHtml(it, true)).join('') +
        (list.length > PER_SECTION ? '<a class="see-all" href="' + hashFor(tab, product, f.id) + '">Voir les ' + list.length + ' éléments « ' + esc(f.name) + ' » →</a>' : '') + '</section>';
    }
    return html || '<p class="empty">Aucune annonce pour ces filtres. Élargissez la période.</p>';
  }

  function renderRetire(items) {
    const today = startOfDay(new Date()).getTime();
    const B = [
      { id: 'past', name: 'Échéances passées', hint: 'Échues au cours des 6 derniers mois — à vérifier si non traitées.', test: t => t < today },
      { id: 'm1', name: 'Dans les 30 jours', test: t => t >= today && t < today + 30 * DAY },
      { id: 'm3', name: 'Dans 1 à 3 mois', test: t => t >= today + 30 * DAY && t < today + 90 * DAY },
      { id: 'm12', name: 'Dans 3 à 12 mois', test: t => t >= today + 90 * DAY && t < today + 365 * DAY },
      { id: 'later', name: 'Plus tard', test: t => t >= today + 365 * DAY }
    ];
    const withD = items.filter(i => i.deadline).sort((a, b) => a.deadline - b.deadline);
    const noD = items.filter(i => !i.deadline).sort((a, b) => (b.date || 0) - (a.date || 0));
    let html = '';
    for (const b of B) {
      const list = withD.filter(i => b.test(i.deadline.getTime()));
      if (!list.length) continue;
      if (b.id === 'past') list.reverse();
      html += '<section class="bucket"><h2>' + b.name + ' <span class="n">' + list.length + '</span></h2>' + (b.hint ? '<p class="hint">' + b.hint + '</p>' : '') +
        list.map(ritemHtml).join('') + '</section>';
    }
    if (noD.length) {
      html += '<section class="bucket"><h2>Date non précisée <span class="n">' + noD.length + '</span></h2><p class="hint">Annonces de retrait ou de dépréciation des 12 derniers mois sans date détectée automatiquement — triées par date d\'annonce.</p>' +
        noD.slice(0, limit).map(ritemHtml).join('') + '</section>' + moreBtn(noD.length - limit);
    }
    return html || '<p class="empty">Aucune fin de vie trouvée pour ces filtres.</p>';
  }

  function countdown(d) {
    const days = Math.round((startOfDay(d) - startOfDay(new Date())) / DAY);
    if (days === 0) return "aujourd'hui";
    if (days > 0) return days < 60 ? 'dans ' + days + ' j' : 'dans ' + Math.round(days / 30.4) + ' mois';
    return -days < 60 ? 'il y a ' + (-days) + ' j' : 'il y a ' + Math.round(-days / 30.4) + ' mois';
  }

  function ritemHtml(it) {
    let when;
    if (it.deadline) {
      const past = it.deadline < startOfDay(new Date());
      const d = it.precision === 'month' ? it.deadline.toLocaleDateString('fr-FR', { month: 'short' }) : it.deadline.getDate();
      const m = it.precision === 'month' ? it.deadline.getFullYear() : it.deadline.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
      when = '<div class="when' + (past ? ' past' : '') + '"><div class="d">' + esc(d) + '</div><div class="m">' + esc(m) + '</div><div class="c">' + countdown(it.deadline) + '</div></div>';
    } else {
      when = '<div class="when none"><div class="d">?</div><div class="m">annoncé le</div><div class="m">' + (it.date ? esc(fmtShort(it.date)) : '—') + '</div></div>';
    }
    const annonce = it.deadline && it.date ? '<span>annoncé le ' + fmtShort(it.date) + '</span>' : '';
    return '<div class="ritem' + (it.deadline && it.deadline < startOfDay(new Date()) ? ' is-past' : '') + '">' + when + '<div><h3><a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.title) + '</a></h3>' +
      metaLine(it).replace(/<\/div>$/, annonce + '</div>') + crumbs(it) + (it.summary ? '<p class="summary">' + esc(it.summary) + '</p>' : '') + '</div></div>';
  }

  // Onglet Organismes : une section par organisme
  const ORGS = [
    { id: 'msrc', name: 'MSRC — vulnérabilités Microsoft', hint: 'CVE publiées dans le Security Update Guide de Microsoft (dont le Patch Tuesday) pour vos produits, avec gravité, score CVSS et exploitation constatée.' },
    { id: 'cnil', name: 'CNIL — protection des données', hint: 'Actualités de la CNIL liées à Microsoft 365 : cloud, outils collaboratifs, messagerie, transferts de données, hébergement.' },
    { id: 'cis', name: 'CIS — benchmarks', hint: 'Benchmarks CIS nouveaux ou mis à jour (annonces mensuelles « CIS Benchmarks Update »).' },
    { id: 'anssi', name: 'ANSSI — guides et publications', hint: 'Guides, recommandations et actualités de l\'ANSSI liés à vos technologies.' }
  ];
  // Chaque organisme montre ses 8 éléments les plus récents ; « Afficher plus » agit section par section
  const ORG_FIRST = 8, ORG_STEP = 40;
  let orgShown = {};
  function renderOrg(items) {
    let html = '';
    for (const o of ORGS) {
      const list = items.filter(i => i.source === o.id).sort((a, b) => (b.date || 0) - (a.date || 0));
      if (!list.length) continue;
      const shown = orgShown[o.id] || ORG_FIRST;
      const rest = list.length - shown;
      html += '<section class="bucket" id="sec-' + o.id + '"><h2>' + o.name + ' <span class="n">' + list.length + '</span></h2><p class="hint">' + o.hint + '</p>' +
        list.slice(0, shown).map(it => itemHtml(it, true)).join('') +
        (rest > 0 ? '<button class="more" data-org-more="' + o.id + '">Afficher ' + Math.min(rest, ORG_STEP) + ' de plus <span class="muted-n">(' + rest + ' restants)</span></button>' : '') + '</section>';
    }
    return html || '<p class="empty">Aucune publication pour ces filtres. Élargissez la période (les guides ANSSI et benchmarks CIS sont moins fréquents).</p>';
  }

  function renderRoadmap(items) {
    const order = ['Rolling out', 'In development', 'Launched', 'Cancelled', ''];
    const names = { 'Rolling out': 'En cours de déploiement', 'In development': 'En développement', 'Launched': 'Lancé', 'Cancelled': 'Annulé', '': 'Autre' };
    let html = '', max = 0;
    for (const st of order) {
      const list = items.filter(i => (i.status || '') === st).sort((a, b) => (b.date || 0) - (a.date || 0));
      if (!list.length) continue;
      max = Math.max(max, list.length);
      html += '<section class="bucket"><h2>' + names[st] + ' <span class="n">' + list.length + '</span></h2>' + list.slice(0, limit).map(it => itemHtml(it, true)).join('') + '</section>';
    }
    return (html + moreBtn(max - limit)) || '<p class="empty">Aucun élément de roadmap pour ces filtres.</p>';
  }

  function renderOs() {
    const map = { ios: ['ios', 'ipados'], applebusiness: ['ios', 'ipados', 'macos'], macos: ['macos'], android: ['android'], windows: ['windows'] };
    const keys = (product && map[product]) || EOL_PRODUCTS;
    let html = '<div class="os-grid">';
    for (const k of keys) {
      const res = eolRaw[k] && eolRaw[k].result;
      if (!res) { html += '<div class="os-card"><h2>' + esc(EOL_SVC[k]) + '</h2><p class="sub">Données indisponibles.</p></div>'; continue; }
      let rel = res.releases || [];
      if (k === 'windows') rel = rel.filter(r => /^1[01]-/.test(r.name) && /-(w|e)$/.test(r.name)).slice(0, 10);
      else rel = rel.slice(0, 7);
      const pid = k === 'ipados' ? 'ios' : k;
      html += '<div class="os-card"><h2>' + iconHtml(PROD[pid].icon, null, null, 'os-ico') + esc(res.label || EOL_SVC[k]) + '</h2>' +
        '<div class="sub">Source : <a href="' + esc((res.links && res.links.html) || 'https://endoflife.date/' + k) + '" target="_blank" rel="noopener">endoflife.date</a>' + (eolInfo.live ? ' · en direct' : ' · copie locale') + '</div>' +
        '<div class="tbl"><table><thead><tr><th>Version</th><th>Sortie</th><th>Dernière version</th><th>Statut</th></tr></thead><tbody>';
      for (const r of rel) {
        const eol = toDate(r.eolFrom);
        let st;
        if (r.isEol) st = '<span class="badge retire">Fin de support' + (eol ? ' · ' + fmtShort(eol) : '') + '</span>';
        else if (eol) st = '<span class="badge plan">Jusqu\'au ' + fmtShort(eol) + '</span>';
        else st = '<span class="badge ok">Supportée</span>';
        const latest = r.latest ? (r.latest.link ? '<a href="' + esc(r.latest.link) + '" target="_blank" rel="noopener">' + esc(r.latest.name) + '</a>' : esc(r.latest.name)) + (r.latest.date ? '<br><small>' + fmtShort(new Date(r.latest.date)) + '</small>' : '') : '—';
        html += '<tr><td><strong>' + esc(r.label || r.name) + '</strong>' + (r.codename ? '<br><small>' + esc(r.codename) + '</small>' : '') + '</td><td>' + (r.releaseDate ? fmtShort(new Date(r.releaseDate)) : '—') + '</td><td>' + latest + '</td><td>' + st + '</td></tr>';
      }
      html += '</tbody></table></div></div>';
    }
    html += '</div>';
    html += '<h2 class="section">Dernières sorties et mises à jour de sécurité (120 jours)</h2>' + renderByDate(visible(), 'Aucune sortie récente.');
    return html;
  }

  // ------------------------------------------------------------------ État des services (tenant, Microsoft Graph)
  const HEALTH_STATUS = {
    serviceOperational: ['Opérationnel', 'ok'], serviceDegradation: ['Dégradation du service', 'plan'], serviceInterruption: ['Interruption du service', 'deadline'],
    investigating: ['Enquête en cours', 'plan'], restoringService: ['Rétablissement en cours', 'plan'], verifyingService: ['Vérification en cours', 'plan'],
    extendedRecovery: ['Récupération prolongée', 'retire'], investigationSuspended: ['Enquête suspendue', ''], serviceRestored: ['Rétabli', 'ok'],
    falsePositive: ['Faux positif', ''], postIncidentReviewPublished: ['Rapport post-incident publié', 'ok'], resolved: ['Résolu', 'ok'],
    resolvedExternal: ['Résolu (externe)', 'ok'], mitigated: ['Atténué', 'ok'], mitigatedExternal: ['Atténué (externe)', 'ok'], confirmed: ['Confirmé', 'retire'], reported: ['Signalé', 'plan']
  };
  const SERVICE_ICON = {
    'exchange online': 'exchange', 'microsoft entra': 'entra', 'microsoft teams': 'teams', 'sharepoint online': 'sharepoint', 'microsoft onedrive': 'onedrive',
    'microsoft intune': 'intune', 'microsoft defender xdr': 'defender', 'microsoft purview': 'purview', 'microsoft 365 suite': 'm365', 'microsoft 365 apps': 'f-office-apps',
    'microsoft 365 for the web': 'f-office-apps', 'microsoft copilot (microsoft 365)': 'f-copilot', 'microsoft 365 copilot chat': 'f-copilot', 'windows autopatch': 'windows',
    'planner': null, 'microsoft forms': null, 'microsoft viva': null
  };
  const healthLabel = s => HEALTH_STATUS[s] || [s, ''];
  const activeIssues = () => ((TENANT && TENANT.issues) || []).filter(i => !i.resolved);
  // Produits suivis concernés par un service Microsoft (noms de service du Message Center)
  function issueProducts(i) {
    const s = String(i.service || '').toLowerCase().trim();
    return PRODUCTS.filter(p => p.svc.includes(s) || (p.id === 'defender' && /defender/.test(s)) || (p.id === 'm365' && /copilot/.test(s))).map(p => p.id);
  }
  let healthSvc = null; // service choisi en cliquant sur sa carte (filtre)
  function issueMatches(i) {
    if (product && !issueProducts(i).includes(product)) return false;
    if (healthSvc && i.service !== healthSvc) return false;
    if (state.q) {
      const txt = (i.title + ' ' + i.service + ' ' + (i.feature || '') + ' ' + i.id + ' ' + (i.impact || '')).toLowerCase();
      if (!state.q.toLowerCase().split(/\s+/).filter(Boolean).every(w => txt.includes(w))) return false;
    }
    return true;
  }

  function issueHtml(i) {
    const st = healthLabel(i.status);
    const cls = i.classification === 'incident' ? ['Incident', 'deadline'] : ['Avis', 'plan'];
    const url = 'https://admin.microsoft.com/Adminportal/Home#/servicehealth/:/alerts/' + encodeURIComponent(i.id);
    const start = toDate(i.start), mod = toDate(i.modified), end = toDate(i.end);
    return '<article class="item' + (!i.resolved && i.classification === 'incident' ? ' ret' : '') + '"><h3><a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(i.title) + '</a></h3>' +
      '<div class="meta"><span class="badge ' + cls[1] + '">' + cls[0] + '</span><span class="badge ' + st[1] + '">' + esc(st[0]) + '</span>' +
      '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(i.id) + ' ↗</a>' +
      (start ? '<span>depuis le ' + fmtShort(start) + ' ' + fmtTime(start) + '</span>' : '') +
      (i.resolved && end ? '<span>terminé le ' + fmtShort(end) + '</span>' : '') +
      (mod ? '<span>mis à jour le ' + fmtShort(mod) + ' ' + fmtTime(mod) + '</span>' : '') + '</div>' +
      '<div class="crumbs"><span class="tag">' + esc(i.service) + (i.feature ? ' › ' + esc(i.feature) : '') + '</span></div>' +
      (i.impact ? '<p class="summary open">' + esc(i.impact) + '</p>' : '') +
      (i.lastPost ? '<p class="summary" title="Cliquer pour déplier la dernière mise à jour"><strong>Dernière mise à jour :</strong> ' + esc(i.lastPost) + '</p>' : '') + '</article>';
  }

  // ---- Windows release health : problèmes connus des mises à jour (pages publiques Microsoft, via collect.ps1)
  const WIN_STATUS = { Confirmed: ['Confirmé', 'retire'], Investigating: ['Enquête en cours', 'plan'], Mitigated: ['Atténué', 'plan'], 'Mitigated: External': ['Atténué (externe)', 'plan'], Resolved: ['Résolu', 'ok'], 'Resolved: External': ['Résolu (externe)', 'ok'] };
  const winOpen = w => !/^Resolved/i.test(w.status);
  let winVer = null, showWinResolved = false;
  function renderWindowsIssues() {
    let list = (snapshot.windowsIssues || []).slice();
    if (!list.length) return '';
    const versions = [...new Set(list.flatMap(w => w.versions))];
    if (winVer) list = list.filter(w => w.versions.includes(winVer));
    if (state.q) { const ws = state.q.toLowerCase().split(/\s+/).filter(Boolean); list = list.filter(w => ws.every(x => (w.title + ' ' + w.summary + ' ' + w.kb + ' ' + w.details).toLowerCase().includes(x))); }
    const open = list.filter(winOpen).sort((a, b) => b.updated.localeCompare(a.updated));
    const done = list.filter(w => !winOpen(w)).sort((a, b) => b.updated.localeCompare(a.updated));
    const fmtIso = s => s ? fmtShort(new Date(s + 'T12:00:00')) : '';
    const card = w => {
      const st = WIN_STATUS[w.status] || [w.status, ''];
      const plat = (w.platforms || '').replace(/​/g, '');
      return '<article class="item' + (w.status === 'Confirmed' ? ' ret' : '') + '"><h3><a href="' + esc(w.url) + '" target="_blank" rel="noopener">' + esc(w.title) + '</a></h3>' +
        '<div class="meta"><span class="src">Windows release health</span><span class="badge ' + st[1] + '">' + esc(st[0]) + '</span>' +
        (w.kb ? '<a href="https://support.microsoft.com/help/' + esc(w.kb.replace('KB', '')) + '" target="_blank" rel="noopener">Issu de ' + esc(w.kb) + ' ↗</a>' : '') +
        (w.origDate ? '<span>publiée le ' + fmtIso(w.origDate) + '</span>' : '') +
        (w.fixKb ? '<a href="https://support.microsoft.com/help/' + esc(w.fixKb.replace('KB', '')) + '" target="_blank" rel="noopener">Corrigé par ' + esc(w.fixKb) + ' ↗</a>' : '') +
        (w.updated ? '<span>mis à jour le ' + fmtIso(w.updated) + '</span>' : '') + '</div>' +
        '<div class="crumbs"><span class="tag">' + w.versions.map(esc).join(' · ') + '</span></div>' +
        (w.summary ? '<p class="summary open">' + esc(w.summary) + '</p>' : '') +
        (w.details ? '<p class="summary" title="Cliquer pour déplier le détail et le contournement"><strong>Détail :</strong> ' + esc(w.details) + '</p>' : '') +
        (plat ? '<p class="win-plat"><strong>Plateformes touchées :</strong> ' + esc(plat) + '</p>' : '') + '</article>';
    };
    let html = '<section class="bucket" id="win-health"><h2>' + iconHtml('windows', null, null, 'ico') + ' Windows — problèmes connus des mises à jour <span class="n">' + open.length + ' ouvert' + (open.length > 1 ? 's' : '') + '</span></h2>' +
      '<p class="hint">Source : Windows release health (Microsoft). À vérifier avant de déployer un Patch Tuesday avec Intune / Windows Autopatch.</p>' +
      '<div class="chips win-vers">' + chip('', 'Toutes les versions', !winVer).replace('data-v=""', 'data-winver=""') +
      versions.map(v => chip(v, v, winVer === v).replace('data-v="', 'data-winver="')).join('') + '</div>';
    html += open.length ? open.map(card).join('') : '<p class="empty">Aucun problème ouvert pour cette sélection.</p>';
    if (done.length) html += showWinResolved ? '<h3 class="sub-h">Résolus récemment</h3>' + done.map(card).join('')
      : '<button class="more" data-winres="1">Afficher les ' + done.length + ' problèmes résolus récemment</button>';
    return html + '</section>';
  }

  let showResolved = false;
  function renderHealth() {
    // Windows release health : visible sur « Tout voir », Windows et Intune (déploiement des mises à jour)
    const showWin = !product || product === 'windows' || product === 'intune';
    const winHtml = showWin ? renderWindowsIssues() : '';
    if (!TENANT || TENANT.error || !TENANT.health) {
      const why = !TENANT ? 'Aucune donnée de tenant : créez tenant.config.json (tenantId, clientId, certThumbprint) puis lancez collect.ps1.'
        : TENANT.error ? 'Erreur lors de la collecte : ' + TENANT.error
          : (TENANT.issuesError || 'État des services indisponible.') + ' L\'application Entra doit disposer de la permission ServiceHealth.Read.All.';
      return '<p class="empty">' + esc(why) + '</p>' + winHtml;
    }
    const gen = toDate(TENANT.generated);
    let services = TENANT.health.slice();
    if (product) services = services.filter(s => issueProducts({ service: s.service }).includes(product));
    const order = s => s.status === 'serviceOperational' ? 1 : 0;
    services.sort((a, b) => order(a) - order(b) || a.service.localeCompare(b.service));
    if (healthSvc && !services.some(s => s.service === healthSvc)) healthSvc = null;
    // Incidents en cours par service (indépendamment du filtre de service) : compteurs et infobulles des cartes
    const bySvc = {};
    activeIssues().filter(i => !product || issueProducts(i).includes(product)).forEach(i => { (bySvc[i.service] = bySvc[i.service] || []).push(i); });
    const active = activeIssues().filter(issueMatches).sort((a, b) => (a.classification === 'incident' ? 0 : 1) - (b.classification === 'incident' ? 0 : 1) || (toDate(b.modified) - toDate(a.modified)));
    const resolved = ((TENANT.issues || []).filter(i => i.resolved && issueMatches(i))).sort((a, b) => toDate(b.modified) - toDate(a.modified));
    const degraded = services.filter(s => s.status !== 'serviceOperational').length;
    const allActive = [].concat(...Object.values(bySvc));
    const inc = allActive.filter(i => i.classification === 'incident').length;
    const note = tenantInfo.loading ? '<span class="spinning">⟳</span> Actualisation en cours depuis votre tenant…'
      : 'Données de votre tenant du ' + (gen ? fmtShort(gen) + ' à ' + fmtTime(gen) : '—') + '. ' +
      (IS_LOCAL_SERVER ? 'Actualisation automatique toutes les 5 minutes, ou immédiate avec le bouton ⟳ en haut à droite.'
        : TENANT_API ? 'Collectées toutes les heures par GitHub Actions ; la page les relit toutes les 10 minutes (ou avec le bouton ⟳).'
          : 'Ouvrez l\'application via Lancer-Veille.cmd pour l\'actualiser en direct (ici, seule une nouvelle collecte la met à jour).') +
      (tenantInfo.error ? ' Dernière tentative en échec : ' + esc(tenantInfo.error) + '.' : '');
    let html = '<p class="health-note">' + note + '</p>' +
      '<div class="kpis">' +
      '<div class="kpi ok"><div class="v">' + (services.length - degraded) + '<small>/' + services.length + '</small></div><div class="l">Services opérationnels</div></div>' +
      '<div class="kpi ' + (degraded ? 'warn' : 'ok') + '"><div class="v">' + degraded + '</div><div class="l">Services dégradés</div></div>' +
      '<div class="kpi ' + (inc ? 'bad' : 'ok') + '"><div class="v">' + inc + '</div><div class="l">Incidents en cours</div></div>' +
      '<div class="kpi ' + (allActive.length - inc ? 'warn' : 'ok') + '"><div class="v">' + (allActive.length - inc) + '</div><div class="l">Avis en cours</div></div></div>';
    html += '<h2 class="section">Services <span class="section-hint">Cliquez sur un service pour filtrer les incidents ci-dessous · survolez pour un aperçu</span></h2><div class="svc-grid">' + services.map(s => {
      const st = healthLabel(s.status);
      const list = bySvc[s.service] || [];
      const ko = s.status !== 'serviceOperational';
      // Infobulle : aperçu des incidents / avis en cours du service
      const tip = list.length
        ? '<div class="svc-tip" role="tooltip"><div class="tip-h">' + esc(s.service) + ' · ' + list.length + ' en cours</div>' +
          list.slice(0, 4).map(i => { const d = toDate(i.start); return '<div class="tip-i"><span class="badge ' + (i.classification === 'incident' ? 'deadline' : 'plan') + '">' + (i.classification === 'incident' ? 'Incident' : 'Avis') + '</span> ' + esc(i.title) +
            '<div class="tip-m">' + esc(healthLabel(i.status)[0]) + (d ? ' · depuis le ' + fmtShort(d) : '') + (i.feature ? ' · ' + esc(i.feature) : '') + '</div></div>'; }).join('') +
          (list.length > 4 ? '<div class="tip-m">+ ' + (list.length - 4) + ' autre(s)…</div>' : '') + '<div class="tip-f">Cliquer pour voir le détail</div></div>'
        : (ko ? '<div class="svc-tip" role="tooltip"><div class="tip-h">' + esc(s.service) + '</div><div class="tip-m">Microsoft signale une dégradation sans publier d\'incident dans l\'API. Consultez la page Santé des services du centre d\'administration.</div></div>' : '');
      return '<button type="button" class="svc ' + (ko ? 'is-ko' : 'is-ok') + (healthSvc === s.service ? ' sel' : '') + '" data-svc="' + esc(s.service) + '" aria-pressed="' + (healthSvc === s.service) + '">' +
        iconHtml(SERVICE_ICON[s.service.toLowerCase().trim()], '#5b6075', s.service) +
        '<span class="svc-t"><span class="svc-n">' + esc(s.service) + '</span><span class="badge ' + st[1] + '">' + esc(st[0]) + '</span>' +
        (list.length ? '<span class="svc-c">' + list.length + ' en cours</span>' : (ko ? '<span class="svc-c muted">détail non publié dans l\'API</span>' : '')) + '</span>' + tip + '</button>';
    }).join('') + '</div>';
    const svcName = healthSvc ? ' — ' + esc(healthSvc) : '';
    html += '<section class="bucket" id="health-issues"><h2>Incidents et avis en cours' + svcName + ' <span class="n">' + active.length + '</span>' +
      (healthSvc ? '<button class="chip on clear-svc" data-svc-clear="1">✕ Tous les services</button>' : '') + '</h2>';
    if (active.length) html += active.map(issueHtml).join('');
    else if (healthSvc) {
      const s = TENANT.health.find(x => x.service === healthSvc);
      html += '<p class="empty">' + (s && s.status !== 'serviceOperational'
        ? 'Microsoft indique « ' + esc(healthLabel(s.status)[0]) + ' » pour ' + esc(healthSvc) + ' sans publier d\'incident dans l\'API. <a href="https://admin.microsoft.com/Adminportal/Home#/servicehealth" target="_blank" rel="noopener">Ouvrir la Santé des services ↗</a>'
        : 'Aucun incident ni avis en cours pour ' + esc(healthSvc) + '.') + '</p>';
    } else html += '<p class="empty">Aucun incident ni avis en cours pour cette sélection.</p>';
    html += '</section>';
    html += '<section class="bucket"><h2>Résolus ces 30 derniers jours <span class="n">' + resolved.length + '</span></h2>' +
      (resolved.length ? (showResolved ? resolved.map(issueHtml).join('') : '<button class="more" data-resolved="1">Afficher les ' + resolved.length + ' incidents et avis résolus</button>') : '<p class="hint">Aucun.</p>') + '</section>';
    return html + winHtml;
  }

  const VIEWS = {
    health: ['Mon tenant · Microsoft 365', 'État des services', 'État de santé des services Microsoft 365 de votre tenant : services dégradés, incidents et avis en cours, avec leurs dernières mises à jour.'],
    news: ['Microsoft 365 · Sécurité · Mobilité', 'Nouveautés', 'Annonces du Message Center, de la Roadmap Microsoft 365, des pages « What\'s new » de Microsoft Learn, des blogs produits, du changelog Microsoft Graph et des éditeurs d\'OS mobiles.'],
    org: ['MSRC · CNIL · CIS · ANSSI', 'Organismes', 'Publications des organismes sur vos produits : vulnérabilités Microsoft (MSRC), protection des données (CNIL), benchmarks du CIS, guides et recommandations de l\'ANSSI.'],
    retire: ['Cycle de vie', 'Fins de vie & retraits', 'Retraits de fonctionnalités, dépréciations et fins de support annoncés par Microsoft et les éditeurs d\'OS, classés par échéance. Les dates sont extraites automatiquement des annonces : vérifiez toujours le message source.'],
    roadmap: ['Microsoft 365 Roadmap', 'Roadmap', 'Fonctionnalités prévues, en développement et en cours de déploiement selon la Roadmap publique Microsoft 365.'],
    os: ['Mobilité & postes', 'Versions OS', 'Versions d\'iOS, iPadOS, macOS, Android et Windows : dates de sortie, dernières mises à jour et fins de support.']
  };

  function render() {
    document.querySelectorAll('#tabs a').forEach(a => { a.classList.toggle('active', a.dataset.tab === tab); a.href = hashFor(a.dataset.tab, product, feature); });
    const v = VIEWS[tab];
    const p = product && PROD[product];
    const f = p && feature && featureOf(product, feature);
    $('#viewEyebrow').textContent = p ? p.name + (f ? ' › ' + f.name : '') : v[0];
    $('#viewTitle').textContent = p ? (f ? f.name : p.name) + ' — ' + v[1].toLowerCase() : v[1];
    $('#viewLede').textContent = p ? (f ? 'Annonces ' + (tab === 'retire' ? 'de retrait ' : '') + 'liées à « ' + f.name + ' » dans ' + p.name + '.' : (tab === 'news' ? 'Nouveautés ' + p.name + ' classées par fonctionnalité. Choisissez une fonctionnalité dans le menu pour filtrer.' : v[2])) : v[2];
    const counts = productCounts();
    renderSidebar(counts);
    renderFilters();
    renderTabBadges();
    let html;
    if (tab === 'os') html = renderOs();
    else if (tab === 'health') html = renderHealth();
    else {
      const items = visible();
      const n = items.length;
      if (tab === 'news') html = (product && !feature && state.groupBy === 'feature') ? renderByFeature(items) : renderByDate(items, 'Aucune annonce pour ces filtres. Élargissez la période ou choisissez un autre produit.');
      else html = tab === 'retire' ? renderRetire(items) : tab === 'org' ? renderOrg(items) : renderRoadmap(items);
      $('#resultCount').textContent = n.toLocaleString('fr-FR') + ' élément' + (n > 1 ? 's' : '');
    }
    $('#content').innerHTML = html;
    renderRail();
  }

  // Pastilles des onglets : nouveautés depuis la dernière visite, incidents en cours
  function renderTabBadges() {
    const nc = newCountsByTab();
    const act = activeIssues();
    const inc = act.filter(i => i.classification === 'incident').length;
    document.querySelectorAll('#tabs a').forEach(a => {
      let b = a.querySelector('.tb');
      const t = a.dataset.tab;
      const val = t === 'health' ? (act.length || 0) : (nc[t] || 0);
      if (!val) { if (b) b.remove(); return; }
      if (!b) { b = document.createElement('span'); a.appendChild(b); }
      b.className = 'tb' + (t === 'health' ? (inc ? ' bad' : ' warn') : '');
      b.textContent = t === 'health' ? val : '+' + val;
      b.title = t === 'health' ? val + ' incident(s) / avis en cours' : val + ' nouveauté(s) depuis votre dernière visite';
    });
  }

  function renderRail() {
    const today = startOfDay(new Date()).getTime();
    const up = ALL.filter(it => (it.retire || it.actionBy) && it.deadline && it.deadline.getTime() >= today && (!product || it.products.includes(product)) && (!product || !feature || it.feat[product].includes(feature)))
      .sort((a, b) => a.deadline - b.deadline).slice(0, 8);
    $('#railDeadlines').innerHTML = up.map(it => '<li><span class="dd">' + (it.precision === 'month' ? esc(it.deadline.toLocaleDateString('fr-FR', { month: 'short' })) : it.deadline.getDate()) +
      '<small>' + esc(it.precision === 'month' ? it.deadline.getFullYear() : it.deadline.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' })) + '</small></span><a href="' + esc(it.url) + '" target="_blank" rel="noopener">' + esc(it.title) + '</a></li>').join('') ||
      '<li>Aucune échéance à venir.</li>';
    $('#railMore').href = hashFor('retire', product, feature);
    const rows = [];
    rows.push(['Message Center & Roadmap', mcInfo.live ? 'direct · ' + fmtTime(mcInfo.at) : mcRaw ? 'copie locale' : 'indisponible', mcInfo.live ? 'live' : mcRaw ? '' : 'err']);
    rows.push(['endoflife.date (OS)', eolInfo.live ? 'direct · ' + fmtTime(eolInfo.at) : Object.keys(eolRaw).length ? 'copie locale' : 'indisponible', eolInfo.live ? 'live' : Object.keys(eolRaw).length ? '' : 'err']);
    const gen = toDate(snapshot.generated);
    const errs = (snapshot.report || []).filter(r => r.error).length;
    rows.push(['Learn, blogs, Graph, Apple…', gen ? 'collecte du ' + fmtShort(gen) + ' ' + fmtTime(gen) : 'non collecté', gen ? (Date.now() - gen > 2 * DAY ? 'err' : '') : 'err']);
    if (errs) rows.push([errs + ' source(s) en erreur', 'relancer collect.ps1', 'err']);
    if (TENANT) {
      const tg = toDate(TENANT.generated);
      rows.unshift(['Mon tenant (Graph)', TENANT.error ? 'erreur' : 'collecte du ' + (tg ? fmtShort(tg) + ' ' + fmtTime(tg) : '—'), TENANT.error ? 'err' : (tg && Date.now() - tg > DAY ? 'err' : 'live')]);
    }
    $('#railSources').innerHTML = rows.map(r => '<li><span>' + esc(r[0]) + '</span><span class="st ' + r[2] + '">' + esc(r[1]) + '</span></li>').join('');
  }

  function renderLiveStatus() {
    const el = $('#liveStatus');
    const ok = mcInfo.live;
    el.className = 'live ' + (ok ? 'ok' : 'warn');
    el.querySelector('.txt').textContent = ok ? 'En direct · ' + fmtTime(mcInfo.at) : 'Copie locale';
    const gen = toDate(snapshot.generated);
    el.title = (ok ? 'Message Center / Roadmap chargés en direct à ' + fmtTime(mcInfo.at) : 'Sources en direct injoignables : affichage de la copie locale' + (mcInfo.error ? ' (' + mcInfo.error + ')' : '')) +
      (gen ? '\nAutres sources collectées le ' + fmtShort(gen) + ' à ' + fmtTime(gen) : '');
  }

  // ------------------------------------------------------------------ Chargement en direct
  // Données du tenant : le serveur local relance collect-tenant.ps1 (≈ 10 s) et renvoie le résultat
  async function loadTenant(renderAfter) {
    if (!TENANT_API || tenantInfo.loading) return;
    tenantInfo.loading = true;
    if (tab === 'health') render();
    try {
      const r = await fetch(TENANT_API, { cache: 'no-store' });
      if (r.status === 404 && !IS_LOCAL_SERVER) { tenantInfo = { loading: false, live: false, error: null }; return; } // pas de données tenant publiées
      if (!r.ok) throw new Error('HTTP ' + r.status);
      // api/tenant renvoie du JSON ; data/tenant.js contient « window.TENANT = {...}; »
      const txt = await r.text();
      TENANT = JSON.parse(IS_LOCAL_SERVER ? txt : txt.replace(/^\s*window\.TENANT\s*=\s*/, '').replace(/;\s*$/, ''));
      tenantInfo = { loading: false, live: true, error: TENANT.error || null };
    } catch (e) {
      tenantInfo = { loading: false, live: false, error: e.message };
    }
    if (renderAfter) rebuild();
  }

  async function loadLive() {
    $('#refreshBtn').classList.add('spin');
    const mcP = fetch(LIVE_MC, { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(j => { mcRaw = j; mcInfo = { live: true, at: new Date(), error: null }; })
      .catch(e => { mcInfo = { live: false, at: null, error: e.message }; });
    const eolP = Promise.all(EOL_PRODUCTS.map(p => fetch(LIVE_EOL + p + '/', { cache: 'no-store' }).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then(j => [p, j])))
      .then(list => { list.forEach(([p, j]) => { eolRaw[p] = j; }); eolInfo = { live: true, at: new Date(), error: null }; })
      .catch(e => { eolInfo = { live: false, at: null, error: e.message }; });
    await Promise.all([mcP, eolP, loadTenant(false)]);
    $('#refreshBtn').classList.remove('spin');
    renderLiveStatus();
    rebuild();
  }

  // ------------------------------------------------------------------ Événements
  function save() { const s = Object.assign({}, state); delete s.q; store('state2', s); }
  function update(fn) { fn(); limit = PAGE; orgShown = {}; save(); render(); }

  function readHash() {
    const [t, p, f] = location.hash.replace('#', '').split('/');
    tab = VIEWS[t] ? t : 'news';
    product = PROD[p] ? p : null;
    feature = product && f && featureOf(product, f) ? f : null;
    store('product', product);
  }

  function onHash() {
    readHash();
    limit = PAGE;
    orgShown = {};
    healthSvc = null;
    // Sur mobile, déplier un produit laisse le menu ouvert pour choisir une fonctionnalité
    if (!product || feature) closeMenu();
    render();
    window.scrollTo(0, 0);
  }

  function closeMenu() { $('#sidebar').classList.remove('open'); $('#scrim').hidden = true; }

  function applyTheme(t) {
    if (t) document.documentElement.setAttribute('data-theme', t); else document.documentElement.removeAttribute('data-theme');
    const eff = t || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.querySelectorAll('[data-theme-set]').forEach(b => b.classList.toggle('on', b.dataset.themeSet === eff));
  }

  function bind() {
    $('#periodChips').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) update(() => { state.period = b.dataset.v; }); });
    $('#horizonChips').addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      // Même logique que les sources : 1er clic = uniquement cette tranche, ensuite ajout / retrait, vide = toutes
      update(() => {
        const ids = HORIZONS.map(h => h.id), id = b.dataset.v;
        const allOn = ids.every(x => state.dl.includes(x));
        let next;
        if (id === 'all') next = ids;
        else if (allOn) next = [id];
        else next = state.dl.includes(id) ? state.dl.filter(x => x !== id) : state.dl.concat(id);
        state.dl = next.length ? next : ids;
      });
    });
    $('#sourceChips').addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      const id = b.dataset.v;
      update(() => {
        const ids = tabSources().map(s => s.id);
        const others = state.sources.filter(x => !ids.includes(x)); // sources des autres onglets, inchangées
        const current = state.sources.filter(x => ids.includes(x));
        const allOn = ids.every(x => current.includes(x));
        let next;
        if (id === 'all') next = ids;
        else if (allOn) next = [id];                       // 1er clic : uniquement cette source
        else next = current.includes(id) ? current.filter(x => x !== id) : current.concat(id); // ensuite : ajout / retrait
        if (!next.length) next = ids;                      // plus rien de coché : retour à « Toutes »
        state.sources = others.concat(next);
      });
    });
    $('#flagChips').addEventListener('click', e => {
      const b = e.target.closest('[data-v]'); if (!b) return;
      update(() => {
        if (b.dataset.v === 'action') state.actionOnly = !state.actionOnly;
        else if (b.dataset.v === 'msrc-crit') state.msrcCritical = true;
        else if (b.dataset.v === 'msrc-all') state.msrcCritical = false;
        else state.retireOnly = !state.retireOnly;
      });
    });
    $('#groupToggle').addEventListener('click', e => { const b = e.target.closest('[data-g]'); if (b) update(() => { state.groupBy = b.dataset.g; }); });
    $('#from').addEventListener('change', e => update(() => { state.from = e.target.value; }));
    $('#to').addEventListener('change', e => update(() => { state.to = e.target.value; }));
    let t;
    $('#q').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => update(() => { state.q = e.target.value.trim(); }), 180); });
    $('#resetFilters').addEventListener('click', () => update(() => { const g = state.groupBy; state = defaults(); state.groupBy = g; $('#q').value = ''; }));
    $('#content').addEventListener('click', e => {
      if (e.target.id === 'moreBtn') { limit += PAGE; render(); return; }
      if (e.target.closest('[data-resolved]')) { showResolved = true; render(); return; }
      if (e.target.closest('[data-svc-clear]')) { healthSvc = null; render(); return; }
      if (e.target.closest('[data-winres]')) { showWinResolved = true; render(); return; }
      const wv = e.target.closest('[data-winver]');
      if (wv) { winVer = wv.dataset.winver || null; const y = window.scrollY; render(); window.scrollTo(0, y); return; }
      const sv = e.target.closest('[data-svc]');
      if (sv) {
        healthSvc = healthSvc === sv.dataset.svc ? null : sv.dataset.svc;
        render();
        if (healthSvc) { const t = $('#health-issues'); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        return;
      }
      const om = e.target.closest('[data-org-more]');
      if (om) {
        const id = om.dataset.orgMore, y = window.scrollY;
        orgShown[id] = (orgShown[id] || ORG_FIRST) + ORG_STEP;
        render();
        window.scrollTo(0, y); // rester à la même position
        return;
      }
      if (e.target.classList.contains('summary')) e.target.classList.toggle('open');
    });
    $('#newBar').addEventListener('click', e => {
      const b = e.target.closest('[data-new]'); if (!b) return;
      if (b.dataset.new === 'seen') markAllSeen();
      else update(() => { state.newOnly = !state.newOnly; });
    });
    $('#refreshBtn').addEventListener('click', loadLive);
    $('#menuBtn').addEventListener('click', () => { $('#sidebar').classList.add('open'); $('#scrim').hidden = false; });
    $('#scrim').addEventListener('click', closeMenu);
    document.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => { store('theme', b.dataset.themeSet); applyTheme(b.dataset.themeSet); }));
    window.addEventListener('hashchange', onHash);
    document.addEventListener('keydown', e => { if (e.key === '/' && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); $('#q').focus(); } });
  }

  // ------------------------------------------------------------------ Démarrage
  applyTheme(store('theme'));
  bind();
  if (window.MC_FALLBACK) mcRaw = window.MC_FALLBACK.items;
  if (window.EOL_FALLBACK) eolRaw = Object.assign({}, window.EOL_FALLBACK.products);
  if (!location.hash && store('product') && PROD[store('product')]) history.replaceState(null, '', hashFor('news', store('product')));
  readHash();
  rebuild();
  renderLiveStatus();
  loadLive();
  setInterval(loadLive, REFRESH_MS);
  if (TENANT_API) setInterval(() => loadTenant(true), TENANT_REFRESH_MS);
})();
