# 一次性跑 quote → pay,避免 quote 过期和网络瞬时错误
$ErrorActionPreference = 'Stop'
$maxRetries = 3

for ($i = 1; $i -le $maxRetries; $i++) {
    Write-Host "=== Attempt $i/$maxRetries ==="
    try {
        Write-Host "[1/2] quote..."
        $quoteOut = onchainos payment quote https://www.researchkit.online/api/x402/research --method POST --param "goal=transformer attention mechanism" 2>&1 | Out-String
        $quote = $quoteOut | ConvertFrom-Json
        if (-not $quote.ok) { Write-Host "quote failed: $quoteOut"; continue }
        $payId = $quote.data.paymentId
        Write-Host "paymentId: $payId"

        Write-Host "[2/2] pay..."
        $payOut = onchainos payment pay --payment-id $payId --selected-index 0 --param "goal=transformer attention mechanism" --yes 2>&1 | Out-String
        Write-Host $payOut
        $pay = $payOut | ConvertFrom-Json
        if ($pay.ok) {
            Write-Host "=== SUCCESS ==="
            exit 0
        }
        Write-Host "pay failed, retrying..."
    } catch {
        Write-Host "exception: $_"
    }
    Start-Sleep -Seconds 2
}
Write-Host "=== ALL RETRIES FAILED ==="
exit 1
