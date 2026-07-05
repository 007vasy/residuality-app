# Build + run the API (context = repo root).
FROM node:20-slim
WORKDIR /app
RUN corepack enable

# Copy the whole workspace (node_modules/dist excluded via .dockerignore) and install.
COPY . .
RUN pnpm install --prod=false

# Build the API and every workspace package it depends on.
RUN pnpm --filter @residuality/core \
         --filter @residuality/db \
         --filter @residuality/llm \
         --filter @residuality/mcp \
         --filter @residuality/api build

ENV NODE_ENV=production
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
