import { TlvTypes as nameTT } from "@ndn/name";

export class TlvTypes extends nameTT {
  public readonly Interest = 0x05;
  public readonly CanBePrefix = 0x21;
  public readonly MustBeFresh = 0x12;
  public readonly ForwardingHint = 0x1E;
  public readonly Nonce = 0x0A;
  public readonly InterestLifetime = 0x0C;
  public readonly HopLimit = 0x22;
  public readonly AppParameters = 0x24;
  public readonly ISigInfo = 0x2C;
  public readonly ISigValue = 0x2E;

  public readonly Data = 0x06;
  public readonly MetaInfo = 0x14;
  public readonly ContentType = 0x18;
  public readonly FreshnessPeriod = 0x19;
  public readonly FinalBlockId = 0x1A;
  public readonly Content = 0x15;
  public readonly DSigInfo = 0x16;
  public readonly DSigValue = 0x17;

  public readonly SigType = 0x1B;
  public readonly KeyLocator = 0x1C;
  public readonly KeyDigest = 0x1D;
  public readonly SigNonce = 0x26;
  public readonly SigTime = 0x28;
  public readonly SigSeqNum = 0x2A;
}

export const TT = new TlvTypes();

export class SigTypes {
  public readonly Sha256 = 0x00;
  public readonly Sha256WithRsa = 0x01;
  public readonly Sha256WithEcdsa = 0x03;
  public readonly HmacWithSha256 = 0x04;
}

export const SigType = new SigTypes();
