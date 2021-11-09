import { crypto } from "../crypto_node";
import { IvGen } from "./gen";

/** IV generator using all random bits. */
export class RandomIvGen extends IvGen {
  protected generate() {
    return crypto.getRandomValues(new Uint8Array(this.ivLength));
  }
}
