// Adaptador da versão desktop: oferece ao app as mesmas funções que ele usa no Claude
// (window.claude.use: db, user, assets, downloads, sample), gravando tudo no computador.
(() => {
  const CFG = window.__PSE || {};
  const TOKEN = CFG.token || "";

  async function api(caminho, opcoes = {}) {
    const headers = { "X-Token": TOKEN, ...(opcoes.headers || {}) };
    let body = opcoes.body;
    if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && typeof body !== "string") {
      body = JSON.stringify(body);
      headers["Content-Type"] = "application/json";
    }
    const r = await fetch(caminho, { method: opcoes.method || "GET", headers, body });
    let dados = null;
    try { dados = await r.json(); } catch (e) { /* sem corpo */ }
    if (!r.ok) {
      const erro = new Error((dados && dados.error) || "Erro " + r.status);
      erro.code = (dados && dados.code) || "erro";
      throw erro;
    }
    return dados;
  }

  // ---------- banco (mesma interface do db do Claude) ----------
  const ouvintes = new Set();
  const novoId = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), b => (b % 36).toString(36)).join("");
  const docSnap = (id, data) => ({ id, exists: data != null, data: () => data });

  async function disparar(o) {
    try {
      if (o.tipo === "col") {
        const docs = await api("/api/col/" + encodeURIComponent(o.col));
        o.cb({ docs: docs.map(d => docSnap(d.id, d.data)), size: docs.length, empty: !docs.length });
      } else {
        const r = await api(`/api/doc/${encodeURIComponent(o.col)}/${encodeURIComponent(o.id)}`);
        o.cb(docSnap(o.id, r.exists ? r.data : null));
      }
    } catch (e) { o.err && o.err(e); }
  }
  let agendado = null;
  function avisarMudanca() {
    clearTimeout(agendado);
    agendado = setTimeout(() => ouvintes.forEach(disparar), 30);
  }
  function inscrever(o) {
    ouvintes.add(o);
    disparar(o);
    return () => ouvintes.delete(o);
  }

  function docRef(col, id) {
    id = id || novoId();
    const url = `/api/doc/${encodeURIComponent(col)}/${encodeURIComponent(id)}`;
    return {
      id, path: col + "/" + id,
      get: async () => { const r = await api(url); return docSnap(id, r.exists ? r.data : null); },
      set: async d => { await api(url, { method: "PUT", body: d }); avisarMudanca(); },
      update: async d => { await api(url, { method: "PATCH", body: d }); avisarMudanca(); },
      delete: async () => { await api(url, { method: "DELETE" }); avisarMudanca(); },
      onSnapshot: (cb, err) => inscrever({ tipo: "doc", col, id, cb, err }),
    };
  }
  const db = {
    collection: col => ({
      doc: id => docRef(col, id),
      onSnapshot: (cb, err) => inscrever({ tipo: "col", col, cb, err }),
      get: async () => {
        const docs = await api("/api/col/" + encodeURIComponent(col));
        return { docs: docs.map(d => docSnap(d.id, d.data)) };
      },
    }),
    doc: caminho => { const [c, i] = caminho.split("/"); return docRef(c, i); },
  };

  // ---------- demais funções ----------
  let INFO = { nome: "Equipe Exato", ia: false };
  const pronto = api("/api/info").then(i => (INFO = i)).catch(() => INFO);

  const user = {
    me: async () => { await pronto; return { id: "local", name: INFO.nome }; },
    can: async () => true,
    profiles: async ids => { await pronto; return Object.fromEntries(ids.map(i => [i, { name: i === "local" ? INFO.nome : "" }])); },
  };
  const assets = {
    upload: async file => {
      const r = await api("/api/assets", { method: "POST", body: await file.arrayBuffer(), headers: { "Content-Type": "application/pdf" } });
      return { id: r.id, sizeBytes: r.sizeBytes };
    },
    delete: id => api("/api/assets/" + encodeURIComponent(id), { method: "DELETE" }),
  };
  const downloads = {
    save: async ({ filename, data }) => {
      const r = await api("/api/salvar", { method: "POST", body: { filename, data } });
      setTimeout(() => window.toast && toast("Salvo em " + r.path), 600);
      return r;
    },
  };
  const sample = {
    json: async prompt => {
      await pronto;
      if (!INFO.ia) { const e = new Error("sem chave"); e.code = "sem_chave"; throw e; }
      return api("/api/ia", { method: "POST", body: { prompt } });
    },
  };

  window.claude = {
    use: async nome => ({ db, user, assets, downloads, sample })[nome] || null,
  };

  // ---------- links: PDFs e sites abrem fora da janela do app ----------
  document.addEventListener("click", e => {
    const a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    const href = a.getAttribute("href");
    if (href.startsWith("/_blob/") || (/^https?:\/\//.test(href) && a.target === "_blank")) {
      e.preventDefault();
      api("/api/abrir", { method: "POST", body: { url: href } })
        .catch(err => window.toast && toast(err.code === "not_found" ? "Arquivo não encontrado." : "Não foi possível abrir."));
    }
  }, true);

  // ---------- sinal de vida: o programa encerra quando a janela é fechada ----------
  const ping = () => api("/api/ping", { method: "POST" }).catch(() => {});
  ping(); setInterval(ping, 5000);
  window.addEventListener("pagehide", () => navigator.sendBeacon("/api/fechar?t=" + encodeURIComponent(TOKEN)));

  // ---------- tela "Dados e configurações" ----------
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  async function abrirConfig(primeiraVez) {
    const i = await api("/api/info").catch(() => INFO);
    INFO = i;
    const c = i.contagem || {};
    openDrawer(`<button class="close" data-close>Fechar</button>
      <div><h1>${primeiraVez ? "Bem-vindo ao Painel Sindical" : "Dados e configurações"}</h1>
      <p class="sub">${primeiraVez ? "O programa está sem dados. Importe o arquivo com os dados do app (clientes, convenções, prazos, alertas e PDFs)." : "Os dados ficam só neste computador. Faça backup com frequência."}</p></div>
      <div class="panel help"><div class="panel-h"><h2>Dados</h2></div>
        <p class="meta" style="margin:0 0 10px">${c.clientes || 0} clientes · ${c.ccts || 0} convenções · ${c.prazos || 0} prazos · ${c.alertas || 0} alertas · ${c.pedidos || 0} pedidos</p>
        <div class="actions">
          <label class="btn up">📥 Importar dados (.zip)<input type="file" id="pse-imp" accept=".zip,application/zip" hidden></label>
          <button class="btn ghost" id="pse-bkp">💾 Fazer backup</button>
          <button class="btn ghost" id="pse-pasta">📂 Abrir pasta de dados</button>
        </div>
        <p class="meta" style="margin:10px 0 0">Importar substitui os dados atuais (uma cópia de segurança é guardada antes). Pasta: ${esc(i.pasta)}</p>
        <p class="count" id="pse-st"></p></div>
      <form class="form panel" id="pse-cfg"><div class="panel-h full"><h2>Usuário e IA</h2></div>
        <label class="full">Seu nome (aparece em "Alterado por")<input id="pse-nome" value="${esc(i.nome)}"></label>
        <label class="full">Chave da API do Claude — para a sugestão de enquadramento do E-exato
          <input id="pse-key" type="password" autocomplete="off" placeholder="${i.ia ? "Chave configurada (digite para trocar)" : "sk-ant-..."}"></label>
        <p class="meta full" style="margin:0">${i.ia ? "✅ IA ativa." : "IA desativada: sem a chave, o restante do programa funciona normalmente."} A chave é criada em console.anthropic.com e o uso é cobrado pela Anthropic.</p>
        <div class="actions full"><button class="btn" type="submit">Salvar</button>${i.ia ? '<button class="btn danger" type="button" id="pse-rm">Remover chave</button>' : ""}</div>
      </form>
      <div class="panel help"><div class="panel-h"><h2>Mascote E-exato</h2></div>
        <p class="meta" style="margin:0 0 10px">${i.mascote ? "Usando a sua imagem do lobo." : "Usando o lobo desenhado do app."} Envie uma imagem (PNG com fundo transparente fica melhor).</p>
        <div class="actions">
          <label class="btn up">🐺 Escolher imagem do mascote<input type="file" id="pse-masc" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
          ${i.mascote ? '<button class="btn ghost" id="pse-masc-rm">Voltar ao lobo desenhado</button>' : ""}
        </div><p class="count" id="pse-masc-st"></p></div>
      <p class="meta">${esc(i.app)} ${esc(i.versao)} · versão para computador</p>`, () => {
      document.getElementById("pse-masc").onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return;
        try {
          await api("/api/mascote", { method: "POST", body: await f.arrayBuffer(), headers: { "Content-Type": f.type || "image/png" } });
          aplicarMascote(true); toast("Mascote atualizado."); closeDrawer();
        } catch (e) { document.getElementById("pse-masc-st").textContent = e.message; }
      };
      const mrm = document.getElementById("pse-masc-rm");
      if (mrm) mrm.onclick = async () => { await api("/api/mascote", { method: "DELETE" }); location.reload(); };
      const st = document.getElementById("pse-st");
      document.getElementById("pse-imp").onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return;
        st.textContent = "Importando " + f.name + "…";
        try {
          const r = await api("/api/importar", { method: "POST", body: await f.arrayBuffer(), headers: { "Content-Type": "application/zip" } });
          st.textContent = `Importado: ${r.contagem.clientes || 0} clientes, ${r.contagem.ccts || 0} convenções. Recarregando…`;
          setTimeout(() => location.reload(), 900);
        } catch (e) { st.textContent = e.message; }
      };
      document.getElementById("pse-bkp").onclick = async () => {
        try { const r = await api("/api/backup", { method: "POST" }); st.textContent = "Backup salvo em " + r.path; }
        catch (e) { st.textContent = e.message; }
      };
      document.getElementById("pse-pasta").onclick = () => api("/api/abrir_pasta", { method: "POST" });
      const rm = document.getElementById("pse-rm");
      if (rm) rm.onclick = async () => { await api("/api/config", { method: "POST", body: { remover_chave: true } }); INFO.ia = false; toast("Chave removida."); closeDrawer(); };
      document.getElementById("pse-cfg").onsubmit = async ev => {
        ev.preventDefault();
        const r = await api("/api/config", { method: "POST", body: { nome: document.getElementById("pse-nome").value, api_key: document.getElementById("pse-key").value } });
        INFO.ia = r.ia; INFO.nome = r.nome;
        document.getElementById("mename").textContent = r.nome;
        toast("Configurações salvas."); closeDrawer();
      };
    });
  }
  // ---------- mascote: troca o lobo desenhado pela imagem escolhida ----------
  function aplicarMascote(ativo) {
    if (!ativo) return;
    const src = "/api/mascote?t=" + encodeURIComponent(TOKEN) + "&v=" + Date.now();
    const fab = document.getElementById("fab"), wrap = document.getElementById("mwrap");
    if (fab) {
      const svg = fab.querySelector("svg.wolf");
      if (svg) svg.style.display = "none";
      let img = fab.querySelector(".mascote-img");
      if (!img) { img = document.createElement("img"); img.className = "mascote-img"; img.alt = ""; fab.appendChild(img); }
      img.src = src;
      fab.classList.add("com-imagem"); wrap && wrap.classList.add("com-imagem");
    }
    document.querySelectorAll(".aihead .wolfic").forEach(ic => {
      const svg = ic.querySelector("svg"); if (svg) svg.style.display = "none";
      let img = ic.querySelector(".mascote-img");
      if (!img) { img = document.createElement("img"); img.className = "mascote-img"; img.alt = ""; ic.appendChild(img); }
      img.src = src;
    });
  }

  // ---------- cartões que inclinam com o mouse (efeito 3D) ----------
  const reduzMovimento = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.addEventListener("pointermove", e => {
    if (reduzMovimento) return;
    const k = e.target.closest && e.target.closest(".kpi");
    document.querySelectorAll(".kpi[data-tilt]").forEach(el => { if (el !== k) { el.style.transform = ""; el.removeAttribute("data-tilt"); } });
    if (!k) return;
    const r = k.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    k.setAttribute("data-tilt", "");
    k.style.transform = `rotateX(${((0.5 - y) * 14).toFixed(2)}deg) rotateY(${((x - 0.5) * 18).toFixed(2)}deg) translateZ(6px)`;
    k.style.setProperty("--mx", (x * 100).toFixed(1) + "%");
    k.style.setProperty("--my", (y * 100).toFixed(1) + "%");
  }, { passive: true });

  window.PSE = { abrirConfig, aplicarMascote };

  window.addEventListener("DOMContentLoaded", async () => {
    const b = document.getElementById("helpbtn");
    if (b) {
      b.lastChild.textContent = "Dados e configurações";
      b.onclick = () => abrirConfig(false);
    }
    const i = await pronto;
    if (i && i.mascote) aplicarMascote(true);
    if (i && i.vazio) abrirConfig(true);
  });
})();
