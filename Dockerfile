ARG NODE_IMAGE=node:22.22-bookworm-slim@sha256:e21fc383b50d5347dc7a9f1cae45b8f4e2f0d39f7ade28e4eef7d2934522b752
FROM ${NODE_IMAGE} AS build
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

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apt-get update \
    && apt-get install --only-upgrade --yes --no-install-recommends libgnutls30 \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system --gid 10001 lablineage \
    && useradd --system --uid 10001 --gid lablineage --home-dir /app lablineage \
    && rm -rf /usr/local/lib/node_modules /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack \
      /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
COPY --from=build --chown=lablineage:lablineage /app /app
RUN chown lablineage:lablineage /app
COPY --chown=lablineage:lablineage demo-scan /app/demo-scan
USER lablineage
EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||8788)+'/api/ready').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "--import", "./backend/instrumentation.js", "backend/server.js"]