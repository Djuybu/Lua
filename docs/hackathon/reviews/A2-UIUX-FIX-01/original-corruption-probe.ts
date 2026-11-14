import { test } from "node:test";
import assert from "node:assert/strict";
import { empty, validState, createStore } from "./apps/adviser/src/storage";
test("review: malformed v2 cart must fail closed", async () => {
  const bad = { ...structuredClone(empty), cartData: { carts: [{id:"a",title:"A",currency:"VND",budget:null},{id:"b",title:"B",currency:"VND",budget:null}], candidates: [], legacyMap: {} } };
  assert.equal(validState(bad), false, "missing date/useCase/notes accepted as State");
});
test("review: corrupt v2 offer must fail closed", () => {
  const bad = { ...structuredClone(empty), offers:[null] };
  assert.equal(validState(bad), false, "null offer accepted and later read as RetailerOffer");
});
test("review: snapshot missing specifications must fail closed", () => {
  const bad = { ...structuredClone(empty), cartData: { carts:[{id:"a",title:"A",currency:"VND",budget:null}], candidates:[{id:"c",cartId:"a",productVariantId:"v",decisionSnapshot:{variant:{variantId:"v"}},baselineAmount:null}],legacyMap:{} } };
  assert.equal(validState(bad), false, "invalid ProductVariant accepted in snapshot");
});
