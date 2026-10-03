# Runbooks

All commands run on the server from the repository folder (for example `/opt/katf`) as root.
`dc` below means `docker compose -f deploy/docker-compose.yml --env-file deploy/.env`.

## Install

Needs: Ubuntu 24.04 or Debian 12, Docker Engine with Compose v2, ports 80 and 443 open, and the domain's
DNS `A` record (and `www`) pointing at the server.

```bash
git clone <repository> /opt/katf
sudo /opt/katf/deploy/install.sh
```

It asks for the domain and an email for certificates, generates every secret into `deploy/.env` and
`deploy/backup.env` (mode 600), builds and starts the stack, asks you to type the owner's password
(never shown or stored in a file), schedules backups, and prints the private admin address.

**Then, immediately:** save `deploy/.env` and `deploy/backup.env` in a password manager. Without
`DATA_KEY` and `RESTIC_PASSWORD` a backup cannot be restored.

## First sign-in

1. Open the admin address. Sign in with the owner email and password.
2. Scan the QR code with an authenticator app and enter the code. Save the ten recovery codes offline.
3. **Settings → Brand & company:** company name, CR number, address, contact email and phone, WhatsApp,
   jurisdiction. Legal texts show these from the settings.
4. **Staff:** add a verifier, support and finance account as needed (each sets up TOTP at first sign-in).
5. **Areas / Services:** check the neighbourhood pins and the price guides.

## Before going live (the legal gate)

Live payments, public technician registration and SMS to the public stay off until all of these are done:

1. The lawyer reviews every text in **Legal documents** (and the open questions in DECISIONS.md F).
   Publish each approved text as a new version and tick "The lawyer approved this text" only with the
   lawyer's written approval.
2. Payment provider contract signed. In `deploy/.env`: `PAYMENT_PROVIDER=thawani`, the live keys and the
   live base URL the provider gives you (`THAWANI_BASE_URL`), `THAWANI_LIVE=true`. Register the webhook
   `https://<domain>/api/webhooks/payments` with the provider. Run `dc up -d api`.
3. SMS provider configured (`SMS_PROVIDER` and its keys). Test with **Messaging → Send me a test**.
4. iPhone push: APNs key filled (see [ios.md](ios.md)).
5. `DEMO_MODE=false` (the default).
6. **Settings → Switches → Legal gate cleared.** The switch refuses while any required text is a draft.

## Daily and weekly work

| When | Who | What |
|---|---|---|
| Daily | Verifier | **Applications**: oldest first (target in Settings → review time) |
| Daily | Support | **Overview** alerts, **Dispatch** (unaccepted requests), **Support**, flagged chats |
| Daily | Finance/Support | **Disputes** before their decision time |
| Weekly (or per setting) | Finance | **Payouts** → create batch → download the bank CSV → upload to the bank → "Mark as paid" with the bank reference |
| Weekly | Finance | **Payments → Reconcile** with the provider's report; **Reports** shows the ledger balance |
| Monthly | Owner | **Security**: staff sessions, sign-ins, audit chain check; rotate the admin path if staff changed |

## Update

```bash
sudo /opt/katf/deploy/update.sh
```

Backs up, pulls, rebuilds, restarts and checks health. If the new version is not healthy it puts the
previous images and code back automatically. Database changes only add things, so the previous version
keeps working; if a release note says otherwise, restore the pre-update backup (below).

## Backups and restore

- Nightly at 02:15: database dump, uploaded files and both env files, encrypted with restic (AES-256),
  14 days kept (`KEEP_DAILY` in `backup.env`). Log: `/var/log/katf-backup.log`.
- Fridays at 04:30: `restore.sh --test` restores the latest backup into a throw-away database and checks the
  ledger balance and the audit chain. A failure is in the same log.
- **Off-site copy (strongly recommended):** set `RESTIC_REPOSITORY` in `deploy/backup.env` to an S3, B2 or SFTP
  location and its credentials. A backup on the same server does not survive losing the server.

```bash
sudo deploy/backup.sh               # backup now
sudo deploy/restore.sh --test       # safe check
sudo deploy/restore.sh              # REPLACE live data with the latest backup (asks to type RESTORE)
sudo deploy/restore.sh 2026-10-03T021500Z   # a specific night
```

A live restore first takes a safety backup of the current state. If the chosen backup was made before a
key rotation, it switches `DATA_KEY` back to the key saved inside that backup.

**New server from backups:** install Docker, clone the repository, copy your saved `deploy/.env` and
`deploy/backup.env` into `deploy/`, run `install.sh` (it keeps existing env files), then
`deploy/restore.sh`.

## Admin address

```bash
sudo deploy/show-admin-path.sh      # print it
sudo deploy/rotate-admin-path.sh    # new secret address; everyone signs in again
```

## Rotate the data key

```bash
sudo deploy/rotate-data-key.sh
```

Backs up, stops the app for about a minute, re-encrypts every encrypted field and stored file under a new
`DATA_KEY`, recomputes the lookup indexes, restarts, and backs up again under the new key. Open sign-in
codes are cancelled and links signed with the old key (old tracking links, file links) stop working.
Save the new `deploy/.env` offline afterwards. Do it if the key may have leaked, or yearly.

## Lost authenticator

- A staff member: the owner opens **Staff → Reset two-step verification**; the person enrols again at the
  next sign-in.
- The owner: sign in with one of the recovery codes ("Use a recovery code").
- The owner with no recovery codes: on the server, `dc exec api node dist/cli.js create-owner` creates a
  new owner account; then disable the old one in **Staff**.

## Suspected breach

1. **Security → Active sessions:** end every staff session; rotate the admin path; reset staff passwords and TOTP.
2. Rotate the data key.
3. Review the **audit log** (the chain check must say "intact") and sign-in history.
4. Ask the lawyer about notification duties under the Personal Data Protection Law before contacting users.

## Useful commands

```bash
dc ps                                   # what is running
dc logs -f --tail 200 api               # API log (no personal data is logged)
curl -fsS https://<domain>/api/health   # health
dc exec api node dist/cli.js verify-audit
dc exec db psql -U katf -d katf         # database shell (careful)
```
