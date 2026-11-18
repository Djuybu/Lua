// Public HTTPS gateway: Vercel forwards /advisor/v1/* and /health to the GCP VM.
// Native/Android Studio builds have no browser origin and may omit Expo env vars.
export const DEFAULT_GCP_API_GATEWAY = "https://lua-adviser.vercel.app";

export function resolveApiEndpoint(configured?: string): string {
  return (configured?.trim() || DEFAULT_GCP_API_GATEWAY).replace(/\/+$/, "");
}

// Keep direct process.env access so Expo can inline the build-time override.
export const DEFAULT_API_ENDPOINT = resolveApiEndpoint(
  process.env.EXPO_PUBLIC_API_URL,
);
