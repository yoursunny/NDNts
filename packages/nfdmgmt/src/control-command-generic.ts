import { Component, digestSigning, Interest, Name, SignedInterestPolicy, type Signer, TT } from "@ndn/packet";
import { Decoder, type Encodable, Encoder } from "@ndn/tlv";

import { ControlResponse } from "./control-response";
import { CommonOptions } from "./options";

const defaultSIP = new SignedInterestPolicy(SignedInterestPolicy.Nonce(), SignedInterestPolicy.Time());

export interface ControlCommandOptions extends CommonOptions {
  /**
   * Command Interest signer.
   * Default is digest signing.
   */
  signer?: Signer;

  /**
   * Signed Interest policy for the command Interest.
   * Default is including SigNonce and SigTime in the signed Interest.
   */
  signedInterestPolicy?: SignedInterestPolicy;
}

/**
 * Invoke generic ControlCommand and wait for response.
 * @param command command name components.
 * @param params command parameters.
 * @param opts target prefix and other options.
 * @returns command response.
 */
export async function invokeGeneric(command: string, params: Encodable, opts: ControlCommandOptions = {}): Promise<ControlResponse> {
  const { endpoint, prefix, verifier } = CommonOptions.applyDefaults(opts);
  const {
    signer = digestSigning,
    signedInterestPolicy = defaultSIP,
  } = opts;

  const interest = new Interest(new Name([
    ...prefix.comps,
    ...command.split("/"),
    new Component(TT.GenericNameComponent, Encoder.encode(params)),
  ]));
  await signedInterestPolicy.makeSigner(signer).sign(interest);

  const data = await endpoint.consume(interest, {
    describe: `ControlCommand(${command})`,
    verifier,
  });
  return Decoder.decode(data.content, ControlResponse);
}
