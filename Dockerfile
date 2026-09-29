# Sarena: API + website (/) + control panel (at its private address) in one container.
#   docker build -t sarena .
#   docker run -p 3000:3000 --env-file backend/.env -v sarena-data:/app/backend/data sarena

FROM node:22-alpine AS dashboard
WORKDIR /build/dashboard
COPY dashboard/package.json dashboard/package-lock.json ./
RUN npm ci
COPY dashboard/ ./
# The panel's stand-alone demo (built from the same source) reads the sample venues from the server's seed.
COPY backend/src/db/seed-venues.json /build/backend/src/db/seed-venues.json
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev
COPY backend/ ./
COPY website/ /app/website/
COPY --from=dashboard /build/dashboard/dist /app/dashboard/dist
RUN mkdir -p /app/backend/data && chown -R node:node /app/backend/data
EXPOSE 3000
# Uploaded images and the embedded database (when DATABASE_URL is empty) live here.
VOLUME ["/app/backend/data"]
USER node
CMD ["node", "src/index.ts"]
