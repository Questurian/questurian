# Google AI Access Guide (This Machine Only)

This guide is for a new developer using **this exact workstation**.

## 1) What is already configured on this machine

- Existing ADC credential file is present at:
  - `/Users/alanmalpartida/.config/gcloud/application_default_credentials.json`
- Project/location env vars are already set in this repo:
  - `apps/backend/.env`
  - `.env`
- Current project used by the app env:
  - `GOOGLE_CLOUD_PROJECT=circular-symbol-484517-g2`
  - `GOOGLE_CLOUD_LOCATION=us-central1`

## 2) What the new dev should do first

1. Use the existing machine credentials first (no re-auth needed initially).
2. Verify credential file exists:

```bash
ls -l ~/.config/gcloud/application_default_credentials.json
```

3. Verify project env in repo:

```bash
rg -n "GOOGLE_CLOUD_PROJECT|GOOGLE_CLOUD_LOCATION" apps/backend/.env .env
```

## 3) If credentials are expired or invalid

Only then re-authenticate ADC on this machine:

```bash
gcloud auth application-default login
```

Then ensure project is correct:

```bash
gcloud config set project circular-symbol-484517-g2
```

## 4) Docker note

Docker is already wired to reuse this machine's credentials:

- `apps/backend/.env` is loaded via `docker-compose.yml`
- Host gcloud creds are mounted into container:
  - `~/.config/gcloud:/root/.config/gcloud:ro`

## 5) Security rules for this workstation

- Do not move or commit credential files.
- Do not paste credential JSON in docs/chat.
- If access breaks due account changes, re-run ADC login with the approved team account.
