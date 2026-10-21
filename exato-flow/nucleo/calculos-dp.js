/*
 * EXATO FLOW · Calculadoras de DP (independentes do cadastro de clientes).
 *
 * 1) simularSalario: salário base + insalubridade/periculosidade + horas extras (qualquer %)
 *    + adicional noturno + DSR sobre variáveis → bruto, INSS, IRRF, FGTS, líquido e custo.
 * 2) calcularRescisao: verbas por modalidade de desligamento, aviso proporcional (Lei 12.506),
 *    projeção do aviso nos avos, INSS/IRRF/FGTS por verba, FGTS do mês e multa rescisória.
 *
 * Usa as tabelas oficiais de FolhaAuditoria.TABELAS (INSS, IRRF com a redução da Lei 15.270,
 * FGTS e salário mínimo), as mesmas da Auditoria da folha.
 * Simulação: não substitui o TRCT; CCT, médias e estabilidades devem ser conferidas no caso real.
 */
(function(raiz){
  "use strict";
  const A=raiz.FolhaAuditoria||(typeof require==="function"?require("./folha-auditoria.js"):null);
  const r2=v=>Math.round((v+Number.EPSILON)*100)/100;
  const num=v=>{ if(typeof v==="number") return isFinite(v)?v:0; const s=String(v??"").replace(/[^\d,.-]/g,""); if(!s) return 0;
    const t=/,\d{1,2}$/.test(s)?s.replace(/\./g,"").replace(",","."):/^\d{1,3}(\.\d{3})+$/.test(s)?s.replace(/\./g,""):s.replace(/,/g,""); const x=parseFloat(t); return isFinite(x)?x:0; };

  // ---------- datas (AAAA-MM-DD, sem fuso) ----------
  const D=s=>{ const m=String(s||"").match(/^(\d{4})-(\d{2})-(\d{2})/); return m?{a:+m[1],m:+m[2],d:+m[3]}:null; };
  const iso=(a,m,d)=>{ const x=new Date(Date.UTC(a,m-1,d)); return x.toISOString().slice(0,10); };
  const addDias=(s,n)=>{ const x=new Date(s+"T00:00:00Z"); x.setUTCDate(x.getUTCDate()+n); return x.toISOString().slice(0,10); };
  const difDias=(a,b)=>Math.round((new Date(b+"T00:00:00Z")-new Date(a+"T00:00:00Z"))/864e5);
  const diasNoMes=(a,m)=>new Date(Date.UTC(a,m,0)).getUTCDate();
  const fmt=s=>s?s.split("-").reverse().join("/"):"—";
  // soma n anos/meses mantendo o dia (31/01 + 1 mês = 28 ou 29/02)
  function addMeses(s,n){ const x=D(s); let m=x.m-1+n, a=x.a+Math.floor(m/12); m=((m%12)+12)%12+1; return iso(a,m,Math.min(x.d,diasNoMes(a,m))); }
  function anosCompletos(ini,fim){ let n=0; while(addMeses(ini,12*(n+1))<=addDias(fim,1)) n++; return n; }
  // meses completos entre ini e fim (inclusive) e dias que sobram
  function mesesEDias(ini,fim){ let n=0; while(addMeses(ini,n+1)<=addDias(fim,1)) n++; return {meses:n,dias:difDias(addMeses(ini,n),fim)+1}; }

  // ---------- encargos do empregado ----------
  function irrf(rend,deducoesLegais,T,simplificadoPermitido){
    const simpl=simplificadoPermitido!==false&&deducoesLegais<T.irrf.simplificado;
    const ded=simpl?T.irrf.simplificado:deducoesLegais, base=Math.max(0,r2(rend-ded));
    const r=A.irrfMensal(base,rend,T);
    return {...r,base,ded,simpl};
  }

  // ---------- adicionais fixos (salário e rescisão) ----------
  // insalubridade: % do salário mínimo (Súmula Vinculante 4 do STF), salvo base maior prevista em CCT/contrato;
  // periculosidade: 30% do salário base (art. 193 §1º); não se acumulam (art. 193 §2º).
  // quebra de caixa: valor fixo ou % do salário; tem natureza salarial (Súmula 247 do TST).
  function adicionais(e,sal,T){
    const sm=T.salarioMinimo.valor, avisos=[];
    const g=num(e.insal&&e.insal.grau), bIns=e.insal&&e.insal.base;
    const baseIns=bIns==="salario"?sal:bIns==="valor"?num(e.insal.valorBase):sm;
    let insal=g?r2(baseIns*g/100):0, peric=e.peric?r2(sal*0.30):0;
    if(insal&&peric){ avisos.push("Insalubridade e periculosidade não se acumulam (art. 193 §2º da CLT): o empregado escolhe a mais vantajosa. Ficou a maior."); if(insal>peric) peric=0; else insal=0; }
    if(insal&&bIns!=="salario"&&bIns!=="valor") avisos.push(`Insalubridade sobre o salário mínimo (${A.brl(sm)}). Se a CCT ou o contrato prevê outra base, troque a base.`);
    const q=e.quebra||{}, qv=num(q.valor), quebra=qv?r2(q.tipo==="pct"?sal*qv/100:qv):0;
    const insTxt=g?`${g}% de ${bIns==="salario"?"salário base":bIns==="valor"?"base informada":"salário mínimo"}`:"";
    const qTxt=quebra?(q.tipo==="pct"?`${String(qv).replace(".",",")}% do salário`:"valor fixo"):"";
    return {insal,peric,quebra,avisos,insTxt,qTxt,grau:g};
  }

  // ---------- 1) salário ----------
  // e: {salario, horasMes, insal:{grau,base,valorBase}, peric, he:[{pct,horas}], noturno:{horas,pct}, comp:"AAAA-MM", feriados,
  //     outrosTrib:[{desc,valor}], naoTrib:[{desc,valor}], dependentes, pensao, vt:{usa,custo}, descontos:[{desc,valor}],
  //     regime:"simples"|"fora", rat, terceiros}
  function simularSalario(e,T){
    const sal=num(e.salario), hm=num(e.horasMes)||220, sm=T.salarioMinimo.valor;
    const ad=adicionais(e,sal,T), {insal,peric,quebra}=ad, avisos=[...ad.avisos];
    const vh=(sal+insal+peric)/hm;              // hora normal sobre salário + adicional (OJ 47 SDI-1 e Súmula 132 do TST); sem arredondar antes de multiplicar
    const he=(e.he||[]).filter(x=>num(x.horas)>0).map(x=>{ const p=num(x.pct), h=num(x.horas); return {pct:p,horas:h,valor:r2(h*vh*(1+p/100))}; });
    const noth=num(e.noturno&&e.noturno.horas), notp=num(e.noturno&&e.noturno.pct)||20, not=noth?r2(noth*vh*notp/100):0;
    // DSR sobre variáveis: variáveis ÷ dias úteis × domingos e feriados do mês (Lei 605/1949 art. 7º; Súmula 172 do TST)
    let dsr=0, dias=null; const variaveis=r2(he.reduce((s,x)=>s+x.valor,0)+not);
    if(variaveis&&e.comp&&/^\d{4}-\d{2}$/.test(e.comp)){
      const [a,m]=e.comp.split("-").map(Number), dm=diasNoMes(a,m); let dom=0;
      for(let d=1;d<=dm;d++) if(new Date(Date.UTC(a,m-1,d)).getUTCDay()===0) dom++;
      const fer=Math.max(0,num(e.feriados)), dsrD=dom+fer, ut=dm-dsrD;
      dias={uteis:ut,dsr:dsrD,domingos:dom,feriados:fer}; dsr=ut>0?r2(variaveis/ut*dsrD):0;
    }
    const outrosT=(e.outrosTrib||[]).filter(x=>num(x.valor)).map(x=>({desc:x.desc||"Outros proventos",valor:r2(num(x.valor))}));
    const naoT=(e.naoTrib||[]).filter(x=>num(x.valor)).map(x=>({desc:x.desc||"Verba indenizatória",valor:r2(num(x.valor))}));
    const baseTrib=r2(sal+insal+peric+quebra+variaveis+dsr+outrosT.reduce((s,x)=>s+x.valor,0));
    const bruto=r2(baseTrib+naoT.reduce((s,x)=>s+x.valor,0));
    const inss=e.semInss?0:A.inssEmpregado(baseTrib,T), dep=Math.max(0,parseInt(e.dependentes)||0), pen=r2(num(e.pensao));
    const ir=irrf(baseTrib,inss+dep*T.irrf.dependente+pen,T);
    let vt=0; if(e.vt&&e.vt.usa){ vt=r2(sal*0.06); const c=num(e.vt.custo); if(c>0) vt=Math.min(vt,c); }
    const desc=(e.descontos||[]).filter(x=>num(x.valor)).map(x=>({desc:x.desc||"Outros descontos",valor:r2(num(x.valor))}));
    const totDesc=r2(inss+ir.devido+pen+vt+desc.reduce((s,x)=>s+x.valor,0));
    const fgts=A.trunc(baseTrib*T.fgts.aliquota);
    // custo mensal para a empresa (estimativa): salário + FGTS + encargos patronais fora do Simples (20% + RAT×FAP + terceiros) + provisões de férias e 13º
    const fora=e.regime==="fora", pat=fora?r2(baseTrib*(0.20+num(e.rat)/100+num(e.terceiros)/100)):0;
    // provisões mensais: 13º = 1/12, férias = 1/12 e 1/3 de férias = 1/36 da remuneração; encargos (FGTS e, fora do Simples, INSS patronal) sobre elas
    const p13=r2(baseTrib/12), pFer=r2(baseTrib/12), pTer=r2(baseTrib/36), prov=r2(p13+pFer+pTer);
    const fgtsProv=r2(prov*T.fgts.aliquota), patProv=fora?r2(prov*(0.20+num(e.rat)/100+num(e.terceiros)/100)):0, provEnc=r2(fgtsProv+patProv);
    // provisão da multa de 40% do FGTS (só é paga na dispensa sem justa causa; Lei 8.036/1990, art. 18, § 1º): 40% do FGTS do mês e das provisões
    const multa40=r2((fgts+fgtsProv)*0.40);
    if(sal&&sal<sm*hm/220-0.005) avisos.push(`Salário abaixo do mínimo nacional proporcional a ${hm} h (${A.brl(r2(sm*hm/220))}).`);
    if(e.semInss) avisos.push("INSS não calculado (opção marcada): o IRRF foi calculado sem a dedução do INSS.");
    if(he.some(x=>x.pct<50)) avisos.push("Hora extra com adicional abaixo de 50% contraria a Constituição (art. 7º, XVI).");
    return {vh:r2(vh),insal,peric,quebra,insTxt:ad.insTxt,qTxt:ad.qTxt,he,noturno:{horas:noth,pct:notp,valor:not},dsr,dias,outrosT,naoT,baseTrib,bruto,inss,ir,dep,pen,vt,desc,totDesc,
      liquido:r2(bruto-totDesc),fgts,custo:{fgts,patronal:pat,provisoes:prov,p13,pFer,pTer,fgtsProv,patProv,encProv:provEnc,multa40,total:r2(bruto+fgts+pat+prov+provEnc+multa40)},avisos};
  }

  // ---------- 2) rescisão ----------
  const MOTIVOS={
    sem_justa:"Dispensa sem justa causa", indireta:"Rescisão indireta (art. 483)", pedido:"Pedido de demissão", justa:"Dispensa por justa causa (art. 482)",
    acordo:"Acordo entre as partes (art. 484-A)", termino:"Término do contrato de experiência / prazo determinado",
    antecipada_emp:"Rescisão antecipada do contrato a prazo pelo empregador (art. 479)", antecipada_func:"Rescisão antecipada do contrato a prazo pelo empregado (art. 480)",
  };
  // art. 130: dias de férias conforme as faltas injustificadas no período aquisitivo
  const diasFeriasPorFaltas=f=>f<=5?30:f<=14?24:f<=23?18:f<=32?12:0;
  // e: {salario, medias, admissao, saida, motivo, aviso ("indenizado"|"trabalhado"|"dispensado"|"nao_cumprido"), fimContrato,
  //     feriasVencidas, feriasDobro, faltas, adiant13, feriasPagas, semAviso, semSaldo, dependentes, pensao, saldoFgts, outrosProv, outrosDesc}
  function calcularRescisao(e,T){
    const sal=num(e.salario), med=num(e.medias), adm=e.admissao, sai=e.saida, mot=e.motivo, erros=[];
    const ad=adicionais(e,sal,T), fixo=r2(sal+ad.insal+ad.peric+ad.quebra), rem=r2(fixo+med), avisos=[...ad.avisos];
    if(!sal) erros.push("Informe o salário.");
    if(!D(adm)||!D(sai)) erros.push("Informe a admissão e o último dia trabalhado.");
    else if(sai<adm) erros.push("O desligamento é anterior à admissão.");
    if(!MOTIVOS[mot]) erros.push("Escolha o motivo do desligamento.");
    const aPrazo=["termino","antecipada_emp","antecipada_func"].includes(mot);
    if(aPrazo&&mot!=="termino"&&!D(e.fimContrato)) erros.push("Informe a data prevista para o fim do contrato a prazo.");
    if(erros.length) return {erros,avisos,verbas:[],descontos:[]};

    const anos=anosCompletos(adm,sai), tempo=mesesEDias(adm,sai);
    // aviso prévio: 30 dias + 3 por ano completo, até 90 (Lei 12.506/2011), só em favor do empregado
    const avisoProp=Math.min(90,30+3*anos);
    let diasInd=0, avisoTxt="", descAviso=0;
    const temAviso=["sem_justa","indireta","acordo"].includes(mot);
    if(e.semAviso&&(temAviso||mot==="pedido")){
      avisoTxt="Aviso prévio não calculado nesta simulação (opção marcada)";
      if(temAviso&&e.aviso!=="trabalhado"&&avisoProp) avisos.push(`Aviso não calculado: sem o aviso indenizado, a projeção de ${avisoProp} dias também não entrou nos avos de 13º e férias. Se o aviso for indenizado em outro documento, os avos podem aumentar.`);
    } else if(temAviso){
      if(e.aviso==="trabalhado"){ diasInd=avisoProp-30; avisoTxt=diasInd?`Aviso trabalhado de 30 dias; os ${diasInd} dias da proporcionalidade são indenizados`:"Aviso trabalhado de 30 dias"; }
      else { diasInd=avisoProp; avisoTxt=`Aviso indenizado de ${avisoProp} dias (30 + 3 × ${anos} ano(s))`; }
    } else if(mot==="pedido"){
      if(e.aviso==="nao_cumprido"){ descAviso=r2(rem); avisoTxt="Aviso não cumprido pelo empregado: desconto de 30 dias (art. 487 §2º)"; }
      else if(e.aviso==="dispensado") avisoTxt="Empregador dispensou o cumprimento do aviso: sem desconto";
      else avisoTxt="Aviso trabalhado pelo empregado (30 dias)";
    }
    const metade=mot==="acordo";
    const valAviso=diasInd?r2(rem/30*diasInd*(metade?0.5:1)):0;
    if(metade&&diasInd) avisoTxt+=" — pela metade no acordo (art. 484-A, I, a)";
    const proj=diasInd?addDias(sai,diasInd):sai;     // a projeção do aviso indenizado conta para 13º e férias (art. 487 §1º; OJ 82 SDI-1)

    // saldo de salário: dias do mês até o desligamento (mês comercial de 30 dias)
    const ds=D(sai), diasSaldo=Math.min(30,ds.d), saldo=r2(sal/30*diasSaldo);
    const verbas=[], descontos=[];
    const V=(cod,desc,ref,valor,inc,memoria)=>{ if(valor>0.004) verbas.push({cod,desc,ref,valor:r2(valor),inc,memoria}); };
    if(e.semSaldo) avisos.push("Saldo de salário não calculado (pago na folha do mês). O INSS e o IRRF desta simulação ficam só sobre as verbas daqui; no TRCT, o INSS do mês soma com o que já foi retido na folha.");
    else {
    V("saldo","Saldo de salário",`${diasSaldo} dia(s)`,saldo,{inss:1,ir:1,fgts:1},`${A.brl(sal)} ÷ 30 × ${diasSaldo}`);
    if(ad.insal) V("saldo_ins","Insalubridade (saldo)",`${diasSaldo} dia(s)`,ad.insal/30*diasSaldo,{inss:1,ir:1,fgts:1},`${A.brl(ad.insal)} (${ad.insTxt}) ÷ 30 × ${diasSaldo}`);
    if(ad.peric) V("saldo_per","Periculosidade (saldo)",`${diasSaldo} dia(s)`,ad.peric/30*diasSaldo,{inss:1,ir:1,fgts:1},`${A.brl(ad.peric)} (30% do salário) ÷ 30 × ${diasSaldo}`);
    if(ad.quebra) V("saldo_qc","Quebra de caixa (saldo)",`${diasSaldo} dia(s)`,ad.quebra/30*diasSaldo,{inss:1,ir:1,fgts:1},`${A.brl(ad.quebra)} (${ad.qTxt}) ÷ 30 × ${diasSaldo}`);
    }
    if(valAviso) V("aviso","Aviso prévio indenizado",`${diasInd} dia(s)${metade?" × 50%":""}`,valAviso,{fgts:1},`${A.brl(rem)} ÷ 30 × ${diasInd}${metade?" × 50%":""}`);

    // 13º proporcional: meses do ano com 15 dias ou mais trabalhados (Lei 4.090/1962), até a data projetada
    let avos13=0;
    if(mot!=="justa"){
      const p=D(proj), ini=adm>iso(p.a,1,1)?adm:iso(p.a,1,1), i=D(ini);
      for(let m=i.m;m<=p.m;m++){ const d1=m===i.m?i.d:1, d2=m===p.m?p.d:diasNoMes(p.a,m); if(d2-d1+1>=15) avos13++; }
    }
    const v13=r2(rem/12*avos13);
    V("13","13º salário proporcional",`${avos13}/12`,v13,{inss:1,ir13:1,fgts:1},`${A.brl(rem)} ÷ 12 × ${avos13}${diasInd?" (inclui a projeção do aviso até "+fmt(proj)+")":""}`);

    // férias: vencidas (+1/3), em dobro se o período concessivo passou (art. 137), proporcionais (+1/3) com redução por faltas (art. 130)
    const venc=Math.max(0,parseInt(e.feriasVencidas)||0), dobro=Math.min(venc,Math.max(0,parseInt(e.feriasDobro)||0));
    if(venc){
      const simples=venc-dobro;
      if(simples) V("fv","Férias vencidas",`${simples} período(s)`,rem*simples,{},`${A.brl(rem)} × ${simples}`);
      if(dobro) V("fvd","Férias vencidas em dobro (art. 137)",`${dobro} período(s)`,rem*2*dobro,{},`${A.brl(rem)} × 2 × ${dobro}`);
      V("fv13","1/3 sobre férias vencidas","1/3",rem*(simples+2*dobro)/3,{},`(${A.brl(rem)} × ${simples+2*dobro}) ÷ 3`);
    }
    let avosF=0, fatorF=1, periodoIni=adm;
    if(mot!=="justa"){       // justa causa não tem férias proporcionais (Súmula 171 do TST); pedido de demissão tem (Súmula 261)
      const k=anosCompletos(adm,proj); periodoIni=addMeses(adm,12*k);
      const md=mesesEDias(periodoIni,proj); avosF=Math.min(12,md.meses+(md.dias>=15?1:0));
      fatorF=diasFeriasPorFaltas(Math.max(0,parseInt(e.faltas)||0))/30;
    }
    const vfp=r2(rem/12*avosF*fatorF);
    V("fp","Férias proporcionais",`${avosF}/12${fatorF<1?` × ${Math.round(fatorF*30)}/30 dias`:""}`,vfp,{},`${A.brl(rem)} ÷ 12 × ${avosF}${fatorF<1?` × ${Math.round(fatorF*30)}/30 (faltas, art. 130)`:""} — período aquisitivo desde ${fmt(periodoIni)}`);
    V("fp13","1/3 sobre férias proporcionais","1/3",vfp/3,{},`${A.brl(vfp)} ÷ 3`);

    // contrato a prazo encerrado antes do fim
    let restantes=0;
    if(mot==="antecipada_emp"||mot==="antecipada_func"){ restantes=Math.max(0,difDias(sai,e.fimContrato)); }
    if(mot==="antecipada_emp") V("479","Indenização do art. 479 (metade dos dias restantes)",`${restantes} dia(s) ÷ 2`,rem/30*restantes/2,{},`${A.brl(rem)} ÷ 30 × ${restantes} ÷ 2`);
    if(mot==="antecipada_func"&&restantes) avisos.push(`Art. 480: a empresa pode descontar o prejuízo que comprovar, até ${A.brl(r2(rem/30*restantes/2))} (metade dos ${restantes} dias restantes). Não foi descontado.`);

    (e.outrosProv||[]).filter(x=>num(x.valor)).forEach(x=>V("outro",x.desc||"Outros proventos","",num(x.valor),{inss:1,ir:1,fgts:1},"informado"));

    // encargos: mês (saldo e outros) e 13º separados; aviso, férias indenizadas e art. 479 são isentos de INSS e IRRF
    const soma=f=>r2(verbas.filter(f).reduce((s,x)=>s+x.valor,0));
    const baseInss=soma(x=>x.inc.inss&&x.cod!=="13"), base13=soma(x=>x.cod==="13");
    const inss=e.semInss?0:A.inssEmpregado(baseInss,T), inss13=base13&&!e.semInss?A.inssEmpregado(base13,T):0;
    const dep=Math.max(0,parseInt(e.dependentes)||0), pen=r2(num(e.pensao));
    const ir=baseInss?irrf(baseInss,inss+dep*T.irrf.dependente+pen,T):null;
    const ir13=base13?irrf(base13,inss13+dep*T.irrf.dependente,T,false):null;   // 13º: tributação exclusiva, só deduções legais
    const Dd=(desc,ref,valor,memoria)=>{ if(valor>0.004) descontos.push({desc,ref,valor:r2(valor),memoria}); };
    Dd("INSS sobre saldo e outros",`base ${A.brl(baseInss)}`,inss,"tabela progressiva");
    Dd("INSS sobre 13º",`base ${A.brl(base13)}`,inss13,"tabela progressiva, cálculo à parte");
    if(ir) Dd("IRRF sobre saldo e outros",`base ${A.brl(ir.base)}`,ir.devido,`${A.brl(baseInss)} − ${ir.simpl?"desconto simplificado":"INSS e dependentes"} ${A.brl(ir.ded)}; tabela ${A.brl(ir.bruto)}${ir.reducao?" − redução Lei 15.270 "+A.brl(ir.reducao):""}`);
    if(ir13) Dd("IRRF sobre 13º",`base ${A.brl(ir13.base)}`,ir13.devido,`${A.brl(base13)} − INSS e dependentes ${A.brl(ir13.ded)}; tabela ${A.brl(ir13.bruto)}${ir13.reducao?" − redução Lei 15.270 "+A.brl(ir13.reducao)+" (confirmar aplicação ao 13º)":""}`);
    if(pen) Dd("Pensão alimentícia","",pen,"informada");
    const a13=num(e.adiant13), fPag=num(e.feriasPagas);
    Dd("13º salário já pago","",Math.min(a13,v13||a13),"valor informado (adiantamento / parcela já paga)");
    if(a13>v13+0.004&&v13) avisos.push(`O 13º já pago (${A.brl(a13)}) passa do 13º da rescisão (${A.brl(v13)}): o desconto ficou limitado a ${A.brl(v13)}. A diferença só pode ser descontada dentro do limite do art. 477 §5º; confira.`);
    const totFer=soma(x=>["fv","fvd","fv13","fp","fp13"].includes(x.cod));
    Dd("Férias já pagas","",fPag,"valor informado (férias pagas antecipadamente)");
    if(fPag&&fPag>totFer+0.004) avisos.push(`As férias já pagas (${A.brl(fPag)}) passam das férias desta rescisão (${A.brl(totFer)}). Confira se o desconto é cabível e o limite do art. 477 §5º.`);
    if(descAviso) Dd("Aviso prévio não cumprido (art. 487 §2º)","30 dias",descAviso,`${A.brl(rem)}`);
    (e.outrosDesc||[]).filter(x=>num(x.valor)).forEach(x=>Dd(x.desc||"Outros descontos","",num(x.valor),"informado"));

    const bruto=soma(()=>true), totDesc=r2(descontos.reduce((s,x)=>s+x.valor,0));
    let liquido=r2(bruto-totDesc);
    if(liquido<0){ avisos.push("Os descontos passam das verbas: o desconto na rescisão é limitado a um salário (art. 477 §5º). Confira."); }

    // FGTS: mês rescisório (saldo, aviso indenizado, 13º e outros) e multa sobre todos os depósitos do contrato
    const baseF=soma(x=>x.inc.fgts), fgtsMes=A.trunc(baseF*T.fgts.aliquota);
    const informado=num(e.saldoFgts)>0;
    const mesesContrato=tempo.meses+(tempo.dias>=15?1:0);
    const saldoF=informado?r2(num(e.saldoFgts)):r2(fixo*T.fgts.aliquota*mesesContrato*13/12);
    const pctMulta=["sem_justa","indireta","antecipada_emp"].includes(mot)?0.40:mot==="acordo"?0.20:0;
    const multa=r2((saldoF+fgtsMes)*pctMulta);
    const saque={sem_justa:1,indireta:1,antecipada_emp:1,termino:1,acordo:0.8}[mot]||0;
    const fgts={base:baseF,mes:fgtsMes,saldo:saldoF,saldoInformado:informado,mesesContrato,pctMulta,multa,
      saque:saque?r2((saldoF+fgtsMes)*saque+multa):0,baseEstimativa:fixo,saquePct:saque,guia:r2(fgtsMes+multa)};
    if(!informado) avisos.push(`Saldo do FGTS estimado (8% da remuneração fixa atual, ${A.brl(fixo)}, × ${mesesContrato} meses × 13/12). Para o valor certo da multa, use o saldo para fins rescisórios do extrato do FGTS Digital.`);
    if(e.semInss) avisos.push("INSS não calculado (opção marcada): o IRRF foi calculado sem a dedução do INSS. Use quando o INSS já foi retido em outra folha ou não se aplica ao caso.");
    if(fixo>sal) avisos.push(`Remuneração usada no aviso, no 13º e nas férias: ${A.brl(rem)} (salário${ad.insal?" + insalubridade":""}${ad.peric?" + periculosidade":""}${ad.quebra?" + quebra de caixa":""}${med?" + médias":""}).`);
    if(med) avisos.push("Médias de variáveis entram no aviso, nas férias e no 13º; o saldo de salário usa só o salário fixo (lance variáveis do mês em outros proventos).");
    if(["sem_justa","indireta"].includes(mot)) avisos.push("Seguro-desemprego: o empregado pode ter direito se cumprir a carência; o valor é calculado pelo Ministério do Trabalho.");
    if(mot==="justa") avisos.push("Justa causa: guarde as provas da falta grave e valide com o advogado antes de aplicar.");
    if(mot==="pedido"&&anos<1) avisos.push("Pedido de demissão com menos de 1 ano: as férias proporcionais são devidas (Súmula 261 do TST).");
    avisos.push("Antes de desligar, confira estabilidades: gestante, acidente de trabalho (12 meses), CIPA, dirigente sindical e garantias da CCT.");

    const prazo=addDias(sai,10);
    return {erros,avisos,motivo:MOTIVOS[mot],anos,tempo,avisoProp,diasInd,avisoTxt,proj,verbas,descontos,bruto,totDesc,liquido:Math.max(0,liquido),
      encargos:{inss,inss13,ir,ir13},fgts,prazo,custo:r2(bruto+fgts.guia),rem,adicionais:ad};
  }

  const API={simularSalario,calcularRescisao,MOTIVOS,diasFeriasPorFaltas,num,addDias,anosCompletos,mesesEDias};
  if(typeof module!=="undefined"&&module.exports) module.exports=API; else raiz.CalculosDP=API;
})(typeof window!=="undefined"?window:globalThis);
