export function addManualTest(title: string, f: () => Promise<string|string[]>) {
  const handler = () => {
    document.querySelectorAll("button").forEach((btn) => btn.disabled = true);
    f().then(
      (result) => {
        if (Array.isArray(result)) {
          result = result.join("\n");
        }
        document.body.innerText = result;
      },
      (err) => document.body.innerText = err,
    );
  };

  window.addEventListener("load", () => {
    const btn = document.createElement("button");
    btn.innerText = title;
    btn.addEventListener("click", handler);
    document.body.appendChild(btn);
    document.body.appendChild(document.createElement("br"));
  });
}
