type Entry = { at: string; area: "network" | "storage" | "chat"; code: string };
const entries: Entry[] = [];
export function recordError(area: Entry["area"], code: string) {
  entries.push({
    at: new Date().toISOString(),
    area,
    code: /^[A-Z_0-9]{1,48}$/.test(code) ? code : "OPERATION_FAILED",
  });
  if (entries.length > 100) entries.shift();
}
export function diagnosticReport() {
  return { version: 1, errors: entries.map((x) => ({ ...x })) };
}
