# Build the SPA, serve it with nginx which proxies /api, /ws, /mcp to the api service.
FROM node:20-slim AS build
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --prod=false
RUN pnpm --filter @stressforge/web build

FROM nginx:alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
