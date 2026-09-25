(() => {
  const aliases = { "chatgpt.com": "chatgpt", chatgpt: "chatgpt", google: "google", bing: "bing", yahoo_jp: "yahoo_jp", "yahoo.co.jp": "yahoo_jp", "search.yahoo.co.jp": "yahoo_jp", perplexity: "perplexity", "perplexity.ai": "perplexity" };
  const query = new URLSearchParams(location.search);
  const sourceKey = [query.get("utm_source"), query.get("cm_ref")].find(key => Object.hasOwn(aliases, key));
  let source = aliases[sourceKey];
  if (!source && document.referrer) {
    const host = new URL(document.referrer).hostname;
    if (host === "chatgpt.com" || host.endsWith(".chatgpt.com")) source = "chatgpt";
    else if (/^(www\.)?google\.(com|co\.jp|co\.uk|de|fr)$/.test(host)) source = "google";
    else if (host === "www.bing.com" || host === "bing.com") source = "bing";
    else if (host === "yahoo.co.jp" || host.endsWith(".yahoo.co.jp")) source = "yahoo_jp";
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

  setupCenteringCalculator();
  setupGradingValueCalculator();
  setupLanguageMenus();

  // Close the language <details> menu on outside click or Escape (it opens natively).
  function setupLanguageMenus() {
    const menus = document.querySelectorAll("details.langs");
    if (!menus.length) return;
    document.addEventListener("click", event => {
      for (const menu of menus) if (menu.open && !menu.contains(event.target)) menu.open = false;
    });
    document.addEventListener("keydown", event => {
      if (event.key !== "Escape") return;
      for (const menu of menus) if (menu.open) { menu.open = false; menu.querySelector("summary").focus(); }
    });
  }

  function setupCenteringCalculator() {
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
  }

  // "Worth grading?" guide calculator. Same math as the app's GradingValueCalculator:
  // the selling fee is paid whether the card sells raw or graded, so only the price
  // difference is reduced by it; the grading fee is paid either way. A grade that the
  // measured centering cannot reach is left out instead of being weighed by a guessed
  // probability (corners and surface are never measured).
  function setupGradingValueCalculator() {
    const form = document.querySelector("#value-form");
    if (!form) return;
    const get = id => document.getElementById(id);
    const inputs = ["raw-price", "second-price", "top-price", "grading-fee", "selling-fee"].map(get);
    const out = { second: get("gain-second"), top: get("gain-top"), breakEven: get("break-even"), verdict: get("value-verdict"), detail: get("value-detail") };
    const texts = out.verdict.dataset;
    const format = new Intl.NumberFormat(document.documentElement.lang || undefined, { maximumFractionDigits: 2 });
    const parse = field => {
      const raw = field.value.trim().replace(/[\s,$¥￥€£円元%]/g, "");
      return /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ? Number(raw) : NaN;
    };
    const signed = value => (value >= 0 ? "+" : "−") + format.format(Math.abs(Math.round(value * 100) / 100));
    function calculate() {
      const [raw, second, top, fee, sellPercent] = inputs.map(parse);
      const valid = [raw, second, top, fee].every(Number.isFinite) && Number.isFinite(sellPercent) && sellPercent < 100;
      inputs.forEach(field => field.setAttribute("aria-invalid", String(!Number.isFinite(parse(field)))));
      get("value-error").hidden = valid;
      if (!valid) {
        out.second.textContent = out.top.textContent = out.breakEven.textContent = "—";
        out.verdict.textContent = texts.needsPrices;
        out.detail.textContent = "";
        return;
      }
      const keep = 1 - sellPercent / 100;
      const gain = price => (price - raw) * keep - fee;
      const ceiling = Number(get("centering-ceiling").value) || Infinity;
      const secondGain = gain(second), topGain = gain(top);
      const secondReachable = ceiling >= 9, topReachable = ceiling >= 10;
      out.second.textContent = secondReachable ? signed(secondGain) : texts.unreachable;
      out.top.textContent = topReachable ? signed(topGain) : texts.unreachable;
      out.breakEven.textContent = format.format(Math.ceil((raw + fee / keep) * 100) / 100);
      let verdict;
      if (secondReachable && secondGain >= 0) verdict = "worthIt";
      else if (topReachable && topGain > 0) verdict = "onlyIfTopGrade";
      else if ((topGain > 0 && !topReachable) || (secondGain >= 0 && !secondReachable)) verdict = "centeringBlocks";
      else verdict = "notWorth";
      out.verdict.textContent = texts[verdict];
      out.detail.textContent = texts[verdict + "Detail"] || "";
    }
    form.addEventListener("submit", event => event.preventDefault());
    form.addEventListener("input", calculate);
    form.addEventListener("change", calculate);
    form.addEventListener("reset", () => setTimeout(calculate, 0));
    calculate();
  }
})();
