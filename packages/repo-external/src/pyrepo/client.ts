import { Endpoint, Producer, ProducerHandler, RetxPolicy } from "@ndn/endpoint";
import { SequenceNum } from "@ndn/naming-convention2";
import { Data, digestSigning, Interest, Name, Signer } from "@ndn/packet";
import { Encoder } from "@ndn/tlv";

import { CommandParameter, DeleteVerb, InsertVerb, MsgSuffix, NotifyParams, Verb } from "./packet";

/** Client to interact with ndn-python-repo. */
export class PyRepoClient {
  constructor({
    endpoint = new Endpoint(),
    repoPrefix,
    localPrefix = new Name("/localhost").append(SequenceNum, 0xFFFFFFFF * Math.random()),
    commandSigner = digestSigning,
    notifyInterestLifetime = Interest.DefaultLifetime,
    notifyRetx = 2,
  }: PyRepoClient.Options) {
    this.endpoint = endpoint;
    this.repoPrefix = repoPrefix;
    this.localPrefix = localPrefix;
    this.commandSigner = commandSigner;
    this.notifyInterestLifetime = notifyInterestLifetime;
    this.notifyRetx = notifyRetx;
    this.messagePrefix = localPrefix.append(MsgSuffix, ...repoPrefix.comps);
    this.messageProducer = this.endpoint.produce(this.messagePrefix, this.handleMessageInterest, {
      describe: `pyrepo-command(${this.repoPrefix})`,
      announcement: localPrefix,
    });
  }

  public readonly endpoint: Endpoint;
  public readonly repoPrefix: Name;
  public readonly localPrefix: Name;
  private readonly commandSigner: Signer;
  private readonly notifyInterestLifetime: number;
  private readonly notifyRetx: RetxPolicy;
  private readonly messagePrefix: Name;
  private readonly messageProducer: Producer;
  private readonly ongoing = new Map<number, Progress>();

  public close(): void {
    this.messageProducer.close();
  }

  public async insert(name: Name): Promise<void> {
    return this.execute(InsertVerb, new CommandParameter(name));
  }

  public async insertRange(name: Name, start: number, end = Infinity): Promise<void> {
    return this.execute(InsertVerb, new CommandParameter(
      name,
      start,
      Number.isFinite(end) ? end : undefined,
    ));
  }

  public async delete(name: Name): Promise<void> {
    return this.execute(DeleteVerb, new CommandParameter(name));
  }

  public async deleteRange(name: Name, start: number, end = Infinity): Promise<void> {
    return this.execute(DeleteVerb, new CommandParameter(
      name,
      start,
      Number.isFinite(end) ? end : undefined,
    ));
  }

  private async execute(verb: Verb, parameter: CommandParameter): Promise<void> {
    let id: number;
    do {
      id = Math.floor(Math.random() * 1000000000000);
    } while (this.ongoing.has(id));
    parameter.processId = id;
    parameter.forwardingHint = this.localPrefix;

    const progress: Progress = {
      id,
      verb,
      parameter,
    };
    this.ongoing.set(id, progress);

    try {
      const notify = new Interest();
      notify.name = this.repoPrefix.append(...verb.notifySuffix);
      notify.lifetime = this.notifyInterestLifetime;
      notify.appParameters = Encoder.encode(new NotifyParams(this.localPrefix, id));
      await notify.updateParamsDigest();
      await this.endpoint.consume(notify, {
        describe: `pyrepo-notify(${this.repoPrefix} ${id})`,
        retx: this.notifyRetx,
      });
    } finally {
      this.ongoing.delete(id);
    }
  }

  private handleMessageInterest: ProducerHandler = async (interest) => {
    if (interest.name.length !== this.messagePrefix.length + 2) {
      return false;
    }
    const verbComp = interest.name.get(-2)!;
    const id = Number.parseInt(interest.name.get(-1)!.text, 10);
    const progress = this.ongoing.get(id);
    if (!progress || !progress.verb.notifySuffix[0].equals(verbComp)) {
      return false;
    }

    const data = new Data(interest.name);
    data.content = Encoder.encode(progress.parameter);
    await this.commandSigner.sign(data);
    return data;
  };
}

interface Progress {
  id: number;
  verb: Verb;
  parameter: CommandParameter;
}

export namespace PyRepoClient {
  export interface Options {
    /** Endpoint for communication. */
    endpoint?: Endpoint;

    /**
     * Name prefix of the repo instance.
     * This corresponds to ndn-python-repo.conf repo_config.repo_name key.
     */
    repoPrefix: Name;

    /**
     * Routable name prefix of the local application.
     * This will be announced automatically.
     * If unspecified, a random local name is used, which only works when the repo is on local machine.
     */
    localPrefix?: Name;

    /** Key to sign commands. */
    commandSigner?: Signer;

    /** InterestLifetime of notify Interests. */
    notifyInterestLifetime?: number;

    /**
     * Retransmission policy of notify Interests.
     * Default is 2 retransmissions.
     */
    notifyRetx?: RetxPolicy;
  }
}
