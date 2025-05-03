import { GetFieldType } from "lodash";
import { Course, Navigation, SignalK, Vessel, Paths, Position, FullValue } from "../src/index.js";

/* Type assertions for testing */
export type Expect<T extends true> = T;
export type Extends<T, U> = T extends U ? true : false;
export type ShapesMatch<T, U> = [T] extends [U] ? [U] extends [T] ? true : false : false;
export type TypesMatch<T, U> = ShapesMatch<T, U> extends true ? ShapesMatch<keyof T, keyof U> extends true ? true : false : false;
export type Not<T extends boolean> = T extends false ? true : false;

export type Tests = [
  Expect<Extends<"vessels", Paths<SignalK>>>,
  Expect<TypesMatch<GetFieldType<SignalK, "vessels">, SignalK["vessels"]>>,

  Expect<Extends<"vessels.self", Paths<SignalK>>>,
  Expect<TypesMatch<GetFieldType<SignalK, "vessels.self">, Vessel | undefined>>,

  Expect<Extends<"vessels.self.navigation", Paths<SignalK>>>,
  Expect<TypesMatch<GetFieldType<SignalK, "vessels.self.navigation">, Navigation | undefined>>,

  Expect<TypesMatch<GetFieldType<SignalK, "vessels.self.navigation.courseGreatCircle">, Course | undefined>>,
  Expect<TypesMatch<GetFieldType<SignalK, "vessels.self.navigation.position.value.latitude">, number | undefined>>,
  Expect<TypesMatch<GetFieldType<Vessel, "url">, string | undefined>>,

  Expect<TypesMatch<GetFieldType<Vessel, "navigation">, Navigation | undefined>>,
  Expect<TypesMatch<GetFieldType<Vessel, "navigation.position">, FullValue<Position> | undefined>>,
  Expect<TypesMatch<GetFieldType<Vessel, "navigation.position.value">, Position | undefined>>,

  Expect<Not<Extends<"unknown", Paths<SignalK>>>>,
  Expect<TypesMatch<GetFieldType<SignalK, "unknown">, undefined>>,
];
