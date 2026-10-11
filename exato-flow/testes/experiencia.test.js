// Contrato de experiência: prazos, avisos e decisões (CLT arts. 445 e 451)
global.window=globalThis; require('../nucleo/flow-dados.js'); const F=window.FlowDados;
let ok=0, fail=0;
const eq=(n,a,b)=>{ const s=JSON.stringify(a)===JSON.stringify(b); s?ok++:fail++; if(!s) console.log('FALHA',n,'\n  obtido ',JSON.stringify(a),'\n  esperado',JSON.stringify(b)); };
const f={nome:'JOAO',admissao:'2026-10-01',exp_dias1:45,exp_dias2:45,situacao:'Trabalhando'};
let x=F.experiencia(f,'2026-10-20');
eq('45+45: fim do 1º período conta o dia da admissão',[x.fim1,x.fim2,x.fase],['2026-11-14','2026-12-29','curso']);
x=F.experiencia(f,'2026-11-07'); eq('7 dias antes: pede decisão com prorrogar',[x.fase,x.nivel,x.dias,x.opcoes],['decidir','warn',7,['prorrogar','efetivar','rescindir']]);
x=F.experiencia(f,'2026-11-13'); eq('a 1 dia: urgente',[x.nivel,/amanhã/.test(x.texto)],['crit',true]);
x=F.experiencia(f,'2026-11-16'); eq('venceu sem decisão: alerta art. 451',[x.fase,x.nivel,/451/.test(x.texto)],['vencido','crit',true]);
x=F.experiencia({...f,exp_dec1:'prorrogar'},'2026-12-23'); eq('prorrogado: acompanha o 2º período',[x.periodo,x.fase,x.opcoes],[2,'decidir',['efetivar','rescindir']]);
x=F.experiencia({...f,exp_dec1:'prorrogar',exp_dec2:'efetivar'},'2026-12-23'); eq('efetivado: sem alerta',[x.fase,x.nivel],['efetivado',null]);
x=F.experiencia({...f,exp_dec1:'rescindir',rescisao:'2026-11-14'},'2026-11-10'); eq('rescisão registrada no fim do 1º período',[x.fase,x.fim],['rescindir','2026-11-14']);
x=F.experiencia({...f,exp_dias1:90,exp_dias2:0},'2026-12-25'); eq('90 dias sem prorrogação: só efetivar ou rescindir',[x.fim1,x.opcoes],['2026-12-29',['efetivar','rescindir']]);
eq('mais de 90 dias no total é erro',!!F.experiencia({...f,exp_dias1:60,exp_dias2:45},'2026-10-10').erro,true);
x=F.experiencia({nome:'NOVO',admissao:'2026-10-05',situacao:'Trabalhando'},'2026-10-11'); eq('admitido sem prazo: pede o prazo',x.fase,'sem_prazo');
eq('admitido há mais de 90 dias sem prazo: nada',F.experiencia({nome:'X',admissao:'2025-01-05'},'2026-10-11'),null);
console.log(`${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
