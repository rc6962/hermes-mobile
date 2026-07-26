export const DEFAULT_HERMES_API_URL = "http://127.0.0.1:8642";

const ALLOWED_HTTP_HOSTS = new Set(["127.0.0.1", "localhost", "10.0.2.2"]);

export function resolveHermesApiUrl(configuredUrl?: string): string {
  if (!configuredUrl) {
    return DEFAULT_HERMES_API_URL;
  }

  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== "http:" || !ALLOWED_HTTP_HOSTS.has(parsed.hostname.toLowerCase())) {
      return DEFAULT_HERMES_API_URL;
    }
    return configuredUrl;
  } catch {
    return DEFAULT_HERMES_API_URL;
  }
}
