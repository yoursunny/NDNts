import { Component } from "@ndn/packet";

export const TT = {
  CaPrefix: 0x81,
  CaInfo: 0x83,
  ParameterKey: 0x85,
  ParameterValue: 0x87,
  CaCertificate: 0x89,
  MaxValidityPeriod: 0x8B,
  ProbeResponse: 0x8D,
  AllowLongerName: 0x8F,
  EcdhPub: 0x91,
  CertRequest: 0x93,
  Salt: 0x95,
  RequestId: 0x97,
  Challenge: 0x99,
  Status: 0x9B,
  InitializationVector: 0x9D,
  EncryptedPayload: 0x9F,
  SelectedChallenge: 0xA1,
  ChallengeStatus: 0xA3,
  RemainingTries: 0xA5,
  RemainingTime: 0xA7,
  IssuedCertName: 0xA9,
  ErrorCode: 0xAB,
  ErrorInfo: 0xAD,
  AuthenticationTag: 0xAF,
};

export const Verb = {
  INFO: Component.from("INFO"),
  PROBE: Component.from("PROBE"),
  NEW: Component.from("NEW"),
  CHALLENGE: Component.from("CHALLENGE"),
};

export enum Status {
  BEFORE_CHALLENGE = 0,
  CHALLENGE = 1,
  PENDING = 2,
  SUCCESS = 3,
}
export namespace Status {
  export const MIN = 0;
  export const MAX = 3;
}

export enum ErrorCode {
  BadInterestFormat = 1,
  BadParameterFormat = 2,
  BadSignature = 3,
  InvalidParameters = 4,
  NameNotAllowed = 5,
  BadValidityPeriod = 6,
  OutOfTries = 7,
  OutOfTime = 8,
  NoAvailableName = 9,
}
