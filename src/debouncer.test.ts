import { expect, test } from "vitest";

import { debouncer } from "./debouncer";
import { isEqual } from "./isEqual.test";
import { sleep } from "./promise";
import { Sheet } from "./sheet";

test("debouncer", async () => {
  const proxy = new Sheet(isEqual).newProxy();
  const waiting = proxy.new(false);
  const deb = debouncer(20, waiting);
  const v = proxy.new(0);
  expect(waiting.consolidatedValue).toBe(false);

  for (let i = 1; i <= 10; i++) {
    deb((i) => v.set(i), i);
    await sleep(5);
    expect(v.consolidatedValue).toBe(0);
    expect(waiting.consolidatedValue).toBe(true);
  }

  await sleep(30);
  expect(v.consolidatedValue).toBe(10);
  expect(waiting.consolidatedValue).toBe(false);
});
