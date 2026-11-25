export function checkMutationOrigin(request, configuredOrigin, production = true) {
  try {
    const url = new URL(configuredOrigin);
    if (url.origin !== configuredOrigin || (production && url.protocol !== 'https:') || (!production && !['http:', 'https:'].includes(url.protocol))) return false;
    if (request.headers.get('origin') !== configuredOrigin || request.headers.get('sec-fetch-site') === 'cross-site') return false;
    return /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(request.headers.get('content-type') ?? '');
  } catch { return false; }
}
