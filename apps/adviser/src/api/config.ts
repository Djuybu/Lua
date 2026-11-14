// Build-owned configuration. Empty means unconfigured, never pretend connected.
export const DEFAULT_API_ENDPOINT = (
  process.env.EXPO_PUBLIC_API_URL ?? ""
).trim();
