FROM node:22-alpine AS builder

WORKDIR /workspace

ARG HTTP_PROXY
ARG HTTPS_PROXY
ARG http_proxy
ARG https_proxy
ARG NO_PROXY
ARG no_proxy

ENV HTTP_PROXY=${HTTP_PROXY} \
    HTTPS_PROXY=${HTTPS_PROXY} \
    http_proxy=${http_proxy} \
    https_proxy=${https_proxy} \
    NO_PROXY=${NO_PROXY} \
    no_proxy=${no_proxy}

RUN if [ -n "$HTTP_PROXY" ]; then npm config set proxy "$HTTP_PROXY"; fi \
    && if [ -n "$HTTPS_PROXY" ]; then npm config set https-proxy "$HTTPS_PROXY"; fi \
    && if [ -n "$NO_PROXY" ]; then npm config set noproxy "$NO_PROXY"; fi \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 600000 \
    && npm config set maxsockets 5 \
    && npm install -g pnpm@9

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/tsconfig.json apps/web/vite.config.ts apps/web/index.html ./apps/web/

RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web

ARG VITE_API_BASE_URL=http://localhost:4000
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN pnpm --filter @sloth-cloud/web build

FROM node:22-alpine AS runtime

WORKDIR /app

COPY --from=builder /workspace/apps/web/dist ./dist

RUN cat > /app/server.mjs <<'EOF'
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 80);
const root = '/app/dist';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function resolvePath(urlPath) {
  const safePath = normalize(urlPath).replace(/^(\.\.(\/|\\|$))+/, '');
  return join(root, safePath);
}

function sendFile(reply, path) {
  const ext = extname(path).toLowerCase();
  reply.statusCode = 200;
  reply.setHeader('Content-Type', mime[ext] || 'application/octet-stream');
  createReadStream(path).pipe(reply);
}

createServer((req, res) => {
  const requestPath = req.url ? req.url.split('?')[0] : '/';
  const filePath = resolvePath(requestPath === '/' ? '/index.html' : requestPath);

  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }

  // SPA fallback
  sendFile(res, join(root, 'index.html'));
}).listen(port, () => {
  console.log(`sloth-web listening on :${port}`);
});
EOF

EXPOSE 80

CMD ["node", "/app/server.mjs"]
