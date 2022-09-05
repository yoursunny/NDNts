import { Endpoint } from "@ndn/endpoint";
import { type Data, type Name, Component } from "@ndn/packet";
import { Decoder } from "@ndn/tlv";
import { asDataView, toHex } from "@ndn/util";
import itKeepAlive from "it-keepalive";

import { PrpsPublisher, PrpsSubscriber } from "../prps/mod";
import { CheckVerb, CommandParameter, CommandResponse, DeleteVerb, InsertVerb } from "./packet";

/** Client to interact with ndn-python-repo. */
export class PyRepoClient {
  constructor(opts: PyRepoClient.Options) {
    this.endpoint = opts.endpoint ?? new Endpoint();
    this.repoPrefix = opts.repoPrefix;
    this.progressTimeout = opts.progressTimeout ?? 10000;
    this.publisher = new PrpsPublisher(opts);
    this.subscriber = new PrpsSubscriber({
      subAnnouncement: false,
      ...opts,
    });
    this.endpoint.fw.nodeNames.push(this.publisher.pubPrefix);
  }

  public readonly endpoint: Endpoint;
  public readonly repoPrefix: Name;
  private readonly progressTimeout: number;
  private readonly publisher: PrpsPublisher;
  private readonly subscriber: PrpsSubscriber;
  private readonly ongoing = new Map<string, PrpsSubscriber.Subscription>();

  public close(): void {
    const nodeNameIndex = this.endpoint.fw.nodeNames.findIndex((nodeName) => nodeName.equals(this.publisher.pubPrefix));
    if (nodeNameIndex >= 0) {
      this.endpoint.fw.nodeNames.splice(nodeNameIndex, 1);
    }

    this.publisher.close();
    for (const sub of this.ongoing.values()) {
      sub.close();
    }
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

  private async execute(verb: Component, parameter: CommandParameter): Promise<void> {
    const id = new Uint8Array(4);
    const idDataView = asDataView(id);
    let key: string;
    do {
      idDataView.setUint32(0, Math.random() * 0xFFFFFFFF);
      key = toHex(id);
    } while (this.ongoing.has(key));
    parameter.processId = id;
    parameter.checkPrefix = this.publisher.pubPrefix;
    parameter.fwHint = this.publisher.pubPrefix;

    const checkTopic = parameter.checkPrefix.append(CheckVerb, new Component(undefined, id));
    const sub = this.subscriber.subscribe(checkTopic);
    this.ongoing.set(key, sub);
    try {
      const commandTopic = this.repoPrefix.append(verb);
      await this.publisher.publish(commandTopic, parameter);

      const subAlive = itKeepAlive<Data | false>(
        () => false,
        { timeout: this.progressTimeout },
      )(sub);

      for await (const data of subAlive) {
        if (data === false) {
          throw new Error("command timeout");
        }
        const response = new Decoder(data.content).decode(CommandResponse);
        if (response.statusCode === 200) {
          break;
        }
      }
    } finally {
      sub.close();
      this.ongoing.delete(key);
    }
  }
}

export namespace PyRepoClient {
  export interface Options extends PrpsPublisher.Options, PrpsSubscriber.Options {
    /**
     * Name prefix of the repo instance.
     * This corresponds to ndn-python-repo.conf repo_config.repo_name key.
     */
    repoPrefix: Name;

    /**
     * Progress update timeout in milliseconds.
     * If no progress update is received for this period of time, the command is deemed failed.
     * Default is 10 seconds.
     */
    progressTimeout?: number;
  }
}
