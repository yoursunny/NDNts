import { consume } from "@ndn/endpoint";
import { Component, digestSigning, Interest, type Name, SignedInterestPolicy, type Signer, TT } from "@ndn/packet";
import { Decoder, type Encodable, Encoder } from "@ndn/tlv";

import { type CommonOptions, concatName, localhostPrefix } from "./common";
import { ControlResponse } from "./control-response";

const defaultSIP = new SignedInterestPolicy(SignedInterestPolicy.Nonce(), SignedInterestPolicy.Time());

export interface ControlCommandOptions extends CommonOptions {
  /**
   * Customize command format.
   * @defaultValue ControlCommandOptions.formatCommandParamsComp
   */
  formatCommand?: ControlCommandOptions.FormatCommand;

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
export namespace ControlCommandOptions {
  /** Build command Interest from name and parameters. */
  export type FormatCommand = (prefix: Name, command: string, params: Encodable) => Interest;

  /**
   * Build command Interest with parameters in a GenericNameComponent.
   * @see {@link https://redmine.named-data.net/projects/nfd/wiki/ControlCommand}
   */
  export const formatCommandParamsComp: FormatCommand = (prefix, command, params) => {
    const interest = new Interest();
    interest.name = concatName(prefix, command, [new Component(TT.GenericNameComponent, Encoder.encode(params))]);
    return interest;
  };

  /**
   * Build command Interest with parameters in the ApplicationParameters field.
   * @see {@link https://redmine.named-data.net/projects/nfd/wiki/PrefixAnnouncement}
   */
  export const formatCommandAppParams: FormatCommand = (prefix, command, params) => {
    const interest = new Interest();
    interest.name = concatName(prefix, command, []);
    interest.appParameters = Encoder.encode(params);
    return interest;
  };
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
  const {
    cOpts,
    prefix = localhostPrefix,
    formatCommand = ControlCommandOptions.formatCommandParamsComp,
    signer = digestSigning,
    signedInterestPolicy = defaultSIP,
  } = opts;

  const interest = formatCommand(prefix, command, params);
  await signedInterestPolicy.makeSigner(signer).sign(interest);

  const data = await consume(interest, {
    describe: "nfdmgmt",
    ...cOpts,
  });
  return Decoder.decode(data.content, ControlResponse);
}
