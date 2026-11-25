import React from "react";
import AdviserApp from "./src/AdviserApp";
import { createHttpChatTransport } from "./src/api/chat";
import { DEFAULT_API_ENDPOINT } from "./src/api/config";
import { safeEndpoint } from "./src/model";
import { recordError } from "./src/utils/error-logger";

function createInitialChatTransport() {
  if (!DEFAULT_API_ENDPOINT) return undefined;
  if (!safeEndpoint(DEFAULT_API_ENDPOINT)) {
    recordError("network", "INVALID_CHAT_ENDPOINT");
    return undefined;
  }
  try {
    return createHttpChatTransport(DEFAULT_API_ENDPOINT);
  } catch {
    recordError("network", "INVALID_CHAT_ENDPOINT");
    return undefined;
  }
}

const chatTransport = createInitialChatTransport();

export default function App() {
  return <AdviserApp chatTransport={chatTransport} />;
}
