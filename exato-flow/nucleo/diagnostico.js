/*
 * EXATO FLOW · Diagnóstico de DP (clientes novos e prospects).
 *
 * Lê as respostas da Ficha de Início (o código #EXATO-FICHA no fim do texto ou, nas fichas
 * antigas, os rótulos das perguntas) e aplica as regras de triagem: riscos priorizados com base
 * legal, pontos em ordem, nota de conformidade, estimativas em R$ quando há dado para isso,
 * plano de ação, perguntas para a reunião e documentos.
 *
 * É triagem, não parecer: o que depende de CCT, porte, regime ou documento fica como "Confirmar"
 * até o DP completar os dados do escritório (ctx.comp) ou marcar o item como resolvido.
 */
(function(){
  "use strict";

  // ---------- perguntas da ficha (id → rótulo); os rótulos das fichas antigas (v2) também servem de chave ----------
  const CAMPOS={
    razao:"Nome da empresa (como está no CNPJ)", cnpj:"CNPJ", atividade:"O que a empresa faz", cidade:"Em que cidade a empresa funciona",
    unidades:"Quantos endereços (lojas, fábricas, unidades) a empresa tem", resp:"Quem é o responsável pela empresa", resp_contato:"WhatsApp e e-mail do responsável",
    dp_interno:"Tem alguém que cuida dos funcionários no dia a dia (ponto, atestados, férias)", dp_interno_nome:"Nome e WhatsApp dessa pessoa",
    origem:"Quem faz a folha de pagamento hoje", competencia:"A partir de qual mês vamos começar",
    qt_clt:"Funcionários com carteira assinada", qt_aprendiz:"Jovens aprendizes", qt_estag:"Estagiários", qt_pj:"Pessoas que trabalham com CNPJ próprio (PJ / MEI)",
    qt_terc:"Pessoas de outra empresa (limpeza, segurança…)", qt_socios:"Sócios que trabalham na empresa", qt_free:"Freelancers ou diaristas eventuais",
    qt_mulheres:"Quantas mulheres trabalham na empresa", pj_horario:"As pessoas com CNPJ próprio cumprem horário fixo na empresa",
    registro:"Quando alguém novo começa, a carteira é assinada", experiencia:"Quem entra passa por contrato de experiência",
    afastado:"Tem alguém afastado agora (INSS, licença-maternidade, acidente)", afastado_quem:"Quem e por qual motivo",
    contratar:"Pensam em contratar ou desligar alguém nos próximos meses", contratar_det:"Conte um pouco: quantas pessoas, para quê, quando", cargos:"Quais funções existem na empresa",
    ambiente:"Alguém trabalha com algo que pode fazer mal à saúde ou com risco", ambiente_det:"Qual área e com o quê",
    motorista:"Tem motorista, vigia ou outra função bem diferente das demais", motorista_det:"Quais",
    exame:"Os funcionários fazem exame médico quando entram na empresa",
    escalas:"Em quais dias o pessoal trabalha", horario:"Qual o horário de entrada, almoço e saída", almoco:"Quanto tempo de almoço",
    ponto:"Como os funcionários marcam a entrada e a saída", ponto_sist:"Qual aplicativo ou marca do relógio",
    extra:"Quando alguém fica além do horário, o que acontece", extra_freq:"Isso acontece com que frequência",
    domingo:"Trabalham em domingos ou feriados", noite:"Alguém trabalha à noite, depois das 22h", noite_det:"Quem e até que horas",
    pgto:"Em que dia o salário é pago", adiant:"Paga um vale (adiantamento) no meio do mês", adiant_det:"Quanto e em que dia",
    menor_sal:"Qual o menor salário pago hoje, sem contar extras (R$)", variaveis:"Além do salário, alguém recebe", comissao:"Como funciona a comissão? Quem informa o valor todo mês",
    beneficios:"O que a empresa oferece", descontos:"Tem algum desconto fixo no salário de alguém",
    por_fora:"Alguém recebe parte do pagamento fora do holerite (dinheiro ou Pix à parte)",
    ferias_venc:"Tem funcionário com mais de um ano sem tirar férias", ferias_venc_qt:"Quantos funcionários",
    canal:"Como prefere mandar as informações do mês (faltas, atestados, horas)", envio_quem:"Quem vai mandar essas informações", envio_dia:"Até que dia do mês consegue mandar",
    holerite:"Como prefere entregar o holerite aos funcionários",
    processo:"A empresa tem processo trabalhista ou recebeu fiscalização do trabalho nos últimos 2 anos", processo_det:"O que aconteceu",
    preocupa:"Tem alguma coisa sobre os funcionários que hoje preocupa ou dá trabalho", duvidas:"Alguma dúvida ou pedido para a nossa primeira conversa",
  };
  const NUMEROS=["unidades","qt_clt","qt_aprendiz","qt_estag","qt_pj","qt_terc","qt_socios","qt_free","qt_mulheres","ferias_venc_qt"];
  const LISTAS=["escalas","variaveis","beneficios","canal","docs"];
  const OPCOES={
    escalas:["Segunda a sexta","Segunda a sábado","Dia sim, dia não (12 por 36)","Turnos que revezam","Meio período","Outro"],
    variaveis:["Comissão","Prêmio ou bônus","Gorjeta","Ajuda de custo","Nada além do salário"],
    beneficios:["Vale-transporte","Vale-alimentação ou refeição","Cesta básica","Plano de saúde","Plano odontológico","Seguro de vida","Nenhum"],
    canal:["WhatsApp","E-mail","Planilha que o escritório envia"],
  };
  const DOCS=["Contrato social da empresa","Lista dos funcionários com salário e data de admissão","Contratos de trabalho dos funcionários",
    "Folhas de pagamento ou holerites dos últimos 3 meses","Controle de férias de cada funcionário","Registros de ponto do último mês",
    "Exames médicos dos funcionários (ASO)","Convenção coletiva do sindicato","Contratos de estágio, PJ ou terceirizados","Atestados ou documentos de quem está afastado"];

  const n=x=>{ const v=parseInt(String(x??"").replace(/\D/g,""),10); return isFinite(v)?v:0; };
  // "2.329,40", "2329,40", "1.621", "1621.00" e "R$ 1.621" → número
  const reais=x=>{ const s=String(x??"").replace(/[^\d,.]/g,""); if(!s) return 0;
    const t=/,\d{1,2}$/.test(s)?s.replace(/\./g,"").replace(",","."):/^\d{1,3}(\.\d{3})+$/.test(s)?s.replace(/\./g,""):s.replace(/,/g,"");
    const v=parseFloat(t); return isFinite(v)?v:0; };
  const brl=v=>"R$ "+(Math.round(v*100)/100).toLocaleString("pt-BR",{minimumFractionDigits:2,maximumFractionDigits:2});
  const sem=s=>String(s||"").normalize("NFD").replace(/[̀-ͯ]/g,"").toLowerCase().replace(/[?:.…]+$/,"").replace(/\s+/g," ").trim();
  const tem=(a,x)=>Array.isArray(a)&&a.includes(x);

  // ---------- leitura ----------
  function b64(s){
    s=String(s).replace(/\s+/g,"");
    if(typeof atob==="function") return decodeURIComponent(Array.from(atob(s),c=>"%"+c.charCodeAt(0).toString(16).padStart(2,"0")).join(""));
    return Buffer.from(s,"base64").toString("utf8");
  }
  // ficha v3: "#EXATO-FICHA:<base64 de {ver,v}>" no fim do texto (sobrevive a e-mail e WhatsApp)
  function lerCodigo(txt){
    const m=String(txt||"").match(/#EXATO-FICHA:([A-Za-z0-9+/=\s]+?)(?:#FIM|$)/);
    if(!m) return null;
    try{ const o=JSON.parse(b64(m[1])); return o&&o.v?o.v:null; }catch(e){ return null; }
  }
  // fichas antigas: "- rótulo: valor" agrupado por "== ETAPA =="
  const POR_ROTULO=Object.fromEntries(Object.entries(CAMPOS).map(([id,l])=>[sem(l),id]));
  function lerRotulos(txt){
    const v={setores:[]}; let sec="";
    String(txt||"").split(/\r?\n/).forEach(raw=>{
      const l=raw.trim(), h=l.match(/^==\s*(.+?)\s*==$/); if(h){ sec=sem(h[1]); return; }
      if(!l.startsWith("- ")||sec==="ficou em duvida") return;
      const corpo=l.slice(2); let i=corpo.indexOf(": "); if(corpo.startsWith("Conte um pouco")) i=corpo.indexOf(": ",i+2);
      if(i<0) return;
      const k=corpo.slice(0,i).trim(), val=corpo.slice(i+2).trim();
      if(sec==="documentos"){ if(/^j[aá]/i.test(k)) v.docs=DOCS.filter(d=>val.includes(d)); return; }
      if(sec.startsWith("areas")&&/pessoa\(s\)/.test(val)){
        const p=val.split(" · "); v.setores.push({nome:k,qt:String(n(p[0])||""),horario:p.slice(1).filter(x=>x!=="trabalha à noite").join(" · "),noite:/trabalha à noite/.test(val)?"Sim":""}); return; }
      const id=POR_ROTULO[sem(k)]||(sem(k)==="quais"?"motorista_det":null);
      if(!id) return;
      if(LISTAS.includes(id)) v[id]=(OPCOES[id]||[]).filter(o=>val.includes(o));
      else v[id]=val;
    });
    return v;
  }
  function ler(txt){
    const c=lerCodigo(txt);
    const v=c||lerRotulos(txt);
    if(!Array.isArray(v.setores)) v.setores=[];
    v.setores=v.setores.filter(s=>s&&String(s.nome||"").trim());
    const naoSei=Object.keys(CAMPOS).filter(id=>v[id]==="Não sei").map(id=>CAMPOS[id]);
    const docs=Array.isArray(v.docs)?v.docs:[];
    return {v,origem:c?"codigo":"texto",naoSei,docsOk:DOCS.filter(d=>docs.includes(d)),docsFalta:DOCS.filter(d=>!docs.includes(d))};
  }

  // ---------- regras ----------
  // ctx.comp (dados que o DP completa): regime (REGIMES do Flow), porte ("ME/EPP" | "Demais"), cct {ramo,pmin,pref,fim,reg},
  // sal_medio (R$), processos ("Sim"|"Não"), obs. ctx.salMin = salário mínimo nacional vigente. ctx.hoje = "AAAA-MM-DD".
  function analisar(L,ctx){
    ctx=ctx||{}; const comp=ctx.comp||{}, v=L.v, I=[];
    const add=(id,p,area,t,resp,porque,fazer,lei,est)=>I.push({id,p,area,t,resp,porque,fazer,lei,est:est||null});
    const ok=(id,area,t,resp,porque)=>I.push({id,p:"ok",area,t,resp,porque,fazer:"",lei:"",est:null});
    const clt=n(v.qt_clt), apr=n(v.qt_aprendiz), est=n(v.qt_estag), pj=n(v.qt_pj), terc=n(v.qt_terc), soc=n(v.qt_socios), free=n(v.qt_free);
    const emp=clt+apr, unid=Math.max(1,n(v.unidades)), varios=n(v.unidades)>1;
    const meEpp=comp.porte==="ME/EPP", demais=comp.porte==="Demais";
    const salMin=ctx.salMin||0, menor=reais(v.menor_sal), salRef=reais(comp.sal_medio)||menor;
    const noturnoArea=v.setores.some(s=>s.noite==="Sim");

    // --- registro e contratação ---
    if(v.registro==="Alguns dias depois"||v.registro==="Só depois de um tempo"){
      const multa=meEpp?800:3000;
      add("registro","alta","Vínculo","Registro depois do início do trabalho",`Carteira assinada: ${v.registro}`,
        "O registro tem de existir antes do primeiro dia: a admissão vai ao eSocial até o dia anterior ao início. Trabalho antes do registro é empregado sem registro: multa por empregado na fiscalização e direitos do período (FGTS, INSS, férias, 13º).",
        "Passar a enviar os dados da admissão ao escritório antes do início. Levantar quem está hoje com data de início diferente da registrada e regularizar.",
        "CLT arts. 29, 41 e 47 · eSocial S-2200",
        {valor:multa,tipo:"por empregado",memoria:`Multa do art. 47 da CLT: ${brl(multa)} por empregado não registrado${meEpp?" (ME/EPP)":comp.porte?"":" (R$ 800 se ME/EPP)"}, dobrada na reincidência`});
    } else if(v.registro==="Antes ou no primeiro dia") ok("registro","Vínculo","Registro antes do início do trabalho",v.registro,"Admissão regular: evita multa por empregado sem registro.");
    else if(v.registro==="Não sei") add("registro","conf","Vínculo","Momento do registro a confirmar","Cliente respondeu “Não sei”","Trabalho antes do registro gera multa por empregado e passivo do período.","Comparar datas de admissão da folha com o início real de quem entrou nos últimos 12 meses.","CLT arts. 41 e 47");
    if(v.experiencia==="Não") add("experiencia","conf","Contratos","Contrato de experiência não usado",`Experiência: ${v.experiencia}`,
      "Sem experiência, o desligamento no início do contrato custa aviso prévio e multa de 40% do FGTS. Com contrato de experiência (até 90 dias), o término no prazo não tem aviso nem multa.",
      "Adotar o contrato de experiência nas próximas admissões (módulo Contratos do Flow).","CLT arts. 443 §2º, c, 445 e 479");
    else if(v.experiencia==="Sim") ok("experiencia","Contratos","Usa contrato de experiência",v.experiencia,"Reduz o custo de desligamento no início do contrato.");

    // --- jornada e ponto ---
    const ponto=v.ponto||"";
    const porEstab=varios?" (a regra vale por estabelecimento: confirme quantos trabalham em cada endereço)":"";
    if(ponto==="Não marcam"&&emp>20) add("ponto","alta","Jornada","Mais de 20 empregados sem registro de ponto",`${emp} empregados${varios?" em "+unid+" endereços":""} · ponto: ${ponto}`,
      "Registro de jornada é obrigatório acima de 20 trabalhadores por estabelecimento"+porEstab+". Sem ponto, a jornada alegada pelo empregado vale como verdadeira até prova em contrário.",
      "Implantar ponto (relógio, aplicativo homologado ou ponto por exceção previsto em acordo/CCT) antes da 1ª folha.","CLT art. 74 §2º · TST Súmula 338, I");
    else if(ponto==="Não marcam"&&emp>0) add("ponto","media","Jornada","Empresa sem controle de ponto",`${emp} empregados · ponto: ${ponto}`,
      "Dispensado até 20 trabalhadores por estabelecimento, mas a empresa fica sem prova em pedido de hora extra.","Recomendar controle simples (aplicativo).","CLT art. 74 §2º");
    if(ponto==="Caderno ou planilha") add("ponto",emp>20?"alta":"media","Jornada","Ponto manual em caderno ou planilha",`Ponto: ${ponto}${emp?` · ${emp} empregados`:""}`,
      "Marcações sempre iguais (“britânicas”) não valem como prova e invertem o ônus para a empresa.","Ver os espelhos do último mês. Avaliar migração para aplicativo de ponto.","TST Súmula 338, III · Portaria MTP 671/2021");
    if(ponto==="Relógio de ponto"||ponto==="Aplicativo no celular") ok("ponto","Jornada","Ponto eletrônico ou por aplicativo",`${ponto}${v.ponto_sist?" · "+v.ponto_sist:""}`,"Base de prova da jornada. Confira se o sistema atende a Portaria MTP 671/2021.");
    const extra=v.extra||"";
    if(extra&&extra!=="Quase nunca acontece"){
      if(/compensa|folga/i.test(extra)) add("compensacao","alta","Jornada","Compensação de horas sem acordo confirmado",`${extra}${v.extra_freq?" · "+v.extra_freq:""}`,
        "Banco de horas exige acordo escrito: individual (compensação em até 6 meses) ou coletivo (até 1 ano). Acordo tácito só vale para compensação no mesmo mês. Sem isso, as horas compensadas tendem a ser cobradas como extras.",
        "Pedir os acordos de compensação/banco de horas e o saldo por empregado. Conferir o que a CCT permite.","CLT art. 59 §§2º, 5º e 6º · art. 59-B");
      else ok("compensacao","Jornada","Horas extras pagas",extra,"Sem risco de banco de horas irregular. Confira o percentual da CCT.");
      if(v.extra_freq==="Quase todo dia") add("he_habitual","media","Custo","Hora extra habitual",`${extra} · ${v.extra_freq}`,
        "Limite de 2 horas extras por dia. Habitualidade gera reflexos em DSR, férias, 13º, FGTS e aviso prévio e aumenta o custo fixo.",
        "Levantar horas por pessoa no último trimestre e simular custo de hora extra x nova contratação.","CLT art. 59 · TST Súmulas 172 e 376");
    }
    const esc=v.escalas||[];
    if(tem(esc,"Dia sim, dia não (12 por 36)")) add("12x36","media","Jornada","Escala 12x36","Escala 12x36","Depende de acordo individual escrito ou de convenção/acordo coletivo.","Pedir o acordo e conferir a cláusula da CCT.","CLT art. 59-A");
    if(tem(esc,"Turnos que revezam")) add("revezamento","media","Jornada","Turnos de revezamento","Turnos que revezam","Turno ininterrupto de revezamento tem jornada de 6 horas, salvo negociação coletiva.","Verificar se há acordo coletivo autorizando 8 horas.","CF art. 7º, XIV · TST Súmula 423");
    if(v.domingo==="Sim, sempre"||v.domingo==="Às vezes") add("domingo",v.domingo==="Sim, sempre"?"media":"conf","Jornada","Trabalho em domingos e feriados",`Domingos/feriados: ${v.domingo}`,
      "Exige escala de revezamento com folga compensatória; no comércio, folga coincidindo com domingo ao menos uma vez a cada 3 semanas e feriado só se a CCT autorizar. Sem folga, paga em dobro.",
      "Pedir a escala e conferir a CCT.","Lei 605/1949 · Lei 10.101/2000 arts. 6º e 6º-A · TST Súmula 146");
    if(v.noite==="Sim"||noturnoArea) add("noturno","media","Folha","Trabalho noturno",v.noite==="Sim"?`Noite: ${v.noite_det||"sim"}`:"Área com trabalho noturno",
      "Adicional mínimo de 20% e hora reduzida de 52min30s entre 22h e 5h; a prorrogação depois das 5h também é noturna. A CCT pode prever percentual maior.",
      "Cadastrar adicional noturno e hora reduzida; conferir o percentual da CCT.","CLT art. 73 · TST Súmula 60");
    if(v.almoco==="15 min"||v.almoco==="30 min") add("intervalo","media","Jornada","Intervalo de almoço curto",`Almoço: ${v.almoco}`,
      "Acima de 6 horas de jornada o intervalo mínimo é de 1 hora; redução para 30 minutos só com acordo ou convenção coletiva. Intervalo suprimido é pago com 50% sobre o tempo não concedido.",
      "Confirmar a jornada de quem tem esse intervalo e se há previsão coletiva.","CLT arts. 71 §4º e 611-A, III");
    else if(["1 hora","1h30","2 horas"].includes(v.almoco)) ok("intervalo","Jornada","Intervalo de almoço regular",`Almoço: ${v.almoco}`,"Dentro do mínimo legal para jornada acima de 6 horas (até 2 horas).");

    // --- saúde e segurança ---
    if(v.ambiente==="Sim") add("risco","alta","SST","Possível insalubridade ou periculosidade",v.ambiente_det||"Sim",
      "O adicional (insalubridade 10/20/40% do salário mínimo; periculosidade 30% do salário-base) depende de laudo. Também afeta o eSocial (S-2240) e a aposentadoria especial.",
      "Pedir PGR, PCMSO e LTCAT. Se não houver, indicar empresa de SST antes de definir adicional.","CLT arts. 189 a 193 · NR-15 · NR-16");
    else if(v.ambiente==="Não sei") add("risco","conf","SST","Exposição a risco a confirmar","Cliente respondeu “Não sei”",
      "Sem laudo não há base para pagar nem para dispensar adicional, e o evento S-2240 do eSocial exige essa informação.","Pedir PGR/LTCAT; se não existirem, encaminhar para SST.","NR-1 · NR-9 · NR-15");
    if(v.exame==="Não"||v.exame==="Às vezes") add("aso",v.exame==="Não"?"alta":"media","SST","Exame admissional não feito sempre",`Exame na admissão: ${v.exame}`,
      "O exame médico admissional é obrigatório antes do início das atividades, e os periódicos e demissional também. Os ASOs alimentam o eSocial (S-2220) e são a primeira coisa pedida em fiscalização.",
      "Contratar ou conferir a clínica de medicina do trabalho e regularizar os ASOs em atraso.","CLT art. 168 · NR-7");
    else if(v.exame==="Sim, sempre") ok("aso","SST","Exame admissional feito",v.exame,"Confirme também periódicos, demissional e o PCMSO vigente.");
    add("sst","conf","SST","Programas de SST (PGR, PCMSO) e CIPA","Não perguntado diretamente",
      "PGR e PCMSO são obrigatórios e alimentam o eSocial; ME/EPP de grau de risco 1 e 2 podem ter tratamento diferenciado. A CIPA é dimensionada pelo grau de risco e número de empregados; abaixo do quadro, a NR-5 pede um representante nomeado.",
      "Pedir PGR, PCMSO e documentação da CIPA ou do representante.","NR-1 · NR-5 · NR-7");
    if(v.motorista==="Sim") add("diferenciada","media","Sindical","Possível categoria diferenciada",v.motorista_det||"Sim",
      "Motoristas, vigilantes e outras categorias diferenciadas seguem CCT própria (piso, jornada, benefícios). Motorista profissional tem regras próprias de jornada e tempo de espera.",
      "Enquadrar cada função no sindicato correto antes da 1ª folha.","CLT art. 511 §3º · Lei 13.103/2015");
    const mulheres=v.qt_mulheres==="30 ou mais"?30:/^\d+$/.test(String(v.qt_mulheres||"").trim())?n(v.qt_mulheres):0;
    if(mulheres>=30) add("creche","media","Benefícios","Local para amamentação ou reembolso-creche",`${mulheres} mulheres${varios?" em "+unid+" endereços":""}`,
      "Estabelecimento com pelo menos 30 mulheres com mais de 16 anos precisa ter local para guarda dos filhos no período de amamentação, ou convênio com creche; o reembolso-creche substitui se previsto em acordo ou convenção.",
      "Confirmar quantas mulheres por estabelecimento e o que a CCT prevê.","CLT art. 389 §§1º e 2º");

    // --- vínculos ---
    if(pj>0){
      const h=v.pj_horario;
      if(h==="Sim"||h==="Algumas") add("pj","alta","Vínculo","PJ com características de empregado",`${pj} PJ/MEI · horário fixo: ${h}`,
        "Pessoalidade, habitualidade, pagamento e subordinação caracterizam vínculo de emprego, qualquer que seja o contrato. É uma das maiores fontes de passivo.",
        "Levantar contratos, notas e rotina de cada PJ. Avaliar o registro com cálculo de custo.","CLT arts. 2º, 3º e 9º");
      else add("pj","media","Vínculo","Prestadores PJ",`${pj} PJ/MEI`,"Sem horário fixo o risco cai, mas subordinação e exclusividade ainda podem caracterizar vínculo.","Revisar contratos e forma de trabalho.","CLT art. 3º");
    }
    if(free>0) add("freelancer","media","Vínculo","Freelancers e diaristas eventuais",`${free} pessoa(s)`,
      "Trabalho repetido em dias fixos tende a caracterizar vínculo. Pagamento a autônomo exige RPA com INSS (11% retido e patronal conforme o regime) e eSocial (S-1200).",
      "Entender a frequência de cada um e formalizar por RPA ou registro (intermitente ou temporário).","CLT art. 3º · Lei 8.212/1991 art. 22, III");
    if(terc>0) add("terceiros","media","Vínculo","Terceirizados",`${terc} pessoa(s)`,"A tomadora responde de forma subsidiária pelas verbas trabalhistas e previdenciárias dos terceirizados.",
      "Pedir o contrato e exigir todo mês as guias de FGTS/INSS e a folha da prestadora.","Lei 6.019/1974 art. 5º-A §5º · TST Súmula 331");
    if(est>0) add("estagio","media","Vínculo","Estagiários",`${est} estagiário(s)`,"Exige termo de compromisso com a instituição de ensino, seguro de acidentes, jornada de até 6h/30h semanais e recesso. Sem isso, vira vínculo de emprego.",
      "Pedir os termos de compromisso, a apólice e o controle de jornada.","Lei 11.788/2008 arts. 3º, 9º, 10 e 13");
    if(apr>0) add("aprendiz","conf","Vínculo","Jovem aprendiz",`${apr} aprendiz(es)`,"Contrato especial com matrícula em programa de aprendizagem, jornada limitada e FGTS de 2%.","Pedir contrato e comprovante de matrícula.","CLT arts. 428 a 433");
    if(emp>=7&&!meEpp) add("cota_aprendiz",demais?"media":"conf","Cotas","Cota de aprendizes",`${emp} empregados${demais?" · empresa fora de ME/EPP":""}`,
      "Cota de 5% a 15% das funções que exigem formação profissional (base pela CBO), por estabelecimento. Microempresa e EPP são dispensadas.",
      demais?"Calcular a base pelas funções e programar as contratações.":"Confirmar o porte (ME/EPP) e calcular a base pelas funções.","CLT art. 429 · LC 123/2006 art. 51, III");
    if(emp>=100){ const pct=emp>1000?5:emp>500?4:emp>200?3:2;
      add("cota_pcd","alta","Cotas","Cota de PcD",`${emp} empregados`,`Empresas com 100 ou mais empregados devem preencher de 2% a 5% dos cargos com reabilitados ou PcD; nesta faixa, ${pct}% (${Math.ceil(emp*pct/100)} pessoas).`,
        "Levantar PcD/reabilitados no quadro.","Lei 8.213/1991 art. 93"); }
    if(soc>0) add("prolabore","conf","Folha","Pró-labore dos sócios",`${soc} sócio(s) trabalhando`,
      "Sócio que trabalha deve ter pró-labore com INSS de 11% retido. O patronal de 20% depende do regime (no Simples, anexos I a III e V já estão no DAS; o anexo IV recolhe à parte).",
      "Confirmar o regime e o valor do pró-labore.","Lei 8.212/1991 arts. 21 e 22 · LC 123/2006 art. 18 §5º-C");

    // --- eventos ---
    if(v.afastado==="Sim") add("afastado","media","Eventos","Empregado afastado",v.afastado_quem||"Sim",
      "Exige controle de retorno e das estabilidades: acidente (12 meses após o retorno) e gestante (até 5 meses após o parto). Evento S-2230 no eSocial.",
      "Pedir atestados, CAT ou certidão e datas. Agendar retorno e exame de retorno ao trabalho.","Lei 8.213/1991 art. 118 · ADCT art. 10, II, b · NR-7");
    if(v.contratar&&v.contratar!=="Não"){ const det=v.contratar_det||"";
      add("movimento",/tempor/i.test(det)?"media":"conf","Eventos","Movimentação prevista",`${v.contratar}${det?" · "+det:""}`,
        "Admissão vai ao eSocial até o dia anterior ao início. Rescisão é paga em até 10 dias do término. Temporário só por empresa de trabalho temporário.",
        "Combinar o prazo de envio dos dados de admissão e o fluxo de desligamento.","CLT art. 477 §6º · Lei 6.019/1974 · eSocial S-2200/S-2299"); }

    // --- remuneração ---
    if(menor>0){
      const k=comp.cct&&(comp.cct.pmin||comp.cct.pref)?comp.cct:null, piso=k?(k.pmin||k.pref):0;
      if(salMin&&menor<salMin) add("salario_min","alta","Folha","Salário abaixo do mínimo nacional",`Menor salário: ${brl(menor)} · mínimo: ${brl(salMin)}`,
        "Nenhum empregado de jornada integral pode receber menos que o salário mínimo (proporcional só em jornada parcial).",
        "Confirmar se é jornada parcial; se não, corrigir já na 1ª folha e calcular as diferenças.","CF art. 7º, IV · CLT art. 76",
        {valor:(salMin-menor),tipo:"por empregado/mês",memoria:`${brl(salMin)} − ${brl(menor)}`});
      else if(piso&&menor<piso) add("piso","alta","Folha","Salário abaixo do piso da CCT",`Menor salário: ${brl(menor)} · piso ${k.ramo||""}: ${brl(piso)}`,
        "O piso da convenção é o mínimo da categoria; pagar menos gera diferenças com reflexos em férias, 13º, FGTS e horas extras.",
        "Conferir a função (algumas CCTs têm pisos por cargo) e corrigir na 1ª folha.","CLT arts. 611 e 619 · CCT "+(k.reg||k.ramo||""),
        {valor:piso-menor,tipo:"por empregado/mês",memoria:`${brl(piso)} − ${brl(menor)} (menor piso da CCT)`});
      else if(piso) ok("piso","Folha","Menor salário dentro do piso da CCT",`${brl(menor)} ≥ ${brl(piso)}`,"Confira os pisos por função na CCT.");
      else if(salMin) ok("salario_min","Folha","Menor salário acima do mínimo nacional",`${brl(menor)} ≥ ${brl(salMin)}`,"Falta comparar com o piso da CCT: escolha a convenção nos dados do escritório.");
    }
    if(v.por_fora==="Sim") add("por_fora","alta","Folha","Pagamento fora do holerite",`Por fora: ${v.por_fora}`,
      "Valor pago fora da folha é salário: gera diferenças de FGTS, INSS, férias, 13º e horas extras e risco fiscal e previdenciário.",
      "Quantificar por empregado e propor regularização gradual (incorporação ao salário ou rubrica correta).","CLT art. 457 · Lei 8.036/1990 art. 15 · Lei 8.212/1991 art. 28");
    else if(v.por_fora==="Não") ok("por_fora","Folha","Tudo pago no holerite",v.por_fora,"Sem passivo de pagamento por fora.");
    else if(v.por_fora==="Não sei") add("por_fora","conf","Folha","Pagamento fora do holerite a confirmar","Cliente respondeu “Não sei”","Pagamento por fora é a origem mais comum de diferenças de FGTS e INSS.","Perguntar na reunião com cuidado e comparar extrato bancário x folha.","CLT art. 457");
    const fv=n(v.ferias_venc_qt);
    if(v.ferias_venc==="Sim"){
      const e=salRef?{valor:(fv||1)*salRef*4/3,tipo:fv?"total estimado":"por empregado",memoria:`${fv||1} × (${brl(salRef)} + 1/3) — ${comp.sal_medio?"salário médio informado":"base: menor salário (estimativa mínima)"}`}:null;
      add("ferias","alta","Férias","Férias vencidas",`${fv?fv+" funcionário(s)":"Sim"} com mais de um ano sem férias`,
        "Férias concedidas depois do período concessivo (12 meses após o período aquisitivo) são pagas em dobro.","Pedir o controle de férias e programar a concessão dos períodos vencidos já no 1º mês.","CLT arts. 134 e 137",e);
    } else if(v.ferias_venc==="Não") ok("ferias","Férias","Férias em dia",v.ferias_venc,"Sem risco de dobra; confira no controle de férias que chegar.");
    else if(v.ferias_venc==="Não sei") add("ferias","conf","Férias","Férias vencidas a confirmar","Cliente respondeu “Não sei”","Férias fora do prazo são pagas em dobro.","Pedir o controle de férias de cada funcionário.","CLT arts. 134 e 137");
    const varr=v.variaveis||[];
    if(tem(varr,"Comissão")) add("comissao","media","Folha","Comissões",v.comissao||"Comissão","Comissão integra o salário: gera DSR sobre comissões e entra pela média em férias, 13º e rescisão. Comissionista puro tem garantia do mínimo.",
      "Definir o leiaute e o prazo de envio das comissões e conferir o cálculo do DSR.","CLT art. 457 §1º · TST Súmula 27 · Lei 605/1949 art. 7º");
    if(tem(varr,"Prêmio ou bônus")) add("premio","conf","Folha","Prêmios e bônus","Prêmio ou bônus","Prêmio por desempenho superior ao ordinário não integra a remuneração; pago como valor fixo habitual ou complemento de salário, tende a integrar.","Entender critério e frequência.","CLT art. 457 §§2º e 4º");
    if(tem(varr,"Gorjeta")) add("gorjeta","media","Folha","Gorjetas","Gorjeta","Integram a remuneração (não o salário-base) e devem ser anotadas e rateadas conforme a lei e a CCT.","Ver como é rateada e registrada.","CLT art. 457 §3º · Lei 13.419/2017");
    if(tem(varr,"Ajuda de custo")) add("ajuda","conf","Folha","Ajuda de custo","Ajuda de custo","Não integra se for reembolso de despesa; valor fixo sem despesa correspondente pode ser considerado salário.","Pedir a política e os comprovantes.","CLT art. 457 §2º");
    const ben=(v.beneficios||[]).join(", ");
    if(tem(v.beneficios,"Vale-transporte")) add("vt","conf","Benefícios","Vale-transporte",ben,"Desconto de até 6% do salário-base; quem não quer o benefício deve declarar por escrito.","Pedir os termos de opção e renúncia.","Lei 7.418/1985 · Decreto 10.854/2021");
    if(tem(v.beneficios,"Vale-alimentação ou refeição")||tem(v.beneficios,"Cesta básica")) add("alimentacao","conf","Benefícios","Alimentação / cesta básica",ben,"Não integra o salário se não for paga em dinheiro. Verificar se a CCT obriga e se há adesão ao PAT.","Conferir a CCT e a situação no PAT.","CLT arts. 457 §2º e 458 · Lei 6.321/1976");
    if(v.descontos) add("descontos","media","Folha","Descontos em folha",v.descontos,"Descontos além dos legais precisam de autorização por escrito do empregado; consignado segue limite legal; pensão só com ofício judicial.",
      "Pedir autorizações, contratos de consignado e ofícios.","CLT art. 462 · Lei 10.820/2003 · TST Súmula 342");
    if(v.adiant==="Sim") add("adiantamento","conf","Folha","Adiantamento quinzenal",v.adiant_det||"Sim","Rotina operacional: definir percentual, data e se a CCT exige adiantamento.","Cadastrar o adiantamento no sistema.","CCT");

    // --- histórico ---
    if(v.processo==="Sim"||comp.processos==="Sim") add("processo","media","Passivo","Processo trabalhista ou fiscalização recente",v.processo_det||"Sim",
      "Processos e autos de infração mostram onde já houve problema e costumam se repetir com outros empregados pelos mesmos motivos.",
      "Pedir cópia das reclamações, sentenças, acordos e autos de infração; tratar a causa na rotina.","CLT art. 626 e seguintes");
    else if(v.processo==="Não") ok("processo","Passivo","Sem processo ou fiscalização recente",v.processo,"Histórico limpo nos últimos 2 anos, segundo o cliente.");
    const preoc=(v.preocupa||"").toLowerCase();
    if(preoc){
      if(/sem registro|sem carteira/.test(preoc)) add("relato_registro","alta","Vínculo","Trabalho sem registro relatado",v.preocupa,"Vínculo sem registro gera multa por empregado não registrado e passivo de FGTS, INSS, férias e 13º.","Levantar as datas reais de início e regularizar com registro retroativo.","CLT arts. 29 e 47");
      if(/f[eé]rias/.test(preoc)&&v.ferias_venc!=="Sim") add("relato_ferias","alta","Férias","Férias atrasadas relatadas",v.preocupa,"Férias concedidas após o período concessivo são pagas em dobro.","Pedir o controle de férias e programar a concessão dos períodos vencidos já no 1º mês.","CLT arts. 134 e 137");
      if(/por fora/.test(preoc)&&v.por_fora!=="Sim") add("relato_por_fora","alta","Folha","Pagamento por fora relatado",v.preocupa,"Valores fora da folha geram diferenças de FGTS, INSS, férias e 13º e risco fiscal.","Quantificar e propor regularização gradual.","CLT art. 457 · Lei 8.036/1990");
      if(/extra/.test(preoc)) add("relato_he","media","Jornada","Reclamação sobre horas extras",v.preocupa,"Insatisfação interna costuma anteceder ação trabalhista.","Cruzar ponto x folha dos últimos meses.","CLT art. 59");
    }
    if(v.dp_interno==="Sim") ok("dp_interno","Rotina","Tem responsável interno pelo pessoal",v.dp_interno_nome||v.dp_interno,"Facilita o envio das informações do mês e a coleta de documentos.");

    // --- dados do escritório ---
    if(!comp.regime||!comp.porte) add("regime","conf","Cadastro","Regime tributário e porte",comp.regime?`Regime: ${comp.regime}`:"Não perguntado na ficha",
      "Definem o INSS patronal (Simples x Presumido/Real, Anexo IV, CPRB) e as dispensas de ME/EPP (aprendiz, SST).","Confirmar com a contabilidade: regime, anexo, CNAE e porte.","LC 123/2006 · Lei 8.212/1991");
    else if(comp.regime!=="Simples Nacional"&&comp.regime!=="MEI") add("patronal","conf","Custo","Encargos patronais fora do Simples",`Regime: ${comp.regime}`,
      "Fora do Simples a empresa recolhe a cota patronal de 20%, RAT ajustado pelo FAP e terceiros (salário-educação, Sistema S, Incra) sobre a folha.",
      "Conferir FPAS, RAT e FAP no cadastro do Domínio antes da 1ª folha.","Lei 8.212/1991 art. 22 · Decreto 3.048/1999 art. 202-A");
    if(!comp.cct) add("cct","conf","Sindical","Enquadramento sindical e CCT","Convenção ainda não definida",
      "Piso, reajuste, percentual de hora extra, regras de domingo, benefícios obrigatórios e contribuições dependem da CCT.","Enquadrar pela atividade preponderante e município e escolher a CCT nos dados do escritório.","CLT arts. 511 e 611");
    else if(comp.cct.fim&&ctx.hoje&&comp.cct.fim<ctx.hoje) add("cct_vencida","conf","Sindical","CCT escolhida está vencida",`${comp.cct.ramo} · venceu em ${comp.cct.fim.split("-").reverse().join("/")}`,
      "Reajuste e piso podem estar desatualizados; a nova convenção costuma ser retroativa à data-base.","Acompanhar a nova CCT no Painel Sindical.","CLT art. 614 §3º");
    add("regularidade","conf","Regularidade","Situação de eSocial, FGTS Digital e DCTFWeb","Não perguntado ao cliente","Pendências herdadas viram multa e juros e travam certidões.",
      "Com procuração no e-CAC e no FGTS Digital, consultar competências em aberto e parcelamentos.","Lei 8.036/1990 · IN RFB 2.005/2021");
    if(v.origem==="Outro escritório") add("transicao","conf","Transição","Transição do escritório anterior",v.origem,"Garantir o histórico (fichas, folhas, férias, provisões, eventos do eSocial) e definir a última competência do anterior.",
      "Pedir carta de transferência e backup completo; alinhar quem envia a última folha.","—");
    return I.sort((a,b)=>ORDEM[a.p]-ORDEM[b.p]);
  }
  const ORDEM={alta:0,media:1,conf:2,ok:3};
  const PESO={alta:12,media:5};
  // pontos de atenção que são rotina de folha, não irregularidade: aparecem no plano, mas não descontam da nota
  const ROTINA=new Set(["afastado","movimento","comissao","noturno","gorjeta","estagio","descontos"]);
  const desconta=i=>PESO[i.p]&&!ROTINA.has(i.id);

  // nota de 0 a 100: começa em 100 e perde 12 por risco alto e 5 por médio ainda abertos; "Confirmar" e rotina não descontam
  function nota(itens,feitos){
    feitos=feitos||{};
    const abertos=itens.filter(i=>desconta(i)&&!feitos[i.id]);
    const v=Math.max(0,100-abertos.reduce((s,i)=>s+PESO[i.p],0));
    return {valor:v,faixa:v>=80?"Boa":v>=50?"Atenção":"Crítica",alta:abertos.filter(i=>i.p==="alta").length,media:abertos.filter(i=>i.p==="media").length,
      conf:itens.filter(i=>i.p==="conf"&&!feitos[i.id]).length,ok:itens.filter(i=>i.p==="ok").length};
  }
  function porArea(itens,feitos){
    const m={};
    itens.forEach(i=>{ if(i.p==="ok"||(feitos&&feitos[i.id])) return; const a=(m[i.area]=m[i.area]||{area:i.area,alta:0,media:0,conf:0}); a[i.p]++; });
    return Object.values(m).sort((a,b)=>b.alta-a.alta||b.media-a.media||b.conf-a.conf);
  }
  function perguntas(L,itens){
    const q=L.naoSei.map(x=>`${x} (cliente marcou “Não sei”)`);
    const ids=new Set(itens.map(i=>i.id));
    if(ids.has("regime")) q.push("Regime tributário, anexo do Simples e porte (ME/EPP)?");
    if(ids.has("cct")) q.push("Qual sindicato e convenção se aplicam? Há acordo coletivo próprio?");
    q.push("eSocial, FGTS Digital e DCTFWeb estão em dia? Há parcelamentos?");
    if(!L.v.exame) q.push("Exames médicos (ASO) e PGR/PCMSO estão em dia?");
    if(!L.v.ferias_venc&&!ids.has("relato_ferias")) q.push("Há férias vencidas?");
    if(!L.v.processo) q.push("Existe processo trabalhista ou fiscalização recente?");
    if(!L.v.por_fora) q.push("Algum valor é pago fora da folha?");
    if(!L.v.registro) q.push("O registro é feito antes do primeiro dia de trabalho?");
    return q;
  }
  function resumoCliente(L,itens,feitos,emp){
    feitos=feitos||{};
    const ab=itens.filter(i=>!feitos[i.id]), alta=ab.filter(i=>i.p==="alta"), media=ab.filter(i=>i.p==="media"), oks=itens.filter(i=>i.p==="ok");
    const out=[`Diagnóstico de início – ${emp||L.v.razao||"Empresa"}`,""];
    if(oks.length){ out.push("O que já está em ordem:"); oks.forEach(i=>out.push(`• ${i.t}`)); out.push(""); }
    out.push("Prioridades antes da primeira folha:"); (alta.length?alta:[{fazer:"Nenhum ponto urgente identificado."}]).forEach(i=>out.push(`• ${i.fazer}`));
    if(media.length){ out.push("","A ajustar nos próximos 30 dias:"); media.forEach(i=>out.push(`• ${i.t}`)); }
    if(L.docsFalta.length){ out.push("","Documentos que precisamos receber:"); L.docsFalta.forEach(d=>out.push(`• ${d}`)); }
    out.push("","Qualquer dúvida, estamos à disposição. Departamento Pessoal – Exato Soluções Contábeis");
    return out.join("\n");
  }
  function diagnosticar(txt,ctx){
    const L=ler(txt), itens=analisar(L,ctx);
    return {L,itens,nota:nota(itens,ctx&&ctx.feitos),areas:porArea(itens,ctx&&ctx.feitos),perguntas:perguntas(L,itens)};
  }

  // empresa fictícia da ficha antiga, para conhecer o módulo
  const EXEMPLO="RESPOSTAS DA FICHA DE INÍCIO\nComercial Andrade Ltda – CNPJ 12.345.678/0001-90\nRespondido em 13/10/2026\n\n== SUA EMPRESA ==\n- Nome da empresa (como está no CNPJ): Comercial Andrade Ltda\n- CNPJ: 12.345.678/0001-90\n- O que a empresa faz: atacado de roupas com estoque e expedição\n- Em que cidade a empresa funciona: Criciúma/SC\n- Quem é o responsável pela empresa: Carlos Andrade\n- WhatsApp e e-mail do responsável: (48) 99999-0000 · carlos@exemplo.com\n- Tem alguém que cuida dos funcionários no dia a dia (ponto, atestados, férias): Sim\n- Nome e WhatsApp dessa pessoa: Juliana (48) 98888-0000\n- Quem faz a folha de pagamento hoje: Outro escritório\n- A partir de qual mês vamos começar: novembro\n\n== SUA EQUIPE ==\n- Funcionários com carteira assinada: 23\n- Jovens aprendizes: 1\n- Pessoas que trabalham com CNPJ próprio (PJ / MEI): 2\n- As pessoas com CNPJ próprio cumprem horário fixo na empresa: Algumas\n- Freelancers ou diaristas eventuais: 3\n- Sócios que trabalham na empresa: 2\n- Tem alguém afastado agora (INSS, licença-maternidade, acidente): Sim\n- Quem e por qual motivo: Maria, licença-maternidade\n- Pensam em contratar ou desligar alguém nos próximos meses: Contratar\n- Conte um pouco: quantas pessoas, para quê, quando: 4 temporários para dezembro na expedição\n- Quais funções existem na empresa: vendedor, estoquista, conferente, caixa, motorista, auxiliar administrativo\n\n== ÁREAS DA EMPRESA ==\n- Loja: 9 pessoa(s) · seg a sáb, 8h às 18h\n- Estoque e expedição: 12 pessoa(s) · seg a sáb, 6h às 15h\n- Escritório: 3 pessoa(s) · seg a sex, 8h às 18h\n- Alguém trabalha com algo que pode fazer mal à saúde ou com risco: Não sei\n- Tem motorista, vigia ou outra função bem diferente das demais: Sim\n- Quais: 2 motoristas de entrega\n\n== HORÁRIOS ==\n- Em quais dias o pessoal trabalha: Segunda a sexta, Segunda a sábado\n- Qual o horário de entrada, almoço e saída: Loja 8h às 18h com 1h de almoço, sábado até 12h\n- Quanto tempo de almoço: 1 hora\n- Como os funcionários marcam a entrada e a saída: Caderno ou planilha\n- Quando alguém fica além do horário, o que acontece: Às vezes paga, às vezes compensa\n- Isso acontece com que frequência: Só em épocas de movimento\n- Trabalham em domingos ou feriados: Às vezes\n- Alguém trabalha à noite, depois das 22h: Não\n\n== PAGAMENTOS E BENEFÍCIOS ==\n- Em que dia o salário é pago: dia 5\n- Paga um vale (adiantamento) no meio do mês: Sim\n- Quanto e em que dia: 40% no dia 20\n- Além do salário, alguém recebe: Comissão, Prêmio ou bônus\n- Como funciona a comissão? Quem informa o valor todo mês: 2% sobre vendas, gerente manda planilha\n- O que a empresa oferece: Vale-transporte, Cesta básica\n- Tem algum desconto fixo no salário de alguém: compras na loja e um empréstimo\n\n== ROTINA COM A GENTE ==\n- Como prefere mandar as informações do mês (faltas, atestados, horas): WhatsApp, Planilha que o escritório envia\n- Quem vai mandar essas informações: Juliana\n- Até que dia do mês consegue mandar: dia 25\n- Como prefere entregar o holerite aos funcionários: PDF pelo WhatsApp ou e-mail\n- Tem alguma coisa sobre os funcionários que hoje preocupa ou dá trabalho: férias atrasadas de dois funcionários e o pessoal reclama das horas extras\n\n== DOCUMENTOS ==\n- Já tenho: Contrato social da empresa; Lista dos funcionários com salário e data de admissão; Folhas de pagamento ou holerites dos últimos 3 meses\n- Ainda não tenho: Contratos de trabalho dos funcionários; Controle de férias de cada funcionário; Registros de ponto do último mês; Exames médicos dos funcionários (ASO); Convenção coletiva do sindicato; Contratos de estágio, PJ ou terceirizados; Atestados ou documentos de quem está afastado\n\n== FICOU EM DÚVIDA ==\n- Alguém trabalha com algo que pode fazer mal à saúde ou com risco";

  const API={EXEMPLO,CAMPOS,DOCS,OPCOES,ROTINA,PESO,ler,lerCodigo,analisar,nota,porArea,perguntas,resumoCliente,diagnosticar,reais,brl,n};
  if(typeof module!=="undefined"&&module.exports) module.exports=API;
  if(typeof window!=="undefined") window.Diagnostico=API;
})();
