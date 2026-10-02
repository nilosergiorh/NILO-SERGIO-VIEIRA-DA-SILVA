/*
 * EXATO FLOW \u00b7 n\u00facleo de dados compartilhado entre os m\u00f3dulos.
 *
 * Cadastro \u00fanico de clientes = cole\u00e7\u00e3o "clientes" da base do Flow (a mesma
 * que o Painel Sindical sempre usou). Campos do Painel: cod, nome, fant,
 * cnpj, mun, cnae, ativ, cct, lab, pat, conf, confirmado, temEmp, obs.
 * Campos de Departamento Pessoal (prefixo dp_): dp_situacao, dp_regime,
 * dp_func, dp_ponto, dp_resp, dp_contato, dp_email, dp_fone, dp_obs.
 *
 * Cole\u00e7\u00e3o "auditorias": um documento por CNPJ (s\u00f3 d\u00edgitos), com a \u00faltima
 * auditoria de guias e o hist\u00f3rico das \u00faltimas 12 compet\u00eancias.
 */
(function(){
  "use strict";

  // Runtime do claude.ai: o da janela principal quando o m\u00f3dulo roda dentro do Flow.
  function runtime(){
    try{ if(window.parent!==window && window.parent.claude && window.parent.claude.use) return window.parent.claude; }catch(e){}
    return window.claude || null;
  }
  const memo={};
  function use(nome){
    const rt=runtime();
    if(!rt || !rt.use) return Promise.resolve(null);
    if(!memo[nome]) memo[nome]=rt.use(nome).catch(()=>null);
    return memo[nome];
  }

  // ---------- CNPJ ----------
  const digitos=s=>String(s??"").replace(/\D/g,"");
  function fmtCnpj(s){
    const d=digitos(s);
    if(d.length!==14) return String(s??"");
    return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,"$1.$2.$3/$4-$5");
  }
  function cnpjValido(s){
    const d=digitos(s);
    if(d.length!==14 || /^(\d)\1+$/.test(d)) return false;
    const dv=n=>{ let soma=0,p=n-7; for(let i=0;i<n;i++){ soma+=+d[i]*p--; if(p<2) p=9; } const r=soma%11; return r<2?0:11-r; };
    return dv(12)===+d[12] && dv(13)===+d[13];
  }
  const raiz=s=>digitos(s).slice(0,8);

  // ---------- datas e CCT ----------
  function hoje(){ const d=new Date(); return new Date(d.getFullYear(),d.getMonth(),d.getDate()); }
  function isoData(s){ const m=String(s||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m?new Date(+m[1],+m[2]-1,+m[3]):null; }
  function fmtData(s){ const d=isoData(s); return d?d.toLocaleDateString("pt-BR"):"\u2014"; }
  // Mesma regra do Painel Sindical: vencida, vence em at\u00e9 90 dias, vigente ou sem CCT.
  function statusCct(k){
    if(!k || !k.fim) return "SEM";
    const fim=isoData(k.fim); if(!fim) return "SEM";
    const dias=(fim-hoje())/864e5;
    return dias<0?"VENCIDA":dias<=90?"VENCE":"VIGENTE";
  }
  const ROTULO_CCT={VIGENTE:"CCT vigente",VENCE:"CCT vence em 90 dias",VENCIDA:"CCT vencida",SEM:"Sem CCT"};

  // ---------- compet\u00eancia ----------
  const compChave=c=>{ const m=String(c||"").match(/^(\d{2})\/(\d{4})$/); return m?m[2]+"-"+m[1]:""; };

  // ---------- pend\u00eancias do cadastro ----------
  const REGIMES=["Simples Nacional","Lucro Presumido","Lucro Real","MEI","Pessoa f\u00edsica / CAEPF","Imune / isenta"];
  const SITUACOES=["Ativo","Sem movimento","Inativo"];
  const PONTO=["Sem controle (at\u00e9 20 empregados)","Manual / livro","Cart\u00e3o / rel\u00f3gio","Eletr\u00f4nico (REP)","Aplicativo","Ponto por exce\u00e7\u00e3o"];
  const ativo=c=>(c.dp_situacao||"Ativo")!=="Inativo";

  // Lista de pend\u00eancias de um cliente. ctx = {porCnpj, porCod, cctPorRamo}
  function pendencias(c,ctx){
    const p=[]; const add=(nivel,texto)=>p.push({nivel,texto});
    const d=digitos(c.cnpj);
    if(!d) add("alta","Sem CNPJ");
    else if(!cnpjValido(d)) add("alta","CNPJ inv\u00e1lido (d\u00edgito verificador n\u00e3o confere)");
    else if((ctx.porCnpj[d]||[]).length>1) add("alta","CNPJ repetido em outro cliente");
    if(!String(c.cod||"").trim()) add("media","Sem c\u00f3digo do Dom\u00ednio");
    else if((ctx.porCod[String(c.cod).trim()]||[]).length>1) add("alta","C\u00f3digo do Dom\u00ednio repetido");
    if(!ativo(c)) return p;
    const st=statusCct(ctx.cctPorRamo[c.cct]);
    if(!c.cct) add("alta","Sem conven\u00e7\u00e3o coletiva definida");
    else if(st==="SEM") add("media","CCT do cliente n\u00e3o est\u00e1 no Painel Sindical");
    else if(st==="VENCIDA") add("alta","CCT vencida");
    if(c.cct && c.confirmado!=="Sim") add("baixa","Enquadramento sindical ainda n\u00e3o confirmado");
    if(!c.dp_regime) add("media","Sem regime tribut\u00e1rio");
    if(c.dp_func==null || c.dp_func==="") add("baixa","Sem n\u00famero de funcion\u00e1rios");
    return p;
  }

  function indices(clientes,ccts){
    const porCnpj={}, porCod={};
    for(const c of clientes){
      const d=digitos(c.cnpj); if(d) (porCnpj[d]=porCnpj[d]||[]).push(c);
      const k=String(c.cod||"").trim(); if(k) (porCod[k]=porCod[k]||[]).push(c);
    }
    const cctPorRamo=Object.fromEntries((ccts||[]).map(k=>[k.ramo,k]));
    return {porCnpj,porCod,cctPorRamo};
  }

  // ---------- conex\u00e3o com a base ----------
  // Assina clientes, ccts e auditorias uma \u00fanica vez e avisa quem pediu.
  const estado={clientes:[],ccts:[],auditorias:[],pronto:{},erro:null,db:null};
  const ouvintes=new Set();
  let iniciado=null;
  function avisar(){ ouvintes.forEach(fn=>{ try{ fn(estado); }catch(e){ console.error(e); } }); }
  function conectar(){
    if(iniciado) return iniciado;
    iniciado=(async()=>{
      const db=await use("db");
      if(!db){ estado.erro="sem_base"; avisar(); return null; }
      estado.db=db;
      for(const col of ["clientes","ccts","auditorias"]){
        db.collection(col).onSnapshot(snap=>{
          estado[col]=snap.docs.map(d=>({...d.data(),_id:d.id}));
          estado.pronto[col]=true; avisar();
        },err=>{ estado.erro=(err&&err.code)||"erro"; avisar(); });
      }
      return db;
    })();
    return iniciado;
  }
  function assinar(fn){ ouvintes.add(fn); conectar(); fn(estado); return ()=>ouvintes.delete(fn); }

  async function usuarioId(){ const u=await use("user"); if(!u) return ""; try{ return (await u.id())||""; }catch(e){ return ""; } }
  async function carimbo(){ return {upd_by:await usuarioId(), upd_at:new Date().toISOString()}; }

  window.FlowDados={use,digitos,fmtCnpj,cnpjValido,raiz,hoje,isoData,fmtData,statusCct,ROTULO_CCT,compChave,
    REGIMES,SITUACOES,PONTO,ativo,pendencias,indices,conectar,assinar,estado,usuarioId,carimbo};
})();
