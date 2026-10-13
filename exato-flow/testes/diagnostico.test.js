// Diagnóstico de DP: leitura da ficha (código v3 e texto antigo) e regras de triagem
const D=require('../nucleo/diagnostico.js'), fs=require('fs'), path=require('path');
let ok=0, fail=0;
const eq=(n,a,b)=>{ const s=JSON.stringify(a)===JSON.stringify(b); s?ok++:fail++; if(!s) console.log('FALHA',n,'\n  obtido ',JSON.stringify(a),'\n  esperado',JSON.stringify(b)); };
const ler=f=>fs.readFileSync(path.join(__dirname,'dados',f),'utf8').replace(/\r\n/g,'\n');   // o checkout no Windows troca LF por CRLF
const ids=(r,p)=>r.itens.filter(i=>!p||i.p===p).map(i=>i.id);
const base={salMin:1621,hoje:'2026-10-13'};

// ficha antiga (só texto): mesmo resultado do módulo original (4 alta, 7 média, 14 confirmar)
let r=D.diagnosticar(ler('ficha-v2-exemplo.txt'),base);
eq('v2: lido pelo texto',r.L.origem,'texto');
eq('v2: contagem por prioridade',[ids(r,'alta').length,ids(r,'media').length,ids(r,'conf').length],[4,7,14]);
eq('v2: riscos altos',ids(r,'alta'),['ponto','compensacao','pj','relato_ferias']);
eq('v2: áreas e escalas',[r.L.v.setores.length,r.L.v.escalas],[3,['Segunda a sexta','Segunda a sábado']]);
eq('v2: "Não sei" e documentos',[r.L.naoSei,r.L.docsOk.length,r.L.docsFalta.length],[['Alguém trabalha com algo que pode fazer mal à saúde ou com risco'],3,7]);
eq('v2: rotina não desconta da nota (4×12 + 3×5)',r.nota.valor,37);
eq('exemplo embutido = arquivo de teste',D.EXEMPLO.trim(),ler('ficha-v2-exemplo.txt').trim());

// ficha v3: código #EXATO-FICHA
r=D.diagnosticar(ler('ficha-v3-exemplo.txt'),base);
eq('v3: lido pelo código',r.L.origem,'codigo');
eq('v3: riscos altos',ids(r,'alta'),['registro','ponto','pj','salario_min','por_fora','ferias']);
eq('v3: 2 endereços e regra por estabelecimento',/2 endereços/.test(r.itens.find(i=>i.id==='ponto').resp),true);
eq('v3: abaixo do mínimo, diferença por empregado',r.itens.find(i=>i.id==='salario_min').est.valor,71);
eq('v3: férias vencidas: 3 × (1.550 + 1/3)',Math.round(r.itens.find(i=>i.id==='ferias').est.valor*100)/100,6200);
eq('v3: multa do art. 47 sem porte informado',r.itens.find(i=>i.id==='registro').est.valor,3000);
eq('v3: 30 ou mais mulheres → creche',ids(r).includes('creche'),true);

// dados do escritório refinam
const txt=ler('ficha-v3-exemplo.txt');
r=D.diagnosticar(txt,{...base,comp:{porte:'ME/EPP',regime:'Simples Nacional'}});
eq('ME/EPP: multa de R$ 800 e sem cota de aprendiz',[r.itens.find(i=>i.id==='registro').est.valor,ids(r).includes('cota_aprendiz')],[800,false]);
eq('regime e porte informados: some o "Confirmar regime"',ids(r).includes('regime'),false);
r=D.diagnosticar(txt,{...base,comp:{porte:'Demais',regime:'Lucro Presumido',sal_medio:'2.400,00'}});
eq('fora do Simples: encargos patronais',ids(r).includes('patronal'),true);
eq('cota de aprendiz vira média fora de ME/EPP',r.itens.find(i=>i.id==='cota_aprendiz').p,'media');
eq('salário médio do escritório na estimativa das férias',r.itens.find(i=>i.id==='ferias').est.valor,9600);
// piso da CCT
const v3=t=>'RESPOSTAS DA FICHA DE INÍCIO\n#EXATO-FICHA:'+Buffer.from(JSON.stringify({ver:3,v:t})).toString('base64')+'#FIM';
const cct={ramo:'Comércio',pmin:2000,pref:2100,fim:'2027-04-30',reg:'SC000001/2026'};
r=D.diagnosticar(v3({razao:'X',qt_clt:'5',menor_sal:'1.900,00'}),{...base,comp:{cct}});
eq('abaixo do piso da CCT: diferença',[r.itens.find(i=>i.id==='piso').p,r.itens.find(i=>i.id==='piso').est.valor],['alta',100]);
r=D.diagnosticar(v3({razao:'X',qt_clt:'5',menor_sal:'2000'}),{...base,comp:{cct}});
eq('no piso: em ordem',r.itens.find(i=>i.id==='piso').p,'ok');
r=D.diagnosticar(v3({razao:'X',qt_clt:'5'}),{...base,comp:{cct:{...cct,fim:'2026-04-30'}}});
eq('CCT vencida a confirmar',ids(r).includes('cct_vencida'),true);
// respostas positivas viram "em ordem"
r=D.diagnosticar(v3({razao:'X',qt_clt:'25',ponto:'Aplicativo no celular',registro:'Antes ou no primeiro dia',exame:'Sim, sempre',por_fora:'Não',ferias_venc:'Não',almoco:'1 hora',processo:'Não',extra:'A empresa paga as horas a mais'}),base);
eq('pontos em ordem',ids(r,'ok'),['registro','ponto','compensacao','intervalo','aso','por_fora','ferias','processo']);
eq('nada alto nem médio: nota 100',r.nota.valor,100);
// marcar como resolvido tira da nota
r=D.diagnosticar(ler('ficha-v3-exemplo.txt'),{...base,feitos:{registro:{em:'x'},ponto:{em:'x'}}});
const r0=D.diagnosticar(ler('ficha-v3-exemplo.txt'),base);
eq('resolvidos não descontam',r.nota.valor-r0.nota.valor,24);
// cota PcD
r=D.diagnosticar(v3({razao:'X',qt_clt:'250'}),base);
eq('PcD: 201 a 500 empregados → 3%',/3% \(8 pessoas\)/.test(r.itens.find(i=>i.id==='cota_pcd').porque),true);
// texto sem ficha
eq('texto qualquer não vira empresa',D.ler('bom dia, segue a planilha').v.razao,undefined);
// resumo para o cliente
const res=D.resumoCliente(r0.L,r0.itens,{},'Padaria');
eq('resumo traz prioridades e documentos',[/Prioridades antes da primeira folha/.test(res),/Documentos que precisamos receber/.test(res)],[true,true]);

console.log(`diagnóstico: ${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
