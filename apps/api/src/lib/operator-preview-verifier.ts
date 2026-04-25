// @ts-nocheck
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';

export type PreviewGoldenPath =
  | 'single-file-html-canvas'
  | 'vite-react'
  | 'nextjs'
  | 'docker-compose';

export interface PreviewVerificationEvidence {
  runtimeLiveAt: string | null;
  healthPassedAt: string | null;
  smokePassedAt: string | null;
  screenshotPath: string | null;
}

export interface PreviewVerificationInput {
  previewKind: 'static' | 'proxy';
  goldenPath: PreviewGoldenPath | null;
  previewUrl: string;
  healthcheckPath: string | null;
  screenshotPath: string | null;
  buildRoot?: string | null;
  runtimeUrl?: string | null;
  timeoutMs?: number;
}

export interface PreviewVerificationResult {
  ok: boolean;
  reason: string | null;
  evidence: PreviewVerificationEvidence;
  observedChange: boolean;
  placeholderLike: boolean;
}

export type PreviewVerifier = (input: PreviewVerificationInput) => Promise<PreviewVerificationResult>;

const placeholderPattern = /\b(coming soon|placeholder|diagnostic|preview unavailable|build failed|runtime unavailable|error report)\b/i;
const systemChromiumCandidates = [
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/usr/lib/chromium/chrome',
];

function nowIso() {
  return new Date().toISOString();
}

function defaultEvidence(): PreviewVerificationEvidence {
  return {
    runtimeLiveAt: null,
    healthPassedAt: null,
    smokePassedAt: null,
    screenshotPath: null,
  };
}

function resolveChromiumExecutablePath() {
  const configured = process.env.SLOTH_PLAYWRIGHT_EXECUTABLE_PATH?.trim();
  if (configured && existsSync(configured)) {
    return configured;
  }

  return systemChromiumCandidates.find((candidate) => existsSync(candidate)) ?? undefined;
}

function contentTypeFor(path: string) {
  switch (extname(path).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.woff2':
      return 'font/woff2';
    default:
      return 'application/octet-stream';
  }
}

async function startStaticPreviewServer(buildRoot: string, previewPath: string) {
  const normalizedPreviewPath = `/${previewPath.replace(/^\/+|\/+$/g, '')}`.replace(/\/+$/g, '') || '/';
  const indexPath = join(buildRoot, 'index.html');
  const server = createServer((request, response) => {
    const requestPathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    let effectivePath = requestPathname;

    if (normalizedPreviewPath !== '/') {
      if (requestPathname === normalizedPreviewPath || requestPathname === `${normalizedPreviewPath}/`) {
        effectivePath = '/';
      } else if (requestPathname.startsWith(`${normalizedPreviewPath}/`)) {
        effectivePath = requestPathname.slice(normalizedPreviewPath.length) || '/';
      }
    }

    const normalizedRelative = effectivePath === '/' ? 'index.html' : effectivePath.replace(/^\/+/, '');
    const absolutePath = resolve(buildRoot, normalizedRelative);
    const candidatePath = absolutePath.startsWith(resolve(buildRoot)) && existsSync(absolutePath) ? absolutePath : indexPath;

    try {
      const payload = readFileSync(candidatePath);
      response.writeHead(200, { 'content-type': contentTypeFor(candidatePath) });
      response.end(payload);
    } catch {
      response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('not_found');
    }
  });

  const listening = await new Promise<{ port: number }>((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectPromise(new Error('preview_static_server_address_missing'));
        return;
      }
      resolvePromise({ port: address.port });
    });
  });

  const baseUrl = `http://127.0.0.1:${listening.port}${normalizedPreviewPath === '/' ? '' : normalizedPreviewPath}`;
  return {
    baseUrl,
    async close() {
      await new Promise<void>((resolvePromise) => {
        server.close(() => resolvePromise());
      });
    },
  };
}

function resolveHealthUrl(baseUrl: string, previewKind: PreviewVerificationInput['previewKind'], healthcheckPath: string | null) {
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const trimmed = (healthcheckPath ?? '').trim();
  if (!trimmed || trimmed === '/') {
    return previewKind === 'static' ? baseUrl : new URL('/', normalizedBaseUrl).toString();
  }
  if (previewKind === 'static') {
    return new URL(trimmed.replace(/^\/+/, ''), normalizedBaseUrl).toString();
  }
  return new URL(trimmed, normalizedBaseUrl).toString();
}

async function collectPageSnapshot(page: {
  evaluate<T>(pageFunction: () => T): Promise<T>;
}) {
  return page.evaluate(() => {
    const body = document.body;
    const text = body?.innerText ?? '';
    const html = body?.innerHTML ?? '';
    const visibleInteractiveCount = [
      ...document.querySelectorAll('button, [role="button"], a[href], input:not([type="hidden"]), textarea, select'),
    ].filter((element) => {
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      const style = window.getComputedStyle(element);
      return style.display !== 'none' && style.visibility !== 'hidden';
    }).length;
    const canvasCount = document.querySelectorAll('canvas').length;
    const localScriptCount = [...document.scripts].filter((script) => {
      if (!script.src) {
        return true;
      }
      try {
        const url = new URL(script.src, window.location.href);
        return url.origin === window.location.origin;
      } catch {
        return false;
      }
    }).length;
    const previewMode = document.querySelector('meta[name="sloth-preview-mode"]')?.getAttribute('content') ?? null;

    return {
      title: document.title,
      hash: window.location.hash,
      text,
      htmlLength: html.length,
      visibleInteractiveCount,
      canvasCount,
      localScriptCount,
      previewMode,
    };
  });
}

async function runSmokeInteraction(page: {
  evaluate<T>(pageFunction: () => Promise<T> | T): Promise<T>;
}) {
  return page.evaluate(async () => {
    const wait = (ms: number) => new Promise((resolvePromise) => window.setTimeout(resolvePromise, ms));

    const clickable = document.querySelector('button, [role="button"], a[href]');
    if (clickable instanceof HTMLElement) {
      clickable.click();
      await wait(250);
      return 'click';
    }

    const input = document.querySelector('input:not([type="hidden"]), textarea');
    if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
      input.focus();
      input.value = 'smoke';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await wait(250);
      return 'input';
    }

    const canvas = document.querySelector('canvas');
    if (canvas instanceof HTMLCanvasElement) {
      const rect = canvas.getBoundingClientRect();
      canvas.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }));
      await wait(250);
      return 'canvas';
    }

    await wait(150);
    return 'noop';
  });
}

function hasObservableChange(
  before: Awaited<ReturnType<typeof collectPageSnapshot>>,
  after: Awaited<ReturnType<typeof collectPageSnapshot>>,
) {
  return before.title !== after.title
    || before.hash !== after.hash
    || before.text !== after.text
    || before.htmlLength !== after.htmlLength;
}

export function hasCompletePreviewEvidence(evidence: PreviewVerificationEvidence | null | undefined) {
  return Boolean(
    evidence?.runtimeLiveAt
    && evidence.healthPassedAt
    && evidence.smokePassedAt
    && evidence.screenshotPath,
  );
}

export const verifyPreviewRuntime: PreviewVerifier = async (input) => {
  const evidence = defaultEvidence();
  const timeoutMs = input.timeoutMs ?? 25_000;
  let liveUrl = input.runtimeUrl?.trim() || '';
  let closeStaticServer: (() => Promise<void>) | null = null;

  try {
    if (input.previewKind === 'static') {
      const buildRoot = input.buildRoot?.trim();
      if (!buildRoot || !existsSync(buildRoot)) {
        return {
          ok: false,
          reason: 'preview_runtime_missing_static_build',
          evidence,
          observedChange: false,
          placeholderLike: false,
        };
      }
      const previewPath = (() => {
        try {
          return new URL(input.previewUrl).pathname;
        } catch {
          return '/';
        }
      })();
      const staticServer = await startStaticPreviewServer(buildRoot, previewPath);
      liveUrl = staticServer.baseUrl;
      closeStaticServer = staticServer.close;
    } else if (!liveUrl) {
      return {
        ok: false,
        reason: 'preview_runtime_missing_proxy_target',
        evidence,
        observedChange: false,
        placeholderLike: false,
      };
    }

    const healthUrl = resolveHealthUrl(liveUrl, input.previewKind, input.healthcheckPath);
    const healthResponse = await fetch(healthUrl, { redirect: 'follow' });
    if (!healthResponse.ok) {
      return {
        ok: false,
        reason: `preview_health_failed:${healthResponse.status}`,
        evidence,
        observedChange: false,
        placeholderLike: false,
      };
    }

    evidence.runtimeLiveAt = nowIso();
    evidence.healthPassedAt = nowIso();

    const playwright = await import('playwright');
    const browser = await playwright.chromium.launch({
      headless: true,
      executablePath: resolveChromiumExecutablePath(),
    });
    try {
      const page = await browser.newPage();
      const response = await page.goto(liveUrl, {
        waitUntil: 'networkidle',
        timeout: timeoutMs,
      });
      if (!response || !response.ok()) {
        return {
          ok: false,
          reason: `preview_runtime_navigation_failed:${response?.status() ?? 'missing'}`,
          evidence,
          observedChange: false,
          placeholderLike: false,
        };
      }

      const before = await collectPageSnapshot(page);
      await runSmokeInteraction(page);
      const after = await collectPageSnapshot(page);
      const observedChange = hasObservableChange(before, after);
      const combinedText = `${after.title}\n${after.text}`.toLowerCase();
      const placeholderLike = Boolean(after.previewMode === 'placeholder' || after.previewMode === 'diagnostic' || placeholderPattern.test(combinedText));
      const posterLike = placeholderLike || (!observedChange && after.canvasCount === 0 && after.visibleInteractiveCount === 0);

      if (posterLike) {
        return {
          ok: false,
          reason: 'preview_static_poster_detected',
          evidence,
          observedChange,
          placeholderLike: posterLike,
        };
      }

      if (
        input.goldenPath === 'single-file-html-canvas'
        && after.canvasCount === 0
        && (!observedChange || after.localScriptCount === 0)
      ) {
        return {
          ok: false,
          reason: 'preview_static_poster_detected',
          evidence,
          observedChange,
          placeholderLike: false,
        };
      }

      if (!input.screenshotPath) {
        return {
          ok: false,
          reason: 'preview_screenshot_path_missing',
          evidence,
          observedChange,
          placeholderLike: false,
        };
      }

      mkdirSync(dirname(input.screenshotPath), { recursive: true });
      await page.screenshot({
        path: input.screenshotPath,
        fullPage: true,
      });
      evidence.smokePassedAt = nowIso();
      evidence.screenshotPath = input.screenshotPath;

      return {
        ok: true,
        reason: null,
        evidence,
        observedChange,
        placeholderLike: false,
      };
    } finally {
      await browser.close();
    }
  } catch (error) {
    return {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      evidence,
      observedChange: false,
      placeholderLike: false,
    };
  } finally {
    if (closeStaticServer) {
      await closeStaticServer();
    }
  }
};
