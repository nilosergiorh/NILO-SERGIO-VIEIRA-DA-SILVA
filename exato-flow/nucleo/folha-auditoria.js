/*
 * EXATO FLOW - Auditoria da folha (sem tela).
 *
 * Recalcula os encargos do empregado a partir das bases do Extrato Mensal do Dominio
 * e confere a folha contra o ponto conferido no Flow e contra o piso da convencao.
 *
 * Tabelas por ano em TABELAS, cada uma com a fonte oficial. Antes de usar um ano novo,
 * confira os valores na fonte e inclua o ano aqui (nao se usa tabela de outro ano).
 *
 * Arredondamento: o Dominio trunca os centavos em cada faixa do INSS e no FGTS
 * (conferido nos extratos de 06 a 09/2026: 184,43 e 185,55 da Adrielle, 617,70 do Samuel).
 * As diferencas de ate R$ 0,05 sao tratadas como arredondamento.
 */
(function(raiz){
  "use strict";

  const TABELAS={
    2026:{
      inss:{faixas:[[1621.00,0.075],[2902.84,0.09],[4354.27,0.12],[8475.55,0.14]],teto:8475.55,
        fonte:"Portaria Interministerial MPS/MF nº 13, de 09/01/2026 (DOU 12/01/2026)"},
      irrf:{faixas:[[2428.80,0,0],[2826.65,0.075,182.16],[3751.05,0.15,394.16],[4664.68,0.225,675.49],[Infinity,0.275,908.73]],
        dependente:189.59,simplificado:607.20,
        reducao:{ate:5000.00,max:312.89,limite:7350.00,a:978.62,b:0.133145},
        fonte:"Receita Federal - Tributação de 2026 (tabela mensal e redução da Lei 15.270/2025)"},
      fgts:{aliquota:0.08,aprendiz:0.02,fonte:"Lei 8.036/1990, art. 15"},
      salarioMinimo:{valor:1621.00,fonte:"Decreto 12.797/2025"},
      salarioFamilia:{cota:67.54,limite:1980.38,fonte:"Portaria Interministerial MPS/MF nº 13/2026, art. 4º"},
      conferido:"2026-10-11"
    }
  };
  const TOL=0.05;
  const trunc=v=>Math.floor(Math.round(v*1000)/10)/100;   // trunca no centavo (o Math.round tira o ruído do ponto flutuante)
  const r2=v=>Math.round(v*100)/100;
  const tab=comp=>{ const a=+String(comp).slice(-4)||+String(comp).slice(0,4); return TABELAS[a]||null; };

  // INSS do empregado: progressivo por faixa, truncado em cada faixa, limitado ao teto
  function inssEmpregado(base,T){
    let ant=0, tot=0; const b=Math.min(base,T.inss.teto);
    for(const [lim,al] of T.inss.faixas){ if(b<=ant) break; tot+=trunc((Math.min(b,lim)-ant)*al); ant=lim; }
    return r2(tot);
  }
  // IRRF mensal: imposto da tabela sobre a base, menos a redução da Lei 15.270/2025 (sobre os rendimentos tributáveis), limitada ao imposto
  function irrfMensal(base,rendTrib,T){
    const f=T.irrf.faixas.find(([lim])=>base<=lim);
    const bruto=Math.max(0,r2(base*f[1]-f[2]));
    const R=T.irrf.reducao;
    let red=0;
    if(rendTrib<=R.ate) red=Math.min(bruto,R.max);
    else if(rendTrib<=R.limite) red=Math.max(0,Math.min(bruto,r2(R.a-R.b*rendTrib)));
    return {bruto,reducao:red,devido:r2(bruto-red)};
  }
  const soma=(w,cods)=>r2((w.eventos||[]).filter(e=>cods.includes(e.cod)).reduce((t,e)=>t+(e.tp==="D"?e.valor:-e.valor),0));
  const temEv=(w,cods)=>(w.eventos||[]).some(e=>cods.includes(e.cod));
  const COD={inss:["998"],inssFerias:["812","821","836"],irrf:["999"],irrfFerias:["942"],inss13:["989","826"],ferias:["3","931","937"],rescisao:["51","9179"]};

  // confere um empregado do extrato. Devolve itens {tipo, nivel ("ok"|"erro"|"atencao"|"nc"), msg, folha, calc, dif}
  function conferirEncargos(w,comp){
    const T=tab(comp), out=[];
    if(!T){ out.push({tipo:"tabelas",nivel:"nc",msg:`Tabelas de ${comp} ainda não cadastradas: confira na fonte oficial e inclua no Flow.`}); return out; }
    if(w.tipo!=="Empr"){ return out; }   // contribuinte (pró-labore) tem outra regra
    const ferias=temEv(w,COD.ferias)||temEv(w,COD.inssFerias), resc=temEv(w,COD.rescisao)||/demit/i.test(w.sit||"");
    // INSS: no mês com férias o Domínio divide o desconto em mais de uma rubrica; soma tudo e compara com a base total
    const inssFolha=soma(w,[...COD.inss,...COD.inssFerias]);
    if(w.baseInss>0 && !resc){
      const calc=inssEmpregado(w.baseInss,T), dif=r2(inssFolha-calc);
      out.push({tipo:"INSS",nivel:Math.abs(dif)<=TOL?"ok":"erro",folha:inssFolha,calc,dif,
        msg:`Base ${brl(w.baseInss)}${w.baseInss>T.inss.teto?" (acima do teto)":""}`});
    }
    // FGTS
    if(w.baseFgts>0&&resc) out.push({tipo:"FGTS",nivel:"nc",msg:"Rescisão no mês: o FGTS rescisório (aviso indenizado, 13º) tem base própria; conferir no TRCT"});
    else if(w.baseFgts>0){
      const al=/aprendiz/i.test(w.vinculo+" "+w.cargo)?T.fgts.aprendiz:T.fgts.aliquota, calc=trunc(w.baseFgts*al), dif=r2(w.valorFgts-calc);
      out.push({tipo:"FGTS",nivel:Math.abs(dif)<=TOL?"ok":"erro",folha:w.valorFgts,calc,dif,msg:`${(al*100).toFixed(0)}% sobre ${brl(w.baseFgts)}`});
    }
    // IRRF mensal (férias e rescisão têm cálculo próprio: ficam para conferência manual)
    const irFolha=soma(w,COD.irrf);
    if(ferias||resc){ if(irFolha||temEv(w,COD.irrfFerias)) out.push({tipo:"IRRF",nivel:"nc",msg:ferias?"Mês com férias: IRRF de férias é calculado à parte (conferir manualmente)":"Rescisão no mês: conferir o IRRF no TRCT"}); }
    else if(w.baseIrrf>=0 && w.baseInss>0){
      const rend=w.baseInss;                      // rendimentos tributáveis do mês (sem verbas indenizatórias)
      const ded=r2(rend-w.baseIrrf), inss=soma(w,COD.inss);
      let como="", deps=null;
      if(Math.abs(ded-T.irrf.simplificado)<=TOL) como="desconto simplificado";
      else { const k=(ded-inss)/T.irrf.dependente; if(Math.abs(k-Math.round(k))<0.01&&k>-0.01){ deps=Math.round(k); como=deps?`INSS + ${deps} dependente(s)`:"INSS"; } else como=`deduções de ${brl(ded)} (pensão ou outras)`; }
      const melhor=Math.max(inss+(deps||0)*T.irrf.dependente,T.irrf.simplificado);
      if(deps!=null||como==="desconto simplificado"){
        const dedUsada=ded; if(dedUsada+TOL<melhor) out.push({tipo:"IRRF",nivel:"atencao",msg:`Dedução usada ${brl(dedUsada)} menor que a mais vantajosa (${brl(melhor)})`});
      }
      const c=irrfMensal(w.baseIrrf,rend,T), dif=r2(irFolha-c.devido);
      out.push({tipo:"IRRF",nivel:Math.abs(dif)<=TOL?"ok":"erro",folha:irFolha,calc:c.devido,dif,
        msg:`Base ${brl(w.baseIrrf)} (${como})${c.reducao?`; redução Lei 15.270 de ${brl(c.reducao)}`:""}`});
    }
    return out;
  }
  const brl=v=>"R$ "+Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const hm=s=>{ const m=String(s||"").match(/^(\d{1,4}):(\d{2})$/); return m?+m[1]*60+ +m[2]:null; };
  const fmtH=m=>Math.floor(m/60)+":"+String(m%60).padStart(2,"0");
  const numBR=s=>parseFloat(String(s||"0").replace(/\./g,"").replace(",","."))||0;

  // ---------- Ponto x Folha ----------
  // linhas: TXT gerado no Flow (registro 10); regras: ponto_regras do cliente; workers: empregados do extrato da mesma competência
  function conferirPonto(workers,linhas,regras){
    const R=regras||{}, fmt=R.formato||"SEXAGESIMAL", out=[];
    const rubDias=R.falta&&R.falta.unidade==="dias"?String(R.falta.rub):null;
    const rubRS=new Set(((R.planilha&&R.planilha.valores)||[]).map(v=>String(v.rub)));
    const txt=new Map();   // "cod|rub" -> {tipo, valor}
    for(const l of linhas||[]){ if(!/^10\d{41}$/.test(l)) continue;
      const cod=String(+l.slice(2,12)), rub=String(+l.slice(18,22)), v=+l.slice(24,33);
      const tipo=rubRS.has(rub)?"rs":rub===rubDias?"dias":"horas";
      const val=tipo==="rs"?v/100:tipo==="dias"?v/100:(fmt==="CENTESIMAL"?Math.round(v*60/100):Math.floor(v/100)*60+v%100);
      txt.set(cod+"|"+rub,{cod,rub,tipo,val}); }
    const rubsTxt=new Set([...txt.values()].map(x=>x.rub));
    const fmtV=(t,v)=>t==="rs"?brl(v):t==="dias"?String(v).replace(".",",")+" dia(s)":fmtH(v);
    const porCod=new Map(workers.map(w=>[String(+w.id),w]));
    for(const x of txt.values()){
      const w=porCod.get(x.cod), ev=w&&(w.eventos||[]).find(e=>e.cod===x.rub);
      const nome=w?w.nome:"cód. "+x.cod;
      if(!w){ out.push({cod:x.cod,nome,rub:x.rub,nivel:"erro",ponto:fmtV(x.tipo,x.val),folha:"—",msg:"Funcionário do TXT não está na folha do mês (código errado ou demitido?)"}); continue; }
      if(!ev){ out.push({cod:x.cod,nome,rub:x.rub,nivel:"erro",ponto:fmtV(x.tipo,x.val),folha:"—",msg:"Lançamento do ponto não está na folha: o TXT foi importado?"}); continue; }
      const fv=x.tipo==="rs"?ev.valor:x.tipo==="dias"?numBR(ev.ref):hm(ev.ref);
      const ok=x.tipo==="horas"?fv===x.val:Math.abs(fv-x.val)<0.005;
      out.push({cod:x.cod,nome,rub:x.rub,nivel:ok?"ok":"erro",ponto:fmtV(x.tipo,x.val),folha:fv==null?ev.ref:fmtV(x.tipo,fv),msg:ok?"":"Valor na folha diferente do TXT conferido"});
    }
    // na folha e não no TXT: só para as rubricas que o ponto lança
    for(const w of workers) for(const e of w.eventos||[]){
      if(!rubsTxt.has(e.cod)||txt.has(String(+w.id)+"|"+e.cod)) continue;
      out.push({cod:String(+w.id),nome:w.nome,rub:e.cod,nivel:"atencao",ponto:"—",folha:e.ref&&e.ref!=="0,00"?e.ref:brl(e.valor),msg:"Na folha, mas não no TXT do ponto: lançado à mão? Confira o motivo"});
    }
    return out.sort((a,b)=>(+a.cod)-(+b.cod)||(+a.rub)-(+b.rub));
  }

  // ---------- Piso e reajuste da CCT ----------
  // cct: {ini, fim, pmin, pref, reaj, ramo}; pmin = menor piso (ingresso/experiência), pref = piso após a experiência
  function conferirPiso(w,cct,comp,exp){
    const out=[]; if(w.tipo!=="Empr") return out;
    const T=tab(comp), fimComp=fimDoMes(comp), hMes=w.horasMes||220, prop=hMes/220;
    if(/aprendiz/i.test(w.vinculo+" "+w.cargo)){ out.push({tipo:"Piso",nivel:"nc",msg:"Aprendiz: confira o piso do aprendiz na CCT"}); return out; }
    if(!w.salario){ return out; }
    const sm=T?r2(T.salarioMinimo.valor*prop):null;
    if(sm&&w.salario+TOL<sm) out.push({tipo:"Piso",nivel:"erro",folha:w.salario,calc:sm,dif:r2(w.salario-sm),msg:`Salário abaixo do mínimo nacional${prop<1?" proporcional a "+hMes+" h":""} (${T.salarioMinimo.fonte})`});
    if(!cct||!(cct.pmin||cct.pref)){ out.push({tipo:"Piso",nivel:"nc",msg:"Cliente sem CCT com piso cadastrado no Painel Sindical"}); return out; }
    const dias=w.adm?Math.round((Date.parse(fimComp)-Date.parse(w.adm))/864e5):999, ex=exp||90;
    const piso=dias>ex&&cct.pref?cct.pref:(cct.pmin||cct.pref), pp=r2(piso*prop);
    const venc=cct.fim&&cct.fim<comp.split("/").reverse().join("-")+"-01";
    const nome=dias>ex?`piso após ${ex} dias`:`piso de ingresso (até ${ex} dias)`;
    if(w.salario+TOL<pp) out.push({tipo:"Piso",nivel:dias>ex?"atencao":"erro",folha:w.salario,calc:pp,dif:r2(w.salario-pp),
      msg:`Salário abaixo do ${nome} da CCT ${cct.ramo||""}${prop<1?" proporcional a "+hMes+" h":""}${venc?" (CCT vencida em "+cct.fim.split("-").reverse().join("/")+": confira a nova)":""}. Confira se a função tem piso próprio`});
    else out.push({tipo:"Piso",nivel:"ok",folha:w.salario,calc:pp,dif:r2(w.salario-pp),msg:`${nome[0].toUpperCase()+nome.slice(1)}${venc?" (CCT vencida)":""}`});
    return out;
  }
  // reajuste na data-base: compara o salário do mês anterior à data-base com o do mês da data-base (ou o primeiro depois dela)
  // hist: [{comp:"MM/AAAA", salario}] do mesmo empregado, em qualquer ordem
  function conferirReajuste(hist,cct){
    hist=hist||[];
    if(!cct||!cct.ini||!cct.reaj) return null;
    const ord=hist.map(h=>({...h,k:h.comp.split("/").reverse().join("-")})).sort((a,b)=>a.k.localeCompare(b.k));
    const db=cct.ini.slice(0,7), antes=ord.filter(h=>h.k<db).pop(), depois=ord.find(h=>h.k>=db);
    if(!antes||!depois) return {nivel:"nc",msg:`Sem extrato de antes e depois da data-base (${db.split("-").reverse().join("/")}) para conferir o reajuste de ${(cct.reaj*100).toFixed(2).replace(".",",")}%`};
    const min=r2(antes.salario*(1+cct.reaj));
    return antes.salario&&depois.salario+TOL<min
      ? {nivel:"erro",folha:depois.salario,calc:min,dif:r2(depois.salario-min),msg:`Reajuste da data-base abaixo de ${(cct.reaj*100).toFixed(2).replace(".",",")}% (${brl(antes.salario)} em ${antes.comp})`}
      : {nivel:"ok",folha:depois.salario,calc:min,msg:`Reajuste de ${(cct.reaj*100).toFixed(2).replace(".",",")}% aplicado`};
  }
  // ---------- encargos da empresa (INSS patronal, RAT x FAP, Terceiros) ----------
  // sm: resumo do fim do Extrato (parseExtrato.summary); regime: cadastro do cliente (dp_regime), se preenchido
  function conferirPatronal(sm,regime){
    if(!sm) return null;
    const base=sm.scEmpr||0, pct=v=>base?v/base:0, al=[];
    const temPatronal=(sm.empresa||0)+(sm.rat||0)+(sm.terceiros||0)+(sm.contribuintes||0)>0;
    const simplesCad=/simples/i.test(regime||""), foraCad=regime&&!simplesCad&&!/mei/i.test(regime);
    const linhas=[
      {rot:"Empresa (cota patronal)",valor:sm.empresa||0,pct:pct(sm.empresa||0),esperado:"20% (Lei 8.212/1991, art. 22, I)"},
      {rot:"RAT ajustado (RAT × FAP)",valor:sm.rat||0,pct:pct(sm.rat||0),esperado:"RAT 1%, 2% ou 3% pelo CNAE × FAP do ano (0,5 a 2,0)"},
      {rot:"Terceiros (outras entidades)",valor:sm.terceiros||0,pct:pct(sm.terceiros||0),esperado:"conforme o FPAS (ex.: 5,8% indústria e comércio)"},
      {rot:"Adicional ao SENAI",valor:sm.senai||0,pct:pct(sm.senai||0),esperado:"0,2% quando aplicável (empresa industrial com mais de 500 empregados)"},
      {rot:"Contribuintes (20% sobre pró-labore)",valor:sm.contribuintes||0,pct:sm.scContr?(sm.contribuintes||0)/sm.scContr:0,base:sm.scContr||0,esperado:"20% sobre o pró-labore"}];
    if(temPatronal){
      const e=pct(sm.empresa||0);
      if(sm.empresa&&Math.abs(e-0.20)>0.002) al.push({nivel:"atencao",msg:`Cota patronal de ${(e*100).toFixed(2).replace(".",",")}% sobre a folha (esperado 20%): confira desoneração ou base`});
      const r=pct(sm.rat||0); if(sm.rat&&(r<0.005-0.0005||r>0.06+0.0005)) al.push({nivel:"erro",msg:`RAT ajustado de ${(r*100).toFixed(2).replace(".",",")}% fora do intervalo possível (0,5% a 6%)`});
      if(!sm.rat) al.push({nivel:"atencao",msg:"Empresa com cota patronal e sem RAT: confira o cadastro de RAT/FAP no Domínio"});
      if(simplesCad) al.push({nivel:"atencao",msg:"Cadastro diz Simples Nacional, mas a folha tem INSS patronal: confira se é Anexo IV"});
    } else if(foraCad) al.push({nivel:"erro",msg:`Cadastro diz ${regime}, mas a folha não tem INSS patronal (empresa, RAT, terceiros): confira o enquadramento no Domínio`});
    return {temPatronal,regimeDeduzido:temPatronal?(simplesCad?"Simples Nacional – Anexo IV (com cota patronal)":"Fora do Simples (com cota patronal)"):"Simples Nacional (sem cota patronal na folha)",base,linhas,alertas:al,total:sm.totalInss||0};
  }
  function fimDoMes(comp){ const [m,a]=comp.split("/").map(Number); return new Date(Date.UTC(a,m,0)).toISOString().slice(0,10); }


  const API={TABELAS,tab,trunc,inssEmpregado,irrfMensal,conferirEncargos,conferirPonto,conferirPiso,conferirReajuste,conferirPatronal,brl,hm,fmtH};
  if(typeof module!=="undefined"&&module.exports) module.exports=API; else raiz.FolhaAuditoria=API;
})(typeof window!=="undefined"?window:globalThis);
