/**
 * OKX API v5/v6 签名工具
 *
 * 2023 年 OKX 改版后签名规则：
 * 1. POST 请求的 body 必须是 Python json.dumps() 风格（冒号/逗号后加空格）
 *    即 {"key": "value", "key2": "value2"}，而不是 JSON.stringify() 默认的 {"key":"value","key2":"value2"}
 * 2. JSON 字段必须按字母顺序排序
 * 3. GET 请求的 query string 必须参与签名（path + "?" + queryString）
 *
 * 参考文档/案例：
 *   https://blog.csdn.net/ll0xx/article/details/135152509
 *   OKX 官方 Python SDK: json.dumps(body) 默认带空格
 *
 * 签名公式：base64(HMAC-SHA256(secret, timestamp + method + requestPath + body))
 * 其中 requestPath 对 GET 包含 query string（?foo=bar&baz=qux）
 */
import type { X402Config } from './config'

/**
 * 把 JSON 对象序列化为 OKX 风格的 JSON 字符串
 * - 字段按字母顺序排序
 * - 冒号后加空格
 * - 逗号后加空格
 */
export function okxStringify(obj: unknown): string {
  if (obj === null || obj === undefined) return ''
  // Python json.dumps() 默认 separators=(', ', ': ')，字段按字母序
  // 不能简单用 JSON.stringify + 正则替换，会破坏字符串里的 : 和 ,（如 URL）
  return serializeSorted(obj)
}

function serializeSorted(val: unknown): string {
  if (val === null) return 'null'
  if (typeof val === 'boolean') return String(val)
  if (typeof val === 'number') {
    if (Number.isFinite(val)) return String(val)
    return 'null'
  }
  if (typeof val === 'string') return JSON.stringify(val) // 自带转义，不动
  if (Array.isArray(val)) {
    if (val.length === 0) return '[]'
    const items = val.map(serializeSorted).join(', ')
    return `[${items}]`
  }
  if (typeof val === 'object') {
    const keys = Object.keys(val).sort()
    if (keys.length === 0) return '{}'
    const pairs = keys.map((k) => `${JSON.stringify(k)}: ${serializeSorted((val as Record<string, unknown>)[k])}`)
    return `{${pairs.join(', ')}}`
  }
  return 'null'
}

/**
 * OKX v5/v6 签名
 * @param method HTTP 方法（大写）
 * @param requestPath 请求路径（GET 时含 query string，如 /api/v5/account/balance?ccy=BTC）
 * @param body 请求体（POST 时是 JSON 字符串，GET 时是空字符串）
 * @param timestamp ISO 8601 UTC 时间戳
 */
export function okxSign(
  cfg: Pick<X402Config, 'okxApiSecret'>,
  method: 'POST' | 'GET' | 'PUT' | 'DELETE',
  requestPath: string,
  body: string,
  timestamp: string,
): string {
  const prehash = timestamp + method.toUpperCase() + requestPath + body
  const { createHmac } = require('crypto') as typeof import('crypto')
  return createHmac('sha256', cfg.okxApiSecret).update(prehash).digest('base64')
}
