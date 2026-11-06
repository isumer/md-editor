#!/usr/bin/env bash
# AC-PERF-09 measurement on a real Mac (diag only). Usage:
#   curl -fsSL https://raw.githubusercontent.com/isumer/md-editor/bug/perf09-diag/scripts/perf-mac.sh | bash
set -euo pipefail
dir="$HOME/md-editor-perf"
out="$HOME/Desktop/md-editor-perf.tgz"
command -v git >/dev/null || { echo "git gerekli: xcode-select --install"; exit 1; }
command -v node >/dev/null || { echo "Node.js 24 gerekli: https://nodejs.org (ya da brew install node@24)"; exit 1; }
major=$(node -p 'process.versions.node.split(".")[0]')
[ "$major" -ge 24 ] || { echo "Node $major bulundu, 24 gerekli"; exit 1; }
rm -rf "$dir"
git clone --depth 1 -b bug/perf09-diag https://github.com/isumer/md-editor.git "$dir"
cd "$dir"
npm ci --no-audit --no-fund
npm run build
{ sysctl -n machdep.cpu.brand_string; sw_vers; system_profiler SPDisplaysDataType 2>/dev/null | grep -E "Chipset|Cores|Resolution|Retina" || true; pmset -g | grep -i lowpowermode || true; } > machine.txt
npx playwright test test/e2e/preview-perf.spec.ts -g "preview has no frame" --repeat-each 3 --reporter=line 2>&1 | tee perf.log || true
tar czf "$out" machine.txt perf.log test-results/traces
echo
grep -E "scroll:" perf.log || true
echo "Bitti: $out"
