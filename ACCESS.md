# WeChat — Access & Delivery

A WeChat ClawBot is linked to a specific account. While it only receives messages directed to it, without a gate those messages would flow straight into your assistant session. The access model described here decides who gets through.

By default, a message from an unknown sender triggers **pairing**: the bot replies with a 6-character code and drops the message. You run `/wechat:access pair <code>` from your assistant session to approve them. Once approved, their messages pass through.

All state lives in `~/.claude/channels/wechat/access.json`. The `/wechat:access` skill commands edit this file; the server re-reads it on every inbound message, so changes take effect without a restart.

## At a glance

| | |
| --- | --- |
| Default policy | `pairing` |
| Sender ID | WeChat iLink user ID (e.g. `abc123@im.wechat`) |
| Config file | `~/.claude/channels/wechat/access.json` |

## DM policies

`dmPolicy` controls how messages from senders not on the allowlist are handled.

| Policy | Behavior |
| --- | --- |
| `pairing` (default) | Reply with a pairing code, drop the message. Approve with `/wechat:access pair <code>`. |
| `allowlist` | Drop silently. No reply. |
| `disabled` | Drop everything, including allowlisted users. |

```
/wechat:access policy allowlist
```

## User IDs

WeChat iLink identifies users by IDs in the format `xxx@im.wechat`. Pairing captures the ID automatically. If you need to add someone directly, have them send a message first (which creates a pending entry showing their ID), or ask them for their ID directly.

```
/wechat:access allow abc123@im.wechat
/wechat:access remove abc123@im.wechat
```

## Delivery

Configure outbound behavior with `/wechat:access set <key> <value>`.

**`textChunkLimit`** sets the split threshold for long messages. WeChat's practical limit is 4000 characters. The `reply` tool auto-chunks text above this limit, preferring paragraph boundaries.

```
/wechat:access set textChunkLimit 4000
```

## Skill reference

| Command | Effect |
| --- | --- |
| `/wechat:access` | Print current state: policy, allowlist, pending pairings. |
| `/wechat:access pair a4f91c` | Approve pairing code `a4f91c`. Adds the sender to `allowFrom` and writes an approved marker for the server to send confirmation on WeChat. |
| `/wechat:access deny a4f91c` | Discard a pending code. The sender is not notified. |
| `/wechat:access allow abc123@im.wechat` | Add a user ID directly. |
| `/wechat:access remove abc123@im.wechat` | Remove from the allowlist. |
| `/wechat:access policy allowlist` | Set `dmPolicy`. Values: `pairing`, `allowlist`, `disabled`. |
| `/wechat:access set textChunkLimit 4000` | Set a config key: `textChunkLimit`. |

## Config file

`~/.claude/channels/wechat/access.json`. Absent file is equivalent to `pairing` policy with empty lists, so the first message triggers pairing.

```jsonc
{
  // Handling for messages from senders not in allowFrom.
  "dmPolicy": "pairing",

  // WeChat iLink user IDs allowed to message the bot.
  "allowFrom": ["abc123@im.wechat"],

  // Pending pairing codes awaiting approval.
  "pending": {
    "a4f91c": {
      // The sender who triggered pairing.
      "senderId": "abc123@im.wechat",
      "createdAt": 1711100000000,
      "expiresAt": 1711103600000,
      // Number of times the pairing code reply has been sent to this sender.
      "replies": 1
    }
  },

  // Split threshold for long messages. WeChat practical limit is 4000.
  "textChunkLimit": 4000
}
```

## Pairing gate logic

When a message arrives from an unknown sender under `pairing` policy:

1. Load access.json, prune expired pending entries.
2. If `dmPolicy === 'disabled'` → drop.
3. If sender is in `allowFrom` → deliver.
4. If `dmPolicy === 'allowlist'` → drop silently.
5. If sender has an existing pending code → resend the code (up to 2 times), then drop.
6. If fewer than 3 pending entries exist → generate a new 6-char code, save it, reply to sender.
7. Otherwise → drop (too many simultaneous pending pairings).

Pending codes expire after 1 hour. After expiry, `/wechat:access pair <code>` will report the code as not found.
