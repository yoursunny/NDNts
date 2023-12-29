import "../test-fixture/expect";

import { expect, test } from "vitest";

import { Decoder, Encoder, StructBuilder, StructFieldNNI, StructFieldNNIBig, StructFieldText } from "..";

test("basic", () => {
  const b = new StructBuilder("MyType", 0x40)
    .add(0x41, "a41", StructFieldNNI, { required: false, repeat: false })
    .add(0x42, "a42", StructFieldNNI, { required: true, repeat: false })
    .add(0x43, "a43", StructFieldNNI, { required: false, repeat: true })
    .add(0x44, "a44", StructFieldNNI, { required: true, repeat: true });
  class MyType extends b.baseClass<MyType>() {}
  b.subclass = MyType;

  const myObj = new MyType();
  expect(myObj.a41).toBeUndefined();
  expect(myObj.a42).toBe(0);
  expect(myObj.a43).toEqual([]);
  expect(myObj.a44).toEqual([]);
  expect(myObj.toString()).toBe("MyType a42=0");

  myObj.a41 = 0xAA41;
  myObj.a42 = 0xAA42;
  myObj.a43.push(0xAA0043, 0xAA0143);
  myObj.a44.push(0xAA0044, 0xAA0144);
  expect(myObj.toString()).toBe([
    "MyType",
    `a41=${0xAA41}`,
    `a42=${0xAA42}`,
    `a43=[${0xAA0043}, ${0xAA0143}]`,
    `a44=[${0xAA0044}, ${0xAA0144}]`,
  ].join(" "));

  const wire = Encoder.encode(myObj);
  expect(wire).toMatchTlv(({ type, value }) => {
    expect(type).toBe(0x40);
    expect(value).toMatchTlv(
      ({ type, nni }) => {
        expect(type).toBe(0x41);
        expect(nni).toBe(0xAA41);
      },
      ({ type, nni }) => {
        expect(type).toBe(0x42);
        expect(nni).toBe(0xAA42);
      },
      ({ type, nni }) => {
        expect(type).toBe(0x43);
        expect(nni).toBe(0xAA0043);
      },
      ({ type, nni }) => {
        expect(type).toBe(0x43);
        expect(nni).toBe(0xAA0143);
      },
      ({ type, nni }) => {
        expect(type).toBe(0x44);
        expect(nni).toBe(0xAA0044);
      },
      ({ type, nni }) => {
        expect(type).toBe(0x44);
        expect(nni).toBe(0xAA0144);
      },
    );
  });

  const decoded = Decoder.decode(wire, MyType);
  expect(decoded).toBeInstanceOf(MyType);
  expect(decoded.a41).toBe(0xAA41);
  expect(decoded.a42).toBe(0xAA42);
  expect(decoded.a43).toEqual([0xAA0043, 0xAA0143]);
  expect(decoded.a44).toEqual([0xAA0044, 0xAA0144]);
});

test("types", () => {
  const b = new StructBuilder("MyType")
    .add(0x41, "a41", StructFieldNNI, { required: true })
    .add(0x42, "a42", StructFieldNNIBig, { required: true })
    .add(0x43, "a43", StructFieldText, { required: true });
  class MyType extends b.baseClass<MyType>() {}
  b.subclass = MyType;

  const myObj = new MyType();
  expect(myObj.a41).toBe(0);
  expect(myObj.a42).toBe(0n);
  expect(myObj.a43).toBe("");

  myObj.a41 = 0xAA41;
  myObj.a42 = 0xAA42n;
  myObj.a43 = "AA43";
  expect(myObj.toString()).toBe([
    "MyType",
    `a41=${0xAA41}`,
    `a42=${0xAA42n}`,
    "a43=AA43",
  ].join(" "));

  expect(myObj).toEncodeAs(
    ({ type, nni }) => {
      expect(type).toBe(0x41);
      expect(nni).toBe(0xAA41);
    },
    ({ type, nniBig }) => {
      expect(type).toBe(0x42);
      expect(nniBig).toBe(0xAA42n);
    },
    ({ type, text }) => {
      expect(type).toBe(0x43);
      expect(text).toBe("AA43");
    },
  );
});

test("order", () => {
  const b = new StructBuilder("MyType")
    .add(0x41, "a41", StructFieldNNI, { order: 2 })
    .add(0x42, "a42", StructFieldNNI, { order: 1 });
  class MyType extends b.baseClass<MyType>() {}
  b.subclass = MyType;

  const myObj = new MyType();
  myObj.a41 = 0xAA41;
  myObj.a42 = 0xAA42;
  expect(myObj.toString()).toBe([
    "MyType",
    `a42=${0xAA42}`,
    `a41=${0xAA41}`,
  ].join(" "));

  expect(myObj).toEncodeAs(
    ({ type, nni }) => {
      expect(type).toBe(0x42);
      expect(nni).toBe(0xAA42);
    },
    ({ type, nni }) => {
      expect(type).toBe(0x41);
      expect(nni).toBe(0xAA41);
    },
  );
});

test("no-topTT", () => {
  const b = new StructBuilder("MyType")
    .add(0x41, "a41", StructFieldNNI, { repeat: true });
  class MyType extends b.baseClass<MyType>() {}
  b.subclass = MyType;

  const myObj = new MyType();
  myObj.a41.push(0xAA0041, 0xAA0141);
  expect(myObj.toString()).toBe([
    "MyType",
    `a41=[${0xAA0041}, ${0xAA0141}]`,
  ].join(" "));

  const wire = Encoder.encode(myObj);
  expect(wire).toMatchTlv(
    ({ type, nni }) => {
      expect(type).toBe(0x41);
      expect(nni).toBe(0xAA0041);
    },
    ({ type, nni }) => {
      expect(type).toBe(0x41);
      expect(nni).toBe(0xAA0141);
    },
  );

  const decoded = Decoder.decode(wire, MyType);
  expect(decoded).toBeInstanceOf(MyType);
  expect(decoded.a41).toEqual([0xAA0041, 0xAA0141]);
});
