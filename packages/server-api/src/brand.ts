declare const __brand: unique symbol

/**
 * An interface for creating branded types, which create a more specific and unique data type
 * with greater clarity and specificity,
 * @hidden
 * @example
 * ```ts
 * type Path = Branded<string, "path">
 *
 * function getSelfPath(path: Path): Delta {
 *   // ...
 * }
 * ```
 *
 * @see https://egghead.io/blog/using-branded-types-in-typescript
 * @internal
 * @typeParam Type - The real type to use (e.g. `string`, `boolean`, etc.)
 * @typeParam Name - The name of this type (e.g. `path`, `sourceRef`, etc.)
 */
export type Brand<Type, Name> = Type & { [__brand]: Name }
