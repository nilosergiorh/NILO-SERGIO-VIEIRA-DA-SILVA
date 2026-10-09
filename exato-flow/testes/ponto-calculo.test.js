// Testes do motor de apuracao do ponto. Rodar: node exato-flow/testes/ponto-calculo.test.js
const P=require('../nucleo/ponto-calculo.js');
let ok=0,fail=0; const eq=(n,a,b)=>{ if(JSON.stringify(a)===JSON.stringify(b)) ok++; else {fail++; console.log('FALHOU',n,'obtido',JSON.stringify(a),'esperado',JSON.stringify(b));} };
const N=P.fmt, D=d=>'2026-09-'+String(d).padStart(2,'0');
const J='07:30 12:00 13:30 17:48';
const dias=o=>Object.fromEntries(Object.entries(o).map(([k,v])=>[D(k),v]));
// setembro/2026: 1 = terca; 7 = segunda, feriado (Independencia); 6 = domingo
const base={};
for(let d=1;d<=30;d++){ const w=new Date(Date.UTC(2026,8,d)).getUTCDay(); if(w>=1&&w<=5&&d!==7) base[d]={m:J}; }
const f={nome:'A',jornada:'padrao',dias:dias({...base,
 2:{m:'07:35 12:00 13:30 17:48'}, 3:{m:'07:45 12:00 13:30 17:48'}, 4:{m:'07:30 12:00 13:30 19:48'},
 5:{m:'08:00 12:00'}, 6:{m:'08:00 12:00'}, 7:{m:'08:00 12:00 13:00 17:00'}, 8:{m:''}, 9:{m:'',oc:'ATESTADO'},
 10:{m:'07:30 12:00 13:30'}, 15:{m:'',oc:'FALTA'}, 16:{m:'22:00 05:00'}, 17:{m:'07:30 12:20 13:00 17:48'}})};
const ap=P.apurar(f,'2026-09',{semMarcacao:'falta'});  // regra antiga: dia útil vazio = falta
const d=k=>ap.dias[k-1];
eq('normal',[d(1).heUtil,d(1).hfalta,d(1).falta],[0,0,false]);
eq('tolerancia 5 min',d(2).hfalta,0);
eq('atraso 15 min',N(d(3).hfalta),'0:15');
eq('2h extra',N(d(4).heUtil),'2:00');
eq('sabado sem jornada = extra util',N(d(5).heUtil),'4:00');
eq('domingo = 100%',N(d(6).he100),'4:00');
eq('feriado = 100%',[N(d(7).he100),d(7).feriado],['8:00','Independência']);
eq('falta dia inteiro',d(8).falta,true);
eq('atestado neutro',[d(9).falta,d(9).hfalta],[false,0]);
eq('marcacao impar',d(10).alertas.some(a=>/ímpar/.test(a.t)),true);
eq('noturno relogio',N(d(16).noturno),'7:00');
eq('intervalo < 1h',d(17).alertas.some(a=>/menor que 1h/.test(a.t)),true);
eq('dias de falta',ap.tot.faltas,[D(8),D(15)]);
eq('semanas de DSR',ap.tot.semanasDsr,['2026-09-13','2026-09-20']);
eq('noturno reduzido 7h -> 8h',N(ap.tot.noturnoLancar),'8:00');
eq('prorrogacao (Sum. 60)',N(P.minutosNoturnos([[1320,1860]],{ini:'22:00',fim:'05:00',prorroga:true})),'9:00');
eq('sem prorrogacao',N(P.minutosNoturnos([[1320,1860]],{ini:'22:00',fim:'05:00',prorroga:false})),'7:00');
eq('madrugada',N(P.minutosNoturnos([[0,360]],{ini:'22:00',fim:'05:00',prorroga:true})),'5:00');
eq('Sexta-feira Santa 2026',Object.keys(P.feriadosNacionais(2026)).find(k=>P.feriadosNacionais(2026)[k]==='Sexta-feira Santa'),'2026-04-03');
// faixas por dia: 50% ate 2h no dia, 100% acima
const ap2=P.apurar({jornada:'padrao',dias:{[D(1)]:{m:'07:30 12:00 13:30 20:48'},[D(2)]:{m:'07:30 12:00 13:30 20:48'}}},'2026-09',{he:{faixas:[{ate:120,pct:50,rub:150},{ate:null,pct:100,rub:200}],domFer:{pct:100,rub:200},limite:'dia'}});
eq('faixa por dia',ap2.tot.heFaixas.map(x=>N(x.min)),['4:00','2:00']);
// faixa por mes: 70% ate 30h no mes (regra do ponto-dominio)
const muito={}; for(let k=1;k<=30;k++){ const w=new Date(Date.UTC(2026,8,k)).getUTCDay(); if(w>=1&&w<=5&&k!==7) muito[D(k)]={m:'07:30 12:00 13:30 19:48'}; }
const ap3=P.apurar({jornada:'padrao',dias:muito},'2026-09',{he:{faixas:[{ate:1800,pct:70,rub:170},{ate:null,pct:100,rub:200}],domFer:{pct:100,rub:200},limite:'mes'}});
eq('faixa por mes (21 dias x 2h = 42h -> 30h + 12h)',ap3.tot.heFaixas.map(x=>N(x.min)),['30:00','12:00']);
// sabado a 100%
const ap4=P.apurar({jornada:'padrao',dias:{[D(5)]:{m:'08:00 12:00'}}},'2026-09',{he:{faixas:[{ate:null,pct:50,rub:150}],domFer:{pct:100,rub:200},sab100:true}});
eq('sabado 100%',[N(ap4.dias[4].he100),ap4.dias[4].heUtil],['4:00',0]);
// 1 par so: modo 1 deduz 1h; modo 2 paga como extra
const um={[D(1)]:{m:'07:30 17:48'}};
eq('1 par modo 2',N(P.apurar({jornada:'padrao',dias:um},'2026-09',{}).dias[0].heUtil),'1:30');
eq('1 par modo 1',N(P.apurar({jornada:'padrao',dias:um},'2026-09',{interv:{modo:1,padrao:60,lim:360}}).dias[0].heUtil),'0:30');
// DSR por meio periodo de falta
const meio={...dias(base),[D(3)]:{m:'07:30 12:00'}};
eq('sem regra de meio periodo',P.apurar({jornada:'padrao',dias:meio},'2026-09',{}).tot.semanasDsr,[]);
eq('com regra de meio periodo',P.apurar({jornada:'padrao',dias:meio},'2026-09',{dsr:{rub:42,min:440,gerar:true,meio:240}}).tot.semanasDsr,['2026-09-06']);
// periodo 21 a 20
const per=P.diasDoMes('2026-09',21); eq('periodo 21 a 20',[per[0].data,per[per.length-1].data,per.length],['2026-08-21','2026-09-20',31]);
eq('dia 25 no periodo 21-20 = agosto',P.dataDoDia('2026-09',21,25),'2026-08-25');
// semana > 44h
const sem={}; [7,8,9,10,11].forEach(k=>sem[D(k)]={m:'07:00 12:00 13:00 19:00'}); sem[D(12)]={m:'08:00 12:00'};
eq('alerta semana > 44h',P.apurar({jornada:'padrao',dias:sem},'2026-09',{}).dias.some(x=>x.alertas.some(a=>/Semana com/.test(a.t))),true);
// TXT (leiaute Importar Lancamentos)
const R=JSON.parse(JSON.stringify(P.REGRAS_PADRAO)); R.not.rub=25;
const tx=P.linhasTxt({empresa:206,comp:'2026-09',processo:11,formato:'SEXAGESIMAL',regras:R,funcionarios:[{cod:5,nome:'A',apur:ap}]});
eq('HE 6:50 sexagesimal',tx.linhas[0],'10'+'0000000005'+'202609'+'0150'+'11'+'000000650'+'0000000206');
eq('tamanhos 43/11',tx.linhas.every(l=>l.length===(l.startsWith('10')?43:11)),true);
eq('2 faltas = 14:40',tx.linhas.find(l=>l.slice(18,22)==='0040').slice(24,33),'000001440');
eq('registro 11 logo abaixo da falta',tx.linhas.slice(tx.linhas.findIndex(l=>l.slice(18,22)==='0040')+1).slice(0,2),['11202609081','11202609151']);
eq('DSR 2 semanas',tx.linhas.find(l=>l.slice(18,22)==='0042').slice(24,33),'000001440');
eq('centesimal 7:20 -> 733',P.valorHoras(440,'CENTESIMAL'),733);
const semRub=P.linhasTxt({empresa:206,comp:'2026-09',formato:'SEXAGESIMAL',regras:P.REGRAS_PADRAO,funcionarios:[{cod:5,nome:'A',apur:ap}]});
eq('noturno sem rubrica bloqueia',semRub.erros.some(e=>/Adicional noturno sem rubrica/.test(e)),true);
// falta inteira e parcial na mesma rubrica (8069) = uma linha so; sem registro 11
const R2=JSON.parse(JSON.stringify(R)); R2.falta.rub=8069; R2.txt.reg11=false;
const tx2=P.linhasTxt({empresa:206,comp:'2026-09',formato:'SEXAGESIMAL',regras:R2,funcionarios:[{cod:5,nome:'A',apur:ap}]});
eq('8069 somada numa linha',tx2.linhas.filter(l=>l.slice(18,22)==='8069').length,1);
eq('sem registro 11',tx2.linhas.some(l=>l.startsWith('11')),false);
// reducao noturna em rubrica propria
const R3=JSON.parse(JSON.stringify(R)); R3.not.rubRed=27;
const tx3=P.linhasTxt({empresa:206,comp:'2026-09',formato:'SEXAGESIMAL',regras:R3,funcionarios:[{cod:5,nome:'A',apur:P.apurar(f,'2026-09',R3)}]});
eq('noturno real 7:00 + reducao 1:00',[tx3.linhas.find(l=>l.slice(18,22)==='0025').slice(24,33),tx3.linhas.find(l=>l.slice(18,22)==='0027').slice(24,33)],['000000700','000000100']);
// carga prevista vinda do relógio (CHPrev) prevalece sobre a jornada
const apPrev=P.apurar({jornada:'padrao',dias:{[D(1)]:{m:'08:00 12:00 13:00 17:45',p:525},[D(5)]:{m:'',p:0}}},'2026-09',{});
eq('CHPrev 8:45 sem extra nem falta',[apPrev.dias[0].heUtil,apPrev.dias[0].hfalta,apPrev.dias[0].esperado],[0,0,525]);
eq('CHPrev zero no dia sem jornada',apPrev.dias[4].falta,false);

// ---------- ECO HAM: cálculo por marcação (exemplos do documento de configuração, 05/10/2026) ----------
const ECO={calc:'marcacao',jornadas:[{id:'eco',nome:'08:00-12:00 13:12-18:00',dias:{1:'08:00-12:00 13:12-18:00',2:'08:00-12:00 13:12-18:00',3:'08:00-12:00 13:12-18:00',4:'08:00-12:00 13:12-18:00',5:'08:00-12:00 13:12-18:00',6:'',0:''}}],
  he:{faixas:[{ate:null,pct:50,rub:150}],domFer:{pct:100,rub:200},limite:'mes',sab100:true},hfalta:{rub:8069},falta:{rub:40,min:440},dsr:{rub:42,min:440,gerar:true,meio:264}};
const eco1=(dia,m,oc,extra)=>P.apurar({jornada:'eco',dias:{[D(dia)]:{m,oc:oc||''}}},'2026-09',{...ECO,...(extra||{})}).dias[dia-1];
const LEG={tolRegra:'porMarcacao'};
let x=eco1(2,'08:50 12:00 13:07 18:09');
eq('Mateus 02/09 Súmula 366: atraso 0:50 e extra 0:14',[N(x.hfalta),N(x.heUtil)],['0:50','0:14']);
x=eco1(2,'08:50 12:00 13:07 18:09','',LEG);
eq('Mateus 02/09 regra antiga: atraso 0:50 e extra 0:09',[N(x.hfalta),N(x.heUtil)],['0:50','0:09']);
x=eco1(24,'07:56 12:01 13:07 18:01');
eq('Mateus 24/09 Súmula 366: soma 11 min = 0:11 extra',[N(x.hfalta),N(x.heUtil)],['0:00','0:11']);
x=eco1(24,'07:56 12:01 13:07 18:01','',LEG);
eq('Mateus 24/09 regra antiga: zerado',[x.hfalta,x.heUtil],[0,0]);
x=eco1(3,'08:08 12:00 13:12 18:00');
eq('8 min de atraso numa batida (Súmula 366) conta',N(x.hfalta),'0:08');
eq('8 min de atraso numa batida (regra antiga) some',eco1(3,'08:08 12:00 13:12 18:00','',LEG).hfalta,0);
x=eco1(3,'08:03 11:58 13:12 18:01');
eq('variações pequenas (3+2+0+1) toleradas',[x.hfalta,x.heUtil],[0,0]);
x=eco1(3,'08:00 12:00 13:12 18:00','',{calc:'saldo'});
eq('modo saldo continua disponível',[x.hfalta,x.heUtil],[0,0]);
x=eco1(8,'13:09 18:54','ATESTADO');
eq('atestado parcial: abona e paga o que passou do horário',[x.hfalta,N(x.heUtil),x.parcial],[0,'0:57',true]);
x=eco1(9,'');
eq('dia útil vazio fica pendente',[x.falta,x.pendente,x.alertas.some(a=>a.nivel==='alta')],[false,true,true]);
const fer=P.apurar({jornada:'eco',dias:{[D(8)]:{m:'',oc:'FALTA'}}},'2026-09',ECO);
eq('falta em semana com feriado avisa (Lei 605, art. 6)',fer.dias.some(d=>d.alertas.some(a=>/feriado/.test(a.t)&&/605/.test(a.t))),true);
const fc=P.apurar({jornada:'eco',dias:{[D(1)]:{m:'08:00 12:01 13:09 18:02',fc:1}}},'2026-09',ECO).dias[0];
eq('marcação antes da admissão avisa',fc.alertas.some(a=>/admissão/.test(a.t)),true);
x=eco1(5,'08:00 12:00 13:00 15:00');
eq('sábado a 100% no modo marcação',[N(x.he100),x.heUtil],['6:00',0]);
const txtEco=P.linhasTxt({empresa:310,comp:'2026-09',processo:11,formato:'SEXAGESIMAL',regras:{...P.REGRAS_PADRAO,...ECO},
  funcionarios:[{cod:24,nome:'MATEUS',apur:{tot:{heFaixas:[{pct:50,rub:150,min:0}],he100:746,hfalta:0,noturnoLancar:0,reducaoNoturna:0,faltas:[],semanasDsr:[]}}}]});
eq('TXT igual ao exemplo real da ECO HAM (Mateus, HE 100% 12:26)',txtEco.linhas,['1000000000242026090200110000012260000000310']);

// ---------- PIASSESKI: 3 faixas mensais (50% até 10h, 60% até 40h, 100% acima) ----------
const muito3={}; for(let d=1;d<=30;d++){ const w=new Date(Date.UTC(2026,8,d)).getUTCDay(); if(w>=1&&w<=5&&d!==7) muito3[D(d)]={m:'07:30 12:00 13:30 20:48'}; }
const ap5=P.apurar({jornada:'padrao',dias:muito3},'2026-09',{he:{faixas:[{ate:600,pct:50,rub:150},{ate:2400,pct:60,rub:201},{ate:null,pct:100,rub:200}],domFer:{pct:100,rub:200},limite:'mes'}});
eq('3 faixas no mês (21 dias x 3h = 63h -> 10h + 30h + 23h)',ap5.tot.heFaixas.map(x=>N(x.min)),['10:00','30:00','23:00']);

// ---------- AF MÓVEIS: valores do espelho do relógio (Ponto System Web) ----------
const AF={fonte:'espelho',jornadas:[{id:'af',dias:{1:'07:00-12:00 13:00-17:00',2:'07:00-12:00 13:00-17:00',3:'07:00-12:00 13:00-17:00',4:'07:00-12:00 13:00-17:00',5:'07:00-12:00 13:00-16:00',6:'',0:''}}],
  he:{faixas:[{ate:120,pct:50,rub:150},{ate:null,pct:100,rub:200}],domFer:{pct:100,rub:200},limite:'dia',sab100:true},hfalta:{rub:8069},falta:{rub:40,min:440,unidade:'dias'},dsr:{rub:42,min:440,gerar:true},not:{ini:'22:00',fim:'05:00',pct:25,rub:26,rubRed:'',reduzida:false,prorroga:false},txt:{reg11:true}};
const afd={[D(9)]:{m:'05:00 12:00 13:00 20:27',sw:{n:540,e50:120,e100:207}},[D(15)]:{m:'',sw:{f:540}},[D(16)]:{m:'07:30 12:00 13:00 17:30',sw:{n:540,an:30}},[D(20)]:{m:'',sw:{dsr:440}},[D(17)]:{m:'07:00 12:00 13:00 18:00',sw:{n:540}}};
const apAf=P.apurar({jornada:'af',dias:afd},'2026-09',AF);
eq('espelho: HE 50/100 e falta vêm do relógio',[N(apAf.tot.heFaixas[0].min),N(apAf.tot.he100),apAf.tot.faltas,N(apAf.tot.dsrMin),N(apAf.tot.noturnoLancar)],['2:00','3:27',[D(15)],'7:20','0:30']);
eq('espelho: diverge das marcações vira pendência',apAf.dias[16].alertas.some(a=>a.nivel==='alta'&&/diverge/.test(a.t)),true);
const txtAf=P.linhasTxt({empresa:189,comp:'2026-09',processo:11,formato:'SEXAGESIMAL',regras:{...P.REGRAS_PADRAO,...AF},funcionarios:[{cod:10,nome:'MATEUS',apur:apAf}]});
eq('falta em DIAS (1 = 100) com registro 11',txtAf.linhas.filter(l=>/0040110/.test(l)||l.startsWith('11')),['1000000000102026090040110000001000000000189','11202609151']);

// ---------- OLIVER: planilha de lançamentos (HE, horas falta, dias de falta e valores em R$) ----------
const OL={fonte:'lancamentos',jornadas:[{id:'padrao',dias:{1:'07:30-12:00 13:30-17:48',2:'07:30-12:00 13:30-17:48',3:'07:30-12:00 13:30-17:48',4:'07:30-12:00 13:30-17:48',5:'07:30-12:00 13:30-17:48',6:'',0:''}},{id:'meio',dias:{1:'13:30-17:48',2:'13:30-17:48',3:'13:30-17:48',4:'13:30-17:48',5:'13:30-17:48',6:'',0:''}}]};
const RO={...P.REGRAS_PADRAO,...OL};
const fal=(...d)=>Object.fromEntries(d.map(x=>[D(x),{m:'',oc:'FALTA'}]));
const apLe=P.apurar({jornada:'padrao',dias:fal(3,10,17),lanc:{}},'2026-09',OL);
eq('lançamentos: dias vazios não ficam pendentes',[apLe.tot.pendentes.length,apLe.tot.alertasAltos],[0,0]);
const txtLe=P.linhasTxt({empresa:206,comp:'2026-09',processo:11,formato:'SEXAGESIMAL',regras:RO,funcionarios:[{cod:5,nome:'LEANDRO',apur:apLe,minFalta:440,minDsr:440}]});
eq('TXT igual ao exemplo real da Oliver (Leandro, 3 faltas)',txtLe.linhas,['1000000000052026090040110000022000000000206','11202609031','11202609101','11202609171','1000000000052026090042110000022000000000206']);
const apX=P.apurar({jornada:'padrao',dias:fal(8,9),lanc:{he50:390,he100:480,hfalta:30,valores:[{rub:981,desc:'Vales',centavos:150000},{rub:8111,desc:'Plano',centavos:26204}]}},'2026-09',OL);
const txtX=P.linhasTxt({empresa:206,comp:'2026-09',processo:11,formato:'SEXAGESIMAL',regras:RO,funcionarios:[{cod:24,nome:'PAULO',apur:apX,minFalta:440,minDsr:440}]});
eq('ordem e valores como a planilha (150, 200, 8069, 40+reg.11, 42, 981, 8111)',txtX.linhas,['1000000000242026090150110000006300000000206','1000000000242026090200110000008000000000206','1000000000242026098069110000000300000000206','1000000000242026090040110000014400000000206','11202609081','11202609091','1000000000242026090042110000007200000000206','1000000000242026090981110001500000000000206','1000000000242026098111110000262040000000206']);
const apLv=P.apurar({jornada:'meio',dias:fal(1,14),lanc:{}},'2026-09',OL);
const txtLv=P.linhasTxt({empresa:206,comp:'2026-09',processo:11,formato:'SEXAGESIMAL',regras:RO,funcionarios:[{cod:50,nome:'LEVIR',apur:apLv,minFalta:215,minDsr:215}]});
eq('jornada de meio período (Levir): 3:35 por falta e por DSR, 2 semanas',txtLv.linhas.filter(l=>l.startsWith('10')),['1000000000502026090040110000007100000000206','1000000000502026090042110000007100000000206']);
const apDom=P.apurar({jornada:'padrao',dias:fal(6),lanc:{avisos:['Faltas dia inteiro: "31" não é dia de 09/2026']}},'2026-09',OL);
eq('falta em domingo e dia inválido da planilha viram pendência',[apDom.dias[5].alertas.some(a=>/sem expediente/.test(a.t)),apDom.tot.alertasAltos],[true,2]);
console.log(`${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
