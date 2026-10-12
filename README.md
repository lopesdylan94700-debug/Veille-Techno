# Veille techno

Tableau de veille sur les technologies Microsoft (et OS mobiles) : nouveautés, roadmap, fins de vie.

## Utilisation locale (Windows, rien à installer)

Double-cliquez sur **`Lancer-Veille.cmd`** : il collecte les sources puis ouvre http://localhost:8080/.

- Sans relancer la collecte : `powershell -ExecutionPolicy Bypass -File serve.ps1`
- Pour actualiser seulement les données : `powershell -ExecutionPolicy Bypass -File collect.ps1`
- `index.html` peut aussi être ouvert directement par double-clic.

## Accès depuis n'importe où (GitHub Pages, gratuit)

1. Créez un dépôt GitHub (privé ou public) et déposez-y **tous** les fichiers de ce dossier, y compris `.github/workflows/veille.yml`.
2. Dans le dépôt : **Settings → Pages → Source : GitHub Actions**.
3. Onglet **Actions → Veille techno → Run workflow**.

Le site est ensuite republié toutes les 3 heures (`https://<compte>.github.io/<depot>/`).
Remarque : avec un compte gratuit, GitHub Pages rend le site public même si le dépôt est privé (les données sont publiques de toute façon).

## Sources

| Source | Contenu | Rafraîchissement |
|---|---|---|
| mc.merill.net (archive de Merill Fernando) | Message Center M365 + Roadmap M365 (~6 500 éléments, tags *Retirement*, *Plan for change*) | **en direct** dans le navigateur, toutes les 30 min |
| endoflife.date | Versions et fins de support iOS, iPadOS, macOS, Android, Windows | **en direct** |
| Microsoft Learn « What's new » | Entra, Intune, Defender (Endpoint, Office 365, Identity, Cloud Apps, XDR), Sentinel, Purview | `collect.ps1` |
| Microsoft Learn Lifecycle | Retraits et fins de support des produits (année -1 à +2) | `collect.ps1` |
| Blogs Tech Community, Microsoft Security Blog, Microsoft 365 Blog | Annonces produits | `collect.ps1` |
| Microsoft Graph changelog | Nouveautés et dépréciations d'API (120 jours) | `collect.ps1` |
| Partner Center — annonces mensuelles | Changements de prix, listes de prix, devises, facturation à l'usage, promotions (12 mois) | `collect.ps1` |
| MSRC — Security Update Guide (API Microsoft) | CVE des produits suivis : gravité, CVSS, exploitation constatée, divulgation publique (90 jours, paramètre `-MsrcDays`) | `collect.ps1` |
| CNIL — actualités | Actualités liées à Microsoft 365 : cloud, outils collaboratifs, messagerie, transferts de données, hébergement (≈ 12 mois, paramètre `-CnilPages`) | `collect.ps1` |
| ANSSI — catalogue des guides et actualités | Guides et recommandations liés aux technologies suivies | `collect.ps1` |
| CIS — « CIS Benchmarks Update » mensuels | Benchmarks nouveaux ou mis à jour (Windows, Intune, Microsoft 365, iOS, macOS, Android…) (12 mois) | `collect.ps1` |

L'onglet **Organismes** regroupe les publications MSRC, CNIL, CIS et ANSSI. Seules celles qui concernent un produit suivi y apparaissent. Les correspondances se font par mots-clés : table `MSRC_RE` pour les CVE Microsoft, table `ORG_RE` (français et anglais) pour les autres organismes, dans `app.js`.
| Apple Developer, Apple Security Releases, Android Developers Blog | Sorties d'OS, mises à jour de sécurité | `collect.ps1` |

Si les sources en direct sont injoignables, la page utilise la copie locale (`data/mc-fallback.js`, `data/eol-fallback.js`).

## Mon tenant (Message Center et état des services)

`collect.ps1` lit aussi le Message Center et l'état des services de **votre** tenant via Microsoft Graph, avec une authentification par certificat.

1. Une application Entra avec les permissions d'application `ServiceMessage.Read.All` et `ServiceHealth.Read.All` (consentement administrateur).
2. Son certificat installé avec la clé privée dans `Cert:\CurrentUser\My` (ou `LocalMachine\My`).
3. Un fichier `tenant.config.json` à la racine :
   ```json
   { "tenantId": "...", "clientId": "...", "certThumbprint": "..." }
   ```

Le collecteur n'appelle que les API Service Communications (`/admin/serviceAnnouncement/...`). Les données vont dans `data/tenant.js` : ce fichier et la configuration sont exclus de Git (`.gitignore`) et de la publication GitHub Pages. Elles se mettent à jour à chaque lancement de la collecte.

- **Nouveautés** : source « Mon tenant ». Un message présent dans votre tenant remplace sa copie de l'archive publique, avec la date « Action requise avant le … » quand Microsoft la fournit.
- **État des services** : services dégradés, incidents et avis en cours avec leur dernière mise à jour, résolus des 30 derniers jours. Cliquez sur un service pour filtrer, survolez-le pour un aperçu.
- **Actualisation** : la collecte du tenant est dans `collect-tenant.ps1`. Quand l'application est ouverte via `Lancer-Veille.cmd` (serveur local), le bouton ⟳ et un rafraîchissement automatique toutes les 5 minutes relancent cette collecte (adresse locale `/api/tenant`).
- **Windows release health** : dans le même onglet, les problèmes connus des mises à jour Windows 11, Windows 10 et Windows Server, avec un filtre par version. On y trouve la KB d'origine, la KB corrective, l'état, le détail du contournement et les plateformes touchées. Source publique, collectée par `collect.ps1`.

## Nouveautés depuis ma dernière visite

Le navigateur mémorise la date de première apparition de chaque annonce. Tout ce qui est apparu depuis votre visite précédente porte un badge **Nouveau**, avec des compteurs « +N » sur les onglets et les produits. Le bandeau permet de n'afficher que les nouveautés ou de tout marquer comme vu.

## Navigation

- Menu de gauche en accordéon : **Tout voir** puis les produits, classés par groupe. Defender regroupe Endpoint, Office 365, Identity, Cloud Apps et XDR.
- Cliquer sur un produit le déplie et affiche ses **fonctionnalités**. Un seul produit est ouvert à la fois, et recliquer dessus revient à « Tout voir ». Les nouveautés sont regroupées par fonctionnalité (bascule « Regrouper par : Fonctionnalité / Date »).
- Chaque vue a son adresse, à mettre en favori : `#news/intune`, `#news/intune/autopilot`, `#retire/entra/auth`…

## Icônes

Le dossier `icons/` contient les icônes officielles de Microsoft :
- [Azure architecture icons](https://learn.microsoft.com/azure/architecture/icons/) : Intune, Sentinel, Defender, Compliance (Purview), Licences et fonctionnalités Entra/Intune ;
- [Microsoft Entra architecture icons](https://learn.microsoft.com/entra/architecture/architecture-icons) ;
- les logos produits de Fluent UI (SharePoint, Teams, OneDrive, Outlook, Microsoft 365, Word, Loop) ;
- les logos de Microsoft Learn (Exchange, Windows, Graph, Copilot, PowerShell, Android) ;
- deux pictogrammes simples (téléphone, ordinateur portable) pour iOS et macOS.

Elles sont utilisées selon les conditions de Microsoft (documentation et outils, sans modification). Les packs officiels actuels ne contiennent pas de logo Purview : c'est l'icône Microsoft « Compliance Center » qui le représente.

## Personnalisation

- **Produits et fonctionnalités** : tableau `PRODUCTS` en haut de `app.js`. Pour chaque produit : noms de services du Message Center, expression régulière sur le titre et liste `features`. Chaque fonctionnalité a un nom, une icône (fichier dans `icons/`) et une expression régulière. Une annonce qui ne correspond à aucune fonctionnalité est rangée dans « Autres ».
- **Détection des retraits** : `RETIRE_RE` dans `app.js`. Les échéances sont extraites automatiquement du texte (« March 31, 2027 », « by June 2027 »…) : vérifiez toujours le message source.
- **Flux** : ajoutez une ligne `Read-Feed` / `Read-Learn` dans `collect.ps1`.

Les messages du Message Center varient selon le tenant : le lien « Ouvrir dans mon tenant » renvoie vers votre centre d'administration.
