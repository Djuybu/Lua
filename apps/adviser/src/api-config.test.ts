import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveApiEndpoint } from "./api/config";
import { safeEndpoint } from "./model";

test("native builds without an environment URL use the public HTTPS GCP gateway", () => {
  const endpoint = resolveApiEndpoint(undefined);
  assert.equal(endpoint, "https://lua-adviser.vercel.app");
  assert.equal(safeEndpoint(endpoint), true);
});

test("empty build variables still connect to the GCP gateway", () => {
  assert.equal(resolveApiEndpoint(""), "https://lua-adviser.vercel.app");
  assert.equal(resolveApiEndpoint("  "), "https://lua-adviser.vercel.app");
});

test("explicit backend overrides take precedence and normalize trailing slashes", () => {
  assert.equal(resolveApiEndpoint(" https://api.example.com/ "), "https://api.example.com");
  assert.equal(resolveApiEndpoint("http://127.0.0.1:8080"), "http://127.0.0.1:8080");
});
