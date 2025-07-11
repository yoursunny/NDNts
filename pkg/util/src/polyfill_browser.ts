import "@shigen/polyfill-symbol-dispose";

if (!crypto.subtle && !globalThis.isSecureContext) {
  Object.defineProperty(crypto, "subtle", {
    configurable: true,
    get() {
      console.error("NDNts depends on Web Crypto but it is unavailable because this webpage is not delivered securely, " +
        "see https://mdn.io/SecureContext");
      return undefined;
    },
  });
}
