import { type AnyCell } from "./cell";
import type { SheetProxy } from "./proxy";

// Type transformation: T_k[] => AnyCell<T_k>[]
export type AnyCellArray<L extends unknown[]> = {
  [K in keyof L]: AnyCell<L[K]>;
};

/** Compute function */
export type ComputeFn<In extends unknown[], Out> = (...args: In) => Out;

// Interfaces extending definitions from Svelte

/** Callback to inform of a value updates. */
export type Subscriber<T> = (value: T) => void;

/** Unsubscribes from value updates. */
export type Unsubscriber = () => void;

/** Callback to update a value. */
export type Updater<T> = (value: T) => T;

/** Cleanup logic callback. */
type Invalidator<T> = (value?: T) => void;

/** Readable interface for subscribing. */
export interface Readable<T> {
  /**
   * Subscribe on value changes.
   * @param run subscription callback
   * @param invalidate cleanup callback
   */
  subscribe(
    this: void,
    run: Subscriber<T>,
    invalidate?: Invalidator<T>
  ): Unsubscriber;
}

/** Writable interface for both updating and subscribing. */
export interface Writable<T> extends Readable<T> {
  /**
   * Set value and inform subscribers.
   * @param value to set
   */
  set(this: void, value: T): void;

  /**
   * Update value using callback and inform subscribers.
   * @param updater callback
   */
  update(this: void, updater: Updater<T>): void;
}

/**
 * CellOptions are used for new/map cells.
 */
export type CellOptions = {
  /** cell name */
  name?: string;
  /** cell proxy */
  proxy?: SheetProxy;
};
