(() => {
  const aliases = { "chatgpt.com": "chatgpt", chatgpt: "chatgpt", google: "google", bing: "bing", perplexity: "perplexity", "perplexity.ai": "perplexity" };
  const query = new URLSearchParams(location.search);
  const sourceKey = [query.get("utm_source"), query.get("cm_ref")].find(key => Object.hasOwn(aliases, key));
  let source = aliases[sourceKey];
  if (!source && document.referrer) {
    const host = new URL(document.referrer).hostname;
    if (host === "chatgpt.com" || host.endsWith(".chatgpt.com")) source = "chatgpt";
    else if (/^(www\.)?google\.(com|co\.jp|co\.uk|de|fr)$/.test(host)) source = "google";
    else if (host === "www.bing.com" || host === "bing.com") source = "bing";
    else if (host === "www.perplexity.ai" || host === "perplexity.ai") source = "perplexity";
  }
  if (source) {
    for (const link of document.querySelectorAll("a[href]")) {
      const target = new URL(link.href);
      if (link.hasAttribute("data-app-link")) {
        target.searchParams.set("ct", target.searchParams.get("ct").replace("_202609", `_${source}_202609`));
        link.href = target.href;
      } else if (!link.getAttribute("href").startsWith("#") && target.origin === location.origin && target.pathname.startsWith("/centermint/") && target.pathname.endsWith("/")) {
        target.searchParams.set("cm_ref", source);
        link.href = target.href;
      }
    }
  }

  const form = document.querySelector("#centering-form");
  if (!form) return;
  const fields = ["left", "right", "top", "bottom"].map(id => document.getElementById(id));
  const outputs = [document.getElementById("horizontal"), document.getElementById("vertical")];
  const preview = document.getElementById("inner-preview");
  function calculate() {
    const values = fields.map(field => {
      const raw = field.value.trim();
      return /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(raw) ? Number(raw.replace(",", ".")) : NaN;
    });
    const valid = [0, 2].map(i => Number.isFinite(values[i] + values[i + 1]) && values[i] + values[i + 1] > 0);
    fields.forEach((field, i) => field.setAttribute("aria-invalid", String(!valid[Math.floor(i / 2)])));
    document.getElementById("input-error").hidden = valid.every(Boolean);
    const shares = [0, 2].map((i, axis) => {
      if (!valid[axis]) { outputs[axis].textContent = "—"; return null; }
      const share = values[i] / (values[i] + values[i + 1]);
      const percent = Math.round(share * 1000) / 10;
      outputs[axis].textContent = `${percent.toFixed(1)} / ${(100 - percent).toFixed(1)}`;
      return share;
    });
    preview.parentElement.hidden = !valid.every(Boolean);
    if (valid.every(Boolean)) {
      preview.style.left = `${shares[0] * 20}%`;
      preview.style.right = `${(1 - shares[0]) * 20}%`;
      preview.style.top = `${shares[1] * 16}%`;
      preview.style.bottom = `${(1 - shares[1]) * 16}%`;
    }
  }
  form.addEventListener("submit", event => event.preventDefault());
  form.addEventListener("input", calculate);
  form.addEventListener("reset", () => setTimeout(calculate, 0));
  calculate();
})();
