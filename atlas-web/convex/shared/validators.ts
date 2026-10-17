import { v, type VLiteral, type VUnion } from "convex/values";

type LiteralUnion<T extends readonly string[]> = VUnion<T[number], VLiteral<T[number]>[]>;

/** `v.union(v.literal(...))` from a readonly tuple, so enums live in one place (Fitcheck pattern). */
export function literals<const T extends readonly string[]>(values: T): LiteralUnion<T> {
  const members = values.map((value) => v.literal(value)) as VLiteral<T[number]>[];
  return v.union(...members) as unknown as LiteralUnion<T>;
}
