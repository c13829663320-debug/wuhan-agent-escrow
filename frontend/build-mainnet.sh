#!/usr/bin/env bash
# 主网地址回填后一键构建前端（部署到子路径 /agent-escrow/）。
#
# 用法:
#   bash frontend/build-mainnet.sh <registryAddress> <escrowAddress>
#
# 说明:
#   - frontend/vite.config.ts 的 base 直接读取 shell 的 process.env.VITE_BASE_PATH，
#     仅写 frontend/.env 不会在配置加载时生效，因此必须在此 export 到进程环境。
#   - 运行时变量（网络 / 合约地址）写入被 gitignore 的 frontend/.env。
set -euo pipefail

# 定位到本脚本所在目录（即 frontend/），保证后续路径与 npm 上下文正确
cd "$(dirname "$0")"

REGISTRY_ADDRESS="${1:-}"
ESCROW_ADDRESS="${2:-}"

if [[ -z "${REGISTRY_ADDRESS}" || -z "${ESCROW_ADDRESS}" ]]; then
  echo "用法: bash frontend/build-mainnet.sh <registryAddress> <escrowAddress>" >&2
  echo "示例: bash frontend/build-mainnet.sh 0xRegistry 0xEscrow" >&2
  exit 1
fi

# 关键：子路径 base 必须从 shell 环境注入，vite.config.ts 才能读到
export VITE_BASE_PATH="/agent-escrow/"

# 写入运行时环境变量（frontend/.env 已被 gitignore，不会提交）
cat > .env <<EOF
VITE_DEFAULT_NETWORK=botchain
VITE_REGISTRY_ADDRESS=${REGISTRY_ADDRESS}
VITE_ESCROW_ADDRESS=${ESCROW_ADDRESS}
VITE_BASE_PATH=${VITE_BASE_PATH}
EOF

echo "==> 使用子路径 base: ${VITE_BASE_PATH}"
echo "==> Registry : ${REGISTRY_ADDRESS}"
echo "==> Escrow   : ${ESCROW_ADDRESS}"
echo "==> 安装依赖并构建..."

npm install
npm run build

echo "==> 构建完成，产物位于 frontend/dist/（资源应带前缀 ${VITE_BASE_PATH}assets/）"
