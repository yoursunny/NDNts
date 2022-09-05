import { type Interest, type SigInfo, type Signer, digestSigning, LLSign, Name, TT } from "@ndn/packet";
import { Encoder, NNI } from "@ndn/tlv";

class SignedInterest02 implements Signer.Signable {
  public sigInfo?: SigInfo;
  public sigValue = new Uint8Array();

  constructor(public name: Name, private readonly timestamp: number) {}

  public async [LLSign.OP](sign: LLSign) {
    const nonce = Math.trunc(Math.random() * Number.MAX_SAFE_INTEGER);
    const signedPortion = Encoder.encode([
      ...this.name.comps,
      [TT.GenericNameComponent, NNI(this.timestamp)],
      [TT.GenericNameComponent, NNI(nonce)],
      [TT.GenericNameComponent, this.sigInfo!.encodeAs(TT.DSigInfo)],
    ]);
    this.sigValue = await sign(signedPortion);
    this.name = new Name(Encoder.encode([
      signedPortion,
      [TT.GenericNameComponent, [TT.DSigValue, this.sigValue]],
    ]));
  }
}

/**
 * Sign an Interest in Signed Interest 0.2 format.
 * @param interest input Interest without signed Interest specific components.
 * @param signer private key to sign the Interest.
 * @see https://named-data.net/doc/ndn-cxx/0.8.0/specs/signed-interest.html
 */
export async function signInterest02(
    interest: Interest,
    { signer = digestSigning, timestamp = Date.now() }: signInterest02.Options = {},
): Promise<Interest> {
  const si = new SignedInterest02(interest.name, timestamp);
  await signer.sign(si);
  interest.name = si.name;
  return interest;
}

export namespace signInterest02 {
  export interface Options {
    signer?: Signer;
    timestamp?: number;
  }
}
