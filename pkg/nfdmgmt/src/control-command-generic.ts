import { Component, digestSigning, Interest, SignedInterestPolicy, type Signer, TT } from "@ndn/packet";
import { Decoder, type Encodable, Encoder } from "@ndn/tlv";

import { CommonOptions, concatName } from "./common";
import { ControlResponse } from "./control-response";

const defaultSIP = new SignedInterestPolicy(SignedInterestPolicy.Nonce(), SignedInterestPolicy.Time());

export interface ControlCommandOptions extends CommonOptions {
  /**
   * Command Interest signer.
   * @defaultValue
   * Digest signing.
   */
  signer?: Signer;

  /**
   * Signed Interest policy for the command Interest.
   * @defaultValue
   * Signed Interest shall contain SigNonce and SigTime.
   */
  signedInterestPolicy?: SignedInterestPolicy;
}

/**
 * Invoke generic ControlCommand and wait for response.
 * @param command - Command name.
 * @param params - Command parameters.
 * @param opts - Other options.
 * To interact with non-NFD producer, `.opts.prefix` must be set.
 * @returns Command response.
 */
export async function invokeGeneric(command: string, params: Encodable, opts: ControlCommandOptions = {}): Promise<ControlResponse> {
  const { endpoint, prefix, verifier } = CommonOptions.applyDefaults(opts);
  const {
    signer = digestSigning,
    signedInterestPolicy = defaultSIP,
  } = opts;

  const interest = new Interest(concatName(prefix, command, [new Component(TT.GenericNameComponent, Encoder.encode(params))]));
  await signedInterestPolicy.makeSigner(signer).sign(interest);

  const data = await endpoint.consume(interest, {
    describe: `ControlCommand(${command})`,
    verifier,
  });
  return Decoder.decode(data.content, ControlResponse);
}
