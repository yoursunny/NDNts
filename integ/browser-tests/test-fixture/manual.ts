export function addManualTest(title: string, f: () => Promise<string | string[]>) {
  const handler = () => {
    for (const btn of document.querySelectorAll("button")) {
      btn.disabled = true;
    }
    void (async () => {
      let result: string | string[];
      try {
        result = await f();
      } catch (err: unknown) {
        document.body.textContent = `${err}`;
        return;
      }
      if (Array.isArray(result)) {
        result = result.join("\n");
      }
      document.body.innerHTML = "<pre></pre>";
      document.body.querySelector("pre")!.textContent = result;
    })();
  };

  const render = () => {
    const btn = document.createElement("button");
    btn.textContent = title;
    btn.addEventListener("click", handler);
    document.body.append(btn);
    document.body.append(document.createElement("br"));
  };

  if (document.readyState === "complete") {
    render();
  } else {
    window.addEventListener("load", render);
  }
}
