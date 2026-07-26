import { Capacitor, CapacitorHttp } from "@capacitor/core";

export type NativeHttpImplementation = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function requestBody(init: RequestInit | undefined): unknown {
  if (typeof init?.body !== "string") {
    return undefined;
  }

  const contentType = new Headers(init.headers).get("Content-Type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(init.body);
    } catch {
      return init.body;
    }
  }

  return init.body;
}

export function getNativeHttpImplementation(): NativeHttpImplementation | undefined {
  if (!Capacitor.isNativePlatform()) {
    return undefined;
  }

  return async (input, init = {}) => {
    const response = await CapacitorHttp.request({
      url: String(input),
      method: init.method ?? "GET",
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      data: requestBody(init),
      responseType: "json",
    });

    const data = typeof response.data === "string"
      ? response.data
      : JSON.stringify(response.data ?? "");
    const headers = new Headers(response.headers as Record<string, string>);
    if (!headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return new Response(data, {
      status: response.status,
      headers,
    });
  };
}
