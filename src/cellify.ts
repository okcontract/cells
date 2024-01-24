import { AnyCell, Cell, ValueCell } from "./cell";
import { SheetProxy } from "./proxy";

// Cellified computes a cellified type.
export type Cellified<T> = T extends object
	? T extends Array<infer U>
		? ValueCell<Cellified<U>[]>
		: ValueCell<{
				[P in keyof T]: Cellified<T[P]>;
		  }>
	: ValueCell<T>;

// Uncellified computes an uncellified type.
export type Uncellified<T> = T extends AnyCell<infer U>
	? U extends object
		? U extends Array<infer Elt>
			? Array<Uncellified<Elt>>
			: {
					[P in keyof U]: Uncellified<U[P]>;
			  }
		: U
	: T;

/**
 * cellify converts any value to a Cellified value where each array or record
 * becomes a Cell in canonical form.
 * @param proxy
 * @param v any defined value (v must not be undefined)
 * @returns
 * @todo cell reuses
 */
export const _cellify = <T>(proxy: SheetProxy, v: T): Cellified<T> => {
	if (v instanceof Cell) throw new Error("cell");
	return proxy.new(
		Array.isArray(v)
			? v.map((vv) => _cellify(proxy, vv), "cellify.[]")
			: typeof v === "object" &&
				  v !== null &&
				  v?.constructor?.prototype !== Object.prototype // exclude classes
			  ? Object.fromEntries(
						Object.entries(v).map(
							([k, vv]) => [k, _cellify(proxy, vv)],
							"cellify.{}",
						),
				  )
			  : v,
		"cellify",
	) as Cellified<T>;
};

/**
 * _uncellify is used in tests to flatten a value tree that contains multiple cells.
 * @param v any value
 * @returns value without cells
 */
export const _uncellify = async <T>(
	v: T | AnyCell<T>,
): Promise<Uncellified<T>> => {
	const value = v instanceof Cell ? await v.get() : v;
	if (value instanceof Error) throw value;
	if (Array.isArray(value))
		return Promise.all(
			value.map(async (_element) => await _uncellify(_element)),
		) as Promise<Uncellified<T>>;
	if (
		typeof value === "object" &&
		value !== null &&
		v?.constructor?.prototype === Object.prototype
	)
		return Object.fromEntries(
			await Promise.all(
				Object.entries(value).map(async ([k, vv]) => [k, await _uncellify(vv)]),
			),
		);
	return value as Uncellified<T>;
};
