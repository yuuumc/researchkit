# 线上冒烟：测「载入示例」缓存回放 wall time
# 用法: .\scripts\smoke-prod-replay.ps1
$ErrorActionPreference = 'Stop'

$baseUrl = 'https://researchkit-mu.vercel.app'
$endpoint = "$baseUrl/api/research/multi-agent-stream"

$content = @'
The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.

Experiments on two machine translation tasks show these models to be superior in quality while being more parallelizable and requiring significantly less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results, including ensembles, by over 2 BLEU.

On the WMT 2014 English-to-French translation task, our model establishes a new single-model state-of-the-art BLEU score of 41.8 after training for 3.5 days on eight GPUs, a small fraction of the training costs of the best models from the literature. We show that the Transformer generalizes well to other tasks by applying it successfully to English constituency parsing both with large and limited training data.
'@

$body = @{
  content = $content
  title = 'Attention Is All You Need'
  source = 'built-in example'
  providerType = 'deepseek'
  model = 'deepseek-v4-flash'
  outputLocale = 'en-US'
  preset = 'academic'
} | ConvertTo-Json -Compress

Write-Host "POST $endpoint"
Write-Host "body length: $($content.Length) chars"
$t0 = Get-Date

try {
  $resp = Invoke-WebRequest -Uri $endpoint -Method POST -Body $body `
    -ContentType 'application/json' -UseBasicParsing -TimeoutSec 70
  $wall = ((Get-Date) - $t0).TotalMilliseconds
  $text = $resp.Content
  Write-Host "HTTP $($resp.StatusCode)  wall=$([math]::Round($wall))ms  resp=$($text.Length) bytes"

  # 解析 SSE：按 event: / data: 配对
  $events = $text -split "`n`n"
  $resultData = $null
  foreach ($blk in $events) {
    if ($blk -match "(?ms)^event:\s*result`r?`ndata:\s*(\{.*\})$") {
      $resultData = $Matches[1]
      break
    }
  }
  if (-not $resultData) {
    Write-Host "WARN: no result event found, dump first 800 chars:"
    Write-Host $text.Substring(0, [math]::Min(800, $text.Length))
    return
  }
  $obj = $resultData | ConvertFrom-Json
  $cacheHit = $obj.metadata.example_replay.cacheHit
  $origDur = $obj.metadata.example_replay.originalDurationMs
  Write-Host "cacheHit=$cacheHit  originalDurationMs=$origDur"
  Write-Host "wall=$([math]::Round($wall))ms  vs original=$origDur ms"
} catch {
  $wall = ((Get-Date) - $t0).TotalMilliseconds
  Write-Host "FAILED after $([math]::Round($wall))ms : $_"
}
