# claude-code-wechat

通过企业微信 ClawBot 将微信消息接入 Claude Code 会话的渠道插件。基于微信 iLink Bot API，无需第三方网关，支持文字、图片、文件、语音和视频收发。

A Claude Code channel plugin that bridges WeChat messages into Claude Code sessions via the WeChat iLink Bot API. Supports full bidirectional text and media (image, file, video, voice) with built-in access control. No external gateway dependency.

---

## 前置条件 / Prerequisites

- **[Bun](https://bun.sh)** — MCP 服务器运行时。安装：`curl -fsSL https://bun.sh/install | bash`
- **Claude Code v2.1.80+** — 需要 `--channels` 参数支持
- **微信 iOS 最新版 + ClawBot** — iLink Bot API 的接入方式

---

## 快速开始 / Quick Setup

> 默认配对流程，适合个人使用。多用户和访问控制详见 [ACCESS.md](./ACCESS.md)。
>
> Default pairing flow for single-user setup. See [ACCESS.md](./ACCESS.md) for multi-user access control.

**1. 安装插件 / Install the plugin**

先启动一个 Claude Code 会话（运行 `claude`），然后：

Start a Claude Code session first (run `claude`), then:

```
/plugin install wechat@xiangyang-plugins
```

**2. 登录 / Login**

```
/wechat:configure login
```

终端会渲染一个二维码，用微信（iOS）扫描登录。登录成功后，凭证保存至 `~/.claude/channels/wechat/credentials.json`，你的微信 ID 会自动加入允许列表。

A QR code will be rendered in the terminal. Scan it with WeChat (iOS) to log in. On success, credentials are saved to `~/.claude/channels/wechat/credentials.json` and your WeChat user ID is automatically added to the allowlist.

**3. 带渠道参数启动 / Launch with the channel flag**

退出当前会话，使用渠道参数重新启动：

Exit your current session and start a new one with the channel flag:

```sh
claude --channels plugin:wechat@xiangyang-plugins
```

**4. 配对 / Pair**

在微信上给你的 ClawBot 发一条消息，Bot 会回复一个 6 位配对码。在 Claude Code 终端中运行：

Send a message to your ClawBot on WeChat — it replies with a 6-character pairing code. In your Claude Code terminal run:

```
/wechat:access pair <code>
```

之后发送的微信消息会直接到达助手。

Your next WeChat message reaches the assistant.

> 配对完成后，建议切换到 `allowlist` 策略以防止陌生人触发配对：`/wechat:access policy allowlist`
>
> After pairing, switch to `allowlist` policy to stop strangers from getting pairing-code replies: `/wechat:access policy allowlist`

---

## 工具参考 / Tools Reference

| 工具 / Tool | 用途 / Purpose |
| --- | --- |
| `reply` | 发送文字回复。需传 `user_id`、`text`、`context_token`（均来自入站消息）。自动分块，将 Markdown 转为纯文本（微信不渲染 Markdown）。Send a text reply. Takes `user_id`, `text`, and `context_token` from the inbound message. Auto-chunks text and converts markdown to plain text. |
| `send_image` | 发送图片。需传 `user_id`、`file_path`（本地绝对路径）、`context_token`，可选 `caption`。通过 CDN 加密上传。Send an image via CDN upload. Takes `user_id`, `file_path` (absolute path), `context_token`, optional `caption`. |
| `send_file` | 发送文件附件。参数同 `send_image`。Send a file attachment. Same parameters as `send_image`. |
| `download_attachment` | 下载入站媒体文件（文件、视频）到本地 inbox。需传 `encrypt_query_param`、`aes_key`、`file_type`。Download inbound media (file, video) to local inbox. Takes `encrypt_query_param`, `aes_key`, `file_type`. |

**未实现的工具 / Tools NOT implemented:**
- `react` — iLink API 不支持表情回应 / iLink API does not support emoji reactions
- `edit_message` — 微信不支持编辑已发送的消息 / WeChat does not support editing sent messages

---

## 工作原理 / How It Works

```
微信用户 (iOS)
    |
WeChat ClawBot (iLink Bot API)
    |  HTTP long-poll / POST
    v
+------------------------------------------+
|  claude-code-wechat (MCP Server)         |
|                                          |
|  server.ts          <- 入口 + MCP 层     |
|  src/                                    |
|    api.ts           <- iLink HTTP 客户端 |
|    cdn.ts           <- CDN 上传/下载     |
|    crypto.ts        <- AES-128-ECB 加解密|
|    media.ts         <- 媒体处理          |
|    access.ts        <- 访问控制          |
|    auth.ts          <- 二维码登录        |
+------------------------------------------+
    |  stdio (MCP 协议)
    v
Claude Code Session
```

入站消息通过 `ilink/bot/getupdates` 长轮询到达，转发为 `notifications/claude/channel` 通知。图片在收到时立即下载（CDN URL 会过期）；文件和视频按需通过 `download_attachment` 工具下载。

Inbound messages arrive via `ilink/bot/getupdates` long-poll and are forwarded as `notifications/claude/channel` notifications. Images are downloaded eagerly on arrival (CDN URLs expire); files and videos are downloaded on demand via the `download_attachment` tool.

---

## 限制 / Limitations

- **无消息历史** — iLink API 不提供历史消息查询。助手只能看到当前会话收到的消息。No message history — the iLink API has no history endpoint. The assistant only sees messages arriving in the current session.
- **仅支持私聊** — iLink API 目前仅支持私信，不支持群聊。DMs only — the iLink API currently supports direct messages only, not group chats.
- **不支持编辑/撤回** — 微信不支持通过 Bot API 编辑或撤回已发送的消息。No edit/recall — WeChat does not support editing or recalling bot messages via the API.
- **Markdown 不渲染** — 微信不渲染 Markdown，`reply` 工具会自动将 Markdown 转为纯文本。Markdown is not rendered — the `reply` tool auto-converts markdown to plain text.
- **仅 iOS 微信** — ClawBot iLink API 仅适用于 iOS 版微信。iOS WeChat only — the ClawBot iLink API is iOS-specific.

---

## 访问控制 / Access Control

详见 **[ACCESS.md](./ACCESS.md)**。

See **[ACCESS.md](./ACCESS.md)** for full access control documentation.

快速参考：用户 ID 格式为 `xxx@im.wechat`。默认策略为 `pairing`。

Quick reference: user IDs have the format `xxx@im.wechat`. Default policy is `pairing`.

---

## 许可证 / License

MIT
