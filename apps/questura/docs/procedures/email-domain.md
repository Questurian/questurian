# Procedure: set up email for questurian.com (Resend, SPF, DKIM, DMARC)

**Who this is for:** the owner, at go-live, with access to the Resend account
and the questurian.com DNS (Cloudflare).

**Why it matters:** password resets, verification links, membership emails and
security notices all come from Questurian through Resend. Without these DNS
records, Gmail and Outlook put them in spam or reject them, and a reader who
cannot reset their password cannot get back in.

Nothing here has been done yet. Written 2026-09-24 (launch fix plan, item 4).
No agent has sent a real email or changed DNS to write it.

---

## What the app already does

- Mail goes out through Resend, from **`EMAIL_FROM_ADDRESS`** with the display
  name **`EMAIL_FROM_NAME`** (default `Questurian`). Replies go to
  **`EMAIL_REPLY_TO`** when set, otherwise to the from address.
- In production the server **refuses to boot** without `RESEND_API_KEY` and
  `EMAIL_FROM_ADDRESS`. It also refuses a sender that is not on the site's own
  domain (`questurian.com`, or a subdomain of it such as
  `send.questurian.com`). `pnpm env:check` runs the same check against a filled
  env file before you deploy.
- Every reader email has a plain-text part as well as HTML, and every link in
  it points at the site or the API over https (render tests in
  `apps/server/src/features/emails/lib/templates.test.ts`). The staff
  password-set email is Payload's own and links to the CMS host.

## Decide two things first

1. **The from address.** Use a real mailbox you read, for example
   `hello@questurian.com`. The security emails (password changed, email
   changed, Google connected) tell the reader to **reply** if it wasn't them.
   If you would rather send from `noreply@questurian.com`, set `EMAIL_REPLY_TO`
   to a mailbox you do read.
2. **The Resend region.** Pick the one closest to the server: `us-east-1` if
   Railway runs in the US.

## Step 1: add the domain in Resend

Either in the dashboard (Resend → **Domains** → **Add domain** →
`questurian.com`), or with the Resend CLI (see "Can this be automated?"
below).

Resend then shows the records to publish. Copy the values from Resend, not
from this page: the DKIM key is unique to your account. They look like this:

| Type | Name (in Cloudflare) | Value | What it is |
|---|---|---|---|
| MX | `send` | `feedback-smtp.us-east-1.amazonses.com`, priority 10 | Where bounces go (the return path) |
| TXT | `send` | `v=spf1 include:amazonses.com ~all` | **SPF**: Resend (Amazon SES underneath) may send for the return path |
| TXT | `resend._domainkey` | `p=MIGf…` (long key from Resend) | **DKIM**: signs every message as questurian.com |

The MX and SPF records sit on `send.questurian.com`, not on the bare domain.
They do not touch any mail you receive at `questurian.com`, and they do not
conflict with an SPF record you may already have on the bare domain.

## Step 2: publish the records in Cloudflare

1. Cloudflare → questurian.com → **DNS** → **Records** → **Add record**, once
   per row Resend gave you.
2. Paste the name and value exactly. For the TXT records, paste the value
   without extra quotes.
3. **Proxy status: DNS only** (grey cloud). MX and TXT records cannot be
   proxied anyway, but check nothing is orange.

## Step 3: add DMARC

DMARC tells receivers what to do with mail that claims to be from
questurian.com but fails SPF and DKIM, and sends you reports. Resend does not
publish it for you.

Add one more TXT record:

| Type | Name | Value |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@questurian.com; fo=1` |

- Start with **`p=none`**: nothing is blocked, you only get reports. Point
  `rua` at a mailbox you can read (or a free DMARC report service's address).
- If `_dmarc.questurian.com` already exists, edit it. Two DMARC records make
  both invalid.
- **After two clean weeks**, meaning the reports show only Resend (and any
  other service you use on purpose) passing, change it to `p=quarantine`.
  Later, `p=reject` if you want.

## Step 4: verify in Resend

Resend → **Domains** → questurian.com → **Verify DNS records**. Usually minutes,
sometimes up to a few hours. Every row should turn **Verified**.

## Step 5: set the variables on the host

On Railway (server service), or on the laptop in
`~/questura/config/server.env`:

```
RESEND_API_KEY=re_...              # a sending-only key for questurian.com
EMAIL_FROM_ADDRESS=hello@questurian.com
# optional
EMAIL_FROM_NAME=Questurian
EMAIL_REPLY_TO=
```

Create the key in Resend → **API Keys** with **Sending access** only,
restricted to questurian.com. The server never needs a full-access key.

Then check the file before deploying:

```bash
pnpm --dir apps/questura/apps/server env:check path/to/filled.env   # must say the server would boot
```

## Step 6: the launch-day check

With the site live on the real domain:

1. Request a password reset for a **Gmail** address you own, and for an
   **Outlook / Hotmail** address you own.
2. Both must land in the **inbox**, not spam, from
   `Questurian <hello@questurian.com>` (or whatever you chose).
3. Open each one and look at the headers:
   - Gmail: ⋮ → **Show original**. The summary at the top must say
     **SPF: PASS**, **DKIM: PASS** and **DMARC: PASS**.
   - Outlook: … → **View** → **View message source**. Find
     `Authentication-Results` and check `spf=pass`, `dkim=pass` and
     `dmarc=pass`.
4. Click the reset link. It must open `https://api.questurian.com/…` and land
   on `https://www.questurian.com/…`.

If any of the three says fail, don't announce yet. Resend's domain page shows
which record is wrong.

---

## Can this be automated?

Partly. The Resend side can be scripted, and so can the Cloudflare side, but
each needs a credential the server should never hold. It is quick enough by
hand that a script only pays off if you set up more domains later.

- **Resend CLI** (official; `npm install -g resend-cli`, or
  `brew install resend/cli/resend`). Sign in with `resend login` using a
  **full-access** key (a sending-only key cannot manage domains). Then:

  ```bash
  resend domains create --name questurian.com --region us-east-1 --json   # prints the id and the records[] to publish
  resend domains verify <domain-id>                                        # after the DNS records are in
  resend domains get <domain-id>                                           # status of each record
  ```

  `domains update --tls enforced` makes Resend refuse to deliver over an
  unencrypted connection. Leave open and click tracking **off**: tracking
  rewrites links through Resend's own domain, and the reset link should be our
  own address.
- **The Resend API** does the same (`POST /domains`, `POST /domains/{id}/verify`,
  `GET /domains/{id}`).
- **Cloudflare DNS** can be written through its API with a DNS-edit token, so
  the `records[]` from `domains create` could be piped straight in. Nothing in
  this repo does that today.

The launch-day check (step 6) cannot be automated. It needs real inboxes at
Gmail and Outlook.

## If something goes wrong later

- **Resets stop arriving:** check Resend → **Logs** first. If it says
  "domain not verified", a DNS record was removed or changed. If it shows
  delivered, the reader's provider filtered it: check the DMARC reports.
- **The server refuses to boot after a change** with an `EMAIL_FROM_ADDRESS`
  or `RESEND_API_KEY` message: the variable is missing or the address is on the
  wrong domain. The message names which.
- **Rotating the Resend key:** create the new sending key, set it, deploy,
  then delete the old key in Resend.
