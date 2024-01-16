import { test, expect, describe, it } from "vitest";

import { KeyValueStore, type KeyValueStoreChange } from "./keyValue";
import { Sheet } from "./sheet";

describe("key value store", () => {
  it("sets and gets keys", async () => {
    const store = new Sheet();
    const kvs = new KeyValueStore("test", store);
    kvs.set("key1", { foo: 1, bar: 2 });
    kvs.set("key2", { foo: "abc", bar: 10 });
    const v1 = await kvs.get("key1");
    const v2 = await kvs.get("key2");
    const v3 = await kvs.get("key3");
    expect(v1).toEqual({ foo: 1, bar: 2 });
    expect(v2).toEqual({ foo: "abc", bar: 10 });
    expect(v3).toBeUndefined();
  });
  // it("works from derived store", async () => {
  //   const kv = new KeyValueStoreDB("test");
  //   kv.set("key1", { foo: 1, bar: 2 });
  //   const v1 = await kv.get("key1");
  //   const v3 = await kv.get("key3");
  //   expect(v1).toEqual({ foo: 1, bar: 2 });
  //   expect(v3).toBeUndefined();
  // });
});

test("subscription", async () => {
  const store = new Sheet();
  const kvs = new KeyValueStore("test", store);
  const updates: KeyValueStoreChange<any>[] = [];
  const uns = kvs.subscribe((up) => updates.push(up));
  kvs.set("foo", 10);
  kvs.set("bar", 20);
  kvs.delete("foo");
  expect(updates).toEqual([
    { init: null },
    { set: "foo" },
    { set: "bar" },
    { delete: "foo" },
  ]);
  uns();
});
