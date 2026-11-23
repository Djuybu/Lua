import React from "react";
import AdviserApp from "./src/AdviserApp";
import { createHttpChatTransport } from "./src/api/chat";
import { DEFAULT_API_ENDPOINT } from "./src/api/config";

const chatTransport = DEFAULT_API_ENDPOINT
  ? createHttpChatTransport(DEFAULT_API_ENDPOINT)
  : undefined;

export default function App() {
  return <AdviserApp chatTransport={chatTransport} />;
}
