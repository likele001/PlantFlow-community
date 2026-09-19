# PlantFlow 社区版 · 全栈应用镜像
#   说明：Node Express 单进程同时托管 API（/api/*）与编译后的前端（dist/），
#   因此一个镜像即为完整应用。基于根 Dockerfile 构建逻辑，额外加入国内
#   npm 镜像加速，适配内网 / 低带宽构建。用法见 docker-compose.fullstack.yml。

# ---- deps ----
FROM node:22-alpine AS deps
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

# ---- api build（tsc → dist-api）----
FROM deps AS api-build
WORKDIR /app
COPY api ./api
COPY tsconfig.json ./
RUN npx tsc -p api/tsconfig.json

# ---- web build（vite → dist）----
FROM deps AS web-build
WORKDIR /app
COPY . .
RUN npx vite build

# ---- runtime ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=5000 \
    NPM_CONFIG_REGISTRY=https://registry.npmmirror.com

# prod-only deps（lock 若与服务端不匹配则回落 install，保证可启动）
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-bin-links --no-audit --no-fund

COPY --from=api-build /app/dist-api ./dist-api
COPY --from=web-build /app/dist ./dist
COPY --from=api-build /app/api/migrations ./dist-api/migrations
COPY --from=api-build /app/api/plugins    ./dist-api/plugins

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD wget -qO- http://127.0.0.1:5000/api/health >/dev/null 2>&1 || exit 1

CMD ["node", "dist-api/server.js"]