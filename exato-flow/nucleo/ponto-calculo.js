/*
 * EXATO FLOW - motor de apuracao do ponto (sem DOM; roda no navegador e no Node).
 *
 * Entrada por funcionario: marcacoes do dia ("07:30 12:00 13:30 17:48") e ocorrencia.
 * Saida: horas trabalhadas, horas extras (dia util por faixa e 100%), horas faltas
 * (atrasos e saidas antecipadas), faltas de dia inteiro, semanas de DSR perdidas,
 * adicional noturno e alertas.
 *
 * Regras (parametrizaveis por cliente em REGRAS_PADRAO):
 * - Tolerancia do art. 58, par. 1, da CLT: variacao diaria de ate 10 min nao conta;
 *   acima disso conta o tempo todo (Sumula 366 do TST).
 * - Hora extra em domingo/feriado trabalhado (fora da escala) e em folga = 100%.
 * - Adicional noturno 22h-5h (art. 73 CLT), hora reduzida de 52'30" e prorrogacao
 *   apos as 5h quando a jornada cobre todo o periodo noturno (Sumula 60, II, TST).
 * - Falta injustificada de dia inteiro tira o DSR da semana (Lei 605/49): conta
 *   semanas distintas (segunda a domingo) com falta, como a planilha de lancamentos.
 * Opcoes por cliente (vindas do sistema ponto-dominio da Exato): limite da faixa de HE
 * por mes ou por dia, sabado a 100%, dia com um so par de marcacoes (paga como extra
 * ou deduz o almoco), perda do DSR por falta de meio periodo, rubrica da reducao da
 * hora noturna, fechamento do periodo (ex.: 21 a 20) e alerta de semana acima de 44h.
 * Modo de calculo "marcacao" (automacoes Eletrotak/ECO HAM): em dia util com as 4 batidas, cada
 * batida e comparada ao horario fixo; atraso e hora extra do mesmo dia nao se compensam.
 * Dia util sem marcacao e sem ocorrencia fica pendente (nao vira falta sozinho).
 * Percentuais e regras de CCT mudam de cliente para cliente: confira na convencao.
 */
(function(raiz){
  "use strict";

  const REGRAS_PADRAO={
    tolDia:10,                     // minutos (art. 58, par. 1)
    tolMarc:5,                     // minutos por marcacao (art. 58, par. 1)
    tolRegra:"sumula366",          // "sumula366": passou de 5 min numa batida ou de 10 no dia, conta tudo; "porMarcacao": so as batidas acima de 5 min (regra antiga das planilhas)
    calc:"saldo",                  // "saldo" = trabalhado - previsto; "marcacao" = batida a batida contra o horario, sem compensar atraso com extra
    semMarcacao:"pendente",        // dia util sem marcacao e sem ocorrencia: "pendente" (perguntar ao cliente) ou "falta"
    he:{faixas:[{ate:null,pct:50,rub:150}], domFer:{pct:100,rub:200}, limite:"mes", sab100:false},
    interv:{modo:2,padrao:60,lim:360},  // 1 par so: 2 = paga como extra; 1 = deduz o almoco padrao se passar de lim
    periodo:{diaIni:1},                 // 1 = mes civil; 21 = de 21 do mes anterior a 20 do mes
    semanaLim:2640,                     // 44h (CF art. 7, XIII)
    txt:{reg11:true},
    hfalta:{rub:8069},
    falta:{rub:40,min:440},        // 7:20 = 220h / 30
    dsr:{rub:42,min:440,gerar:true,meio:null}, // meio: minutos de falta parcial no dia que tambem tiram o DSR (null = so falta inteira)
    not:{ini:"22:00",fim:"05:00",pct:20,rub:"",rubRed:"",reduzida:true,prorroga:true},
    feriados:[],                   // "AAAA-MM-DD" municipais/estaduais do cliente
    jornadas:[{id:"padrao",nome:"Segunda a sexta 07:30-17:48 (44h)",dias:{1:"07:30-12:00 13:30-17:48",2:"07:30-12:00 13:30-17:48",3:"07:30-12:00 13:30-17:48",4:"07:30-12:00 13:30-17:48",5:"07:30-12:00 13:30-17:48",6:"",0:""}}]
  };

  const OCORRENCIAS={
    "":{rot:"Normal"},
    FALTA:{rot:"Falta injustificada"},
    ATESTADO:{rot:"Atestado m\u00e9dico",neutro:true,parcial:true},
    FERIAS:{rot:"F\u00e9rias",neutro:true},
    AFASTAMENTO:{rot:"Afastamento",neutro:true},
    ABONO:{rot:"Falta abonada",neutro:true,parcial:true},
    FALTAJUST:{rot:"Falta justificada (art. 473)",neutro:true},
    FOLGA:{rot:"Folga / compensa\u00e7\u00e3o",neutro:true,trabalho100:true},
    FERIADO:{rot:"Feriado",neutro:true,trabalho100:true},
    LICENCA:{rot:"Licen\u00e7a",neutro:true},
    NAOADM:{rot:"Fora do contrato",neutro:true}
  };

  // ---------- horas ----------
  function hm(txt){
    const s=String(txt??"").trim().toLowerCase().replace(/h/,":").replace(/[.,]/,":");
    let m=s.match(/^(\d{1,2}):(\d{2})$/); if(!m) m=s.match(/^(\d{1,2})(\d{2})$/);
    if(!m) return null;
    const h=+m[1], mi=+m[2]; if(h>23||mi>59) return null;
    return h*60+mi;
  }
  const fmt=min=>{ if(min==null) return ""; const s=min<0?"-":""; min=Math.abs(Math.round(min)); return s+Math.floor(min/60)+":"+String(min%60).padStart(2,"0"); };
  const fmt2=min=>{ const t=fmt(min); return t.replace(/^(-?)(\d):/,"$10$2:"); };

  // "07:30 12:00 13:30 17:48" -> {mins:[450,720,810,1068], invalidos:[]}  (virada de dia soma 24h)
  function marcacoes(txt){
    const partes=String(txt??"").split(/[\s;|/-]+/).filter(Boolean);
    const mins=[], invalidos=[]; let ant=null, add=0;
    for(const p of partes){ const v=hm(p); if(v==null){ invalidos.push(p); continue; } let x=v+add; if(ant!=null&&x<ant){ add+=1440; x=v+add; } mins.push(x); ant=x; }
    return {mins,invalidos};
  }
  // "07:30-12:00 13:30-17:48" -> [[450,720],[810,1068]]
  function intervalosJornada(txt){
    const out=[];
    for(const p of String(txt??"").split(/\s+/).filter(Boolean)){
      const [a,b]=p.split("-").map(hm); if(a==null||b==null) continue;
      out.push([a,b>a?b:b+1440]);
    }
    return out;
  }
  const soma=iv=>iv.reduce((t,[a,b])=>t+(b-a),0);
  // minutos de A que caem dentro de B (A e B = listas de [inicio,fim])
  const sobrepoe=(A,B)=>A.reduce((t,[a,b])=>t+B.reduce((u,[c,d])=>u+Math.max(0,Math.min(b,d)-Math.max(a,c)),0),0);

  // ---------- calendario ----------
  function pascoa(a){ const b=a%19,c=Math.floor(a/100),d=a%100,e=Math.floor(c/4),f=c%4,g=Math.floor((c+8)/25),h=Math.floor((c-g+1)/3),i=(19*b+c-e-h+15)%30,k=Math.floor(d/4),l=d%4,m=(32+2*f+2*k-i-l)%7,n=Math.floor((b+11*i+22*m)/451),mes=Math.floor((i+m-7*n+114)/31),dia=((i+m-7*n+114)%31)+1; return new Date(Date.UTC(a,mes-1,dia)); }
  const iso=d=>d.toISOString().slice(0,10);
  // Feriados nacionais (Lei 662/49, Lei 6.802/80, Lei 14.759/23 e Sexta-feira Santa). Municipais e estaduais: cadastrar por cliente.
  function feriadosNacionais(ano){
    const f={};
    [["01-01","Confraterniza\u00e7\u00e3o Universal"],["04-21","Tiradentes"],["05-01","Dia do Trabalho"],["09-07","Independ\u00eancia"],["10-12","Nossa Senhora Aparecida"],["11-02","Finados"],["11-15","Proclama\u00e7\u00e3o da Rep\u00fablica"],["11-20","Dia Nacional de Zumbi e da Consci\u00eancia Negra"],["12-25","Natal"]]
      .forEach(([md,n])=>f[ano+"-"+md]=n);
    const p=pascoa(ano); p.setUTCDate(p.getUTCDate()-2); f[iso(p)]="Sexta-feira Santa";
    return f;
  }
  function diasDoMes(comp,diaIni){ // comp "AAAA-MM"; diaIni>1 = periodo de diaIni do mes anterior ate diaIni-1 do mes
    const [a,m]=comp.split("-").map(Number), out=[];
    const ini=diaIni>1?new Date(Date.UTC(a,m-2,diaIni)):new Date(Date.UTC(a,m-1,1));
    const fim=diaIni>1?new Date(Date.UTC(a,m-1,diaIni-1)):new Date(Date.UTC(a,m,0));
    for(const d=new Date(ini); d<=fim; d.setUTCDate(d.getUTCDate()+1)) out.push({dia:d.getUTCDate(),data:iso(d),dow:d.getUTCDay()});
    return out;
  }
  // dia escrito no cartao/planilha (1..31) -> data do periodo
  function dataDoDia(comp,diaIni,dia){ const L=diasDoMes(comp,diaIni); const x=L.find(d=>d.dia===+dia); return x?x.data:null; }
  const fimSemana=data=>{ const d=new Date(data+"T00:00:00Z"), w=d.getUTCDay(); d.setUTCDate(d.getUTCDate()+(w===0?0:7-w)); return iso(d); };

  // ---------- noturno ----------
  function minutosNoturnos(trab,regra){
    const ini=hm(regra.ini)??1320, fim=hm(regra.fim)??300;
    let tot=0;
    for(let [a,b] of trab){
      for(let base=Math.floor(a/1440)*1440-1440; base<b; base+=1440){
        const ns=base+ini, ne=base+1440+fim;
        let e=ne;
        if(regra.prorroga && a<=ns && b>ne) e=b;   // Sumula 60, II, TST
        tot+=Math.max(0,Math.min(b,e)-Math.max(a,ns));
      }
    }
    return tot;
  }

  // ---------- apuracao de um dia ----------
  function dia(info,ctx){
    const R=ctx.regras, jor=ctx.jornada, oc=OCORRENCIAS[info.oc||""]?info.oc||"":"";
    const {mins,invalidos}=marcacoes(info.m);
    const pares=[]; for(let i=0;i+1<mins.length;i+=2) pares.push([mins[i],mins[i+1]]);
    let trab=soma(pares), deduzido=0;
    const IV=R.interv||{modo:2};
    if(IV.modo===1 && pares.length===1 && trab>(IV.lim||360)){ deduzido=IV.padrao||60; trab-=deduzido; }
    const prev=intervalosJornada(jor&&jor.dias?jor.dias[info.dow]:"");
    // carga prevista do dia: a informada pelo relogio (CHPrev do espelho), se houver; senao a da jornada
    const esperado=info.prev!=null&&info.prev!==""?+info.prev:soma(prev);
    const nomeFeriado=ctx.feriados[info.data];
    const r={data:info.data,dia:info.dia,dow:info.dow,oc,trab,esperado,heUtil:0,he100:0,hfalta:0,falta:false,noturno:0,alertas:[],pares,feriado:nomeFeriado||"",deduzido};
    const alerta=(nivel,t)=>r.alertas.push({nivel,t});
    if(invalidos.length) alerta("alta","Marca\u00e7\u00e3o ileg\u00edvel ou inv\u00e1lida: "+invalidos.join(", "));
    if(mins.length%2) alerta("alta","N\u00famero \u00edmpar de marca\u00e7\u00f5es: falta uma entrada ou sa\u00edda");
    if(info.ilegivel) alerta("alta","Leitura incerta neste dia"+(info.nota?" ("+info.nota+")":"")+": confira no cart\u00e3o");
    if(info.fc&&mins.length) alerta("media","Marca\u00e7\u00e3o fora do contrato (antes da admiss\u00e3o ou depois da rescis\u00e3o): retifique a data no eSocial/Dom\u00ednio");
    if(deduzido) alerta("baixa","S\u00f3 1 par de marca\u00e7\u00f5es: deduzido o almo\u00e7o padr\u00e3o ("+fmt(deduzido)+")");
    else if(pares.length===1 && trab>(IV.lim||360) && IV.modo===2) alerta("baixa","S\u00f3 1 par de marca\u00e7\u00f5es: almo\u00e7o n\u00e3o registrado, pago como extra");
    r.noturno=minutosNoturnos(pares,R.not);

    const O=OCORRENCIAS[oc];
    if(O.neutro){
      if(trab>0){
        if(O.trabalho100) r.he100=trab;
        else if(O.parcial && esperado>0){
          // atestado/abono de parte do dia: abona o que faltou; o trabalho fora do horario continua sendo extra
          let ex=prev.length?trab-sobrepoe(pares,prev):Math.max(0,trab-esperado);
          if(ex<=R.tolDia) ex=0;
          r.heUtil=ex; r.parcial=true;
          alerta("baixa",O.rot+" parcial: abonado o per\u00edodo n\u00e3o trabalhado"+(ex?"; "+fmt(ex)+" fora do hor\u00e1rio pagas como extra":""));
        }
        else alerta("alta","Marca\u00e7\u00f5es em dia de "+O.rot.toLowerCase()+": confira a ocorr\u00eancia");
      }
      return fechar(r,ctx);
    }
    if(oc==="FALTA"){ r.falta=true; if(trab>0) alerta("alta","Falta lan\u00e7ada em dia com marca\u00e7\u00f5es"); return fechar(r,ctx); }

    const especial=(nomeFeriado||info.dow===0);
    if(especial && !(info.dow===0 && esperado>0 && !nomeFeriado)){
      // domingo fora da escala ou feriado: todo o trabalho e 100%; sem falta se nao trabalhar
      r.he100=trab;
      if(nomeFeriado && trab>0) alerta("media","Trabalho no feriado ("+nomeFeriado+"): pago em dobro, salvo folga compensat\u00f3ria");
      return fechar(r,ctx);
    }
    if(esperado>0 && mins.length===0){
      if(R.semMarcacao==="falta") r.falta=true;
      else { r.pendente=true; alerta("alta","Dia \u00fatil sem marca\u00e7\u00e3o e sem ocorr\u00eancia: pergunte ao cliente (falta, folga, f\u00e9rias ou atestado) e lance a ocorr\u00eancia"); }
      return fechar(r,ctx);
    }
    if(R.calc==="marcacao" && esperado>0 && mins.length===4 && prev.length===2 && !invalidos.length){
      // batida a batida: entrada e volta do almoco depois do horario = atraso, antes = extra;
      // saida do almoco e saida final antes do horario = falta, depois = extra. Nao se compensam.
      const pts=[prev[0][0],prev[0][1],prev[1][0],prev[1][1]];
      const d=mins.map((m,i)=>m-pts[i]), v=d.map(Math.abs), sv=v.reduce((a,b)=>a+b,0), tm=R.tolMarc??5;
      let c;
      if(sv<=R.tolDia && v.every(x=>x<=tm)) c=[0,0,0,0];
      else if(R.tolRegra==="porMarcacao") c=sv<=R.tolDia?[0,0,0,0]:d.map(x=>Math.abs(x)<=tm?0:x);
      else c=d;   // Sumula 366 TST: passou do limite, conta a totalidade
      const atr=Math.max(0,c[0])+Math.max(0,-c[1])+Math.max(0,c[2])+Math.max(0,-c[3]);
      const ext=Math.max(0,-c[0])+Math.max(0,c[1])+Math.max(0,-c[2])+Math.max(0,c[3]);
      r.hfalta=atr; r.heUtil=ext; r.porMarcacao=true;
      if(atr&&ext) alerta("baixa","Atraso ("+fmt(atr)+") e hora extra ("+fmt(ext)+") no mesmo dia: n\u00e3o se compensam");
      return fechar(r,ctx);
    }
    let dif=trab-esperado;
    if(Math.abs(dif)<=R.tolDia) dif=0;
    if(dif>0){ if(info.dow===6 && esperado===0 && R.he.sab100) r.he100=dif; else r.heUtil=dif; }
    else if(dif<0) r.hfalta=-dif;
    return fechar(r,ctx);
  }
  function fechar(r,ctx){
    const tot=r.trab;
    if(r.heUtil+r.he100>120 && r.oc!=="FOLGA" && !r.feriado && r.dow!==0) r.alertas.push({nivel:"media",t:"Mais de 2h extras no dia (art. 59 CLT)"});
    if(tot>600) r.alertas.push({nivel:"media",t:"Jornada acima de 10h no dia"});
    if(r.pares.length>=2){
      let maior=0; for(let i=1;i<r.pares.length;i++) maior=Math.max(maior,r.pares[i][0]-r.pares[i-1][1]);
      if(tot>360 && maior<60) r.alertas.push({nivel:"media",t:"Intervalo para refei\u00e7\u00e3o menor que 1h (art. 71 CLT)"});
    } else if(r.pares.length===1 && tot>360) r.alertas.push({nivel:"media",t:"Mais de 6h sem intervalo registrado (art. 71 CLT)"});
    else if(r.pares.length===1 && tot>240 && tot<=360 && !r.parcial) r.alertas.push({nivel:"baixa",t:"Jornada de 4h a 6h: confira o intervalo de 15 min"});
    return r;
  }

  // ---------- apuracao do mes de um funcionario ----------
  function apurar(func,comp,regras,extras){
    const R=Object.assign({},REGRAS_PADRAO,regras||{});
    const jornada=(R.jornadas||[]).find(j=>j.id===func.jornada)||(R.jornadas||[])[0]||null;
    const ano=+comp.slice(0,4);
    const feriados=Object.assign({},feriadosNacionais(ano),Object.fromEntries((R.feriados||[]).map(f=>typeof f==="string"?[f,"Feriado do cliente"]:[f.data,f.nome||"Feriado do cliente"])));
    const ctx={regras:R,jornada,feriados};
    const diaIni=(R.periodo&&R.periodo.diaIni)||1;
    const dias=diasDoMes(comp,diaIni).map(d=>{
      const x=(func.dias||{})[d.data]||{};
      return dia({...d,m:x.m||"",oc:x.oc||"",ilegivel:!!x.il,prev:x.p,nota:x.n||"",fc:!!x.fc},ctx);
    });
    // semana acima de 44h (segunda a domingo)
    const porSem={}; dias.forEach(d=>{ const k=fimSemana(d.data); (porSem[k]=porSem[k]||[]).push(d); });
    Object.values(porSem).forEach(L=>{ const t=L.reduce((a,d)=>a+d.trab,0); if(t>(R.semanaLim||2640)) L[L.length-1].alertas.push({nivel:"baixa",t:"Semana com "+fmt(t)+" trabalhadas (acima de "+fmt(R.semanaLim||2640)+")"}); });
    // interjornada (art. 66): 11h entre o fim de um dia e o inicio do seguinte
    for(let i=1;i<dias.length;i++){
      const a=dias[i-1], b=dias[i];
      if(a.pares.length&&b.pares.length){ const fimA=a.pares[a.pares.length-1][1], iniB=b.pares[0][0]+1440; if(iniB-fimA<660) b.alertas.push({nivel:"media",t:"Menos de 11h de descanso desde o dia anterior (art. 66 CLT)"}); }
    }
    const t={trab:0,esperado:0,heUtil:0,he100:0,hfalta:0,noturno:0,faltas:[],semanasDsr:[],pendentes:[],alertas:0,alertasAltos:0};
    for(const d of dias){
      t.trab+=d.trab; t.esperado+=d.esperado; t.heUtil+=d.heUtil; t.he100+=d.he100; t.hfalta+=d.hfalta; t.noturno+=d.noturno;
      if(d.falta) t.faltas.push(d.data);
      if(d.pendente) t.pendentes.push(d.data);
      t.alertas+=d.alertas.length; t.alertasAltos+=d.alertas.filter(a=>a.nivel==="alta").length;
    }
    const perdeDsr=dias.filter(d=>d.falta||(R.dsr&&R.dsr.meio&&d.hfalta>=R.dsr.meio&&!d.oc)).map(d=>d.data);
    t.semanasDsr=R.dsr&&R.dsr.gerar?[...new Set(perdeDsr.map(fimSemana))]:[];
    // Lei 605/49, art. 6: falta injustificada na semana com feriado tambem tira a remuneracao do feriado (avisa; nao lanca)
    [...new Set(dias.filter(d=>d.falta).map(d=>fimSemana(d.data)))].forEach(k=>{
      const fer=(porSem[k]||[]).filter(d=>d.feriado&&d.dow!==0&&!d.trab);
      if(fer.length){ const ult=porSem[k][porSem[k].length-1]; ult.alertas.push({nivel:"media",t:"Falta injustificada em semana com feriado ("+fer.map(d=>d.data.slice(8)+"/"+d.data.slice(5,7)).join(", ")+"): o feriado tamb\u00e9m pode ser descontado (Lei 605/49, art. 6\u00ba). O Flow n\u00e3o lan\u00e7a: decida e lance \u00e0 parte"}); t.alertas++; }
    });
    // horas extras de dia util por faixa: limite contado no mes (ex.: 70% ate 30h no mes) ou em cada dia (ex.: 50% ate 2h/dia)
    const fx=(R.he&&R.he.faixas&&R.he.faixas.length)?R.he.faixas:[{ate:null,pct:50,rub:150}];
    t.heFaixas=fx.map(f=>({pct:f.pct,rub:f.rub,min:0}));
    const reparte=(qtd,usadoIni)=>{ let resto=qtd, usado=usadoIni; fx.forEach((f,i)=>{ if(resto<=0) return; const lim=f.ate==null?Infinity:Math.max(0,f.ate-usado); const q=Math.min(resto,lim); t.heFaixas[i].min+=q; resto-=q; usado+=q; }); return usado; };
    if((R.he&&R.he.limite)==="dia") dias.forEach(d=>reparte(d.heUtil,0));
    else { let acum=0; dias.forEach(d=>{ acum=reparte(d.heUtil,acum); }); }
    t.noturnoReduzido=Math.round(t.noturno*60/52.5);
    t.noturnoLancar=R.not&&R.not.reduzida&&!R.not.rubRed?t.noturnoReduzido:t.noturno;
    t.reducaoNoturna=R.not&&R.not.rubRed?t.noturnoReduzido-t.noturno:0;
    return {dias,tot:t,jornada,regras:R};
  }

  // ---------- TXT Dominio (Folha > Importar Lancamentos) ----------
  // Registro 10 (43 pos.): "10" + empregado(10) + AAAAMM(6) + rubrica(4) + processo(2) + valor(9) + empresa(10)
  // Registro 11 (11 pos.): "11" + AAAAMMDD + tipo (1 normal) logo abaixo do registro 10 da falta dia inteiro
  const zero=(v,n)=>String(Math.round(Number(v)||0)).padStart(n,"0");
  function valorHoras(min,formato){ min=Math.round(min); return formato==="CENTESIMAL"?Math.round(min/60*100):Math.floor(min/60)*100+min%60; }
  function linhasTxt(op){
    // op: {empresa, comp:"AAAA-MM", processo:11, formato, funcionarios:[{cod, nome, apur, minFalta, minDsr}], regras}
    const R=op.regras, comp=op.comp.replace("-",""), out=[], erros=[], resumo=[];
    const r10=(cod,rub,val)=>"10"+zero(cod,10)+comp+zero(rub,4)+zero(op.processo||11,2)+zero(val,9)+zero(op.empresa,10);
    for(const f of op.funcionarios){
      const t=f.apur.tot, itens=[], porRub=new Map();
      if(!f.cod){ erros.push(f.nome+": sem c\u00f3digo do empregado no Dom\u00ednio"); continue; }
      // a mesma rubrica pode receber mais de um item (ex.: faltas parciais e de dia inteiro na 8069): soma numa linha so
      const push=(rub,min,desc,datas)=>{ if(min<=0) return; if(!rub){ erros.push(f.nome+": "+desc+" sem rubrica configurada"); return; } itens.push({rub,min,desc});
        const k=String(rub), x=porRub.get(k)||{min:0,datas:[]}; x.min+=min; if(datas) x.datas.push(...datas); porRub.set(k,x); };
      t.heFaixas.forEach(x=>push(x.rub,x.min,"Horas extras "+x.pct+"%"));
      push(R.he.domFer.rub,t.he100,"Horas extras "+R.he.domFer.pct+"%");
      push(R.hfalta.rub,t.hfalta,"Horas faltas (atrasos/sa\u00eddas)");
      push(R.not.rub,t.noturnoLancar,"Adicional noturno");
      if(R.not.rubRed) push(R.not.rubRed,t.reducaoNoturna,"Redu\u00e7\u00e3o da hora noturna");
      if(t.faltas.length){
        const minDia=f.minFalta||R.falta.min;
        push(R.falta.rub,t.faltas.length*minDia,"Faltas ("+t.faltas.length+" dia"+(t.faltas.length>1?"s":"")+")",(R.txt&&R.txt.reg11===false)?null:t.faltas);
      }
      if(t.semanasDsr.length) push(R.dsr.rub,t.semanasDsr.length*(f.minDsr||R.dsr.min),"DSR sobre faltas ("+t.semanasDsr.length+" semana"+(t.semanasDsr.length>1?"s":"")+")");
      for(const [rub,x] of porRub){ out.push(r10(f.cod,rub,valorHoras(x.min,op.formato))); x.datas.forEach(d=>out.push("11"+d.replace(/-/g,"")+"1")); }
      resumo.push({cod:f.cod,nome:f.nome,itens});
    }
    for(const l of out){ const n=l.startsWith("10")?43:11; if(l.length!==n) erros.push("Linha com tamanho errado ("+l.length+"): "+l); }
    return {linhas:out,erros,resumo};
  }

  const API={REGRAS_PADRAO,OCORRENCIAS,hm,fmt,fmt2,marcacoes,intervalosJornada,feriadosNacionais,diasDoMes,dataDoDia,fimSemana,minutosNoturnos,apurar,linhasTxt,valorHoras};
  if(typeof module!=="undefined"&&module.exports) module.exports=API; else raiz.PontoCalculo=API;
})(typeof window!=="undefined"?window:globalThis);
