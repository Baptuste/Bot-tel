# Déploiement — production

> Mis en service le **2026-09-01**. Remplace le tunnel cloudflared éphémère du dev.

Bot Tel tourne 24/7 sur une **VM Oracle Cloud « Always Free »** (0 €/mois).

## Vue d'ensemble

```
Telegram  ──►  bot (long polling)
                    │
Client ──HTTPS──►  Caddy :443  ──►  localhost:3000  ──►  Node (bot + API + Mini App) + SQLite
  129.151.240.254.sslip.io       (reverse proxy,          service systemd « bot-tel »
                                  cert Let's Encrypt auto)
```

| | |
|---|---|
| **Hébergeur** | Oracle Cloud Infrastructure, tenancy Free Tier, région `eu-marseille-1` (home region — définitive) |
| **VM** | `bot-tel` · Oracle Linux 9 · ARM `VM.Standard.A1.Flex` 1 OCPU / 6 Go · **Always Free** |
| **IP publique** | `129.151.240.254` — éphémère, mais un timer systemd (`sync-ip`) re-aligne tout seul le hostname `sslip.io` si elle change (voir plus bas) — rien à réserver |
| **Accès SSH** | `ssh -i ~/.ssh/bottel opc@129.151.240.254` (utilisateur `opc`) |
| **URL Mini App** | `https://129.151.240.254.sslip.io` — [sslip.io](https://sslip.io) résout `<ip>.sslip.io` → l'IP, sans compte ni enregistrement DNS. `WEBAPP_URL` dans `.env`. |
| **Réseau OCI** | VCN `bot-tel-vcn` (Start VCN Wizard) ; Security List : ingress TCP **22 + 80 + 443** depuis `0.0.0.0/0` |

## Services sur la VM

| Unité systemd | Rôle |
|---|---|
| `bot-tel` | `node --import tsx src/index.ts` (`User=opc`, `Restart=always`, `enabled`) — démarre au boot |
| `caddy` | reverse proxy `:443 → localhost:3000`, `/etc/caddy/Caddyfile`, certificat Let's Encrypt automatique (tls-alpn-01) |
| `sync-ip.timer` | `/usr/local/bin/sync-ip.sh` — 30 s après chaque boot + toutes les 15 min : compare l'IP publique actuelle au hostname du Caddyfile ; si elle a changé, réécrit `Caddyfile` + `.env` (`<ip>.sslip.io`), recharge Caddy, redémarre le bot. **→ l'IP éphémère n'a pas besoin d'être réservée.** |

```bash
systemctl status bot-tel caddy
sudo journalctl -u bot-tel -f          # logs du bot en direct
```

## Sécurité

- **Deux pare-feux** : `firewall-cmd --add-service={http,https}` sur la VM **et** la Security List OCI (console).
- **SELinux** : `Enforcing` + `setsebool -P httpd_can_network_connect 1` (Caddy → localhost:3000).
- `.env` en `chmod 600`, jamais commité.

## Code

Transféré par **bundle git** (pas de dépôt distant) :

```powershell
# local — C:\Users\bmarchand\Documents\perso\Bot-tel
git bundle create $env:TEMP\bot-tel.bundle --branches HEAD
scp -i $HOME\.ssh\bottel $env:TEMP\bot-tel.bundle opc@129.151.240.254:/home/opc/bot-tel.bundle
ssh -i $HOME\.ssh\bottel opc@129.151.240.254 ./deploy.sh
```

`~/deploy.sh` (sur la VM) : `git fetch` + `git reset --hard origin/main` + `npm ci` + `npm ci` (web) + `npm run build:web` + `systemctl restart bot-tel`.

## Sauvegardes

`~/backup-bot.sh` : `sqlite3 .backup` + gzip, rotation 21 jours, dossier `~/backups/`.
Cron quotidien à **03:15**. Rapatrier une sauvegarde :

```powershell
scp -i $HOME\.ssh\bottel opc@129.151.240.254:/home/opc/backups/bot-AAAA-MM-JJ_HHMM.db.gz .
```

## Mise en route initiale (référence — déjà fait)

1. Compte Oracle Cloud (carte bancaire = vérification, non débitée). Home region proche.
2. VCN via **Start VCN Wizard** → « Create VCN with Internet Connectivity ».
3. Instance : Oracle Linux 9, shape Ampere `A1.Flex` 1/6, réseau = VCN + sous-réseau public + IP publique auto.
   Clé SSH injectée par **cloud-init** (`ssh_authorized_keys`) — le nouvel assistant n'a pas de champ clé.
4. Security List : ajouter ingress TCP 80 et 443.
5. VM : `dnf module install nodejs:20`, `dnf install git sqlite gcc-c++ python3`, `firewall-cmd` 80/443.
6. Code (bundle), `.env`, `npm ci` + `build:web`.
7. Service `bot-tel` (systemd), Caddy (COPR `@caddy/caddy`), Caddyfile → cert auto.
8. Sauvegardes (cron).

## Reste à faire

- Base de prod **vierge** : saisir le vrai catalogue + photos via la Mini App admin.
- Optionnel : **vrai nom de domaine** (~10 €/an) → remplacer `<ip>.sslip.io` dans `/etc/caddy/Caddyfile` + `.env` + **désactiver `sync-ip.timer`**, `systemctl reload caddy`, redémarrer le bot.
- Optionnel : passer le compte OCI en *Pay As You Go* (reste 0 € en Always Free, supprime le risque de récupération d'instance inactive).
