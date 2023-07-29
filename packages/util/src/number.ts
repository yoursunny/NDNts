/** Error if n is not an integer within [0,MAX_SAFE_INTEGER] range. */
export function constrain(n: number, typeName: string): number;
/** Error if n is not an integer within [0,max] range. */
export function constrain(n: number, typeName: string, max: number): number;
/** Error if n is not an integer within [min,max] range. */
export function constrain(n: number, typeName: string, min: number, max: number): number;

export function constrain(n: number, typeName: string, arg3?: number, arg4?: number): number {
  const [min = 0, max = Number.MAX_SAFE_INTEGER] = arg4 === undefined ? [0, arg3] : [arg3, arg4];
  if (!(Number.isInteger(n) && n >= min && n <= max)) {
    throw new RangeError(`${n} is not an integer or out of ${typeName} valid range`);
  }
  return n;
}
