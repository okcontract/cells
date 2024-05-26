import { expect, test } from "vitest";

import { initialValue } from "./initial";
import { isEqual } from "./isEqual.test";
import { delayed, sleep } from "./promise";
import { Sheet } from "./sheet";

test("initialValue", async () => {
  const proxy = new Sheet(isEqual).newProxy();
  const a = proxy.new(1);
  const b = proxy.new(delayed(2, 50));
  const c = initialValue(proxy, a, b);
  expect(c.consolidatedValue).toBe(1);
  await sleep(60);
  expect(c.consolidatedValue).toBe(2);
});
