/*
 * EXATO FLOW · gerador de relatório em PDF (texto de verdade, A4, fundo branco).
 * Substitui o window.print(), que fica bloqueado quando o módulo roda dentro do Flow.
 * Precisa do pdf-lib carregado antes (window.PDFLib). Uso:
 *   const r = await PdfRel.criar({titulo:"Diagnóstico", sub:"Empresa X"});
 *   r.h2("Seção"); r.p("texto"); r.item({titulo, tag, cor, linhas:[["Por quê","..."]]});
 *   const bytes = await r.salvar();
 */
(function(raiz){
  "use strict";
  const MM = 72 / 25.4, A4 = [595.28, 841.89], MARG = 16 * MM;
  const COR = { tinta:[0.09,0.09,0.1], suave:[0.38,0.39,0.42], linha:[0.85,0.85,0.88], red:[0.75,0,0],
    alta:[0.82,0.13,0.13], media:[0.85,0.55,0.05], conf:[0.45,0.47,0.52], ok:[0.12,0.6,0.38] };
  const TROCA = { "→":"->", "←":"<-", "≥":">=", "≤":"<=", "−":"-", "✓":"v", "✔":"v", "✗":"x", "●":"•", " ":" ", " ":" ", " ":" " };

  async function criar(o){
    const L = raiz.PDFLib; if(!L) throw new Error("pdf-lib não carregou");
    const doc = await L.PDFDocument.create();
    doc.setTitle(o.titulo || "Relatório"); doc.setAuthor("Exato Soluções Contábeis"); doc.setCreator("Exato Flow");
    const F = { n: await doc.embedFont(L.StandardFonts.Helvetica), b: await doc.embedFont(L.StandardFonts.HelveticaBold) };
    const rgb = c => L.rgb(c[0], c[1], c[2]);
    const W = A4[0] - 2 * MARG;
    let pag, y, nPag = 0;

    // troca o que a fonte padrão não desenha (setas, símbolos) para não quebrar o PDF
    const ok = new Map();
    function limpa(t){
      let s = ""; for(const ch of String(t ?? "")){
        const c = TROCA[ch] ?? ch;
        if(!ok.has(c)){ try{ F.n.widthOfTextAtSize(c, 10); ok.set(c, true); }catch(e){ ok.set(c, false); } }
        s += ok.get(c) ? c : "?";
      } return s.replace(/[\r\t]/g, " ");
    }
    function quebra(t, f, tam, larg){
      const out = [];
      for(const par of limpa(t).split("\n")){
        let lin = ""; for(const w of par.split(/ +/)){
          const tst = lin ? lin + " " + w : w;
          if(f.widthOfTextAtSize(tst, tam) <= larg || !lin) lin = tst; else { out.push(lin); lin = w; }
        } out.push(lin);
      } return out;
    }
    function novaPag(){
      pag = doc.addPage(A4); nPag++; y = A4[1] - MARG;
      pag.drawRectangle({ x:0, y:A4[1]-6, width:A4[0], height:6, color:rgb(COR.red) });
      pag.drawText(limpa("EXATO SOLUÇÕES CONTÁBEIS · Departamento Pessoal"), { x:MARG, y:y-2, size:8.5, font:F.b, color:rgb(COR.red) });
      if(o.sub) { const s = limpa(o.sub); pag.drawText(s, { x:A4[0]-MARG-F.n.widthOfTextAtSize(s,8.5), y:y-2, size:8.5, font:F.n, color:rgb(COR.suave) }); }
      y -= 10; pag.drawLine({ start:{x:MARG,y}, end:{x:A4[0]-MARG,y}, thickness:0.6, color:rgb(COR.linha) }); y -= 16;
    }
    function cabe(h){ if(y - h < MARG + 14) novaPag(); }
    function linhas(arr, f, tam, cor, x, entre){
      const h = tam * (entre || 1.35);
      for(const l of arr){ cabe(h); pag.drawText(l, { x, y:y-tam, size:tam, font:f, color:rgb(cor) }); y -= h; }
    }
    novaPag();

    const api = {
      h1(t){ linhas(quebra(t, F.b, 18, W), F.b, 18, COR.tinta, MARG, 1.25); y -= 2; },
      h2(t){ y -= 8; cabe(40); linhas(quebra(t, F.b, 12.5, W), F.b, 12.5, COR.tinta, MARG);
        pag.drawLine({ start:{x:MARG,y:y-1}, end:{x:MARG+40,y:y-1}, thickness:1.6, color:rgb(COR.red) }); y -= 9; },
      p(t, op){ op = op || {}; const f = op.negrito ? F.b : F.n, tam = op.tam || 9.5;
        linhas(quebra(t, f, tam, W - (op.recuo||0)), f, tam, op.cor ? (COR[op.cor]||op.cor) : COR.tinta, MARG + (op.recuo||0)); y -= op.depois ?? 3; },
      lista(arr, op){ op = op || {}; const tam = op.tam || 9.5;
        for(const t of arr){ const ls = quebra(t, F.n, tam, W - 12); cabe(tam*1.35);
          pag.drawText("•", { x:MARG+2, y:y-tam, size:tam, font:F.b, color:rgb(COR.red) });
          linhas(ls, F.n, tam, COR.tinta, MARG + 12); y -= 1.5; } y -= 3; },
      // cartão de um item: faixa colorida à esquerda, título, etiqueta e pares rótulo/texto
      item(it){
        const tam = 9, rot = 62, larg = W - 14 - rot;
        const blocos = (it.linhas || []).filter(l => l && l[1]).map(([r, t, cor]) => ({ r:limpa(r).toUpperCase(), ls:quebra(t, F.n, tam, larg), cor }));
        const tit = quebra(it.titulo, F.b, 10.5, W - 14 - (it.tag ? F.b.widthOfTextAtSize(limpa(it.tag), 8) + 18 : 0));
        const alt = tit.length * 14 + blocos.reduce((s, b) => s + b.ls.length * tam * 1.32 + 2, 0) + 12;
        cabe(Math.min(alt, 220));
        const topo = y, pagIni = pag, cor = COR[it.cor] || COR.conf;
        tit.forEach((l, i) => pag.drawText(l, { x:MARG+12, y:y-11-i*14, size:10.5, font:F.b, color:rgb(it.feito ? COR.suave : COR.tinta) }));
        if(it.tag){ const tg = limpa(it.tag), tw = F.b.widthOfTextAtSize(tg, 8);
          pag.drawRectangle({ x:A4[0]-MARG-tw-10, y:y-13, width:tw+10, height:13, color:rgb(cor), opacity:0.14 });
          pag.drawText(tg, { x:A4[0]-MARG-tw-5, y:y-9.6, size:8, font:F.b, color:rgb(cor) }); }
        y -= tit.length * 14 + 3;
        for(const b of blocos){
          cabe(tam * 1.32);
          pag.drawText(b.r, { x:MARG+12, y:y-tam+0.5, size:7, font:F.b, color:rgb(COR.suave) });
          linhas(b.ls, F.n, tam, b.cor ? (COR[b.cor]||COR.tinta) : COR.tinta, MARG + 12 + rot, 1.32); y -= 2;
        }
        y -= 4;
        const fim = y, ini = pag === pagIni ? topo : A4[1] - MARG - 26;
        pag.drawRectangle({ x:MARG, y:fim, width:3, height:Math.max(0, ini - fim), color:rgb(cor) });
        pag.drawLine({ start:{x:MARG,y:fim}, end:{x:A4[0]-MARG,y:fim}, thickness:0.5, color:rgb(COR.linha) });
        y -= 8;
      },
      // linha de indicadores: [[valor, rótulo, cor], ...]
      kpis(arr){
        const n = arr.length, gap = 8, lw = (W - gap * (n - 1)) / n; cabe(46);
        arr.forEach(([v, r, c], i) => { const x = MARG + i * (lw + gap), cor = COR[c] || COR.tinta;
          pag.drawRectangle({ x, y:y-40, width:lw, height:40, borderColor:rgb(COR.linha), borderWidth:0.7, color:rgb([1,1,1]) });
          pag.drawRectangle({ x, y:y-40, width:3, height:40, color:rgb(cor) });
          pag.drawText(limpa(v), { x:x+10, y:y-21, size:15, font:F.b, color:rgb(cor) });
          pag.drawText(limpa(r), { x:x+10, y:y-33, size:7.5, font:F.n, color:rgb(COR.suave) }); });
        y -= 50;
      },
      espaco(h){ y -= h || 8; },
      async salvar(){
        const ps = doc.getPages(), tot = ps.length;
        ps.forEach((pg, i) => { const t = `Página ${i+1} de ${tot}` + (o.rodape ? " · " + o.rodape : "");
          pg.drawText(limpa(t), { x:MARG, y:MARG-4, size:7.5, font:F.n, color:rgb(COR.suave) }); });
        return doc.save();
      }
    };
    return api;
  }
  raiz.PdfRel = { criar };
  if(typeof module !== "undefined") module.exports = raiz.PdfRel;
})(typeof window !== "undefined" ? window : globalThis);
