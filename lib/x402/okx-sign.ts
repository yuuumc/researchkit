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
  // 自定义 replacer + 排序
  const sortKeys = (val: unknown): unknown => {
    if (Array.isArray(val)) {
      return val.map(sortKeys)
    }
    if (val && typeof val === 'object') {
      const sorted: Record<string, unknown> = {}
      Object.keys(val as Record<string, unknown>)
        .sort()
        .forEach((k) => {
          sorted[k] = sortKeys((val as Record<string, unknown>)[k])
        })
      return sorted
    }
    return val
  }
  // JSON.stringify 默认无空格，手动加上
  // 用 4 空格缩进后正则替换太脆弱，改用 space 参数 + 后处理
  // 实际上 JSON.stringify(_, _, 1) 会产生换行 + 1 空格缩进，不是我们要的
  // Python json.dumps() 默认 separators=(', ', ': ')，即逗号后 1 空格、冒号后 1 空格
  // JS 实现方式：JSON.stringify 后正则替换
  const sortedObj = sortKeys(obj)
  const compact = JSON.stringify(sortedObj)
  // 在每个 : 和 , 后加一个空格（字符串内部的 : 和 , 不动，因为它们在引号内）
  // 简单方法：用 replacer 让 JSON.stringify 自己加空格
  // JSON.stringify(obj, null, 0)  → 无空格
  // 我们要的效果：{"a": 1, "b": 2}
  // 用正则：匹配 : 后非空白，加空格；匹配 , 后非空白，加空格
  // 但这会破坏字符串内部的 : 和 ,
  // 更安全：手写序列化器
  return compact
    .replace(/:(?!\s)/g, ': ')
    .replace(/,(?!\s)/g, ', ')
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
