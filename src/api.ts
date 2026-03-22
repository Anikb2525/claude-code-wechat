/**
 * iLink Bot API HTTP client.
 * All endpoints: POST JSON with auth headers. Long-poll for getupdates.
 */
import { randomBytes } from 'crypto'
import type {
  GetUpdatesResp,
  GetUploadUrlReq,
  GetUploadUrlResp,
  SendMessageReq,
  SendTypingReq,
  GetConfigResp,
} from './types.js'

const CHANNEL_VERSION = '0.1.0'

const DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000
const DEFAULT_API_TIMEOUT_MS = 15_000
const DEFAULT_CONFIG_TIMEOUT_MS = 10_000

function randomWechatUin(): string {
  const uint32 = randomBytes(4).readUInt32BE(0)
  return Buffer.from(String(uint32), 'utf-8').toString('base64')
}

function buildHeaders(token: string, body: string): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'AuthorizationType': 'ilink_bot_token',
    'Authorization': `Bearer ${token}`,
    'Content-Length': String(Buffer.byteLength(body, 'utf-8')),
    'X-WECHAT-UIN': randomWechatUin(),
  }
}

async function apiFetch(params: {
  baseUrl: string
  endpoint: string
  body: string
  token: string
  timeoutMs: number
}): Promise<string> {
  const base = params.baseUrl.endsWith('/') ? params.baseUrl : `${params.baseUrl}/`
  const url = new URL(params.endpoint, base).toString()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), params.timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: buildHeaders(params.token, params.body),
      body: params.body,
      signal: controller.signal,
    })
    clearTimeout(timer)
    const text = await res.text()
    if (!res.ok) throw new Error(`${params.endpoint} ${res.status}: ${text}`)
    return text
  } catch (err) {
    clearTimeout(timer)
    throw err
  }
}

function withBaseInfo(body: object): string {
  return JSON.stringify({ ...body, base_info: { channel_version: CHANNEL_VERSION } })
}

export async function getUpdates(opts: {
  baseUrl: string
  token: string
  getUpdatesBuf: string
  timeoutMs?: number
}): Promise<GetUpdatesResp> {
  try {
    const raw = await apiFetch({
      baseUrl: opts.baseUrl,
      endpoint: 'ilink/bot/getupdates',
      body: withBaseInfo({ get_updates_buf: opts.getUpdatesBuf }),
      token: opts.token,
      timeoutMs: opts.timeoutMs ?? DEFAULT_LONG_POLL_TIMEOUT_MS,
    })
    return JSON.parse(raw) as GetUpdatesResp
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return { ret: 0, msgs: [], get_updates_buf: opts.getUpdatesBuf }
    }
    throw err
  }
}

export async function sendMessage(opts: {
  baseUrl: string
  token: string
  body: SendMessageReq
}): Promise<void> {
  await apiFetch({
    baseUrl: opts.baseUrl,
    endpoint: 'ilink/bot/sendmessage',
    body: withBaseInfo(opts.body),
    token: opts.token,
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
  })
}

export async function getUploadUrl(opts: {
  baseUrl: string
  token: string
  req: GetUploadUrlReq
}): Promise<GetUploadUrlResp> {
  const raw = await apiFetch({
    baseUrl: opts.baseUrl,
    endpoint: 'ilink/bot/getuploadurl',
    body: withBaseInfo(opts.req),
    token: opts.token,
    timeoutMs: DEFAULT_API_TIMEOUT_MS,
  })
  return JSON.parse(raw) as GetUploadUrlResp
}

export async function getConfig(opts: {
  baseUrl: string
  token: string
  ilinkUserId: string
  contextToken?: string
}): Promise<GetConfigResp> {
  const raw = await apiFetch({
    baseUrl: opts.baseUrl,
    endpoint: 'ilink/bot/getconfig',
    body: withBaseInfo({
      ilink_user_id: opts.ilinkUserId,
      context_token: opts.contextToken,
    }),
    token: opts.token,
    timeoutMs: DEFAULT_CONFIG_TIMEOUT_MS,
  })
  return JSON.parse(raw) as GetConfigResp
}

export async function sendTyping(opts: {
  baseUrl: string
  token: string
  body: SendTypingReq
}): Promise<void> {
  await apiFetch({
    baseUrl: opts.baseUrl,
    endpoint: 'ilink/bot/sendtyping',
    body: withBaseInfo(opts.body),
    token: opts.token,
    timeoutMs: DEFAULT_CONFIG_TIMEOUT_MS,
  })
}
