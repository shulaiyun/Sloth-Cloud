export interface RepoInputPreflight {
  hasRepoHostUrl: boolean;
  repoUrl: string | null;
  taskDescription: string;
  invalidRepoUrl: boolean;
}

export function extractRepoUrlForPreflight(value: string) {
  const matches = value.match(/https?:\/\/[^\s<>"']+/gi) ?? [];
  for (const rawMatch of matches) {
    const candidate = rawMatch.replace(/[),.!?;:]+$/g, '');
    try {
      const parsed = new URL(candidate);
      if (!/github\.com|gitlab\.com|bitbucket\.org/i.test(parsed.hostname)) {
        continue;
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
      if (segments.length < 2) {
        continue;
      }
      if (!segments.every((segment) => /^[A-Za-z0-9_.-]+$/.test(segment))) {
        continue;
      }

      return `${parsed.origin}/${segments.join('/')}`;
    } catch {
      // Ignore parse failures and continue checking the remaining links.
    }
  }

  return null;
}

export function preflightRepoInput(value: string): RepoInputPreflight {
  const normalized = value.trim();
  const hasRepoHostUrl = /github\.com|gitlab\.com|bitbucket\.org/i.test(normalized);
  const repoUrl = hasRepoHostUrl ? extractRepoUrlForPreflight(normalized) : null;
  const taskDescription = normalized
    .replace(/https?:\/\/[^\s<>"']+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    hasRepoHostUrl,
    repoUrl,
    taskDescription,
    invalidRepoUrl: hasRepoHostUrl && !repoUrl,
  };
}
