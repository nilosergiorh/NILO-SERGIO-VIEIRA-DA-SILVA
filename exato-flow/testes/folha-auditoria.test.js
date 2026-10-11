// Testes da Auditoria da folha: casos reais dos extratos do Domínio (Dunga 264 e 255, 2026)
const A=require('../nucleo/folha-auditoria.js');
let ok=0, fail=0;
const eq=(n,a,b)=>{ const s=JSON.stringify(a)===JSON.stringify(b); s?ok++:fail++; if(!s) console.log('FALHA',n,'\n  obtido ',JSON.stringify(a),'\n  esperado',JSON.stringify(b)); };
const T=A.TABELAS[2026];
eq('INSS truncado por faixa (Adrielle, base 2.319,49)',A.inssEmpregado(2319.49,T),184.43);
eq('INSS 4 faixas (Samuel, base 5.830,01)',A.inssEmpregado(5830.01,T),617.70);
eq('INSS limitado ao teto',A.inssEmpregado(12000,T),A.inssEmpregado(8475.55,T));
eq('IRRF com redução da Lei 15.270 (Samuel 09/2026)',A.irrfMensal(5212.31,5830.01,T).devido,322.28);
eq('IRRF zerado até R$ 5.000 de rendimentos',A.irrfMensal(4200,4900,T).devido,0);
const ev=(cod,valor,tp,ref)=>({cod,valor,tp,ref:ref||'0,00'});
const sam={tipo:'Empr',id:'15',nome:'SAMUEL',sit:'Trabalhando',vinculo:'Celetista',cargo:'MECÂNICO B',baseInss:5830.01,baseFgts:5830.01,valorFgts:466.40,baseIrrf:5212.31,
  eventos:[ev('1',5181.61,'P','220:00'),ev('998',617.70,'D','10,60'),ev('999',322.28,'D','27,50')]};
eq('Samuel 09/2026: INSS, FGTS e IRRF conferem',A.conferirEncargos(sam,'09/2026').map(x=>x.tipo+':'+x.nivel),['INSS:ok','FGTS:ok','IRRF:ok']);
eq('IRRF errado vira divergência',A.conferirEncargos({...sam,eventos:[sam.eventos[0],sam.eventos[1],ev('999',300,'D')]},'09/2026').find(x=>x.tipo==='IRRF').nivel,'erro');
eq('dependentes deduzidos da base (Adrielle)',/2 dependente/.test(A.conferirEncargos({tipo:'Empr',baseInss:3624.33,baseFgts:3624.33,valorFgts:289.94,baseIrrf:+(3624.33-A.inssEmpregado(3624.33,T)-2*189.59).toFixed(2),
  eventos:[ev('998',A.inssEmpregado(3624.33,T),'D')]},'09/2026').find(x=>x.tipo==='IRRF').msg),true);
eq('ano sem tabela não confere',A.conferirEncargos(sam,'01/2031')[0].nivel,'nc');
// piso
const cct={ramo:'Reparação de veículos (oficinas)',ini:'2026-01-01',fim:'2026-12-31',pmin:2101.70,pref:2329.40,reaj:0.053};
const w={tipo:'Empr',salario:2307.38,horasMes:220,adm:'2024-11-29',vinculo:'Celetista',cargo:'AUXILIAR ADMINISTRATIVO'};
eq('salário abaixo do piso após 90 dias',A.conferirPiso(w,cct,'09/2026').map(x=>[x.nivel,x.dif]),[['atencao',-22.02]]);
eq('em experiência usa o piso de ingresso',A.conferirPiso({...w,adm:'2026-08-01'},cct,'09/2026')[0].nivel,'ok');
eq('abaixo do mínimo nacional é divergência',A.conferirPiso({...w,salario:1500},null,'09/2026')[0].nivel,'erro');
eq('reajuste conferido entre antes e depois da data-base',A.conferirReajuste([{comp:'12/2025',salario:2200},{comp:'01/2026',salario:2316.60}],cct).nivel,'ok');
eq('reajuste a menor',A.conferirReajuste([{comp:'12/2025',salario:2200},{comp:'01/2026',salario:2310}],cct).nivel,'erro');
// ponto x folha
const L=(cod,rub,val)=>'10'+String(cod).padStart(10,'0')+'202609'+String(rub).padStart(4,'0')+'11'+String(val).padStart(9,'0')+'0000000264';
const ws=[{id:'8',nome:'KENNEDY',eventos:[ev('150',43.2,'P','1:30'),ev('981',300,'D','300,00')]},{id:'4',nome:'WILLIAN',eventos:[ev('150',50,'P','1:40')]}];
const pf=A.conferirPonto(ws,[L(8,150,130),L(8,981,30000),L(12,150,200)],{formato:'SEXAGESIMAL',planilha:{valores:[{rub:981}]}});
eq('ponto x folha: igual, R$, fora da folha e lançado à mão',pf.map(x=>x.cod+'/'+x.rub+':'+x.nivel),['4/150:atencao','8/150:ok','8/981:ok','12/150:erro']);
// INSS patronal
const sm={scEmpr:100000,scContr:5000,empresa:20000,rat:3000,terceiros:5800,senai:0,contribuintes:1000,totalInss:40000};
eq('patronal: percentuais efetivos',A.conferirPatronal(sm,'').linhas.slice(0,3).map(l=>+(l.pct*100).toFixed(2)),[20,3,5.8]);
eq('Simples sem cota patronal',A.conferirPatronal({scEmpr:60000,totalInss:5000},'').temPatronal,false);
eq('cadastro fora do Simples sem cota patronal = divergência',A.conferirPatronal({scEmpr:60000,totalInss:5000},'Lucro Presumido').alertas[0].nivel,'erro');
eq('RAT fora do intervalo possível',A.conferirPatronal({...sm,rat:8000},'').alertas.some(a=>a.nivel==='erro'),true);
console.log(`${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
