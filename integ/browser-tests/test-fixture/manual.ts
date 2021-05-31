export function addManualTest(title: string, f: () => Promise<string | string[]>) {
  const handler = () => {
    for (const btn of document.querySelectorAll("button")) {
      btn.disabled = true;
    }
    f().then(
      (result) => {
        if (Array.isArray(result)) {
          result = result.join("\n");
        }
        document.body.innerHTML = "<pre></pre>";
        document.body.querySelector("pre")!.textContent = result;
      },
      (err) => document.body.textContent = err,
    );
  };

  window.addEventListener("load", () => {
    const btn = document.createElement("button");
    btn.textContent = title;
    btn.addEventListener("click", handler);
    document.body.append(btn);
    document.body.append(document.createElement("br"));
  });
}
