import { GetFieldType } from "lodash";
import { Course, Navigation, SignalK, Vessel } from "../src/schema";

/* Type assertions for testing */
export type Expect<T extends true> = T;
export type ShapesMatch<T, U> = [T] extends [U] ? [U] extends [T] ? true : false : false;
export type TypesMatch<T, U> = ShapesMatch<T, U> extends true ? ShapesMatch<keyof T, keyof U> extends true ? true : false : false;
export type Not<T extends false> = true;

export type Tests = [
  Expect<TypesMatch<GetFieldType<SignalK, "vessels">, SignalK["vessels"]>>,
  Expect<TypesMatch<GetFieldType<SignalK, "vessels.self">, Vessel | undefined>>,
  Expect<TypesMatch<GetFieldType<SignalK, "vessels.self.navigation">, Navigation | undefined>>,
  Expect<TypesMatch<GetFieldType<SignalK, "vessels.self.navigation.courseGreatCircle">, Course | undefined>>,
  Expect<TypesMatch<GetFieldType<SignalK, "vessels.self.navigation.position.value.latitude">, number | undefined>>,
  Expect<TypesMatch<GetFieldType<SignalK, "nope">, unknown>>,
  Expect<TypesMatch<GetFieldType<Vessel, "navigation">, Navigation | undefined>>,
];
