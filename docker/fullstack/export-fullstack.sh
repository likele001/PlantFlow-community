#!/bin/bash
# PlantFlow 社区版 · 全栈镜像离线导出（内网 / 无外网部署）
# 用法：bash docker/fullstack/export-fullstack.sh [输出目录]
# 产物：<out>/plantflow-fullstack_<时间戳>.tar.gz（含自有镜像 + postgres + redis）
set -euo pipefail
cd "$(dirname "$0")/../.."

OUT_DIR="${1:-dist-fullstack-images}"
mkdir -p "$OUT_DIR"
stamp="$(date +%Y%m%d_%H%M%S)"
archive="${OUT_DIR}/plantflow-fullstack_${stamp}.tar.gz"

images=(
  plantflow-app:fullstack
  pgvector/pgvector:pg16
  redis:7-alpine
)

echo "[plantflow] 导出 ${#images[@]} 个镜像 → ${archive} ..."
# 提示先确保 compose 已 build
docker save "${images[@]}" | gzip -9 > "${archive}"
echo "[plantflow] 完成: ${archive} ($(du -h "${archive}" | cut -f1))"
echo
echo "目标机（无外网）导入并启动："
echo "  docker load < ${archive}"
echo "  docker compose -f docker-compose.fullstack.yml --env-file .env.fullstack up -d   # 无需再联网拉取/构建"