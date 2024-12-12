import type { EcCurve, RsaModulusLength } from "@ndn/keychain";
import type { TestRecord as CertStoreRecord } from "@ndn/keychain/test-fixture/cert-store";
import type { Enable as KeyStoreEnable, TestRecord as KeyStoreRecord } from "@ndn/keychain/test-fixture/key-store";
import type { TestRecord as SignVerifyRecord } from "@ndn/packet/test-fixture/sign-verify";

import type * as Serialize from "../../test-fixture/serialize";

export type SignVerifyTestResult = [
  SignVerifyRecord, // Interest test record
  SignVerifyRecord, // Data test record
];

declare global {
  function testKeyStore(enabled: KeyStoreEnable): Promise<KeyStoreRecord>;
  function testCertStore(): Promise<CertStoreRecord>;
  function testDigestSigning(): Promise<Serialize.Value<SignVerifyTestResult>>;
  function testECDSA(curve: EcCurve): Promise<Serialize.Value<SignVerifyTestResult>>;
  function testRSA(modulusLength: RsaModulusLength): Promise<Serialize.Value<SignVerifyTestResult>>;
  function testHMAC(): Promise<Serialize.Value<SignVerifyTestResult>>;
  function testEd25519(): Promise<Serialize.Value<SignVerifyTestResult>>;
  function testSafeBagDecode(wire: Serialize.Value<Uint8Array>, passphrase: string): Promise<[sigType: number, certName: string]>;
  function testSafeBagEncode(passphrase: string): Promise<Serialize.Value<Uint8Array>>;
}
