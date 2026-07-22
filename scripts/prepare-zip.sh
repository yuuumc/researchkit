#!/usr/bin/env bash
# prepare-zip.sh — 打包前清理 dev artifacts + secrets
# 用法: bash scripts/prepare-zip.sh [output-dir]
# 默认输出到 ../researchkit-clean.zip

set -e

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTPUT="${1:-$ROOT/../researchkit-$(node -p "require('./package.json').version").zip"}"

echo "📦 Preparing clean zip (excluding secrets + dev artifacts)..."

# 1. 检查是否在项目根目录
if [ ! -f "$ROOT/package.json" ]; then
  echo "❌ Error: package.json not found in $ROOT"
  exit 1
fi

# 2. 排除清单（secrets + dev artifacts + build cache + deps）
EXCLUDES=(
  ".env.local"
  ".env.*.local"
  ".env"
  ".researchkit-data/"
  ".researchkit-output/"
  "scripts/reports/*.json"
  "scripts/reports/*.md"
  "node_modules/"
  ".next/"
  ".git/"
  "*.log"
)

# 3. 构建 zip 排除参数
ZIP_EXCLUDES=()
for pattern in "${EXCLUDES[@]}"; do
  ZIP_EXCLUDES+=("--exclude=*${pattern}*")
done

# 4. 打包
cd "$ROOT/.."
zip -r "$OUTPUT" "$(basename "$ROOT")" "${ZIP_EXCLUDES[@]}"

echo ""
echo "✅ Clean zip created: $OUTPUT"
echo ""
echo "Excluded:"
printf '  - %s\n' "${EXCLUDES[@]}"
echo ""
echo "⚠️  Verify no secrets leaked:"
echo "  unzip -l \"$OUTPUT\" | grep -E '\\.env|researchkit-data|researchkit-output|reports/'"
echo "  (should return empty)"
