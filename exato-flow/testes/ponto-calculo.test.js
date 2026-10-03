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
const ap=P.apurar(f,'2026-09',{});
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
console.log(`${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
