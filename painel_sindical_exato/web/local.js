// EXATO FLOW · adaptador da versão para computador.
// Oferece aos módulos as mesmas funções que eles usam no Claude (window.claude.use: db, user,
// assets, downloads, sample), gravando tudo neste computador. Os módulos abrem em iframes e
// usam o runtime da janela principal (window.parent.claude), então este arquivo só roda na casca.
(() => {
  const CFG = window.__PSE || {};
  const TOKEN = CFG.token || "";

  async function api(caminho, opcoes = {}) {
    const headers = { "X-Token": TOKEN, ...(opcoes.headers || {}) };
    let body = opcoes.body;
    if (body !== undefined && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body) && typeof body !== "string") {
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
        const docs = filtrar(await api("/api/col/" + encodeURIComponent(o.col)), o.filtros);
        o.cb({ docs: docs.map(d => docSnap(d.id, d.data)), size: docs.length, empty: !docs.length });
      } else {
        const r = await api(`/api/doc/${encodeURIComponent(o.col)}/${encodeURIComponent(o.id)}`);
        o.cb(docSnap(o.id, r.exists ? r.data : null));
      }
    } catch (e) {
      // ouvinte de um módulo que já foi fechado: descarta
      if (e instanceof TypeError && /dead|freed|detached/i.test(String(e.message))) ouvintes.delete(o);
      else o.err && o.err(e);
    }
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
  // where() do db do Claude: o filtro roda aqui, sobre a coleção inteira (base de uma pessoa só, poucos documentos)
  const OPS = {
    "==": (a, b) => a === b, "eq": (a, b) => a === b, "!=": (a, b) => a !== b, "ne": (a, b) => a !== b,
    "<": (a, b) => a < b, "lt": (a, b) => a < b, "<=": (a, b) => a <= b, "lte": (a, b) => a <= b,
    ">": (a, b) => a > b, "gt": (a, b) => a > b, ">=": (a, b) => a >= b, "gte": (a, b) => a >= b,
    "in": (a, b) => Array.isArray(b) && b.includes(a), "not-in": (a, b) => Array.isArray(b) && !b.includes(a),
    "array-contains": (a, b) => Array.isArray(a) && a.includes(b),
  };
  const campo = (obj, caminho) => String(caminho).split(".").reduce((x, k) => (x == null ? undefined : x[k]), obj);
  function filtrar(docs, filtros) {
    if (!filtros || !filtros.length) return docs;
    return docs.filter(d => filtros.every(([f, op, v]) => (OPS[op] || (() => false))(campo(d.data, f), v)));
  }
  function consulta(col, filtros) {
    return {
      where: (f, op, v) => consulta(col, [...filtros, [f, op, v]]),
      onSnapshot: (cb, err) => inscrever({ tipo: "col", col, filtros, cb, err }),
      get: async () => {
        const docs = filtrar(await api("/api/col/" + encodeURIComponent(col)), filtros);
        return { docs: docs.map(d => docSnap(d.id, d.data)), size: docs.length, empty: !docs.length };
      },
    };
  }
  const db = {
    collection: col => ({ ...consulta(col, []), doc: id => docRef(col, id) }),
    doc: caminho => { const [c, i] = caminho.split("/"); return docRef(c, i); },
  };

  // ---------- demais funções ----------
  let INFO = { nome: "", ia: false };
  const pronto = api("/api/info").then(i => (INFO = i)).catch(() => INFO);

  const user = {
    me: async () => { await pronto; return { id: "local", name: INFO.nome || "" }; },
    id: async () => "local",
    can: async () => true,
    profiles: async ids => { await pronto; return Object.fromEntries(ids.map(i => [i, { name: i === "local" ? (INFO.nome || "") : "" }])); },
  };
  const assets = {
    upload: async file => {
      const r = await api("/api/assets", { method: "POST", body: await file.arrayBuffer(), headers: { "Content-Type": "application/pdf" } });
      return { id: r.id, sizeBytes: r.sizeBytes };
    },
    delete: id => api("/api/assets/" + encodeURIComponent(id), { method: "DELETE" }),
  };
  const downloads = {
    // texto (CSV) ou binário (PDF do lote de guias): salva na pasta Downloads
    save: async ({ filename, data }) => {
      let r;
      if (typeof data === "string") r = await api("/api/salvar", { method: "POST", body: { filename, data } });
      else {
        const bytes = data instanceof Blob ? await data.arrayBuffer() : (ArrayBuffer.isView(data) ? data : data);
        r = await api("/api/salvar_bin", { method: "POST", body: bytes, headers: { "Content-Type": "application/octet-stream", "X-Filename": encodeURIComponent(filename || "arquivo") } });
        if (/\.pdf$/i.test(filename || "")) api("/api/abrir_arquivo", { method: "POST", body: { path: r.path } }).catch(() => {});
      }
      aviso("Salvo em " + r.path);
      return { status: "saved", path: r.path };
    },
  };
  // fotos (cartão ponto, fichas): reduz para no máximo 2000 px antes de mandar ao Claude
  async function imagemB64(blob) {
    try {
      const bmp = await createImageBitmap(blob);
      const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
      const cv = document.createElement("canvas");
      cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      const url = cv.toDataURL("image/jpeg", 0.88);
      return { tipo: "image/jpeg", dados: url.slice(url.indexOf(",") + 1) };
    } catch (e) {
      const bytes = new Uint8Array(await blob.arrayBuffer()); let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return { tipo: blob.type || "image/jpeg", dados: btoa(bin) };
    }
  }
  const sample = {
    json: async (prompt, opcoes = {}) => {
      await pronto;
      if (!INFO.ia) { const e = new Error("A leitura pelo Claude precisa da chave da API (Dados e configurações)."); e.code = "not_granted"; throw e; }
      const imagens = await Promise.all((opcoes.images || []).slice(0, 5).map(imagemB64));
      return api("/api/ia", { method: "POST", body: { prompt: typeof prompt === "string" ? prompt : JSON.stringify(prompt), imagens, nivel: opcoes.modelTier || "default" } });
    },
    limits: async () => ({ images: { maxCount: 5, mediaTypes: ["image/jpeg", "image/png", "image/webp"] } }),
  };

  window.claude = { use: async nome => ({ db, user, assets, downloads, sample })[nome] || null };

  // ---------- links: PDFs das CCTs e sites abrem fora da janela ----------
  function interceptarLinks(doc) {
    if (!doc || doc.__pseLinks) return;
    doc.__pseLinks = true;
    // Esc fecha a janela de configurações mesmo com o foco dentro de um módulo
    doc.addEventListener("keydown", e => { if (e.key === "Escape") fechar(); });
    doc.addEventListener("click", e => {
      const a = e.target.closest && e.target.closest("a[href]");
      if (!a) return;
      const href = a.getAttribute("href");
      if (href.startsWith("/_blob/") || (/^https?:\/\//.test(href) && a.target === "_blank")) {
        e.preventDefault();
        api("/api/abrir", { method: "POST", body: { url: href } })
          .catch(err => aviso(err.code === "not_found" ? "Arquivo não encontrado." : "Não foi possível abrir."));
      }
    }, true);
  }
  interceptarLinks(document);

  // ---------- sinal de vida: o programa encerra quando a janela é fechada ----------
  const ping = () => api("/api/ping", { method: "POST" }).catch(() => {});
  ping(); setInterval(ping, 5000);
  window.addEventListener("pagehide", () => navigator.sendBeacon("/api/fechar?t=" + encodeURIComponent(TOKEN)));

  // ---------- janela "Dados e configurações" (na casca do Flow) ----------
  const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const CSS = `
  .pse-scrim{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);display:flex;justify-content:flex-end}
  .pse-in{width:min(560px,100%);height:100%;overflow:auto;background:linear-gradient(170deg,rgba(32,32,36,.97),rgba(16,16,20,.98));border-left:3px solid #ff2d2d;
    padding:22px 24px 28px;display:grid;align-content:start;gap:16px;color:#f3f3f5;font:14.5px/1.5 "Manrope","Segoe UI",system-ui,sans-serif;box-shadow:-30px 0 60px -20px rgba(0,0,0,.9)}
  #pse-janela .pse-in h1{margin:0;font:800 1.35rem/1.2 "Sora","Segoe UI",sans-serif}
  #pse-janela .pse-in h2{margin:0 0 8px;font:700 .74rem "Sora","Segoe UI",sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#a3a5ad}
  .pse-sub{margin:4px 0 0;color:#a3a5ad;font-size:.88rem}
  .pse-box{background:linear-gradient(160deg,rgba(44,44,50,.62),rgba(24,24,28,.55));border:1px solid rgba(255,255,255,.09);border-radius:14px;padding:14px 16px;display:grid;gap:10px}
  .pse-row{display:flex;flex-wrap:wrap;gap:8px}
  .pse-btn{display:inline-flex;align-items:center;gap:6px;border:0;border-radius:10px;padding:9px 14px;font:700 .84rem "Sora","Segoe UI",sans-serif;cursor:pointer;color:#fff;
    background:linear-gradient(180deg,#ff2d2d,#b00000);box-shadow:0 1px 0 rgba(255,255,255,.3) inset,0 3px 0 #5a0000,0 10px 22px -10px rgba(224,21,21,.7)}
  .pse-btn.g{background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.03));border:1px solid rgba(255,255,255,.16);box-shadow:0 3px 0 rgba(0,0,0,.45)}
  .pse-btn:active{transform:translateY(2px)}
  .pse-x{justify-self:end;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.16);color:#f3f3f5;border-radius:8px;padding:6px 12px;cursor:pointer}
  .pse-in label{display:grid;gap:4px;font-size:.78rem;font-weight:700;color:#a3a5ad}
  .pse-in input[type=text],.pse-in input[type=password]{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.16);border-radius:8px;padding:9px 11px;color:#f3f3f5;font:inherit;font-weight:500}
  .pse-meta{font-size:.78rem;color:#a3a5ad;margin:0}
  .pse-st{font-size:.84rem;color:#ffd0d0;margin:0;min-height:1em}
  .pse-head{display:flex;gap:14px;align-items:center}
  .pse-head img{width:64px;height:64px;border-radius:50%;object-fit:cover;object-position:50% 35%;border:2px solid #ff2d2d;background:#18181b}
  .pse-toast{position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:210;max-width:min(92vw,620px);background:rgba(28,28,32,.95);color:#f3f3f5;border:1px solid rgba(255,255,255,.16);
    border-left:3px solid #ff2d2d;padding:10px 16px;border-radius:12px;font:14px "Manrope",sans-serif}`;
  function estilos() { if (document.getElementById("pse-css")) return; const s = document.createElement("style"); s.id = "pse-css"; s.textContent = CSS; document.head.append(s); }
  function aviso(msg) {
    estilos();
    let t = document.querySelector(".pse-toast");
    if (!t) { t = document.createElement("div"); t.className = "pse-toast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = msg; t.hidden = false; clearTimeout(aviso.h); aviso.h = setTimeout(() => t.hidden = true, 4500);
  }
  function janela(html, depois) {
    estilos();
    fechar();
    const w = document.createElement("div");
    w.className = "pse-scrim"; w.id = "pse-janela";
    w.innerHTML = `<div class="pse-in" role="dialog" aria-modal="true">${html}</div>`;
    w.addEventListener("click", e => { if (e.target === w || e.target.closest("[data-pse-fechar]")) fechar(); });
    document.body.append(w);
    depois && depois(w);
    const f = w.querySelector("input,button:not(.pse-x)"); f && f.focus();
  }
  function fechar() { const w = document.getElementById("pse-janela"); if (w) w.remove(); }

  async function abrirConfig(primeiraVez) {
    const i = await api("/api/info").catch(() => INFO);
    INFO = i;
    const c = i.contagem || {};
    janela(`<button class="pse-x" data-pse-fechar>Fechar</button>
      <div class="pse-head"><img src="/nucleo/mascote-rosto.png" alt=""><div><h1>${primeiraVez ? "Bem-vindo ao EXATO FLOW" : "Dados e configurações"}</h1>
      <p class="pse-sub">${primeiraVez ? "O programa está sem dados. Importe o arquivo com os dados do Flow (clientes, convenções, prazos, alertas, auditorias e PDFs)." : "Os dados ficam só neste computador. Faça backup com frequência."}</p></div></div>
      <div class="pse-box"><h2>Dados</h2>
        <p class="pse-meta">${c.clientes || 0} clientes · ${c.ccts || 0} convenções · ${c.prazos || 0} prazos · ${c.alertas || 0} alertas · ${c.auditorias || 0} auditorias · ${c.funcionarios || 0} cadastros de funcionários · ${c.ponto_regras || 0} clientes no Ponto · ${c.ponto || 0} apurações</p>
        <div class="pse-row">
          <label class="pse-btn" style="display:inline-flex;color:#fff;font-size:.84rem">📥 Importar dados (.zip)<input type="file" id="pse-imp" accept=".zip,application/zip" hidden></label>
          <button class="pse-btn g" id="pse-bkp">💾 Fazer backup</button>
          <button class="pse-btn g" id="pse-pasta">📂 Abrir pasta de dados</button>
        </div>
        <p class="pse-meta">Importar substitui os dados atuais (uma cópia de segurança é guardada antes). Pasta: ${esc(i.pasta)}</p>
        <p class="pse-st" id="pse-st"></p></div>
      <form class="pse-box" id="pse-cfg"><h2>Você e a IA</h2>
        <label>Seu nome (o E-exato chama você assim e ele aparece em "Alterado por")<input type="text" id="pse-nome" value="${esc(i.nome)}" placeholder="Ex.: Nilo"></label>
        <label>Chave da API do Claude: leitura de fotos de cartão ponto, fichas e convenções, e sugestão de enquadramento
          <input type="password" id="pse-key" autocomplete="off" placeholder="${i.ia ? "Chave configurada (digite para trocar)" : "sk-ant-..."}"></label>
        <p class="pse-meta">${i.ia ? "✅ IA ativa." : "IA desativada: ponto em Excel, cálculo, TXT, cadastro e auditoria funcionam sem a chave; fotos e leitura de PDFs pelo Claude não."} A chave é criada em console.anthropic.com e o uso é cobrado pela Anthropic, por leitura.</p>
        <div class="pse-row"><button class="pse-btn" type="submit">Salvar</button>${i.ia ? '<button class="pse-btn g" type="button" id="pse-rm">Remover chave</button>' : ""}</div>
      </form>
      <div class="pse-box"><h2>Mascote E-exato</h2>
        <p class="pse-meta">${i.mascote ? "Usando a imagem que você enviou." : "Usando o lobo padrão da Exato."} Para trocar, envie uma imagem (PNG com fundo transparente fica melhor).</p>
        <div class="pse-row"><label class="pse-btn g" style="display:inline-flex">🐺 Escolher imagem<input type="file" id="pse-masc" accept="image/png,image/jpeg,image/webp,image/gif" hidden></label>
          ${i.mascote ? '<button class="pse-btn g" id="pse-masc-rm">Voltar ao lobo padrão</button>' : ""}</div></div>
      <p class="pse-meta">${esc(i.app)} ${esc(i.versao)} · versão para computador</p>`, w => {
      const st = w.querySelector("#pse-st");
      w.querySelector("#pse-imp").onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return;
        st.textContent = "Importando " + f.name + "…";
        try {
          const r = await api("/api/importar", { method: "POST", body: await f.arrayBuffer(), headers: { "Content-Type": "application/zip" } });
          st.textContent = `Importado: ${r.contagem.clientes || 0} clientes, ${r.contagem.ccts || 0} convenções. Recarregando…`;
          setTimeout(() => location.reload(), 900);
        } catch (e) { st.textContent = e.message; }
      };
      w.querySelector("#pse-bkp").onclick = async () => {
        try { const r = await api("/api/backup", { method: "POST" }); st.textContent = "Backup salvo em " + r.path; }
        catch (e) { st.textContent = e.message; }
      };
      w.querySelector("#pse-pasta").onclick = () => api("/api/abrir_pasta", { method: "POST" });
      const rm = w.querySelector("#pse-rm");
      if (rm) rm.onclick = async () => { await api("/api/config", { method: "POST", body: { remover_chave: true } }); aviso("Chave removida."); fechar(); };
      w.querySelector("#pse-cfg").onsubmit = async ev => {
        ev.preventDefault();
        const antes = INFO.nome;
        const r = await api("/api/config", { method: "POST", body: { nome: w.querySelector("#pse-nome").value, api_key: w.querySelector("#pse-key").value } });
        INFO.ia = r.ia; INFO.nome = r.nome;
        aviso("Configurações salvas."); fechar();
        if (r.nome !== antes) setTimeout(() => location.reload(), 600);
      };
      w.querySelector("#pse-masc").onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return;
        try {
          await api("/api/mascote", { method: "POST", body: await f.arrayBuffer(), headers: { "Content-Type": f.type || "image/png" } });
          location.reload();
        } catch (e) { st.textContent = e.message; }
      };
      const mrm = w.querySelector("#pse-masc-rm");
      if (mrm) mrm.onclick = async () => { await api("/api/mascote", { method: "DELETE" }); location.reload(); };
    });
  }

  // primeira abertura: pergunta como a pessoa quer ser chamada (não usa o usuário do Windows)
  function perguntarNome() {
    janela(`<button class="pse-x" data-pse-fechar>Agora não</button>
      <div class="pse-head"><img src="/nucleo/mascote-rosto.png" alt=""><div><h1>Oi! Eu sou o E-exato.</h1><p class="pse-sub">Como você quer que eu te chame?</p></div></div>
      <form class="pse-box" id="pse-quem"><label>Seu nome<input type="text" id="pse-quem-nome" required placeholder="Ex.: Nilo" autocomplete="given-name"></label>
      <div class="pse-row"><button class="pse-btn" type="submit">Pronto</button></div>
      <p class="pse-meta">Dá para trocar depois em Dados e configurações.</p></form>`, w => {
      w.querySelector("#pse-quem").onsubmit = async ev => {
        ev.preventDefault();
        const nome = w.querySelector("#pse-quem-nome").value.trim();
        if (!nome) return;
        await api("/api/config", { method: "POST", body: { nome } });
        location.reload();
      };
    });
  }
  window.PSE = { abrirConfig, perguntarNome };

  // botão "Dados" no trilho e ajustes dos módulos para o computador
  const ENGRENAGEM = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>';
  function ajustarModulo(ifr) {
    let doc;
    try { doc = ifr.contentDocument; } catch (e) { return; }
    if (!doc) return;
    interceptarLinks(doc);
    // Painel Sindical: o botão "Instalar no celular" vira "Dados e configurações"
    const b = doc.getElementById("helpbtn");
    if (b && !b.__pse) {
      b.__pse = true;
      if (b.lastChild) b.lastChild.textContent = "Dados e configurações";
      b.onclick = ev => { ev.preventDefault(); abrirConfig(false); };
    }
  }
  function vigiarModulos() {
    const ligar = ifr => { if (ifr.__pse) return; ifr.__pse = true; ifr.addEventListener("load", () => setTimeout(() => ajustarModulo(ifr), 50)); ajustarModulo(ifr); };
    document.querySelectorAll(".stage iframe").forEach(ligar);
    new MutationObserver(() => document.querySelectorAll(".stage iframe").forEach(ligar))
      .observe(document.querySelector(".stage") || document.body, { childList: true, subtree: true });
  }

  window.addEventListener("DOMContentLoaded", async () => {
    // item "Dados" na barra lateral do Flow, no grupo Cadastro
    const grupos = document.querySelectorAll(".side .navg");
    const grupo = grupos[grupos.length - 1];
    if (grupo && !document.getElementById("t-dados")) {
      const bt = document.createElement("button");
      bt.className = "nav"; bt.type = "button"; bt.id = "t-dados";
      bt.innerHTML = ENGRENAGEM + '<span class="t"><b>Dados</b><small>Backup e configurações</small></span><span></span>';
      bt.onclick = () => abrirConfig(false);
      grupo.append(bt);
    }
    vigiarModulos();
    const i = await pronto;
    if (i && i.vazio) abrirConfig(true);
    else if (i && !i.nome) perguntarNome();
  });
})();
