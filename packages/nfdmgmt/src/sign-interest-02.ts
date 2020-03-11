import { PrivateKey, theDigestKey } from "@ndn/keychain";
import { Interest, LLSign, Name, SigInfo, TT } from "@ndn/packet";
import { Decoder, Encoder, NNI } from "@ndn/tlv";

class SignedInterest02 {
  public sigInfo?: SigInfo;
  public sigValue?: Uint8Array;
  public [LLSign.PENDING]?: LLSign;

  constructor(public name: Name, private readonly timestamp: number) {
  }

  public async [LLSign.PROCESS](): Promise<void> {
    const nonce = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    const signedPortion = Encoder.encode([
      ...this.name.comps,
      [TT.GenericNameComponent, NNI(this.timestamp)],
      [TT.GenericNameComponent, NNI(nonce)],
      [TT.GenericNameComponent, this.sigInfo!.encodeAs(TT.DSigInfo)],
    ]);
    await LLSign.processImpl(this, () => signedPortion, (sig) => this.sigValue = sig);
    this.name = new Decoder(Encoder.encode([
      TT.Name,
      signedPortion,
      [TT.GenericNameComponent, [TT.DSigValue, this.sigValue]],
    ])).decode(Name);
  }
}

/**
 * Sign an Interest in 2014 Signed Interest format.
 * @param interest input Interest without signed Interest specific components.
 * @param signer private key to sign the Interest.
 * @see https://named-data.net/doc/ndn-cxx/0.6.6/specs/signed-interest.html
 */
export async function signInterest02(
    interest: Interest,
    { signer = theDigestKey, timestamp = Date.now() }: signInterest02.Options = {},
): Promise<Interest> {
  const si = new SignedInterest02(interest.name, timestamp);
  signer.sign(si);
  await si[LLSign.PROCESS]();
  interest.name = si.name;
  return interest;
}

export namespace signInterest02 {
  export interface Options {
    signer?: PrivateKey;
    timestamp?: number;
  }
}
