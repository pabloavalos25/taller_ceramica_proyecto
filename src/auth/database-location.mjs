export function databaseEndpoint(connectionString) {
  try {
    const host = new URL(connectionString).hostname.toLowerCase();
    const match = /^(ep-[a-z0-9-]+?)(?:-pooler)?\.[a-z0-9.-]+\.neon\.tech$/.exec(host);
    return match ? match[1] : null;
  } catch { return null; }
}
