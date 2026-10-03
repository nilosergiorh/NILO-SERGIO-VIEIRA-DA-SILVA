/*
 * EXATO FLOW - leitura dos relatorios do Dominio Folha (sem tela).
 *
 * - pdfText(file): texto de um PDF com o layout em colunas (pdf.js 5.7.284 do cdnjs).
 * - parseExtrato(texto): relatorio "Extrato Mensal" do Dominio -> empresas, empregados e eventos.
 *   Mesmo leitor usado na Auditoria de Guias (copiado de modulos/auditoria-guias.html).
 * - rubricasDoExtrato / classificarRubricas: descobre quais rubricas a empresa usa para hora
 *   extra, adicional noturno, faltas e DSR, pela descricao do evento no proprio Dominio.
 */
(function(raiz){
  "use strict";
function itemsToLines(items){
  const its=items.filter(it=>it.str!=null).map(it=>{const t=it.transform;const fs=Math.hypot(t[2],t[3])||it.height||8;return {s:it.str,x:t[4],y:t[5],w:it.width,fs}});
  its.sort((a,b)=>b.y-a.y||a.x-b.x);
  const lines=[];
  for(const it of its){
    let L=lines.find(l=>Math.abs(l.y-it.y)<Math.max(1.5,it.fs*0.35));
    if(!L){L={y:it.y,items:[]};lines.push(L);}
    L.items.push(it);
  }
  lines.sort((a,b)=>b.y-a.y);
  return lines.map(L=>{
    L.items.sort((a,b)=>a.x-b.x);
    let s='',end=null;
    for(const it of L.items){
      if(!it.s.trim()){continue;}
      if(end!==null){const gap=it.x-end;const cw=it.fs*0.5;
        if(gap>cw*0.3) s+= gap<cw*1.2?' ':' '.repeat(Math.max(2,Math.round(gap/cw)));}
      else s+=' '.repeat(Math.max(0,Math.round(it.x/(it.fs*0.5)))>0?1:0);
      s+=it.s; end=it.x+it.w;
    }
    return s;
  });
}

const num=s=>s==null?0:parseFloat(String(s).replace(/\./g,'').replace(',','.'))||0;
// ---------- leitura do Extrato Mensal (Dom\u00ednio) ----------
const EV_RE=/(\d{1,4})\s+([A-Za-z\u00c0-\u00ff0-9%\/\.\-\u00ba\u00b0\u00aa\(\)'\u00b4`&, ]+?)\s{2,}([\d:.,]+)\s+([\d.]+,\d\d)\s([PDIB])(?=\s|$)/g;
const INSS_COD=new Set(['998','812','821','826','843','989']);
const IR_COD=new Set(['999','856','828','827']);
function parseExtrato(text){
  const comps={}; let comp=null;
  const pages=text.split(/(?=Empresa:\s+\d+\s+-\s+)/);
  for(const pg of pages){
    const m=pg.match(/^Empresa:\s+(\d+)\s+-\s+(.+?)(?:\s{2,}|\n)/); if(!m) continue;
    const code=m[1], name=m[2].trim();
    const cnpj=(pg.match(/CNPJ:\s+([\d./-]+)/)||[])[1]||'';
    const cp=(pg.match(/Compet\u00eancia:\s+(\d\d\/\d{4})/)||[])[1]; if(cp) comp=cp;
    const calc=((pg.match(/C\u00e1lculo:\s+(.+?)(?:\s{2,}|\n)/)||[])[1]||'').trim();
    const c=comps[code]||(comps[code]={code,name,cnpj,comp:cp,calc,workers:[],summary:null});
    const blocks=pg.split(/\n(?=\s*(?:Empr|Contr)\.?:\s+\d+ )/);
    for(const b of blocks){
      const wm=b.match(/^\s*(Empr|Contr)\.?:\s+(\d+)\s+(.+?)\s{2,}Situa\u00e7\u00e3o:\s+(.+?)\s{2,}/); if(!wm) continue;
      const w={tipo:wm[1],id:wm[2],nome:wm[3].trim(),sit:wm[4].trim(),eventos:[]};
      w.vinculo=((b.match(/V\u00ednculo:\s+(\S+)/)||[])[1])||'';
      for(const line of b.split('\n')){
        if(/^\s*(ND:|NF:|V\u00ednculo|Cargo|Empr|Contr)/.test(line)) continue;
        for(const e of line.matchAll(EV_RE)) w.eventos.push({cod:e[1],desc:e[2].trim(),ref:e[3],valor:num(e[4]),tp:e[5]});
      }
      const g=re=>{const x=b.match(re);return x?x[1]:null};
      w.nd=parseInt(g(/ND:\s+(\d+)/)||'0'); w.prov=num(g(/Proventos:\s+([\d.,]+)/)); w.desc=num(g(/Descontos:\s+([\d.,]+)/));
      w.baseInss=num(g(/Base INSS:\s+([\d.,]+)/)); w.exced=num(g(/Excedente INSS:\s+([\d.,]+)/)); w.baseIrrf=num(g(/Base IRRF:\s+([\d.,]+)/));
      w.obs=b.split('\n').map(l=>l.trim()).filter(l=>/^(FERIAS|DEMITIDO|Doen\u00e7a|Licen\u00e7a|Aposent|Novo afast|Afast)/i.test(l)).join('; ');
      c.workers.push(w);
    }
    if(/Sal\u00e1rio contribui\u00e7\u00e3o empregados/.test(pg)){
      const g=re=>num((pg.match(re)||[])[1]);
      const s={scEmpr:g(/Sal\u00e1rio contribui\u00e7\u00e3o empregados:\s+([\d.,]+)/),scContr:g(/Sal\u00e1rio contribui\u00e7\u00e3o contribuintes:\s+([\d.,]+)/),
        segurados:g(/Segurados:\s+([\d.,]+)/),empresa:g(/\n\s*Empresa:\s+([\d.,]+)/),rat:g(/RAT:\s+([\d.,]+)/),contribuintes:g(/\n\s*Contribuintes:\s+([\d.,]+)/),
        terceiros:g(/Terceiros:\s+([\d.,]+)/),senai:g(/Adicional ao SENAI:\s+([\d.,]+)/),totalInss:g(/Total INSS:\s+([\d.,]+)/),
        salFam:g(/Sal\u00e1rio Fam\u00edlia:\s+([\d.,]+)/),salMat:g(/Sal\u00e1rio Maternidade:\s+([\d.,]+)/),coop:g(/Cooperativas:\s+([\d.,]+)/),pis:g(/Valor PIS:\s+([\d.,]+)/),irrf:{}};
      for(const lab of ['Valor IRRF Mensal','Valor IRRF F\u00e9rias','Valor IRRF Partic. Lucros','Valor IRRF 13\u00ba Sal\u00e1rio','Valor Total do IRRF','IRRF contribuintes','IRRF Alugu\u00e9is','Base IRRF Mensal','Base IRRF F\u00e9rias','Base IRRF 13\u00ba Sal\u00e1rio']){
        const esc=lab.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
        const x=pg.match(new RegExp(esc+':\\s+([\\d.,]+)\\s+'+esc+':\\s+([\\d.,]+)'));
        if(x) s.irrf[lab]=[num(x[1]),num(x[2])];
      }
      c.summary=s;
    }
  }
  return {comp,empresas:Object.values(comps)};
}


  // ---------- pdf.js ----------
  let pdfjsP=null;
  function getPdfjs(){
    if(!pdfjsP) pdfjsP=(async()=>{const CDN='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/5.7.284/';let lib;try{lib=await import(CDN+'pdf.min.mjs');await import(CDN+'pdf.worker.min.mjs');}catch(e){pdfjsP=null;throw new Error('O leitor de PDF n\u00e3o carregou. Confira a internet e recarregue a p\u00e1gina.')}return lib;})();
    return pdfjsP;
  }
  async function pdfText(file){
    const lib=await getPdfjs();
    const doc=await lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),verbosity:0}).promise;
    const out=[];
    for(let i=1;i<=doc.numPages;i++){const p=await doc.getPage(i);const tc=await p.getTextContent();out.push(itemsToLines(tc.items).join('\n'));}
    await doc.destroy();
    return out.join('\n\f\n');
  }

  // ---------- rubricas ----------
  const semAcento=t=>String(t||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase();
  // eventos distintos do extrato de uma empresa: {cod, desc, tp (P/D), horas (referencia em hh:mm), qtd}
  function rubricasDoExtrato(emp){
    const m=new Map();
    for(const w of emp.workers||[]) for(const e of w.eventos||[]){
      const x=m.get(e.cod)||{cod:e.cod,desc:e.desc,tp:e.tp,horas:false,qtd:0};
      x.qtd++; if(/^\d{1,3}:\d{2}$/.test(String(e.ref))) x.horas=true; m.set(e.cod,x);
    }
    return [...m.values()].sort((a,b)=>(+a.cod)-(+b.cod));
  }
  // papel de cada rubrica pela descricao. Devolve {he:[{cod,desc,pct}], he100, not, notRed, hfalta, falta, dsr}
  function classificarRubricas(rubs){
    const r={he:[],he100:null,not:null,notRed:null,hfalta:null,falta:null,dsr:null};
    for(const x of rubs){
      const d=semAcento(x.desc);
      if(/REFLEX|MEDIA|S\/\s*H|SOBRE|DSR\s*(S|SOBRE)|13|FERIAS|AVISO|INDENIZ|PERICUL|INSALUB/.test(d) && !/FALTA/.test(d)) continue; // reflexos e medias: calculados pelo Dominio
      const pct=+((d.match(/(\d{2,3})\s*%/)||[])[1]||0);
      if(/EXTRA/.test(d)){ if(pct>=100) r.he100=r.he100||{cod:x.cod,desc:x.desc,pct}; else r.he.push({cod:x.cod,desc:x.desc,pct:pct||50}); continue; }
      if(/NOTURN/.test(d)){ if(/REDU/.test(d)) r.notRed=r.notRed||{cod:x.cod,desc:x.desc}; else r.not=r.not||{cod:x.cod,desc:x.desc,pct}; continue; }
      if(/FALTA|ATRASO/.test(d)){
        if(/DSR|REPOUSO/.test(d)) r.dsr=r.dsr||{cod:x.cod,desc:x.desc};
        else if(/PARC|ATRASO/.test(d)) r.hfalta=r.hfalta||{cod:x.cod,desc:x.desc};
        else r.falta=r.falta||{cod:x.cod,desc:x.desc};
      }
    }
    r.he.sort((a,b)=>a.pct-b.pct);
    return r;
  }
  // empregados do extrato (sem socios/contribuintes)
  const empregadosDoExtrato=emp=>(emp.workers||[]).filter(w=>w.tipo==="Empr").map(w=>({codigo:w.id,nome:w.nome,situacao:w.sit,obs:w.obs}));

  const API={itemsToLines,parseExtrato,pdfText,rubricasDoExtrato,classificarRubricas,empregadosDoExtrato,semAcento};
  if(typeof module!=="undefined"&&module.exports) module.exports=API; else raiz.DominioRel=API;
})(typeof window!=="undefined"?window:globalThis);
