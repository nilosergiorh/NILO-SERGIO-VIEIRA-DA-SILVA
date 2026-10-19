// Agenda fixa do DP: 5º dia útil, dia 15, dia 20 e 13º com feriados nacionais
const A=require('../nucleo/agenda-dp.js');
let ok=0, fail=0;
const eq=(n,a,b)=>{ const s=JSON.stringify(a)===JSON.stringify(b); s?ok++:fail++; if(!s) console.log('FALHA',n,'\n  obtido ',JSON.stringify(a),'\n  esperado',JSON.stringify(b)); };
const D=(a,m)=>Object.fromEntries(A.doMes(a,m).map(x=>[x.id.replace(/-\d{4}-\d{2}-\d{2}$/,''),x.data]));
eq('Páscoa 2026 e 2027',[A.pascoa(2026),A.pascoa(2027)],['2026-04-05','2027-03-28']);
// novembro/2026: 02 Finados (seg), 15 domingo e feriado, 20 Consciência Negra (sex)
eq('novembro/2026',D(2026,11),{salario:'2026-11-07',esocial:'2026-11-13',fgts:'2026-11-19',darf:'2026-11-19','13a':'2026-11-30'});
// setembro/2026: 5º dia útil cai no sábado 05
eq('setembro/2026: sábado conta para o salário',D(2026,9).salario,'2026-09-05');
// dezembro/2026: 20 é domingo
eq('dezembro/2026',D(2026,12),{salario:'2026-12-05',esocial:'2026-12-15',fgts:'2026-12-18',darf:'2026-12-18','13b':'2026-12-18'});
// fevereiro/2027: Carnaval 08 e 09/02 (só bancário); 15 é segunda
eq('fevereiro/2027',D(2027,2),{salario:'2027-02-05',esocial:'2027-02-15',fgts:'2027-02-19',darf:'2027-02-19'});
eq('antecipação explicada',A.doMes(2026,11).find(x=>x.id.startsWith('fgts')).ajuste,'20/11/2026 é Dia da Consciência Negra: antecipado');
eq('competência anterior no texto',A.doMes(2027,1)[0].obr,'Pagamento dos salários de dezembro/2026 (5º dia útil)');
eq('período de 3 meses',A.periodo('2026-10-19',3).length,4+5+5);
console.log(`agenda: ${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
