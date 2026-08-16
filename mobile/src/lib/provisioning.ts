import { CLOUD_ENDPOINT } from "./podule-registry";
import { getDeviceId, setManagedProviderConfig } from "./runtime/managed-runtime";

export interface ProvisionResult {
  provisioned: boolean;
  error?: string;
}

/**
 * Self-provisioning for Epic Cloud: device ID (Keystore) → POST /v1/accounts
 * on the inference box → per-device token → provider config written to the
 * embedded engine. No user input, no key ever baked into the APK.
 */
export async function provisionEpicCloud(
  fetchImpl: typeof fetch = fetch,
): Promise<ProvisionResult> {
  let deviceId: string;
  try {
    deviceId = await getDeviceId();
  } catch {
    // Web/dev fallback: an ephemeral random id.
    deviceId = crypto.randomUUID().replace(/-/g, "");
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(deviceId)) {
    return { provisioned: false, error: "Balls could not build a device identity." };
  }

  let response: Response;
  try {
    response = await fetchImpl(`${CLOUD_ENDPOINT}/accounts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ device_id: deviceId }),
    });
  } catch {
    return { provisioned: false, error: "Balls couldn't reach Epic Cloud." };
  }
  if (response.status === 429) {
    return {
      provisioned: false,
      error: "Too many new devices from this connection right now. Try again in a bit.",
    };
  }
  if (!response.ok) {
    return { provisioned: false, error: `Epic Cloud said no (${response.status}).` };
  }

  let data: { token?: string };
  try {
    data = (await response.json()) as { token?: string };
  } catch {
    return { provisioned: false, error: "Epic Cloud answered without a token." };
  }
  if (!data.token) {
    return { provisioned: false, error: "Epic Cloud answered without a token." };
  }

  const config = JSON.stringify({
    providers: {
      custom_openai_balls: {
        base_url: CLOUD_ENDPOINT,
        api_key: data.token,
        model: "deepseek-v4-flash",
      },
    },
  });
  const stored = await setManagedProviderConfig(config);
  if (!stored.stored) {
    return { provisioned: false, error: "Balls could not remember the token." };
  }
  return { provisioned: true };
}
