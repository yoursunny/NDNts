/**
 * Create a buffer of non-crypto-secure random data.
 * @param size - Buffer size.
 */
export function makeObjectBody(size = 1024 * 1024): Buffer { // eslint-disable-line @typescript-eslint/no-restricted-types
  const objectBody = Buffer.alloc(size);
  for (let i = 0; i < objectBody.length; ++i) {
    objectBody[i] = Math.random() * 0x100;
  }
  return objectBody;
}
