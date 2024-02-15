import "../test-fixture/expect";

import { expect, test } from "vitest";

import { Decoder, Encoder, StructBuilder, StructFieldBytes, StructFieldEnum, StructFieldNNI, StructFieldNNIBig, StructFieldText, StructFieldType } from "..";

test("basic", () => {
  const b = new StructBuilder("MyType", 0x40)
    .add(0x41, "a41", StructFieldNNI, { required: false, repeat: false })
    .add(0x42, "a42", StructFieldNNI, { required: true, repeat: false })
    .add(0x43, "a43", StructFieldNNI, { required: false, repeat: true })
    .add(0x44, "a44", StructFieldNNI, { required: true, repeat: true });
  class MyType extends b.baseClass<MyType>() {}
  b.subclass = MyType;
  expect(b.keys).toEqual(["a41", "a42", "a43", "a44"]);

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
  expect(decoded.a41).toEqual([0xAA0041, 0xAA0141]);
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

test("flags", () => {
  const b = new StructBuilder("MyType")
    .add(0x41, "a41", StructFieldNNI, {
      flagBits: { p: 0x01, q: 0x10 },
    })
    .add(0x42, "a42", StructFieldNNI, {
      required: true,
      flagPrefix: "b",
      flagBits: { p: 0x02, q: 0x20, R: 0x20 },
    });
  class MyType extends b.baseClass<MyType>() {}
  b.subclass = MyType;

  const myObj = new MyType();
  expect(myObj.a41).toBeUndefined();
  expect(myObj.a41P).toBeFalsy();
  expect(myObj.a41Q).toBeFalsy();
  expect(myObj.a42).toBe(0x00);
  expect(myObj.bP).toBeFalsy();
  expect(myObj.bQ).toBeFalsy();
  expect(myObj.toString()).toBe("MyType a42=0x0()");

  myObj.a42 = 0xFF;
  expect(myObj.bP).toBeTruthy();
  expect(myObj.bQ).toBeTruthy();
  expect(myObj.bR).toBeTruthy();
  expect(myObj.toString()).toBe("MyType a42=0xFF(p|q|R)");
  myObj.bP = false;
  myObj.bR = false;
  expect(myObj.bQ).toBeFalsy();
  expect(myObj.a42).toBe(0xDD);
  expect(myObj.toString()).toBe("MyType a42=0xDD()");

  myObj.a41P = false;
  myObj.a41Q = false;
  expect(myObj.a41).toBe(0x00);
  expect(myObj.toString()).toBe("MyType a41=0x0() a42=0xDD()");
  myObj.a41P = true;
  expect(myObj.a41).toBe(0x01);
  expect(myObj.toString()).toBe("MyType a41=0x1(p) a42=0xDD()");
  myObj.a41Q = true;
  expect(myObj.a41).toBe(0x11);
  expect(myObj.toString()).toBe("MyType a41=0x11(p|q) a42=0xDD()");
  myObj.a41P = false;
  expect(myObj.a41).toBe(0x10);
  expect(myObj.toString()).toBe("MyType a41=0x10(q) a42=0xDD()");
  myObj.a41Q = false;
  expect(myObj.a41).toBe(0x00);
  expect(myObj.toString()).toBe("MyType a41=0x0() a42=0xDD()");
});

test("wrap-nest", () => {
  class Inner {
    public static decodeFrom(decoder: Decoder): Inner {
      const { length } = decoder.read();
      return new Inner(length);
    }

    constructor(public n = 0) {}

    public encodeTo(encoder: Encoder): void {
      const value = new Uint8Array(this.n);
      value.fill(0xBB);
      encoder.prependTlv(0x4F, value);
    }

    public toString(): string {
      return this.n.toString(16).toUpperCase();
    }
  }

  const b = new StructBuilder("MyType")
    .add(0x41, "a41", StructFieldType.wrap(Inner), { required: true })
    .add(0x42, "a42", StructFieldType.nest(Inner), { required: true });
  class MyType extends b.baseClass<MyType>() {}
  b.subclass = MyType;

  const myObj = new MyType();
  expect(myObj.a41).toBeInstanceOf(Inner);
  expect(myObj.a42).toBeInstanceOf(Inner);

  myObj.a41 = new Inner(0xAA41);
  myObj.a42 = new Inner(0xAA42);
  expect(myObj.toString()).toBe([
    "MyType",
    "a41=AA41",
    "a42=AA42",
  ].join(" "));

  const wire = Encoder.encode(myObj);
  expect(wire).toMatchTlv(
    ({ type, length }) => {
      expect(type).toBe(0x41);
      expect(length).toBe(0xAA41);
    },
    ({ type, value }) => {
      expect(type).toBe(0x42);
      expect(value).toMatchTlv(
        ({ type, length }) => {
          expect(type).toBe(0x4F);
          expect(length).toBe(0xAA42);
        },
      );
    },
  );

  const decoded = Decoder.decode(wire, MyType);
  expect(decoded).toBeInstanceOf(MyType);
  expect(decoded.a41.n).toBe(0xAA41);
  expect(decoded.a42.n).toBe(0xAA42);
});

test("types", () => {
  enum MyEnum {
    P = 1,
    Q = 2,
  }

  const b = new StructBuilder("MyType")
    .add(0x41, "a41", StructFieldNNI, { required: true })
    .add(0x42, "a42", StructFieldNNIBig, { required: true })
    .add(0x43, "a43", StructFieldEnum<MyEnum>(MyEnum), { required: true })
    .add(0x44, "a44", StructFieldText, { required: true })
    .add(0x45, "a45", StructFieldBytes, { required: true });
  class MyType extends b.baseClass<MyType>() {}
  b.subclass = MyType;

  const myObj = new MyType();
  expect(myObj.a41).toBe(0);
  expect(myObj.a42).toBe(0n);
  expect(myObj.a43).toBe(0);
  expect(myObj.a44).toBe("");
  expect(myObj.toString()).toBe([
    "MyType",
    "a41=0",
    "a42=0",
    "a43=0(unknown)",
    "a44=",
    "a45=",
  ].join(" "));

  myObj.a41 = 0xAA41;
  myObj.a42 = 0xAA42n;
  myObj.a43 = MyEnum.Q;
  myObj.a44 = "AA44";
  myObj.a45 = Uint8Array.of(0xAA, 0x45);
  expect(myObj.toString()).toBe([
    "MyType",
    `a41=${0xAA41}`,
    `a42=${0xAA42n}`,
    "a43=2(Q)",
    "a44=AA44",
    "a45=AA45",
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
    ({ type, nni }) => {
      expect(type).toBe(0x43);
      expect(nni).toBe(2);
    },
    ({ type, text }) => {
      expect(type).toBe(0x44);
      expect(text).toBe("AA44");
    },
    ({ type, value }) => {
      expect(type).toBe(0x45);
      expect(value).toEqualUint8Array([0xAA, 0x45]);
    },
  );
});
