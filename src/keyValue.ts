import { ValueCell, type CellResult } from "./cell";
import { Sheet } from "./sheet";

/**
 * KeyValueStoreChange describes changes in a KeyValueStore.
 */
export type KeyValueStoreChange<K> =
  | { init: null }
  | { set: K }
  | { delete: K };

const NewStoreStatus = { init: null } as KeyValueStoreChange<any>;

/**
 * KeyValueStore is a derived key-value store based on Store.
 */
export class KeyValueStore<K extends string, V> {
  public readonly id: string;
  public readonly store: ValueCell<{ [key in K]: V }>;
  public readonly changes: ValueCell<KeyValueStoreChange<K>>;
  constructor(id: string, cells: Sheet) {
    this.id = id;
    this.store = cells.new({} as { [key in K]: V });
    this.changes = cells.new(NewStoreStatus);
  }

  /**
   * set a key in map.
   * @param k key
   * @param v value
   */
  set = (k: K, v: V) => {
    this.store.update((kv) => ({ ...kv, [k]: v }));
    this.changes.set({ set: k });
  };
  /**
   * get a key from map.
   * @param k key
   */
  get = async (k: K) => {
    const keyValue: CellResult<{ [key in K]: V }, false> =
      await this.store.get();
    return keyValue instanceof Error ? keyValue : keyValue[k];
  };
  /**
   * delete a key from map.
   * @param k key
   */
  delete = (k: K) => {
    this.store.update((kv) => {
      delete kv[k];
      return kv;
    });
    this.changes.set({ delete: k });
  };

  subscribe = (run: (update: KeyValueStoreChange<K>) => void) =>
    this.changes.subscribe(run);
}
