/**
 * 临时调试：暴露 OKX_API_SECRET 和 OKX_API_PASSPHRASE 的 SHA-256 指纹
 * 用于与用户在 OKX 网站看到的原始值做交叉验证
 *
 * 不暴露原始值，只暴露指纹（防止日志泄露）
 * 用户可以用 PowerShell 计算 OKX 网站上看到的 secret 的 SHA-256:
 *   $sha = [System.Security.Cryptography.SHA256]::Create()
 *   $bytes = [System.Text.Encoding]::UTF8.GetBytes("你的secret")
 *   $hash = $sha.ComputeHash($bytes)
 *   $fingerprint = [System.BitConverter]::ToString($bytes).Replace("-","").ToLower()
 *   Write-Host $fingerprint
 * 然后对比 debug-fingerprint 返回的 sha256_fingerprint
 */
import { NextResponse } from 'next/server'
import { getX402Config } from '@/lib/x402/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function sha256Hex(s: string): string {
  const { createHash } = require('crypto') as typeof import('crypto')
  return createHash('sha256').update(s).digest('hex')
}

function md5Hex(s: string): string {
  const { createHash } = require('crypto') as typeof import('crypto')
  return createHash('md5').update(s).digest('hex')
}

export async function GET() {
  try {
    const cfg = getX402Config()

    return NextResponse.json({
      instructions: 'Compare fingerprints with what you see on OKX website. Use PowerShell to compute SHA-256 of original secret.',
      powershell_snippet: `
$secret = "你的原始 secret"
$bytes = [System.Text.Encoding]::UTF8.GetBytes($secret)
$sha = [System.Security.Cryptography.SHA256]::Create()
$hash = $sha.ComputeHash($bytes)
Write-Host ([System.BitConverter]::ToString($hash).Replace("-","").ToLower())
      `,
      api_key: {
        length: cfg.okxApiKey.length,
        first_3: cfg.okxApiKey.slice(0, 3),
        last_3: cfg.okxApiKey.slice(-3),
        sha256: sha256Hex(cfg.okxApiKey),
        md5: md5Hex(cfg.okxApiKey),
      },
      api_secret: {
        length: cfg.okxApiSecret.length,
        first_3: cfg.okxApiSecret.slice(0, 3),
        last_3: cfg.okxApiSecret.slice(-3),
        sha256: sha256Hex(cfg.okxApiSecret),
        md5: md5Hex(cfg.okxApiSecret),
        has_whitespace: /\s/.test(cfg.okxApiSecret),
        has_newline: /\n/.test(cfg.okxApiSecret),
        has_quote: /["']/.test(cfg.okxApiSecret),
      },
      passphrase: {
        length: cfg.okxApiPassphrase.length,
        first_3: cfg.okxApiPassphrase.slice(0, 3),
        last_3: cfg.okxApiPassphrase.slice(-3),
        sha256: sha256Hex(cfg.okxApiPassphrase),
        md5: md5Hex(cfg.okxApiPassphrase),
        has_whitespace: /\s/.test(cfg.okxApiPassphrase),
        has_newline: /\n/.test(cfg.okxApiPassphrase),
        has_quote: /["']/.test(cfg.okxApiPassphrase),
      },
    }, { status: 200 })
  } catch (e) {
    return NextResponse.json({
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 })
  }
}
