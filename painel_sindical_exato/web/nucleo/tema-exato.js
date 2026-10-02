/*
 * EXATO FLOW · tema tecnológico e mascote E-exato.
 * Uso: <script src="(…)nucleo/tema-exato.js" data-mod="inicio|clientes|guias|sindical"></script>
 * Só acrescenta visual: não altera dados nem funções dos módulos.
 */
(function(){
  "use strict";
  const eu = document.currentScript;
  const MOD = (eu && eu.dataset.mod) || "inicio";
  const base = eu ? eu.src : location.href;
  const IMG = { corpo: new URL("mascote.png", base).href, rosto: new URL("mascote-rosto.png", base).href };
  document.documentElement.dataset.mod = MOD;
  const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  function fundo(){
    if (document.querySelector(".fx-bg")) return;
    const d = document.createElement("div");
    d.className = "fx-bg"; d.setAttribute("aria-hidden", "true");
    d.innerHTML = '<i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><div class="piso"></div>';
    document.body.prepend(d);
  }

  // cartões que inclinam com o mouse
  function inclinar(seletor){
    if (reduz) return;
    document.addEventListener("pointermove", e => {
      const alvo = e.target.closest && e.target.closest(seletor);
      document.querySelectorAll(".fx-tilt[data-tilt]").forEach(el => { if (el !== alvo){ el.style.transform = ""; el.removeAttribute("data-tilt"); } });
      if (!alvo) return;
      alvo.classList.add("fx-tilt");
      const r = alvo.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      alvo.setAttribute("data-tilt", "");
      alvo.style.transform = `perspective(900px) rotateX(${((.5 - y) * 10).toFixed(2)}deg) rotateY(${((x - .5) * 12).toFixed(2)}deg) translateZ(4px)`;
      alvo.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
      alvo.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    }, { passive: true });
  }

  // nome de quem está usando (perfil do claude.ai)
  async function primeiroNome(){
    try{
      let rt = window.claude;
      try{ if (window.parent !== window && window.parent.claude) rt = window.parent.claude; }catch(e){}
      if (!rt || !rt.use) return "";
      const u = await rt.use("user"); if (!u) return "";
      const me = await u.me();
      return String((me && me.name) || "").trim().split(/\s+/)[0] || "";
    }catch(e){ return ""; }
  }

  const QUALIDADES = [
    ["Inteligente", "Entende números e legislação.", '<path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0 0 6v1a3 3 0 0 0 5 2.2V4.8A3 3 0 0 0 9 4z"/><path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 0 6v1a3 3 0 0 1-5 2.2V4.8A3 3 0 0 1 15 4z"/>'],
    ["Preciso", "Na Exato, não trabalhamos com achismos.", '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>'],
    ["Observador", "Encontra erros e oportunidades.", '<circle cx="11" cy="11" r="6"/><path d="m20 20-4.2-4.2"/>'],
    ["Estratégico", "Pensa antes de agir.", '<path d="M8 21h8M9 21v-3h6v3M10 18c-2-3 0-5 0-8a2 2 0 1 1 4 0c0 3 2 5 0 8"/>'],
    ["Confiável", "Está sempre ao lado do cliente.", '<path d="M3 12l4-4 5 3 5-3 4 4-4 4-5-3-5 3z"/>'],
    ["Carismático", "Fala a sua língua, com simplicidade e respeito.", '<circle cx="12" cy="12" r="8"/><path d="M8.5 14a4 4 0 0 0 7 0"/><path d="M9 9.5h.01M15 9.5h.01"/>'],
  ];

  // ---------- Início: lobo no cabeçalho e no trilho, com anel e dicas ----------
  function inicio(){
    inclinar(".num, .mod");
    const brand = document.querySelector(".brand");
    let fala = null;
    if (brand && !brand.querySelector(".fx-heroi")){
      const img = document.createElement("img");
      img.className = "fx-heroi"; img.src = IMG.corpo; img.alt = "E-exato, o lobo assistente da Exato";
      fala = document.createElement("div"); fala.className = "fx-heroi-fala";
      fala.innerHTML = "Olá! Eu sou o <b>E-exato</b>. Vamos deixar o DP em dia?";
      brand.append(img, fala);
    }

    const rail = document.querySelector(".rail");
    if (!rail || rail.querySelector(".fx-rail-lobo")) return;
    const box = document.createElement("div");
    box.className = "fx-rail-lobo";
    box.innerHTML = `<div class="mwrap"><div class="fx-ring" aria-hidden="true">${QUALIDADES.map((q, i) =>
      `<div class="q" style="--a:${i * 60}deg" data-t="${q[0]}" data-d="${q[1]}"><span class="qi"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${q[2]}</svg><em>${q[0]}</em></span></div>`).join("")}</div>
      <button class="mbtn" type="button" aria-label="E-exato, assistente da Exato" title="E-exato"><img src="${IMG.corpo}" alt=""></button></div>`;
    rail.insertBefore(box, rail.querySelector(".by"));
    const balao = document.createElement("div");
    balao.className = "fx-fala"; balao.hidden = true; balao.setAttribute("role", "status");
    document.body.append(balao);

    let tHide = null, tOpen = null, tClose = null, iDica = 0;
    const dizer = (html, ms = 7000) => { balao.innerHTML = html; balao.hidden = false; clearTimeout(tHide); if (ms) tHide = setTimeout(() => balao.hidden = true, ms); };
    balao.addEventListener("click", e => { if (e.target.closest("[data-go]")) balao.hidden = true; });

    function dicas(){
      const F = window.FlowDados, E = F && F.estado;
      const lista = [];
      if (E && E.pronto && E.pronto.clientes){
        const I = F.indices(E.clientes, E.ccts);
        const at = E.clientes.filter(F.ativo);
        const venc = at.filter(c => F.statusCct(I.cctPorRamo[c.cct]) === "VENCIDA").length;
        const graves = E.clientes.filter(c => F.pendencias(c, I).some(p => p.nivel === "alta")).length;
        const naoConf = at.filter(c => c.cct && c.confirmado !== "Sim").length;
        const A = Object.fromEntries((E.auditorias || []).map(a => [a._id, a]));
        const audErro = E.clientes.filter(c => { const a = A[F.digitos(c.cnpj)]; return a && a.ultima && a.ultima.st === "erro"; }).length;
        if (venc) lista.push(`<b>${venc} clientes</b> estão com a CCT vencida. Vale conferir se já saiu a nova.<br><button data-go="sindical">Abrir Painel Sindical →</button>`);
        if (graves) lista.push(`<b>${graves} clientes</b> têm pendência grave no cadastro (CNPJ, código ou CCT).<br><button data-go="clientes">Ver clientes →</button>`);
        if (audErro) lista.push(`A última auditoria achou erro em <b>${audErro} cliente(s)</b>. Melhor corrigir antes de pagar a guia.<br><button data-go="guias">Abrir Auditoria →</button>`);
        if (naoConf) lista.push(`Ainda há <b>${naoConf} enquadramentos</b> sem confirmação. Confirmar evita passivo trabalhista.`);
      }
      lista.push("Dica: passe o mouse em mim para ver o que eu faço de melhor. 🐺".replace(" 🐺", ""));
      return lista;
    }

    const wrap = box.querySelector(".mwrap");
    wrap.addEventListener("mouseenter", () => { clearTimeout(tClose); box.classList.add("open"); tOpen = setTimeout(() => { const d = dicas(); dizer(d[iDica++ % d.length]); }, 500); });
    wrap.addEventListener("mouseleave", () => { clearTimeout(tOpen); tClose = setTimeout(() => box.classList.remove("open"), 450); });
    box.querySelectorAll(".q").forEach(q => q.addEventListener("mouseenter", () => { clearTimeout(tOpen); dizer(`<b>${q.dataset.t}</b><br>${q.dataset.d}`, 3500); }));
    box.querySelector(".mbtn").addEventListener("click", () => { const d = dicas(); dizer(d[iDica++ % d.length], 9000); });
    box.querySelector(".mbtn").addEventListener("focus", () => box.classList.add("open"));
    box.querySelector(".mbtn").addEventListener("blur", () => box.classList.remove("open"));

    // o Painel Sindical tem o próprio E-exato: o do trilho se recolhe lá
    const sincronizar = () => {
      const sind = document.querySelector('.tab[data-go="sindical"][aria-current="page"]');
      box.style.visibility = sind ? "hidden" : "";
      if (sind) balao.hidden = true;
    };
    new MutationObserver(sincronizar).observe(rail, { subtree: true, attributes: true, attributeFilter: ["aria-current"] });
    sincronizar();

    primeiroNome().then(nome => {
      if (fala) fala.innerHTML = `Olá${nome ? ", " + esc(nome) : ""}! Eu sou o <b>E-exato</b>. Vamos deixar o DP em dia?`;
      setTimeout(() => {
        if (document.querySelector('.tab[data-go="sindical"][aria-current="page"]')) return;
        const d = dicas();
        dizer(`Olá${nome ? ", " + esc(nome) : ""}! ` + d[0], 9000);
      }, 1800);
    });
  }

  // ---------- Painel Sindical: lobo novo no lugar do desenho e cubo 3D ----------
  function sindical(){
    const fab = document.getElementById("fab"), wrap = document.getElementById("mwrap");
    if (fab){
      const svg = fab.querySelector("svg.wolf"); if (svg) svg.style.display = "none";
      if (!fab.querySelector(".mascote-img")){ const i = document.createElement("img"); i.className = "mascote-img"; i.alt = ""; i.src = IMG.corpo; fab.append(i); }
      fab.classList.add("com-imagem"); if (wrap) wrap.classList.add("com-imagem");
    }
    document.querySelectorAll(".aihead .wolfic").forEach(ic => {
      const svg = ic.querySelector("svg"); if (svg) svg.style.display = "none";
      if (!ic.querySelector(".mascote-img")){ const i = document.createElement("img"); i.className = "mascote-img"; i.alt = ""; i.src = IMG.rosto; ic.append(i); }
    });
    const topo = document.querySelector("#v-painel > div:first-child");
    if (topo && !topo.classList.contains("hero3d")){
      const novo = document.createElement("div"); novo.className = "hero3d";
      novo.innerHTML = '<div class="cubo-cena" aria-hidden="true"><div class="cubo"><span>E</span><span>X</span><span>E</span><span>X</span><span></span><span></span></div></div>';
      topo.replaceWith(novo); novo.append(topo);
    }
    // cartões de indicadores inclinam com o mouse (mesmo efeito da versão para computador)
    if (!reduz) document.addEventListener("pointermove", e => {
      const k = e.target.closest && e.target.closest(".kpi");
      document.querySelectorAll(".kpi[data-tilt]").forEach(el => { if (el !== k){ el.style.transform = ""; el.removeAttribute("data-tilt"); } });
      if (!k) return;
      const r = k.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      k.setAttribute("data-tilt", "");
      k.style.transform = `rotateX(${((.5 - y) * 14).toFixed(2)}deg) rotateY(${((x - .5) * 18).toFixed(2)}deg) translateZ(6px)`;
      k.style.setProperty("--mx", (x * 100).toFixed(1) + "%"); k.style.setProperty("--my", (y * 100).toFixed(1) + "%");
    }, { passive: true });
  }

  function iniciar(){
    fundo();
    if (MOD === "inicio") inicio();
    else if (MOD === "clientes") inclinar(".st");
    else if (MOD === "sindical") sindical();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
