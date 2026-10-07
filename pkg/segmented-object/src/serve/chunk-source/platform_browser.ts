export function fsOpen(_path: string): Promise<never> {
  return Promise.reject(new Error("fsOpen unimplemented in browser"));
}
