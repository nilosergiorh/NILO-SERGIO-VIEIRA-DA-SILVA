/*
 * EXATO FLOW - documentos do contrato de trabalho (sem tela).
 *
 * montar(tipo, ctx) devolve {titulo, blocos, avisos, erros}; html(doc) e docx(doc, JSZip) geram a saída.
 * Os textos citam a base legal de cada cláusula. Cláusulas condicionadas (banco de horas, compensação,
 * prorrogação automática, cláusula assecuratória etc.) só entram quando escolhidas no modelo da empresa.
 * Percentuais da convenção não são fixados no texto: o contrato remete à CCT vigente e garante o mínimo legal,
 * para não ficar desatualizado quando a convenção muda.
 *
 * O texto-base deve ser validado uma vez por advogado trabalhista antes do uso.
 *
 * ctx = {emp:{nome,cnpj,endereco,cidade,uf,rep_nome,rep_cargo},
 *        func:{nome,cpf,ctps,endereco,nascimento,cargo,cbo,admissao,salario,horario:{seg..dom},exp1,exp2,resp_nome,resp_cpf},
 *        modelo:{local,pagamento_dia,compensacao,prorroga_auto,assecuratoria,desconto_dano,epi,uniforme,sigilo,imagem,ponto,extras:[]},
 *        cct:{ramo,reg,pmin,pref}, cidade, data}
 * Dados pessoais (CPF, CTPS, endereço, salário) entram só no documento: o Flow não os grava.
 */
(function(raiz){
  "use strict";
  const DIAS=[["seg","segunda-feira"],["ter","terça-feira"],["qua","quarta-feira"],["qui","quinta-feira"],["sex","sexta-feira"],["sab","sábado"],["dom","domingo"]];
  const brD=iso=>iso?String(iso).slice(0,10).split("-").reverse().join("/"):"____/____/______";
  const brl=v=>"R$ "+Number(v||0).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const addDias=(iso,n)=>{ const d=new Date(iso+"T12:00:00Z"); d.setUTCDate(d.getUTCDate()+n); return d.toISOString().slice(0,10); };
  const lacuna=(v,n)=>v&&String(v).trim()?String(v).trim():"_".repeat(n||24);
  const hm=s=>{ const m=String(s||"").match(/^(\d{1,2}):(\d{2})$/); return m?+m[1]*60+ +m[2]:null; };
  const fmtH=m=>Math.floor(m/60)+"h"+(m%60?String(m%60).padStart(2,"0"):"");
  function idade(nasc,ref){ const n=String(nasc||"").match(/^(\d{4})-(\d{2})-(\d{2})/), r=String(ref||"").match(/^(\d{4})-(\d{2})-(\d{2})/); if(!n||!r) return null; let a=+r[1]-+n[1]; if(+r[2]<+n[2]||(+r[2]===+n[2]&&+r[3]<+n[3])) a--; return a; }
  // "07:30-12:00 13:30-17:48" -> {txt, min, intervalo}
  function lerDia(h){
    const p=String(h||"").trim().split(/\s+/).filter(Boolean).map(x=>x.split("-").map(hm));
    if(!p.length||p.some(x=>x.length!==2||x[0]==null||x[1]==null)) return null;
    const min=p.reduce((t,[a,b])=>t+((b-a+1440)%1440),0), iv=p.length>1?p.slice(1).map((x,i)=>x[0]-p[i][1]):[];
    return {txt:String(h).trim().split(/\s+/).map(x=>x.replace("-"," às ")).join(" e "),min,intervalo:iv[0]||0};
  }
  function jornada(hor){
    const dias=DIAS.map(([k,n])=>({k,n,d:lerDia((hor||{})[k])})), trab=dias.filter(x=>x.d);
    const semana=trab.reduce((t,x)=>t+x.d.min,0);
    // agrupa dias com o mesmo horário: "de segunda a sexta-feira, das 07h30 às 12h e das 13h30 às 17h48"
    const grupos=[]; for(const x of trab){ const g=grupos[grupos.length-1]; if(g&&g.txt===x.d.txt&&DIAS.findIndex(d=>d[0]===x.k)===g.ult+1){ g.ate=x.n; g.ult++; } else grupos.push({de:x.n,ate:null,txt:x.d.txt,ult:DIAS.findIndex(d=>d[0]===x.k),d:x.d}); }
    const hh=t=>t.replace(/(\d{1,2}):(\d{2})/g,(m,a,b)=>`${+a}h${b==="00"?"":b}`);
    const plural=n=>n.replace(/^(\w+)-feira$/,"$1s-feiras").replace(/^(sábado|domingo)$/,"$1s");
    const txt=grupos.map(g=>`${g.ate?`de ${g.de} a ${g.ate}`:(/feira/.test(g.de)?"às ":"aos ")+plural(g.de)}, das ${hh(g.txt).replace(/ e /g," e das ")}`).join("; ");
    const maxDia=Math.max(0,...trab.map(x=>x.d.min)), minIv=Math.min(...trab.filter(x=>x.d.min>360).map(x=>x.d.intervalo||0),999);
    return {txt,semana,maxDia,minIv:minIv===999?null:minIv,dias:trab.length,sabado:!!trab.find(x=>x.k==="sab"),domingo:!!trab.find(x=>x.k==="dom")};
  }

  // ---------- validações comuns ----------
  function validar(tipo,ctx){
    const e=ctx.emp||{}, f=ctx.func||{}, m=ctx.modelo||{}, k=ctx.cct||{}, erros=[], avisos=[];
    const precisa=(v,rot)=>{ if(!v||!String(v).trim()) erros.push(`Falta ${rot}`); };
    precisa(e.nome,"a razão social do empregador"); precisa(e.cnpj,"o CNPJ do empregador"); precisa(e.endereco,"o endereço do empregador");
    precisa(f.nome,"o nome do empregado");
    if(tipo!=="vt"){ precisa(f.cargo,"o cargo"); precisa(f.admissao,"a data de admissão"); }
    if(tipo==="experiencia"||tipo==="indeterminado"){
      precisa(f.cpf,"o CPF do empregado"); precisa(f.endereco,"o endereço do empregado");
      if(!(f.salario>0)) erros.push("Falta o salário");
      const j=jornada(f.horario);
      if(!j.dias) erros.push("Falta o horário de trabalho do empregado (cadastro do funcionário)");
      else {
        if(j.semana>44*60&&m.compensacao==="nenhuma") erros.push(`Jornada de ${fmtH(j.semana)} por semana passa de 44h (CF, art. 7º, XIII) sem acordo de compensação`);
        if(j.maxDia>8*60&&(!m.compensacao||m.compensacao==="nenhuma")) avisos.push(`Há dia com ${fmtH(j.maxDia)} de trabalho: acima de 8h só com acordo de compensação (art. 59, § 2º e § 6º, CLT). Escolha a compensação no modelo da empresa`);
        if(j.minIv!=null&&j.minIv<60) erros.push("Intervalo para refeição menor que 1 hora em jornada acima de 6h (art. 71 da CLT)");
        if(j.domingo) avisos.push("Trabalho aos domingos: confira a autorização na CCT e a escala de revezamento (art. 67 e 68 da CLT; Lei 10.101/2000, art. 6º, no comércio)");
      }
      const piso=k.pref||k.pmin;
      if(f.salario>0&&k.pmin&&f.salario<k.pmin) erros.push(`Salário ${brl(f.salario)} abaixo do menor piso da CCT ${k.ramo||""} (${brl(k.pmin)})`);
      else if(f.salario>0&&k.pref&&f.salario<k.pref) avisos.push(`Salário ${brl(f.salario)} abaixo do piso após a experiência da CCT (${brl(k.pref)}): reajuste ao fim do período, salvo função com piso próprio`);
      if(!k.ramo) avisos.push("Cliente sem convenção coletiva no cadastro: o contrato sai sem a cláusula da CCT");
      if(piso==null&&k.ramo) avisos.push("CCT sem piso cadastrado no Painel Sindical: confira o piso da função");
    }
    if((tipo==="experiencia"||tipo==="indeterminado")&&f.admissao&&ctx.data&&ctx.data>f.admissao)
      avisos.push(`Assinatura (${ctx.data.split("-").reverse().join("/")}) depois da admissão (${f.admissao.split("-").reverse().join("/")}): o contrato deve ser assinado até o início do trabalho${tipo==="experiencia"?". Contrato de experiência assinado depois pode ser desconsiderado e o vínculo tratado como prazo indeterminado":""}`);
    if(tipo==="experiencia"||tipo==="prorrogacao"){
      const d1=+f.exp1||0, d2=+f.exp2||0;
      if(!d1) erros.push("Falta o prazo da experiência (1º período)");
      if(d1+d2>90) erros.push(`Experiência de ${d1+d2} dias passa do limite de 90 (art. 445, parágrafo único, CLT)`);
      if(tipo==="prorrogacao"&&!d2) erros.push("Falta o prazo da prorrogação");
    }
    if(tipo==="banco"&&m.compensacao==="banco_cct"&&!k.ramo) erros.push("Banco de horas anual exige previsão em convenção ou acordo coletivo (art. 59, § 2º, CLT)");
    const a=idade(f.nascimento,f.admissao||ctx.data);
    if(a!=null&&a<18){
      if(a<14) erros.push("Menor de 14 anos não pode ser contratado (CF, art. 7º, XXXIII)");
      else if(a<16&&!/aprendiz/i.test(f.cargo||"")) erros.push("Entre 14 e 16 anos, só como aprendiz (CF, art. 7º, XXXIII)");
      if(!f.resp_nome) erros.push("Empregado menor de 18 anos: informe o responsável legal, que assina junto");
      avisos.push("Menor de 18 anos: proibidos trabalho noturno, perigoso ou insalubre (CF, art. 7º, XXXIII; art. 405 da CLT) e hora extra, salvo compensação ou força maior (art. 413)");
    }
    return {erros,avisos};
  }

  // ---------- blocos ----------
  // {k:"titulo"|"sub"|"cl"|"p"|"item"|"assin"|"local"}, texto com **negrito**
  function partes(ctx){
    const e=ctx.emp||{}, f=ctx.func||{}, a=idade(f.nascimento,f.admissao||ctx.data);
    return [{k:"p",t:`**EMPREGADOR:** ${lacuna(e.nome)}, inscrito no CNPJ sob o nº ${lacuna(e.cnpj,18)}, com sede em ${lacuna(e.endereco,40)}${e.rep_nome?`, neste ato representado por ${e.rep_nome}${e.rep_cargo?", "+e.rep_cargo:""}`:""}.`},
      {k:"p",t:`**EMPREGADO(A):** ${lacuna(f.nome)}, portador(a) do CPF nº ${lacuna(f.cpf,14)}${f.ctps?`, CTPS ${f.ctps}`:", Carteira de Trabalho Digital"}, nascido(a) em ${brD(f.nascimento)}, residente em ${lacuna(f.endereco,40)}${a!=null&&a<18?`, assistido(a) por seu responsável legal ${lacuna(f.resp_nome)}, CPF ${lacuna(f.resp_cpf,14)}`:""}.`}];
  }
  function assinaturas(ctx){
    const e=ctx.emp||{}, f=ctx.func||{}, a=idade(f.nascimento,f.admissao||ctx.data), L=[{k:"local",t:`${lacuna(ctx.cidade||e.cidade,18)}${e.uf&&!ctx.cidade?"/"+e.uf:""}, ${brD(ctx.data)}.`},
      {k:"assin",t:`${e.nome||"EMPREGADOR"}${e.rep_nome?"\n"+e.rep_nome:""}`},{k:"assin",t:`${f.nome||"EMPREGADO(A)"}`}];
    if(a!=null&&a<18) L.push({k:"assin",t:`${f.resp_nome||"Responsável legal"}\nResponsável legal`});
    L.push({k:"assin2",t:"Testemunha 1\nNome / CPF||Testemunha 2\nNome / CPF"});
    return L;
  }
  function clausulasComuns(ctx,tipo){
    const f=ctx.func||{}, m=ctx.modelo||{}, k=ctx.cct||{}, j=jornada(f.horario), C=[];
    const cl=(tit,...ps)=>C.push({tit,ps});
    cl("Da função",`O(A) EMPREGADO(A) é admitido(a) para exercer a função de **${lacuna(f.cargo)}**${f.cbo?` (CBO ${f.cbo})`:""}, obrigando-se a executar as atividades inerentes ao cargo e todo e qualquer serviço compatível com a sua condição pessoal (art. 456, parágrafo único, da CLT).`);
    cl("Do local de trabalho",`Os serviços serão prestados em ${lacuna(m.local||(ctx.emp||{}).endereco,40)}. A transferência para outra localidade observará o art. 469 da CLT.`);
    cl("Da remuneração",`O(A) EMPREGADO(A) receberá salário mensal de **${f.salario>0?brl(f.salario):"R$ __________"}**, pago até o ${m.pagamento_dia?m.pagamento_dia+"º":"5º (quinto)"} dia útil do mês seguinte ao vencido (art. 459, § 1º, da CLT), mediante recibo ou depósito em conta.`,
      `Os reajustes serão os da convenção coletiva de trabalho aplicável ou os concedidos espontaneamente pelo EMPREGADOR.`);
    const comp={sabado:"As horas não trabalhadas aos sábados serão compensadas com o acréscimo nos demais dias da semana, nos termos do acordo de compensação firmado em separado (art. 59, § 6º, da CLT; Súmula 85 do TST), respeitado o limite de 10 horas diárias.",
      banco_semestral:"As horas excedentes poderão ser compensadas em banco de horas no período máximo de 6 (seis) meses, conforme acordo individual escrito firmado em separado (art. 59, § 5º, da CLT). Horas não compensadas no período serão pagas como extras.",
      banco_cct:"As horas excedentes poderão ser compensadas em banco de horas na forma e nos prazos previstos na convenção ou acordo coletivo vigente (art. 59, § 2º, da CLT).",
      mensal:"As horas excedentes poderão ser compensadas dentro do mesmo mês (art. 59, § 6º, da CLT), respeitado o limite de 10 horas diárias."}[m.compensacao];
    cl("Da jornada de trabalho",`A jornada será de **${fmtH(j.semana||0)} semanais**, ${j.txt||"no horário definido pelo EMPREGADOR"}, com intervalo para repouso e alimentação (art. 71 da CLT).`,
      ...(comp?[comp]:[]),
      `As horas extraordinárias, quando prestadas por determinação do EMPREGADOR, serão remuneradas com o adicional previsto na convenção coletiva aplicável, nunca inferior a 50% (cinquenta por cento) sobre a hora normal (CF, art. 7º, XVI), e o trabalho em domingos e feriados não compensados, conforme a convenção e a Lei 605/1949.`,
      `O trabalho entre as 22h e as 5h será remunerado com o adicional noturno previsto na convenção coletiva, nunca inferior a 20% (vinte por cento), com hora noturna de 52 minutos e 30 segundos (art. 73 da CLT).`,
      ...(m.ponto!==false?[`O(A) EMPREGADO(A) registrará diariamente os horários de entrada, saída e intervalos no controle de ponto adotado pelo EMPREGADOR (art. 74, § 2º, da CLT).`]:[]));
    const descontos=[`O EMPREGADOR poderá descontar do salário os valores previstos em lei, na convenção coletiva, os adiantamentos e o vale-transporte (até 6% do salário-base, Lei 7.418/1985), bem como os descontos autorizados por escrito pelo(a) EMPREGADO(A) (art. 462 da CLT; Súmula 342 do TST).`];
    if(m.desconto_dano!==false) descontos.push(`Em caso de dano causado pelo(a) EMPREGADO(A), o desconto será lícito quando houver dolo e, nos casos de culpa (negligência, imprudência ou imperícia), fica desde já acordado, nos termos do art. 462, § 1º, da CLT, após apuração e comunicação por escrito ao(à) EMPREGADO(A).`);
    cl("Dos descontos",...descontos);
    if(m.epi!==false||m.uniforme) cl("Da segurança e do uniforme",
      ...(m.epi!==false?[`O(A) EMPREGADO(A) obriga-se a usar os Equipamentos de Proteção Individual fornecidos gratuitamente pelo EMPREGADOR e a cumprir as normas de segurança e medicina do trabalho. A recusa injustificada constitui ato faltoso (art. 158, parágrafo único, da CLT; NR-6).`]:[]),
      ...(m.uniforme?[`O uso do uniforme fornecido pelo EMPREGADOR é obrigatório durante o trabalho. A higienização do uniforme é de responsabilidade do(a) EMPREGADO(A), salvo quando exigir procedimentos ou produtos diferentes dos de uso comum (art. 456-A da CLT).`]:[]));
    if(m.sigilo!==false) cl("Do sigilo e das normas internas",`O(A) EMPREGADO(A) obriga-se a cumprir o regulamento e as normas internas do EMPREGADOR e a manter sigilo sobre informações técnicas, comerciais e de clientes a que tiver acesso, durante e após o contrato. A violação de segredo da empresa constitui falta grave (art. 482, "g", da CLT).`);
    cl("Da proteção de dados pessoais",`O EMPREGADOR tratará os dados pessoais do(a) EMPREGADO(A) para a execução deste contrato e para o cumprimento de obrigações legais, trabalhistas, previdenciárias e fiscais, inclusive envio ao eSocial, à contabilidade e a operadoras de benefícios concedidos (Lei 13.709/2018, art. 7º, II e V). Dados de saúde, como atestados e exames ocupacionais, serão tratados apenas para essas finalidades (art. 11, II, "a"). O(A) EMPREGADO(A) poderá exercer os direitos do art. 18 da mesma lei.`);
    if(m.imagem) cl("Do uso de imagem",`O(A) EMPREGADO(A) autoriza, de forma gratuita, o uso de sua imagem em materiais institucionais do EMPREGADOR, durante o contrato, podendo revogar esta autorização a qualquer tempo, por escrito.`);
    if(k.ramo) cl("Da convenção coletiva",`Aplica-se a este contrato a convenção coletiva de trabalho da categoria (${k.ramo}${k.reg?", registro "+k.reg:""}) e as que vierem a substituí-la, cujas cláusulas prevalecem sobre este contrato quando mais favoráveis ou quando assim determinar a lei (arts. 611-A e 620 da CLT).`);
    for(const x of m.extras||[]) if(String(x||"").trim()) cl("Disposição específica da empresa",String(x).trim());
    return C;
  }
  const numerar=C=>C.flatMap((c,i)=>[{k:"cl",t:`CLÁUSULA ${i+1}ª – ${c.tit.toUpperCase()}`},...c.ps.map(p=>({k:"p",t:p}))]);

  function montar(tipo,ctx){
    ctx={...ctx,data:ctx.data||new Date().toISOString().slice(0,10)};
    const v=validar(tipo,ctx), f=ctx.func||{}, m=ctx.modelo||{}, e=ctx.emp||{};
    let titulo="", B=[];
    if(tipo==="experiencia"||tipo==="indeterminado"){
      const exp=tipo==="experiencia", d1=+f.exp1||0, d2=+f.exp2||0, fim1=f.admissao&&d1?addDias(f.admissao,d1-1):null, fim2=fim1&&d2?addDias(fim1,d2):null;
      titulo=exp?"Contrato de Trabalho por Prazo Determinado – Experiência":"Contrato Individual de Trabalho por Prazo Indeterminado";
      const C=clausulasComuns(ctx,tipo);
      const prazo={tit:exp?"Do prazo de experiência":"Do prazo",ps:exp?[
        `Este contrato é celebrado a título de experiência (art. 443, § 2º, "c", da CLT), pelo prazo de **${d1} (${extenso(d1)}) dias**, com início em **${brD(f.admissao)}** e término em **${brD(fim1)}**.`,
        ...(d2?[m.prorroga_auto!==false
          ?`Findo o prazo acima sem manifestação em contrário de qualquer das partes e permanecendo o(a) EMPREGADO(A) em serviço, este contrato fica **prorrogado uma única vez por mais ${d2} (${extenso(d2)}) dias**, até **${brD(fim2)}**, sem ultrapassar 90 dias no total (arts. 445, parágrafo único, e 451 da CLT).`
          :`Este contrato poderá ser prorrogado uma única vez, por até ${d2} (${extenso(d2)}) dias, mediante termo de prorrogação assinado pelas partes antes do término do prazo acima, sem ultrapassar 90 dias no total (arts. 445, parágrafo único, e 451 da CLT).`]:[]),
        `Continuando o(a) EMPREGADO(A) a trabalhar após o término da experiência${d2?" e de sua prorrogação":""}, o contrato passará a vigorar por prazo indeterminado (art. 451 da CLT).`,
        ...(m.assecuratoria
          ?[`Fica assegurado a ambas as partes o direito recíproco de rescindir este contrato antes do termo final; exercido esse direito, aplicam-se as regras da rescisão dos contratos por prazo indeterminado, inclusive o aviso prévio (art. 481 da CLT).`]
          :[`A rescisão antecipada sem justa causa obriga o EMPREGADOR a pagar indenização de metade da remuneração a que o(a) EMPREGADO(A) teria direito até o termo do contrato (art. 479 da CLT); se a iniciativa for do(a) EMPREGADO(A), ele(a) indenizará os prejuízos causados, até o mesmo limite (art. 480 da CLT).`])]
        :[`Este contrato vigora por prazo indeterminado a partir de **${brD(f.admissao)}**, sem contrato de experiência.`]};
      C.splice(1,0,prazo);
      B=[{k:"titulo",t:titulo.toUpperCase()},...partes(ctx),{k:"p",t:"As partes acima identificadas celebram o presente contrato de trabalho, que se regerá pelas cláusulas seguintes e pela legislação aplicável."},
        ...numerar(C),{k:"cl",t:`CLÁUSULA ${C.length+1}ª – DO FORO`},{k:"p",t:"As controvérsias decorrentes deste contrato serão resolvidas pela Justiça do Trabalho, observada a competência do local da prestação dos serviços (art. 651 da CLT)."},
        {k:"p",t:"E, por estarem de acordo, as partes assinam este contrato em 2 (duas) vias de igual teor, ficando uma com cada parte, na presença das testemunhas abaixo."},...assinaturas(ctx)];
    }
    else if(tipo==="prorrogacao"){
      const d1=+f.exp1||0, d2=+f.exp2||0, fim1=f.admissao&&d1?addDias(f.admissao,d1-1):null, fim2=fim1&&d2?addDias(fim1,d2):null;
      titulo="Termo de Prorrogação do Contrato de Experiência";
      if(fim1&&ctx.data>fim1) v.erros.push(`O termo precisa ser assinado até ${brD(fim1)}, último dia do 1º período: depois disso o contrato já é por prazo indeterminado (art. 451 da CLT)`);
      B=[{k:"titulo",t:titulo.toUpperCase()},...partes(ctx),
        {k:"p",t:`As partes resolvem **prorrogar** o contrato de trabalho a título de experiência firmado em ${brD(f.admissao)}, com término previsto para **${brD(fim1)}**, por mais **${d2} (${extenso(d2)}) dias**, passando a terminar em **${brD(fim2)}**, sem ultrapassar o limite de 90 dias (arts. 445, parágrafo único, e 451 da CLT).`},
        {k:"p",t:"Permanecem inalteradas as demais cláusulas do contrato de experiência."},...assinaturas(ctx)];
    }
    else if(tipo==="compensacao"||tipo==="banco"){
      const j=jornada(f.horario), banco=tipo==="banco";
      titulo=banco?"Acordo Individual de Banco de Horas":"Acordo Individual de Compensação de Horas";
      B=[{k:"titulo",t:titulo.toUpperCase()},...partes(ctx),
        ...(banco?[
          {k:"p",t:`As partes ajustam, nos termos do art. 59, § 5º, da CLT, que as horas trabalhadas além da jornada normal poderão ser compensadas com folgas ou redução de jornada no prazo máximo de **6 (seis) meses**, contado de cada hora acrescida.`},
          {k:"item",t:"O acréscimo de horas não poderá ultrapassar 2 (duas) horas diárias, respeitado o limite de 10 (dez) horas por dia (art. 59, caput e § 2º, da CLT)."},
          {k:"item",t:"O EMPREGADOR manterá controle do saldo de horas, com acesso do(a) EMPREGADO(A) ao extrato mensal."},
          {k:"item",t:"As horas não compensadas no prazo, ou o saldo existente na rescisão do contrato, serão pagas como horas extras, com o adicional da convenção coletiva, nunca inferior a 50% (art. 59, § 3º, da CLT)."},
          {k:"item",t:"Se a convenção ou o acordo coletivo da categoria dispuser de forma diferente sobre banco de horas, prevalecem as regras coletivas."}]
        :[
          {k:"p",t:`As partes ajustam, nos termos do art. 59, § 6º, da CLT e da Súmula 85 do TST, a compensação das horas não trabalhadas ${j.sabado?"":"aos sábados "}com o acréscimo de jornada nos demais dias, no horário: ${j.txt||"__________"}, totalizando **${fmtH(j.semana||0)} semanais**.`},
          {k:"item",t:"O acréscimo diário não poderá ultrapassar 2 (duas) horas, respeitado o limite de 10 (dez) horas por dia."},
          {k:"item",t:"As horas trabalhadas além do horário compensado serão pagas como extras, com o adicional da convenção coletiva, nunca inferior a 50%."},
          {k:"item",t:"Em atividade insalubre, a prorrogação depende de licença prévia da autoridade competente, salvo nas jornadas 12x36 (art. 60 da CLT), ou do que dispuser a convenção coletiva (art. 611-A, XIII)."}]),
        {k:"p",t:"Este acordo vigora por prazo indeterminado, podendo ser revogado por qualquer das partes mediante comunicação escrita com 30 dias de antecedência."},...assinaturas(ctx)];
    }
    else if(tipo==="vt"){
      titulo="Termo de Opção pelo Vale-Transporte";
      B=[{k:"titulo",t:titulo.toUpperCase()},...partes(ctx),
        {k:"p",t:"Nos termos da Lei 7.418/1985 e do Decreto 10.854/2021, declaro (marque uma opção):"},
        {k:"item",t:"(   ) **OPTO** pelo vale-transporte, autorizando o desconto de até 6% (seis por cento) do meu salário-base, e informo abaixo o trajeto residência–trabalho e retorno:"},
        {k:"p",t:"Meio de transporte / linha: ________________________________________   Quantidade por dia: ______   Valor da tarifa: R$ ______"},
        {k:"item",t:"(   ) **NÃO OPTO** pelo vale-transporte."},
        {k:"p",t:"Comprometo-me a atualizar estas informações sempre que mudar de endereço ou de trajeto, e declaro estar ciente de que a declaração falsa ou o uso indevido do benefício constituem falta grave (art. 482 da CLT)."},...assinaturas(ctx).filter(b=>b.k!=="assin2")];
    }
    else throw new Error("tipo de documento desconhecido: "+tipo);
    return {tipo,titulo,blocos:B,erros:v.erros,avisos:v.avisos};
  }
  function extenso(n){
    const u=["zero","um","dois","três","quatro","cinco","seis","sete","oito","nove","dez","onze","doze","treze","catorze","quinze","dezesseis","dezessete","dezoito","dezenove"],
      d=["","","vinte","trinta","quarenta","cinquenta","sessenta","setenta","oitenta","noventa"];
    n=+n||0; if(n<20) return u[n]; if(n<100) return d[Math.floor(n/10)]+(n%10?" e "+u[n%10]:""); return String(n);
  }

  // ---------- saída ----------
  const escH=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const negrito=s=>escH(s).replace(/\*\*(.+?)\*\*/g,"<b>$1</b>");
  function html(doc){
    return doc.blocos.map(b=>({titulo:`<h1>${negrito(b.t)}</h1>`,cl:`<h3>${negrito(b.t)}</h3>`,p:`<p>${negrito(b.t)}</p>`,item:`<p class="it">${negrito(b.t)}</p>`,local:`<p class="loc">${negrito(b.t)}</p>`,
      assin:`<div class="sig"><span></span>${negrito(b.t).replace(/\n/g,"<br>")}</div>`,assin2:`<div class="sig2">${b.t.split("||").map(x=>`<div class="sig"><span></span>${negrito(x).replace(/\n/g,"<br>")}</div>`).join("")}</div>`})[b.k]||"").join("\n");
  }
  // .docx mínimo (WordprocessingML) montado com JSZip: Arial 11, A4, margens de 2,5 cm
  const escX=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  function runs(t,base){ return String(t).split(/(\*\*.+?\*\*)/).filter(Boolean).map(x=>{ const b=/^\*\*.+\*\*$/.test(x), s=b?x.slice(2,-2):x;
    return `<w:r><w:rPr>${b||base?"<w:b/>":""}</w:rPr>${s.split("\n").map((l,i)=>(i?"<w:br/>":"")+`<w:t xml:space="preserve">${escX(l)}</w:t>`).join("")}</w:r>`; }).join(""); }
  const par=(t,{al="both",b=false,antes=0,depois=120,rec=0,keep=false}={})=>`<w:p><w:pPr>${keep?"<w:keepNext/>":""}<w:spacing w:before="${antes}" w:after="${depois}" w:line="300" w:lineRule="auto"/>${rec?`<w:ind w:left="${rec}"/>`:""}<w:jc w:val="${al}"/></w:pPr>${runs(t,b)}</w:p>`;
  function docxXml(doc){
    const body=doc.blocos.map(b=>{
      if(b.k==="titulo") return par(b.t,{al:"center",b:true,depois:360});
      if(b.k==="cl") return par(b.t,{b:true,antes:200,depois:80,keep:true,al:"left"});
      if(b.k==="item") return par(b.t,{rec:360});
      if(b.k==="local") return par(b.t,{al:"right",antes:360,depois:480});
      if(b.k==="assin") return par("_______________________________________\n"+b.t,{al:"center",antes:480,depois:120});
      if(b.k==="assin2") return b.t.split("||").map(x=>par("_______________________________________\n"+x,{al:"center",antes:480,depois:120})).join("");
      return par(b.t);
    }).join("");
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1418" w:right="1418" w:bottom="1418" w:left="1418" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  }
  async function docx(doc,JSZip){
    const z=new JSZip();
    z.file("[Content_Types].xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`);
    z.file("_rels/.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`);
    z.file("word/_rels/document.xml.rels",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
    z.file("word/styles.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="pt-BR"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`);
    z.file("docProps/core.xml",`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${escX(doc.titulo)}</dc:title><dc:creator>Exato Soluções Contábeis</dc:creator></cp:coreProperties>`);
    z.file("word/document.xml",docxXml(doc));
    return z.generateAsync({type:"blob",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  }

  const TIPOS=[["experiencia","Contrato de experiência"],["indeterminado","Contrato por prazo indeterminado (contratação direta)"],["prorrogacao","Termo de prorrogação da experiência"],["compensacao","Acordo de compensação de horas (sábado)"],["banco","Acordo de banco de horas (6 meses)"],["vt","Termo de opção pelo vale-transporte"]];
  const MODELO_PADRAO={local:"",pagamento_dia:5,compensacao:"nenhuma",prorroga_auto:true,assecuratoria:false,desconto_dano:true,epi:true,uniforme:false,sigilo:true,imagem:false,ponto:true,extras:[]};
  const API={TIPOS,MODELO_PADRAO,montar,validar,jornada,html,docx,docxXml,extenso};
  if(typeof module!=="undefined"&&module.exports) module.exports=API; else raiz.Contratos=API;
})(typeof window!=="undefined"?window:globalThis);
