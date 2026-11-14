import React from "react";
import { registerRootComponent } from "expo";
import AdviserApp from "../../src/AdviserApp";
import {
  initialDraft,
  CATEGORY_PURPOSES,
  VALID_PRIORITIES,
} from "../../src/model";
import type { ChatTransport } from "../../src/chat";
let failures = 0;
const transport: ChatTransport = async (input, signal) => {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, input.text === "slow" ? 1500 : 150);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(Error("aborted fixture"));
      },
      { once: true },
    );
  });
  if (input.text === "error" && failures++ === 0)
    throw Error("private fixture diagnostic");
  return {
    text: "Fixture: chưa có chào bán hoặc bằng chứng hiệu năng được duyệt.",
    mode: "fallback",
    providerLabel: "Fixture transport — không phải HTTP hoặc AI live",
    sources: [],
    ...(input.text === "proposal"
      ? {
          proposal: {
            baseProfileRevision: input.profileRevision,
            draft: {
              ...initialDraft,
              budget: "20000000",
              purposes: [...CATEGORY_PURPOSES.pc_laptop.slice(0, 3)],
              priorities: [...VALID_PRIORITIES.slice(0, 3)],
            },
          },
        }
      : {}),
  };
};
function Fixture() {
  return <AdviserApp chatTransport={transport} />;
}
registerRootComponent(Fixture);
