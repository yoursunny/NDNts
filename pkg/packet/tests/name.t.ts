import "../test-fixture/expect";

import { Decoder, Encoder, StructBuilder } from "@ndn/tlv";
import { expect, test } from "vitest";

import { AltUri, Component, Name, StructFieldName, StructFieldNameNested, TT } from "..";

test("construct", () => {
  let name = new Name();
  expect(name).toHaveLength(0);
  expect(name.value).toEqualUint8Array([]);
  expect(name.toString()).toBe("/");
  expect(AltUri.ofName(name)).toBe("/");

  for (const uri of ["", "ndn:", "/", "ndn:/"]) {
    name = new Name(uri);
    expect(name).toHaveLength(0);
    expect(name.toString()).toBe("/");
  }

  for (const uri of ["A", "ndn:/A", "/A", "/%41", "8=A", "ndn:/8=A", "/8=A", "/8=%41"]) {
    name = new Name(uri);
    expect(name).toHaveLength(1);
    expect(name.at(0)).toEqualComponent("A");
    expect(name.toString()).toBe("/8=A");
    expect(name.valueHex).toBe("080141");
    expect(name.value).toEqualUint8Array([0x08, 0x01, 0x41]);
  }

  const decoder = new Decoder(Uint8Array.of(
    0x07, 0x07,
    0x08, 0x01, 0x41,
    0xF0, 0x02, 0x42, 0x43,
  ));
  name = decoder.decode(Name);
  expect(name).toHaveLength(2);
  expect(name.get(0)).toEqualComponent(Component.from("A"));
  expect(name.get(1)).toEqualComponent(Component.from("240=BC"));
  expect(name.value).toEqualUint8Array([
    0x08, 0x01, 0x41,
    0xF0, 0x02, 0x42, 0x43,
  ]);
  expect(name.toString()).toBe("/8=A/240=BC");
  expect(AltUri.ofName(name)).toBe("/A/240=BC");
});

test("get at", () => {
  const comp0 = Component.from("A");
  const comp1 = Component.from("B");
  const name = new Name([comp0, comp1]);

  expect(name.get(0)).toEqualComponent(comp0);
  expect(name.get(1)).toEqualComponent(comp1);
  expect(name.get(2)).toBeUndefined();
  expect(name.get(-1)).toEqualComponent(comp1);
  expect(name.get(-2)).toEqualComponent(comp0);
  expect(name.get(-3)).toBeUndefined();

  expect(name.at(0)).toEqualComponent(comp0);
  expect(name.at(1)).toEqualComponent(comp1);
  expect(() => name.at(2)).toThrow();
  expect(name.at(-1)).toEqualComponent(comp1);
  expect(name.at(-2)).toEqualComponent(comp0);
  expect(() => name.at(-3)).toThrow();
});

test("modify", () => {
  const name = new Name("/A/B/C");
  expect(new Name(name)).toEqualName("/A/B/C");
  expect(name.slice(1)).toEqualName("/B/C");
  expect(name.getPrefix(-1)).toEqualName("/A/B");
  expect(name.append("D", "E")).toEqualName("/A/B/C/D/E");
  expect(name.replaceAt(1, "BB")).toEqualName("/A/BB/C");
  expect(name.replaceAt(-1, "CC")).toEqualName("/A/B/CC");
  expect(name).toEqualName("/A/B/C"); // immutable
});

test("compare", () => {
  expect(Name.CompareResult.LT).toBe(Component.CompareResult.LT);
  expect(Name.CompareResult.EQUAL).toBe(Component.CompareResult.EQUAL);
  expect(Name.CompareResult.GT).toBe(Component.CompareResult.GT);

  const name = new Name("/A/B");
  expect(name.compare("/A/C")).toBe(Name.CompareResult.LT);
  expect(name.compare("/A/B/C")).toBe(Name.CompareResult.LPREFIX);
  expect(name.compare("/A/B")).toBe(Name.CompareResult.EQUAL);
  expect(name.compare("/A")).toBe(Name.CompareResult.RPREFIX);
  expect(name.compare("/A/A")).toBe(Name.CompareResult.GT);

  expect(name.equals("/A/C")).toBeFalsy();
  expect(name.equals("/A/B/C")).toBeFalsy();
  expect(name.equals("/A/B")).toBeTruthy();
  expect(name.equals("/A")).toBeFalsy();
  expect(name.equals("/A/A")).toBeFalsy();

  expect(name.isPrefixOf("/A/C")).toBeFalsy();
  expect(name.isPrefixOf("/A/B/C")).toBeTruthy();
  expect(name.isPrefixOf("/A/B")).toBeTruthy();
  expect(name.isPrefixOf("/A")).toBeFalsy();
  expect(name.isPrefixOf("/A/A")).toBeFalsy();
});

test("encode", () => {
  const name = new Name("/A/B");
  expect(name).toEncodeAs([
    0x07, 0x06,
    0x08, 0x01, 0x41,
    0x08, 0x01, 0x42,
  ]);
});

test("NameLike", () => {
  expect(Name.isNameLike(new Name())).toBeTruthy();
  expect(Name.isNameLike("/")).toBeTruthy();
  expect(Name.isNameLike({})).toBeFalsy();

  const nameQ = new Name("/Q");
  expect(Name.from(nameQ)).toBe(nameQ);
  const fromQ = Name.from("/Q");
  expect(fromQ).toEqualName(nameQ);
  expect(fromQ).not.toBe(nameQ);
});

test("StructFieldType", () => {
  const b = new StructBuilder("MyType")
    .add(TT.Name, "a41", StructFieldName, { required: true })
    .add(0x42, "a42", StructFieldNameNested, { required: true });
  class MyType extends b.baseClass<MyType>() {}
  b.subclass = MyType;

  const myObj = new MyType();
  expect(myObj.a41).toBeInstanceOf(Name);
  expect(myObj.a42).toBeInstanceOf(Name);

  myObj.a41 = new Name("/AA41");
  myObj.a42 = new Name("/AA/42");
  expect(myObj.toString()).toBe([
    "MyType",
    "a41=/8=AA41",
    "a42=/8=AA/8=42",
  ].join(" "));

  const wire = Encoder.encode(myObj);
  expect(wire).toMatchTlv(
    ({ type, decoder }) => {
      expect(type).toBe(TT.Name);
      expect(decoder.decode(Name)).toEqualName("/AA41");
    },
    ({ type, vd }) => {
      expect(type).toBe(0x42);
      expect(vd.decode(Name)).toEqualName("/AA/42");
    },
  );

  const decoded = Decoder.decode(wire, MyType);
  expect(decoded).toBeInstanceOf(MyType);
  expect(decoded.a41).toEqualName("/AA41");
  expect(decoded.a42).toEqualName("/AA/42");
});
