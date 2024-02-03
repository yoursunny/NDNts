/**
 * Ensure n is an integer within `[0,MAX_SAFE_INTEGER]` range.
 * @param n - Input number.
 * @param typeName - Description of the number type.
 *
 * @throws RangeError
 * Thrown if n is out of valid range.
 */
export function constrain(n: number, typeName: string): number;

/**
 * Ensure n is an integer within `[0,max]` range.
 * @param n - Input number.
 * @param typeName - Description of the number type.
 * @param max - Maximum allowed value (inclusive).
 *
 * @throws RangeError
 * Thrown if n is out of valid range.
 */
export function constrain(n: number, typeName: string, max: number): number;

/**
 * Ensure n is an integer within `[min,max]` range.
 * @param n - Input number.
 * @param typeName - Description of the number type.
 * @param min - Minimum allowed value (inclusive).
 * @param max - Maximum allowed value (inclusive).
 *
 * @throws RangeError
 * Thrown if n is out of valid range.
 */
export function constrain(n: number, typeName: string, min: number, max: number): number;

export function constrain(n: number, typeName: string, arg3?: number, arg4?: number): number {
  const [min = 0, max = Number.MAX_SAFE_INTEGER] = arg4 === undefined ? [0, arg3] : [arg3, arg4];
  if (!(Number.isInteger(n) && n >= min && n <= max)) {
    throw new RangeError(`${n} is not an integer or out of ${typeName} valid range`);
  }
  return n;
}
