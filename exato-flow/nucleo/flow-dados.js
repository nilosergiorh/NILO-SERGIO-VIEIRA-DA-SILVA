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
  // Imagem pronta para o Claude: reduzida a no máximo 2000 px (JPEG) e recriada como Blob da janela que
  // tem o runtime. Os módulos rodam em iframe: um File do iframe não é "Blob" para a janela principal
  // e a plataforma recusava a foto.
  function janelaRuntime(){
    try{ if(window.parent!==window && window.parent.claude && window.parent.claude.use) return window.parent; }catch(e){}
    return window;
  }
  async function imagemClaude(f,max){
    max=max||2000; let blob=f;
    try{
      const bmp=await createImageBitmap(f), k=Math.min(1,max/Math.max(bmp.width,bmp.height));
      const cv=document.createElement("canvas"); cv.width=Math.round(bmp.width*k); cv.height=Math.round(bmp.height*k);
      cv.getContext("2d").drawImage(bmp,0,0,cv.width,cv.height);
      const b2=await new Promise(r=>cv.toBlob(r,"image/jpeg",0.88)); if(b2) blob=b2;
    }catch(e){ /* formato que o navegador não abre (ex.: HEIC): vai como veio */ }
    try{ const W=janelaRuntime(); if(W!==window&&W.Blob) return new W.Blob([await blob.arrayBuffer()],{type:blob.type||"image/jpeg"}); }catch(e){}
    return blob;
  }
  // A plataforma só aceita na chamada ao Claude um objeto de opções "puro" da janela principal (senão rejeita
  // invalid_request) e imagens que sejam Blob dessa janela. Os módulos rodam em iframe: aqui as opções, as
  // listas e as fotos são recriadas na janela do runtime antes de cada chamada.
  async function paraRuntime(v,W){
    if(v==null||typeof v!=="object") return v;
    if((typeof Blob!=="undefined"&&v instanceof Blob)||(W.Blob&&v instanceof W.Blob)){
      if(W.Blob&&v instanceof W.Blob) return v;
      return new W.Blob([await v.arrayBuffer()],{type:v.type||"image/jpeg"});
    }
    if(typeof FileList!=="undefined"&&v instanceof FileList) v=Array.from(v);
    if(Array.isArray(v)){ const a=new W.Array(); for(const x of v) a.push(await paraRuntime(x,W)); return a; }
    if(typeof AbortSignal!=="undefined"&&v instanceof AbortSignal) return v;
    const o=new W.Object(); for(const k of Object.keys(v)) o[k]=typeof v[k]==="function"?v[k]:await paraRuntime(v[k],W); return o;
  }
  function adaptarSample(s){
    const W=janelaRuntime();
    if(!s||W===window) return s;
    const f=async(input,opcoes)=>s(await paraRuntime(input,W),opcoes===undefined?undefined:await paraRuntime(opcoes,W));
    f.json=async(input,opcoes)=>s.json(await paraRuntime(input,W),opcoes===undefined?undefined:await paraRuntime(opcoes,W));
    f.limits=(...a)=>s.limits(...a);
    return f;
  }
  // Mesma regra para base de dados, arquivos, downloads, usuário e conectores: argumentos recriados na janela do
  // runtime (cópia síncrona; com Blob no meio, a chamada vira assíncrona). Resultados que são referências
  // (db.collection(), .doc(), .where()) também passam pelo adaptador.
  const ehBlob=v=>(typeof Blob!=="undefined"&&v instanceof Blob);
  function temBlob(v,n){ if(n>8||v==null||typeof v!=="object") return false; if(ehBlob(v)) return true; return Object.keys(v).some(k=>temBlob(v[k],(n||0)+1)); }
  function copiaW(v,W){
    if(v==null||typeof v!=="object"||typeof v==="function") return v;
    if(Array.isArray(v)){ const a=new W.Array(); for(const x of v) a.push(copiaW(x,W)); return a; }
    if(v instanceof Date) return new W.Date(v.getTime());
    if(W.Blob&&v instanceof W.Blob) return v;
    if(Object.getPrototypeOf(v)!==Object.prototype) return v;   // objeto da própria plataforma: passa como está
    const o=new W.Object(); for(const k of Object.keys(v)) o[k]=copiaW(v[k],W); return o;
  }
  function adaptarObj(obj,W){
    return new Proxy({},{
      get(_,k){
        const v=obj[k];
        if(typeof v!=="function") return v;
        return function(...args){
          const devolver=r=>(r&&typeof r==="object"&&typeof r.then!=="function"&&Object.getPrototypeOf(r)!==W.Array.prototype)?adaptarObj(r,W):r;
          if(args.some(a=>temBlob(a,0))) return (async()=>{ const a2=[]; for(const a of args) a2.push(typeof a==="function"?a:await paraRuntime(a,W)); return v.apply(obj,a2); })();
          return devolver(v.apply(obj,args.map(a=>typeof a==="function"?a:copiaW(a,W))));
        };
      },
      has(_,k){ return k in obj; }
    });
  }
  const memo={};
  function use(nome){
    const rt=runtime();
    if(!rt || !rt.use) return Promise.resolve(null);
    if(!memo[nome]) memo[nome]=rt.use(nome).then(x=>{
      const W=janelaRuntime();
      if(!x||W===window) return x;
      if(nome==="sample") return adaptarSample(x);
      return typeof x==="object"?adaptarObj(x,W):x;
    }).catch(()=>null);
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
  const estado={clientes:[],ccts:[],auditorias:[],funcionarios:[],pronto:{},erro:null,db:null};
  const ouvintes=new Set();
  let iniciado=null;
  function avisar(){ ouvintes.forEach(fn=>{ try{ fn(estado); }catch(e){ console.error(e); } }); }
  function conectar(){
    if(iniciado) return iniciado;
    iniciado=(async()=>{
      const db=await use("db");
      if(!db){ estado.erro="sem_base"; avisar(); return null; }
      estado.db=db;
      for(const col of ["clientes","ccts","auditorias","funcionarios"]){
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


  // ---------- cadastro de funcion\u00e1rios por cliente (documento funcionarios/{cnpj}) ----------
  // lista: [{codigo, nome, cargo, situacao, admissao, nascimento, horario:{seg..dom}, ferias_ini, ferias_fim,
  //          afast_ini, afast_fim, afast_tipo, rescisao, atualizado}]  (sem CPF, endere\u00e7o, sal\u00e1rio ou dados banc\u00e1rios)
  const chaveNome=s=>String(s??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().replace(/[^A-Z0-9 ]/g," ").replace(/\s+/g," ").trim();
  function assinarFuncionarios(cnpj,fn){
    let parar=null, vivo=true;
    conectar().then(db=>{
      if(!vivo) return;
      if(!db){ fn(null); return; }
      parar=db.doc("funcionarios/"+digitos(cnpj)).onSnapshot(s=>fn(s.exists?((s.data()||{}).lista||[]):[]),()=>fn(null));
    });
    return ()=>{ vivo=false; if(parar) parar(); };
  }
  // junta a lista atual com os funcion\u00e1rios lidos (mesmo c\u00f3digo ou mesmo nome); campos vazios n\u00e3o apagam o que j\u00e1 existe
  function mesclarFuncionarios(atual,novos){
    const out=(atual||[]).map(f=>({...f})), agora=new Date().toISOString();
    for(const n of novos||[]){
      let i=out.findIndex(f=>n.codigo&&f.codigo&&String(f.codigo)===String(n.codigo));
      if(i<0) i=out.findIndex(f=>chaveNome(f.nome)===chaveNome(n.nome));
      const base=i>=0?out[i]:{};
      const m={...base}; for(const [k,v] of Object.entries(n)){ if(v!==""&&v!=null&&!(typeof v==="object"&&!Object.values(v).some(Boolean))) m[k]=v; }
      m.atualizado=agora;
      if(i>=0) out[i]=m; else out.push(m);
    }
    return out.sort((a,b)=>(parseInt(a.codigo)||1e9)-(parseInt(b.codigo)||1e9)||String(a.nome).localeCompare(b.nome,"pt-BR"));
  }
  async function salvarFuncionarios(cnpj,lista){
    const db=await conectar(); if(!db) throw {code:"sem_base"};
    await db.doc("funcionarios/"+digitos(cnpj)).set({cnpj:digitos(cnpj),lista,...(await carimbo())});
  }
  // ---------- contrato de experiência (CLT arts. 443, 445 e 451) ----------
  // f.exp_dias1 = 1º período; f.exp_dias2 = prorrogação (0 = sem); total até 90 dias, uma prorrogação só.
  // f.exp_dec1: "prorrogar" | "efetivar" | "rescindir"; f.exp_dec2: "efetivar" | "rescindir".
  // O prazo conta o dia da admissão (admitido em 01/10 com 45 dias: termina em 14/11).
  const EXP_AVISO=7;
  const addDias=(iso,n)=>{ const d=new Date(iso+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
  const difDias=(a,b)=>Math.round((Date.parse(a+"T12:00:00Z")-Date.parse(b+"T12:00:00Z"))/864e5);
  function experiencia(f,ref){
    if(!ref){ const d=new Date(); ref=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
    if(!f||!f.admissao||(f.rescisao&&!f.exp_dec1&&!f.exp_dec2)) return null;
    const d1=parseInt(f.exp_dias1)||0, d2=parseInt(f.exp_dias2)||0;
    if(!d1) return null;   // ficha sem contrato de experi\u00eancia = contratado direto, por prazo indeterminado
    const fim1=addDias(f.admissao,d1-1), fim2=d2?addDias(fim1,d2):null, o={dias1:d1,dias2:d2,fim1,fim2,aviso:EXP_AVISO};
    if(d1+d2>90) o.erro="Experiência com mais de 90 dias no total (art. 445 da CLT): confira os prazos";
    const per=(fim,n,opc,dec)=>{
      if(dec==="rescindir") return {...o,fase:"rescindir",periodo:n,fim,nivel:difDias(fim,ref)>=0?"warn":"info",dias:difDias(fim,ref),texto:`Rescisão no fim da experiência em ${fmtData(fim)}`};
      if(dec==="efetivar") return {...o,fase:"efetivado",periodo:n,fim,nivel:null,texto:`Efetivado após a experiência (${fmtData(fim)})`};
      const dias=difDias(fim,ref);
      if(dias<0) return {...o,fase:"vencido",periodo:n,fim,dias,opcoes:opc.filter(a=>a!=="prorrogar"),nivel:"crit",   // prorrogar depois do vencimento n\u00e3o vale (art. 451)
        texto:n===1&&d2?`1º período venceu em ${fmtData(fim)} sem decisão registrada. Se não houve prorrogação assinada antes do vencimento e ele continuou trabalhando, o contrato virou por prazo indeterminado (art. 451 da CLT)`
                                 :`Experiência terminou em ${fmtData(fim)} sem decisão registrada. Se ele continuou trabalhando, o contrato já é por prazo indeterminado: registre como efetivado`};
      if(dias<=EXP_AVISO) return {...o,fase:"decidir",periodo:n,fim,dias,opcoes:opc,nivel:dias<=2?"crit":"warn",
        texto:`${n===1?(d2?"1º período":"Experiência"):"Prorrogação"} termina em ${fmtData(fim)} (${dias===0?"hoje":dias===1?"amanhã":"em "+dias+" dias"}): ${opc.includes("prorrogar")?"prorrogar, efetivar ou rescindir?":"efetivar ou rescindir?"}`};
      return {...o,fase:"curso",periodo:n,fim,dias,nivel:null,texto:`${n===1?(d2?"1º período":"Experiência"):"Prorrogação"} até ${fmtData(fim)}`};
    };
    if(f.exp_dec1!=="prorrogar") return per(fim1,1,d2?["prorrogar","efetivar","rescindir"]:["efetivar","rescindir"],f.exp_dec1);
    if(!d2) return {...o,fase:"curso",nivel:"warn",texto:"Prorrogação registrada sem prazo: informe os dias da prorrogação"};
    return per(fim2,2,["efetivar","rescindir"],f.exp_dec2);
  }
  // o que é devido no término normal do contrato de experiência (texto de orientação, não substitui o cálculo da rescisão)
  const EXP_RESCISAO=["Saldo de salário até o último dia do contrato","13º salário proporcional","Férias proporcionais + 1/3",
    "FGTS do mês; saque liberado no término do contrato a prazo, sem a multa de 40% (Lei 8.036/1990, art. 20, IX)","Não há aviso prévio no término no prazo",
    "Se a empresa encerrar ANTES do fim: indenização de metade da remuneração do tempo que faltava (art. 479), salvo cláusula assecuratória (art. 481, aí segue as regras do aviso prévio)",
    "Pagamento e entrega dos documentos até 10 dias após o término (art. 477, § 6º); desligamento no eSocial (S-2299) no mesmo prazo",
    "Avise o cliente antes do último dia: se o empregado trabalhar um dia a mais, o contrato vira por prazo indeterminado"];
  const funcAtivo=(f,ref)=>!(f.rescisao&&ref&&f.rescisao<ref)&&!/demit|rescind|deslig/i.test(f.situacao||"");

  window.FlowDados={use,imagemClaude,digitos,fmtCnpj,cnpjValido,raiz,hoje,isoData,fmtData,statusCct,ROTULO_CCT,compChave,
    REGIMES,SITUACOES,PONTO,ativo,pendencias,indices,conectar,assinar,estado,usuarioId,carimbo,
    chaveNome,assinarFuncionarios,mesclarFuncionarios,salvarFuncionarios,funcAtivo,experiencia,EXP_RESCISAO,EXP_AVISO,addDias};
})();
