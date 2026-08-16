export const DEFAULT_HERMES_API_URL = "http://127.0.0.1:8642";

/**
 * Loopback endpoint of the local attachment adapter (runs alongside the
 * Balls runtime in Termux; embedded managed runtime will host it later).
 * 8643 sits beside Balls's 8642.
 */
export const DEFAULT_ATTACHMENT_ADAPTER_URL = "http://127.0.0.1:8643";

const ALLOWED_HTTP_HOSTS = new Set(["127.0.0.1", "localhost", "10.0.2.2"]);

export function resolveBallsApiUrl(configuredUrl?: string): string {
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

export function resolveAttachmentAdapterUrl(configuredUrl?: string): string {
  if (!configuredUrl) {
    return DEFAULT_ATTACHMENT_ADAPTER_URL;
  }

  try {
    const parsed = new URL(configuredUrl);
    if (parsed.protocol !== "http:" || !ALLOWED_HTTP_HOSTS.has(parsed.hostname.toLowerCase())) {
      return DEFAULT_ATTACHMENT_ADAPTER_URL;
    }
    return configuredUrl;
  } catch {
    return DEFAULT_ATTACHMENT_ADAPTER_URL;
  }
}
