export function fsOpen(path: string): Promise<never> {
  void path;
  return Promise.reject(new Error("fsOpen unimplemented in browser"));
}
