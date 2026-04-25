export function normalizeAssistantRepoUrl(rawUrl: string) {
  const candidate = rawUrl.replace(/[),.!?;:]+$/g, '');
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  let pathname = parsed.pathname.replace(/\/+$/g, '');
  const cutMarkers = ['/tree/', '/blob/', '/-/tree/', '/-/blob/', '/archive/'];
  for (const marker of cutMarkers) {
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex > 0) {
      pathname = pathname.slice(0, markerIndex);
      break;
    }
  }
  const segments = pathname.split('/').filter(Boolean);
  const isKnownGitHost = /github\.com|gitlab\.com|bitbucket\.org/i.test(parsed.hostname);

  if (isKnownGitHost) {
    if (segments.length < 2 || !segments.every((segment) => /^[A-Za-z0-9_.-]+$/.test(segment))) {
      return null;
    }
    return `${parsed.origin}/${segments.join('/')}`;
  }

  if (/\.git$/i.test(pathname) || /\.(zip|tar|tar\.gz|tgz)$/i.test(pathname)) {
    const suffix = parsed.search || parsed.hash ? `${parsed.search}${parsed.hash}` : '';
    return `${parsed.origin}${pathname}${suffix}`;
  }

  return null;
}

export function extractAssistantRepoUrl(message: string) {
  const matches = message.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  for (const rawMatch of matches) {
    const normalized = normalizeAssistantRepoUrl(rawMatch);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function splitAssistantRepoInput(message: string) {
  const normalized = message.trim();
  const repoUrl = extractAssistantRepoUrl(normalized);
  const notes = normalized.replace(/https?:\/\/[^\s<>"']+/gi, ' ').replace(/\s+/g, ' ').trim();

  return {
    repoUrl,
    notes: notes || null,
  };
}
