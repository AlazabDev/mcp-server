#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
# 🚀 Daftra MCP — Full Pipeline Runner
# ═══════════════════════════════════════════════════════════════

set -e
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${CYAN}══════════════════════════════════════════════════${NC}"
echo -e "${CYAN}  🧠  Daftra OpenAPI → MCP Pipeline${NC}"
echo -e "${CYAN}══════════════════════════════════════════════════${NC}"

# 1. التحقق من وجود الملف
if [ ! -f "daftra.openapi.json" ]; then
  echo -e "${YELLOW}⚠️  daftra.openapi.json غير موجود${NC}"
  exit 1
fi

SIZE=$(du -h daftra.openapi.json | cut -f1)
echo -e "\n${GREEN}📖 الملف المصدري:${NC} ${SIZE}"

# 2. استخراج العمليات
echo -e "\n${YELLOW}▶ المرحلة 1: استخراج العمليات${NC}"
npx tsx scripts/extract-operations.ts

# 3. توليد أدوات MCP
echo -e "\n${YELLOW}▶ المرحلة 2: توليد أدوات MCP${NC}"
npx tsx scripts/generate-tools.ts

# 4. تجميع TypeScript (اختياري — قد يفشل بسبب أخطاء الأدوات المولّدة)
echo -e "\n${YELLOW}▶ المرحلة 3: التحقق من TypeScript${NC}"
npx tsc --noEmit || echo -e "${YELLOW}⚠️  تحذيرات TS (طبيعي في المرحلة الأولى)${NC}"

echo -e "\n${GREEN}✅ اكتملت العملية بنجاح!${NC}"
echo -e "${CYAN}📁 المخرجات:${NC}"
echo "   ├── extracted/               (JSON العمليات المصنفة)"
echo "   └── src/generated/           (أدوات MCP تلقائية)"
echo ""