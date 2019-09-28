/** Serialized value that may contain Uint8Array. */
export type SerializedInBrowser = string;

const UINT8ARRAY_TAG = "7030c743-40f7-4c63-96db-2c12c5dfca75";

export function serializeInBrowser(value: unknown): SerializedInBrowser {
  return JSON.stringify(value, (key, value) => {
    if (value instanceof Uint8Array) {
      return [UINT8ARRAY_TAG, ...Array.from(value)];
    }
    return value;
  });
}

export function deserializeInBrowser(text: SerializedInBrowser): unknown {
  return JSON.parse(text, (key, value) => {
    if (Array.isArray(value) && value[0] === UINT8ARRAY_TAG) {
      return new Uint8Array(value.slice(1));
    }
    return value;
  });
}
