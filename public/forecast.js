// Snow-day cards shared by the homepage and booking page.
// Data: /api/forecast (MET Norway, cached by our server for 30 min). Calgary time.
//   etcForecast(container, { pick(date, card) })  -> booking page: the button fills in the form
//   etcForecast(container)                        -> homepage: the button links to book.html?date=...
// Hides itself if the forecast can't load. Never throws.
(function () {
  const TZ = "America/Edmonton";
  const FLAKE = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9 4l3 2 3-2M9 20l3-2 3 2M4.2 10.2l3.4-.6-1.2-3.2M19.8 13.8l-3.4.6 1.2 3.2M4.2 13.8l3.4.6-1.2 3.2M19.8 10.2l-3.4-.6 1.2-3.2"/></svg>';

  // ponytail: 1 mm of melted water ≈ 1 cm of snow (10:1 rule). Real snow ranges ~5:1 to 20:1.
  function level(cm) {
    if (cm >= 10) return { n: 3, name: "Heavy snow" };
    if (cm >= 2) return { n: 2, name: "Moderate snow" };
    return { n: 1, name: "Light snow" };
  }
  const deg = t => `${Math.round(t) < 0 ? "−" : ""}${Math.abs(Math.round(t))}°`;

  window.etcForecast = async function (box, opts = {}) {
    try {
      const res = await fetch("/api/forecast");
      if (!res.ok) return;
      const days = new Map(); // YYYY-MM-DD -> { cm, lo, hi }
      for (const p of await res.json()) {
        const key = new Date(p.t).toLocaleDateString("en-CA", { timeZone: TZ });
        const d = days.get(key) || { cm: 0, lo: Infinity, hi: -Infinity };
        if (p.s.includes("snow")) d.cm += p.p || 0;
        if (typeof p.a === "number") { d.lo = Math.min(d.lo, p.a); d.hi = Math.max(d.hi, p.a); }
        days.set(key, d);
      }
      const today = new Date().toLocaleDateString("en-CA", { timeZone: TZ });
      const snowy = [...days].filter(([k, d]) => k >= today && d.cm >= 0.5).sort((a, b) => a[0] < b[0] ? -1 : 1);

      if (!snowy.length) {
        if (opts.pick) return; // booking page: nothing to show
        box.innerHTML = `<p class="forecast-title">No snow in Calgary's 10-day forecast. Sign up for every snowfall and you're covered when it comes.</p><p class="forecast-credit">Calgary forecast updated every 30 min.</p>`;
        box.hidden = false;
        return;
      }
      box.innerHTML = `<p class="forecast-title">❄️ Snow is coming to Calgary on ${snowy.length === 1 ? "this day" : "these days"}:</p><div class="snow-days"></div><p class="forecast-credit">Calgary forecast updated every 30 min.</p>`;
      box.querySelector(".snow-days").replaceChildren(...snowy.map(([key, d]) => {
        const date = new Date(key + "T12:00");
        const long = date.toLocaleDateString("en-CA", { weekday: "long", month: "long", day: "numeric" });
        const lv = level(d.cm);
        const card = document.createElement("div");
        card.className = `snow-day level-${lv.n}`;
        card.innerHTML = `<span class="flakes" title="${lv.name}">${FLAKE.repeat(lv.n)}</span>
          <span class="dow"></span><span class="md"></span>
          <span class="amt"></span><span class="lvl">${lv.name}</span><span class="temp"></span>
          ${opts.pick ? '<button type="button" class="btn btn-primary">Pick this day</button>' : '<a class="btn btn-primary">Book</a>'}`;
        card.querySelector(".dow").textContent = date.toLocaleDateString("en-CA", { weekday: "short" });
        card.querySelector(".md").textContent = date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
        card.querySelector(".amt").textContent = d.cm < 1 ? "<1 cm" : `~${Math.round(d.cm)} cm`;
        card.querySelector(".temp").textContent = isFinite(d.hi) ? `${deg(d.hi)} / ${deg(d.lo)}` : "";
        if (isFinite(d.hi)) card.querySelector(".temp").title = `High ${deg(d.hi)}, low ${deg(d.lo)}`;
        const btn = card.querySelector(".btn");
        if (opts.pick) btn.addEventListener("click", () => opts.pick(key, card));
        else btn.href = `book.html?date=${key}`;
        btn.setAttribute("aria-label", `${opts.pick ? "Pick" : "Book a shovel for"} ${long}: ${lv.name.toLowerCase()}, ${card.querySelector(".amt").textContent}`);
        return card;
      }));
      box.hidden = false;
    } catch { /* the forecast is a nice-to-have; never break the page */ }
  };
})();
