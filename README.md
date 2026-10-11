# Steam Account Auditor

A small Node.js toolkit for auditing **Steam accounts you own or control**. It runs as a two-stage pipeline:

1. **Extract** — log into each account, resolve its `SteamID64`, and collect the IDs.
2. **Check** — query the Steam Web API for each ID and sort accounts into *clean* and *banned* (VAC / community / trade).

> **Scope.** This tool is intended for managing and auditing accounts you legitimately own or are authorized to access (for example, verifying ban status across your own account inventory). You are responsible for complying with the [Steam Subscriber Agreement](https://store.steampowered.com/subscriber_agreement/) and all applicable terms and laws.

## How it works

```
data/accounts.txt ──▶ extract-ids ──▶ data/steam_ids.txt ──▶ check-bans ──▶ data/clean.txt
   (login:pass:                                                             data/banned.txt
    email:emailPass)
```

- **`extract-ids`** reads `data/accounts.txt`, logs in with [`steam-user`](https://www.npmjs.com/package/steam-user), and when Steam Guard is required it reads the login code from the account's mailbox over IMAP. Accounts are processed in concurrency-limited batches; between batches it can optionally rotate the outbound IP via an ADB-connected phone.
- **`check-bans`** reads `data/steam_ids.txt` and calls the Steam Web API `GetPlayerBans` endpoint in chunks of 100 over HTTPS, writing results to `data/clean.txt` and `data/banned.txt`.

## Requirements

- **Node.js 18+** (uses the built-in global `fetch`).
- A **Steam Web API key** — https://steamcommunity.com/dev/apikey (required for `check-bans`).
- IMAP access to the mailboxes that receive Steam Guard codes (required for `extract-ids` on accounts with Steam Guard).
- *(Optional)* [`adb`](https://developer.android.com/tools/adb) and a tethered Android phone, only if you enable IP rotation.

## Setup

```bash
npm install

# Configure secrets and settings
cp .env.example .env            # then edit .env and set STEAM_API_KEY, IMAP_*, etc.

# Provide input data (copy the examples and fill in real values)
cp data/accounts.example.txt data/accounts.txt
cp data/steam_ids.example.txt data/steam_ids.txt   # or let extract-ids generate it
```

All real input/output lives under `data/` and is git-ignored. Only the `*.example.txt` templates are committed.

## Usage

```bash
# Stage 1: resolve SteamID64s from account credentials
npm run extract-ids

# Stage 2: check ban status for the collected IDs
npm run check-bans
```

Outputs:

| File | Contents |
| --- | --- |
| `data/steam_ids.txt` | Resolved `SteamID64`s (appended by `extract-ids`) |
| `data/clean.txt` | IDs with no bans (overwritten each `check-bans` run) |
| `data/banned.txt` | IDs with a VAC / community / trade ban |

## Configuration

All configuration is read from the environment (via `.env`). See [`.env.example`](.env.example) for the full list with defaults. Highlights:

| Variable | Default | Purpose |
| --- | --- | --- |
| `STEAM_API_KEY` | — | Steam Web API key (required for `check-bans`) |
| `IMAP_HOST` / `IMAP_PORT` / `IMAP_SECURE` | `imap.firstmail.ltd` / `993` / `true` | Mailbox server for Steam Guard codes |
| `CONCURRENCY` | `5` | Accounts logged in simultaneously |
| `CONNECT_TIMEOUT_MS` | `25000` | Per-account login timeout |
| `IP_ROTATION_ENABLED` | `false` | Toggle ADB airplane-mode IP rotation between batches |
| `BAN_CHECK_CHUNK_SIZE` | `100` | SteamIDs per `GetPlayerBans` request (API max is 100) |
| `LOG_LEVEL` | `info` | `error` \| `warn` \| `info` \| `debug` |

## Project layout

```
bin/            Thin CLI entrypoints (extract-ids, check-bans)
src/
  config.js        Environment-backed configuration and file paths
  logger.js        Leveled logger
  accountParser.js Parses login:password:email:emailPassword lines
  steamClient.js   Logs in and resolves SteamID64 (one account)
  mailbox.js       Retrieves Steam Guard codes over IMAP
  ipRotator.js     Optional ADB-based IP rotation
  extractIds.js    Orchestrates stage 1
  checkBans.js     Orchestrates stage 2
data/           Local input/output (git-ignored; only *.example.txt tracked)
```

## Account file format

One account per line in `data/accounts.txt`:

```
login:password:email:emailPassword
```

Fields are split on `:`. A password or email password that itself contains `:` is not supported by this format. Blank lines and lines starting with `#` are ignored.

## Security notes

- Secrets live only in `.env` and real data only in `data/` — both are git-ignored. Never commit real credentials.
- `check-bans` calls the Steam Web API over **HTTPS** so the API key is not sent in clear text.
- Account passwords and the API key are never written to logs.
