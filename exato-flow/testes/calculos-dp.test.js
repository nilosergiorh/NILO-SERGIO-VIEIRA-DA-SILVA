// Calculadoras de DP: salário (HE, insalubridade, DSR) e rescisão por modalidade
const C=require('../nucleo/calculos-dp.js'), A=require('../nucleo/folha-auditoria.js'), T=A.TABELAS[2026];
let ok=0, fail=0;
const eq=(n,a,b)=>{ const s=JSON.stringify(a)===JSON.stringify(b); s?ok++:fail++; if(!s) console.log('FALHA',n,'\n  obtido ',JSON.stringify(a),'\n  esperado',JSON.stringify(b)); };
const v=(r,cod)=>{ const x=r.verbas.find(y=>y.cod===cod); return x?x.valor:0; };
const d=(r,txt)=>{ const x=r.descontos.find(y=>y.desc.includes(txt)); return x?x.valor:0; };
const base={salario:'2.000,00',admissao:'2024-03-01',saida:'2026-10-15'};

// --- sem justa causa, aviso indenizado (conferido à mão) ---
let r=C.calcularRescisao({...base,motivo:'sem_justa',aviso:'indenizado'},T);
eq('aviso proporcional: 30 + 3 × 2 anos',[r.avisoProp,r.diasInd,r.proj],[36,36,'2026-11-20']);
eq('saldo 15 dias',v(r,'saldo'),1000);
eq('aviso indenizado 36 dias',v(r,'aviso'),2400);
eq('13º com projeção: 11/12',v(r,'13'),1833.33);
eq('férias proporcionais 9/12 + 1/3',[v(r,'fp'),v(r,'fp13')],[1500,500]);
eq('INSS só sobre saldo; 13º à parte',[d(r,'INSS sobre saldo'),d(r,'INSS sobre 13º')],[75,140.68]);
eq('aviso e férias sem INSS/IR',[r.verbas.find(x=>x.cod==='aviso').inc,r.verbas.find(x=>x.cod==='fp').inc],[{fgts:1},{}]);
eq('FGTS do mês: 8% de saldo + aviso + 13º',r.fgts.mes,418.66);
eq('multa 40% sobre saldo estimado + mês',[r.fgts.saldo,r.fgts.multa],[5546.67,2386.13]);
eq('prazo de 10 dias',r.prazo,'2026-10-25');
eq('líquido',r.liquido,7017.65);
// saldo informado
r=C.calcularRescisao({...base,motivo:'sem_justa',aviso:'indenizado',saldoFgts:'4.000,00'},T);
eq('multa com saldo do extrato',r.fgts.multa,Math.round((4000+418.66)*0.4*100)/100);

// --- aviso trabalhado: indeniza só a proporcionalidade ---
r=C.calcularRescisao({...base,motivo:'sem_justa',aviso:'trabalhado'},T);
eq('trabalhado: 6 dias indenizados',[r.diasInd,v(r,'aviso')],[6,400]);

// --- pedido de demissão ---
r=C.calcularRescisao({...base,motivo:'pedido',aviso:'nao_cumprido'},T);
eq('pedido: sem aviso pago, desconto de 30 dias, sem multa e sem saque',[v(r,'aviso'),d(r,'não cumprido'),r.fgts.multa,r.fgts.saque],[0,2000,0,0]);
eq('pedido: 13º e férias proporcionais sem projeção',[v(r,'13'),v(r,'fp')],[Math.round(2000/12*10*100)/100,Math.round(2000/12*8*100)/100]);

// --- justa causa ---
r=C.calcularRescisao({...base,motivo:'justa',feriasVencidas:1},T);
eq('justa causa: saldo e férias vencidas + 1/3, sem 13º e sem proporcionais',r.verbas.map(x=>x.cod),['saldo','fv','fv13']);

// --- acordo (484-A) ---
r=C.calcularRescisao({...base,motivo:'acordo',aviso:'indenizado'},T);
eq('acordo: metade do aviso, multa 20%, saque 80%',[v(r,'aviso'),r.fgts.pctMulta,r.fgts.saquePct],[1200,0.2,0.8]);

// --- contrato de experiência ---
const exp={salario:'1.800,00',admissao:'2026-09-01',saida:'2026-10-15'};
r=C.calcularRescisao({...exp,motivo:'termino'},T);
eq('término da experiência: sem aviso e sem multa, com saque',[v(r,'aviso'),r.fgts.multa>0,r.fgts.saquePct],[0,false,1]);
eq('13º 2/12 (set e out com 15 dias)',v(r,'13'),300);
r=C.calcularRescisao({...exp,motivo:'antecipada_emp',fimContrato:'2026-10-30'},T);
eq('art. 479: metade de 15 dias restantes',v(r,'479'),450);
eq('art. 479 tem multa de 40%',r.fgts.pctMulta,0.4);
r=C.calcularRescisao({...exp,motivo:'antecipada_emp'},T);
eq('antecipada sem fim do contrato: erro',r.erros.length>0,true);

// --- regras de avos, faltas e teto do aviso ---
r=C.calcularRescisao({salario:'3000',admissao:'2026-01-10',saida:'2026-06-14',motivo:'pedido',aviso:'dispensado'},T);
eq('13º: jan (22 dias) conta; jun (14 dias) não',v(r,'13'),1250);
eq('férias: 5 meses e 5 dias = 5/12',v(r,'fp'),1250);
r=C.calcularRescisao({salario:'3000',admissao:'2025-01-01',saida:'2026-06-30',motivo:'pedido',aviso:'dispensado',faltas:10},T);
eq('10 faltas: 24/30 dos dias (art. 130)',v(r,'fp'),Math.round(3000/12*6*0.8*100)/100);
r=C.calcularRescisao({salario:'3000',admissao:'2000-01-01',saida:'2026-06-30',motivo:'sem_justa',aviso:'indenizado'},T);
eq('aviso limitado a 90 dias',r.avisoProp,90);
r=C.calcularRescisao({...base,motivo:'sem_justa',aviso:'indenizado',feriasVencidas:2,feriasDobro:1},T);
eq('férias vencidas: 1 simples + 1 em dobro + 1/3 de 3 salários',[v(r,'fv'),v(r,'fvd'),v(r,'fv13')],[2000,4000,2000]);
eq('saída antes da admissão',C.calcularRescisao({...base,saida:'2023-01-01',motivo:'pedido'},T).erros.length,1);

// --- salário ---
let s=C.simularSalario({salario:'2.500',insal:{grau:20},he:[{pct:50,horas:10},{pct:60,horas:2},{pct:100,horas:4}],comp:'2026-10',feriados:1},T);
const vh=(2500+324.2)/220;
eq('insalubridade 20% do mínimo',s.insal,324.2);
eq('HE 50/60/100% sobre salário + insalubridade',s.he.map(x=>x.valor),[Math.round(10*vh*1.5*100)/100,Math.round(2*vh*1.6*100)/100,Math.round(4*vh*2*100)/100]);
eq('DSR: out/2026 tem 4 domingos + 1 feriado, 26 úteis',[s.dias.uteis,s.dias.dsr],[26,5]);
eq('bruto = soma das verbas',s.bruto,Math.round((2500+324.2+s.he.reduce((t,x)=>t+x.valor,0)+s.dsr)*100)/100);
eq('INSS sobre o bruto',s.inss,A.inssEmpregado(s.bruto,T));
s=C.simularSalario({salario:'3000',insal:{grau:10},peric:true},T);
eq('insalubridade e periculosidade não acumulam: fica a maior',[s.insal,s.peric],[0,900]);
s=C.simularSalario({salario:'5000',dependentes:2,regime:'fora',rat:'2',terceiros:'5,8',naoTrib:[{desc:'Ajuda de custo',valor:'300'}]},T);
eq('verba indenizatória fora da base',[s.baseTrib,s.bruto],[5000,5300]);
eq('patronal fora do Simples: 27,8%',s.custo.patronal,1390);
s=C.simularSalario({salario:'2000',he:[{pct:40,horas:1}]},T);
eq('HE abaixo de 50% gera aviso',s.avisos.some(a=>/50%/.test(a)),true);

console.log(`calculadoras: ${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
