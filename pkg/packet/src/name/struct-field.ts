import { StructFieldType } from "@ndn/tlv";

import { Component } from "./component";
import { Name } from "./name";

/**
 * StructBuilder field type of {@link Name}, where Name TLV is placed into the structure directly.
 *
 * @remarks
 * Example ABNF structure where this can be used:
 * ```abnf
 *  MyType = MY-TYPE-TYPE TLV-LENGTH
 *             OtherTLV
 *             Name
 *             OtherTLV
 * ```
 *
 * The field is defined as `Name`.
 * If the field is required, it is initialized as an empty Name.
 */
export const StructFieldName: StructFieldType<Name> = StructFieldType.wrap(Name, {
  encode: (name) => name.value,
  decode: ({ value }) => new Name(value),
});

/**
 * StructBuilder field type of {@link Name}, where Name TLV is nested in an outer TLV.
 *
 * @remarks
 * Example ABNF structure where this can be used:
 * ```abnf
 *  MyType = MY-TYPE-TYPE TLV-LENGTH
 *             OtherTLV
 *             NestedTLV
 *             OtherTLV
 *  NestedTLV = NESTED-TLV-TYPE TLV-LENGTH
 *                Name
 * ```
 *
 * The field is defined as `Name`.
 * If the field is required, it is initialized as an empty Name.
 */
export const StructFieldNameNested: StructFieldType<Name> = StructFieldType.nest(Name);

/**
 * StructBuilder field type of {@link Component}, where Component TLV is nested in an outer TLV.
 *
 * @remarks
 * Data.FinalBlockId is an example where this might be used.
 */
export const StructFieldComponentNested: StructFieldType<Component> =
  StructFieldType.nest(Component);
