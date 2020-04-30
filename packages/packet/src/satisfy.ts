import { Data } from "./data";
import { ImplicitDigest } from "./digest-comp";
import { Interest } from "./interest";

/**
 * Determine if a Data can satisfy an Interest.
 * @returns yes, no, or undefined to indicate async implicit digest computation is needed.
 */
export function canSatisfySync(interest: Interest, data: Data): boolean|undefined {
  if (interest.mustBeFresh && data.freshnessPeriod <= 0) {
    return false;
  }

  if (interest.canBePrefix ?
    interest.name.isPrefixOf(data.name) : interest.name.equals(data.name)) {
    return true;
  }

  if (interest.name.length === data.name.length + 1 &&
      interest.name.get(-1)!.is(ImplicitDigest)) {
    const fullName = data.getFullName();
    if (!fullName) {
      return undefined;
    }
    return interest.name.equals(fullName);
  }

  return false;
}

/**
 * Determine if a Data can satisfy an Interest.
 * @returns a Promise that will be resolved with the result.
 */
export async function canSatisfy(interest: Interest, data: Data): Promise<boolean> {
  const result = canSatisfySync(interest, data);
  if (typeof result === "undefined") {
    return interest.name.equals(await data.computeFullName());
  }
  return result;
}
