FROM node:22-alpine AS admin-build

WORKDIR /app/admin
COPY admin/package.json admin/package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY admin/ ./
RUN npm run build

FROM node:22-alpine AS runtime

WORKDIR /app
ENV NODE_ENV=production
ENV DATA_DIR=/app/data

COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund

COPY src ./src
COPY api ./api
COPY --from=admin-build /app/admin/dist ./admin/dist

RUN mkdir -p /app/data
EXPOSE 8090

CMD ["node", "src/index.js"]
