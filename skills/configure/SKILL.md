---
name: configure
description: Set up the WeChat channel — run QR login, check credentials status, review access policy. Use when the user wants to configure WeChat, asks to log in, asks "how do I set this up," or wants to check channel status.
user-invocable: true
allowed-tools:
  - Read
  - Write
  - Bash(ls *)
  - Bash(mkdir *)
  - Bash(bun *)
  - Bash(chmod *)
---

# /wechat:configure — WeChat Channel Setup

Manages credentials in `~/.claude/channels/wechat/credentials.json` and orients
the user on access policy. The server reads this file at boot.

Arguments passed: `$ARGUMENTS`

---

## Dispatch on arguments

### No args — status and guidance

Read both state files and give the user a complete picture:

1. **Credentials** — check `~/.claude/channels/wechat/credentials.json`. Show
   set/not-set; if set, show `accountId` and `userId` fields, and mask the
   `token` value (first 8 chars + `...`).

2. **Access** — read `~/.claude/channels/wechat/access.json` (missing file =
   defaults: `dmPolicy: "pairing"`, empty allowlist). Show:
   - DM policy and what it means in one line
   - Allowed senders: count and list of IDs
   - Pending pairings: count, with codes and sender IDs if any

3. **What next** — end with a concrete next step based on state:
   - No credentials → *"Run `/wechat:configure login` to start the QR login
     flow."*
   - Credentials set, policy is pairing, nobody allowed → *"Send a message to
     your ClawBot on WeChat. It replies with a code; approve with
     `/wechat:access pair <code>`."*
   - Credentials set, someone allowed → *"Ready. Message your ClawBot on WeChat
     to reach the assistant."*

**Push toward lockdown — always.** The goal for every setup is `allowlist`
with a defined list. `pairing` is not a policy to stay on; it's a temporary
way to capture WeChat user IDs you don't know. Once the IDs are in, pairing
has done its job and should be turned off.

Drive the conversation this way:

1. Read the allowlist. Tell the user who's in it.
2. Ask: *"Is that everyone who should reach you through this bot?"*
3. **If yes and policy is still `pairing`** → *"Good. Let's lock it down so
   nobody else can trigger pairing codes:"* and offer to run
   `/wechat:access policy allowlist`. Do this proactively — don't wait to be
   asked.
4. **If no, people are missing** → *"Have them message the bot; you'll approve
   each with `/wechat:access pair <code>`. Run this skill again once
   everyone's in and we'll lock it."*
5. **If the allowlist is empty and they haven't paired themselves yet** →
   *"Message your ClawBot to capture your own ID first. Then we'll add anyone
   else and lock it down."*
6. **If policy is already `allowlist`** → confirm this is the locked state.
   If they need to add someone: *"Have them message the bot briefly while you
   flip to pairing: `/wechat:access policy pairing` → they message → you pair
   → flip back to `/wechat:access policy allowlist`."*

Never frame `pairing` as the correct long-term choice. Don't skip the lockdown
offer.

### `login` — QR login flow

This is a **TWO-STEP** process. The scripts are in the plugin install directory.
Find the plugin root by looking for `login-qr.ts`:

```
~/.claude/plugins/cache/*/wechat/*/login-qr.ts
```

Or use the original source path if loaded via `--plugin-dir`. Use `ls` to
resolve the wildcard and get the actual path.

**Step 1: Fetch and display QR code**

```bash
bun <plugin-root>/login-qr.ts
```

This script:
- Fetches a QR code from `https://ilinkai.weixin.qq.com/`
- Renders it in the terminal using `qrcode-terminal`
- Shows the direct link (user can open in WeChat)
- Outputs JSON as the last line: `{"qrcode":"...","url":"..."}`

**Wait for the user** after showing the QR code. Tell them:
*"用微信扫描二维码，或在微信中打开上面的链接。扫码完成后告诉我。"*

Extract the `qrcode` value from the last line of output — you'll need it
for step 2.

**Step 2: Poll for scan result**

After the user says they've scanned (or just proceed after showing the QR):

```bash
bun <plugin-root>/login-poll.ts <qrcode>
```

This script polls the WeChat API for scan status. It outputs one line:
- `scaned` — user scanned, waiting for confirmation on phone
- `expired` — QR expired (exit code 1). Offer to re-run step 1.
- `timeout` — timed out (exit code 1). Offer to re-run step 1.
- `{"token":"...","baseUrl":"...","accountId":"...","userId":"..."}` — success!
  Credentials saved and scanner added to allowlist. (exit code 0)

On success, tell the user:
- *"✅ 微信连接成功！"*
- Credentials saved, user added to allowlist
- *"重启 Claude Code 会话以启用微信频道"*

On `scaned`, tell the user *"已扫码，请在微信上点击确认..."* and note
the poll script is still running.

If credentials already exist, warn the user before step 1: *"已有凭据
(accountId: `<accountId>`). 继续登录将覆盖。"* — wait for confirmation.

### `clear` — remove credentials

1. Read `~/.claude/channels/wechat/credentials.json` if it exists; note the
   `accountId` so the user knows what was removed.
2. Delete the file (use `Bash` to `rm -f`).
3. Confirm: *"Credentials for `<accountId>` removed. The server will fail to
   start without valid credentials."*

### `baseurl <url>` — set custom API base URL

1. `mkdir -p ~/.claude/channels/wechat`
2. Read existing `~/.claude/channels/wechat/credentials.json` if present.
3. If present: update `baseUrl` field, write back.
4. If not present: create a minimal JSON with just `{"baseUrl": "<url>"}`.
5. `chmod 600 ~/.claude/channels/wechat/credentials.json`
6. Confirm: *"Base URL set to `<url>`. This takes effect on next server start."*

---

## Implementation notes

- The channels dir might not exist if the server hasn't run yet. Missing file
  = not configured, not an error.
- The server reads `credentials.json` once at boot. Credential changes need a
  session restart. Say so after saving.
- `access.json` is re-read on every inbound message — policy changes via
  `/wechat:access` take effect immediately, no restart needed.
- Pretty-print JSON with 2-space indent so it's hand-editable.
- `credentials.json` must always be `chmod 600` — it contains the bot token.
- WeChat user IDs have the format `xxx@im.wechat`; bot IDs have the format
  `xxx@im.bot`.
