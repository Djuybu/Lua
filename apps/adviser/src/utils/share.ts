import { Linking, Platform, Share } from "react-native";
import { safeExternalUrl } from "../model";
import { recordError } from "./error-logger";

export async function openExternalUrl(value: string | null | undefined) {
  const safe = safeExternalUrl(value);
  if (!safe) return false;
  try {
    await Linking.openURL(safe);
    return true;
  } catch {
    recordError("network", "OPEN_URL_FAILED");
    return false;
  }
}

export async function shareOrDownloadJson(
  filename: string,
  payload: string,
): Promise<"downloaded" | "copied" | "shared" | "failed"> {
  if (Platform.OS === "web" && typeof document !== "undefined") {
    try {
      const blob = new Blob([payload], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return "downloaded";
    } catch {
      try {
        if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(payload);
          return "copied";
        }
      } catch {}
    }
  }
  try {
    await Share.share({ message: payload });
    return "shared";
  } catch {
    recordError("storage", "EXPORT_FAILED");
    return "failed";
  }
}
