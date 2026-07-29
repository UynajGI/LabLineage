FROM node:22.22-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752 AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
COPY collector/package.json collector/package.json
RUN npm ci --ignore-scripts
COPY backend backend
COPY frontend frontend
COPY collector collector
RUN npm run build && npm prune --omit=dev --omit=optional

FROM node:22.22-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752 AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd --system --gid 10001 lablineage \
    && useradd --system --uid 10001 --gid lablineage --home-dir /app lablineage
COPY --from=build --chown=lablineage:lablineage /app /app
USER lablineage
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8788)+'/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--import", "./backend/instrumentation.js", "backend/server.js"]
