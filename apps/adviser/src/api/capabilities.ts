import { safeEndpoint } from "../model";
import { trackingSupported } from "../domain/price-tracking";
export async function probeCapabilities(endpoint: string, signal: AbortSignal) {
  if (!safeEndpoint(endpoint)) return { priceTracking: false };
  const response = await fetch(endpoint.replace(/\/$/, "") + "/health", {
    signal,
  });
  if (!response.ok) return { priceTracking: false };
  return { priceTracking: trackingSupported(await response.json()) };
}
