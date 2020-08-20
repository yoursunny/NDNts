import { CertNaming } from "@ndn/keychain";
import { Component } from "@ndn/packet";

export const TT = {
  EncryptedContent: 0x82,
  EncryptedPayload: 0x84,
  InitializationVector: 0x85,
  EncryptedPayloadKey: 0x86,
};

export const ContentTypeKEY = 0x02;
export const DefaultFreshness = 3600_000;

export const Keyword = {
  NAC: Component.from("NAC"),
  KEK: Component.from("KEK"),
  KDK: Component.from("KDK"),
  CK: Component.from("CK"),
  ENCRYPTED_BY: Component.from("ENCRYPTED-BY"),
  KEY: CertNaming.KEY,
};
