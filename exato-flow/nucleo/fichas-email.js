/*
 * EXATO FLOW · Fichas de Início que chegam por e-mail (formulário do Netlify → Gmail do escritório).
 * Usa o conector Gmail do claude.ai (capacidade "mcp"): procura os e-mails "Nova ficha de início recebida"
 * e compara com os diagnósticos já salvos (campo email_id) e com os e-mails marcados como ignorados
 * (documento meta/fichas_email). Nada é importado sozinho: o Flow avisa e o usuário importa ou ignora.
 */
(function(raiz){
  "use strict";
  const SERVIDOR="Gmail";
  const BUSCA='from:formresponses@netlify.com subject:"ficha de início" newer_than:90d';
  const DOC_META="meta/fichas_email";
  const pl=r=>r&&typeof r==="object"&&"payload" in r?r.payload:r;

  // "Empresa: X Cnpj: 00.000.000/0000-00 Responsavel: ..." (prévia do e-mail)
  function dadosDaPrevia(t){
    t=String(t||"");
    const emp=(t.match(/Empresa:\s*(.+?)\s+Cnpj:/i)||[])[1]||"";
    const cnpj=(t.match(/Cnpj:\s*([\d./-]+)/i)||[])[1]||"";
    return {empresa:emp.trim(),cnpj:cnpj.trim()};
  }
  // texto da ficha a partir do corpo do e-mail
  function textoDaFicha(corpo){
    const s=String(corpo||""), i=s.indexOf("RESPOSTAS DA FICHA DE INÍCIO");
    return (i>=0?s.slice(i):s).replace(/\r/g,"").trim();
  }
  // mensagens de ficha: [{id, data, empresa, cnpj}] (mais novas primeiro)
  async function listar(mcp){
    const r=pl(await mcp.callTool(SERVIDOR,"search_threads",{query:BUSCA,pageSize:30}));
    const out=[], vistos=new Set();
    for(const th of (r&&r.threads)||[]){
      let msgs=th.messages||[];
      if((th.messageCount||0)>msgs.length){ try{ const t=pl(await mcp.callTool(SERVIDOR,"get_thread",{threadId:th.id,messageFormat:"MINIMAL"})); msgs=(t&&t.messages)||msgs; }catch(e){} }
      for(const m of msgs){
        if(!m||!m.id||vistos.has(m.id)) continue;
        if(m.sender&&!/formresponses@netlify\.com/i.test(m.sender)) continue;
        vistos.add(m.id);
        out.push({id:m.id,data:m.date||"",...dadosDaPrevia(m.snippet)});
      }
    }
    return out.sort((a,b)=>String(b.data).localeCompare(String(a.data)));
  }
  // fichas ainda não importadas nem ignoradas
  async function novas(mcp,db,diagnosticos){
    const todas=await listar(mcp);
    let ign={}; try{ const s=await db.doc(DOC_META).get(); ign=(s.exists&&s.data().ignorados)||{}; }catch(e){}
    const ja=new Set((diagnosticos||[]).map(d=>d.email_id).filter(Boolean));
    return todas.filter(f=>!ja.has(f.id)&&!ign[f.id]);
  }
  async function texto(mcp,id){
    const m=pl(await mcp.callTool(SERVIDOR,"get_message",{messageId:id,messageFormat:"PLAIN_TEXT"}));
    return textoDaFicha(m&&m.plaintextBody);
  }
  async function ignorar(db,id,por){
    const ref=db.doc(DOC_META); let ign={};
    try{ const s=await ref.get(); ign=(s.exists&&s.data().ignorados)||{}; }catch(e){}
    ign[id]={em:new Date().toISOString(),por:por||""};
    await ref.set({ignorados:ign});
  }
  const fmtData=s=>{ const d=new Date(s); return isNaN(d)?"":d.toLocaleDateString("pt-BR")+" "+d.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"}); };

  const API={SERVIDOR,BUSCA,DOC_META,dadosDaPrevia,textoDaFicha,listar,novas,texto,ignorar,fmtData};
  raiz.FichasEmail=API;
  if(typeof module!=="undefined") module.exports=API;
})(typeof window!=="undefined"?window:globalThis);
