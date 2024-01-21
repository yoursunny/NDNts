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
  interface Window {
    testKeyStore(enabled: KeyStoreEnable): Promise<KeyStoreRecord>;
    testCertStore(): Promise<CertStoreRecord>;
    testDigestSigning(): Promise<Serialize.Value<SignVerifyTestResult>>;
    testECDSA(curve: EcCurve): Promise<Serialize.Value<SignVerifyTestResult>>;
    testRSA(modulusLength: RsaModulusLength): Promise<Serialize.Value<SignVerifyTestResult>>;
    testHMAC(): Promise<Serialize.Value<SignVerifyTestResult>>;
    testEd25519(): Promise<Serialize.Value<SignVerifyTestResult>>;
    testSafeBagDecode(wire: Serialize.Value<Uint8Array>, passphrase: string): Promise<[sigType: number, certName: string]>;
    testSafeBagEncode(passphrase: string): Promise<Serialize.Value<Uint8Array>>;
  }
}
