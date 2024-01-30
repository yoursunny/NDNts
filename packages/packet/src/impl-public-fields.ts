export const FIELDS = Symbol("@ndn/packet.FIELDS");

export function definePublicFields<
  Target extends PublicFields & { [FIELDS]: Fields },
  Fields extends PublicFields,
  PublicFields extends {},
>(
    typ: new() => Target,
    fieldDefs: Record<keyof PublicFields, ReadonlyArray<keyof Fields>>,
) {
  for (const [field, clearing] of Object.entries(fieldDefs) as Iterable<[keyof PublicFields, ReadonlyArray<keyof Fields>]>) {
    Object.defineProperty(typ.prototype, field, {
      enumerable: true,
      get(this: Target) {
        return this[FIELDS][field];
      },
      set(this: Target, v: any) {
        const f = this[FIELDS];
        (f[field] as any) = v;
        for (const c of clearing) {
          (f[c] as any) = undefined;
        }
      },
    });
  }
}
