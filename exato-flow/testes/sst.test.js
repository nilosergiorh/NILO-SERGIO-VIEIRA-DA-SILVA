// SST: vencimentos dos documentos da empresa e leitura do PDF
const S=require('../nucleo/sst.js');
let ok=0, fail=0;
const eq=(n,a,b)=>{ const s=JSON.stringify(a)===JSON.stringify(b); s?ok++:fail++; if(!s) console.log('FALHA',n,'\n  obtido ',JSON.stringify(a),'\n  esperado',JSON.stringify(b)); };
const H='2026-10-19';
eq('somar meses no fim do mês',[S.addMeses('2024-01-31',1),S.addMeses('2024-10-19',24)],['2024-02-29','2026-10-19']);
eq('PGR sem validade: emissão + 2 anos',S.status('PGR',{emissao:'2024-11-10'},H),{st:'vence',txt:'Vence em 10/11/2026 (em 22 dias)',venc:'2026-11-10',calc:true,dias:22});
eq('validade escrita vale mais que o cálculo',S.status('PGR',{emissao:'2024-01-01',validade:'2027-01-01'},H).st,'vigente');
eq('vencido',S.status('PCMSO',{emissao:'2025-09-01'},H).st,'vencido');
eq('obrigatório sem documento = falta; opcional = não se aplica',[S.status('PGR',null,H).st,S.status('LTCAT',null,H).st],['falta','na']);
eq('dispensa',S.status('PGR',{dispensa:true,motivo:'ME grau 1'},H).st,'dispensado');
eq('sem data',S.status('INSAL',{responsavel:'X',emissao:'',validade:''},H).st,'na');
let r=S.resumo({docs:{PGR:{emissao:'2025-01-10'},PCMSO:{emissao:'2025-09-01'}}},H,false);
eq('resumo: pior = vencido; CIPA falta',[r.pior,r.cont.vencido,r.cont.falta],['vencido',1,1]);
r=S.resumo({docs:{}},H,true);
eq('sem empregados: nada é cobrado',[r.pior,r.cont.falta||0],['vigente',0]);
const n=S.normalizar({tipo:'pgr',emissao:'2026-02-30x',validade:'2028-02-10',grau_risco:'Grau 3',cipa_tipo:'designado',riscos:[{setor:'Açougue',tipo:'físico',agente:'frio',adicional:'insalubridade 20%'},{}],alertas:['',' x ']});
eq('normalizar: tipo, data inválida, grau, listas',[n.tipo,n.emissao,n.validade,n.grau_risco,n.cipa_tipo,n.riscos.length,n.alertas],['PGR','','2028-02-10','3','Designado',1,['x']]);
eq('adicionais dos laudos',S.adicionais({docs:{PGR:n}}).map(a=>a.agente+' '+a.adicional),['frio insalubridade 20%']);
// análise do adicional
const A=S.analisar([
  {setor:'Produção Madeiras',funcao:'Aux. Produção Madeira',agente:'Ruído',valor:81.9,unidade:'dB(A)',metodo:'NR-15',conclusao:'salubre',especial:'nao'},
  {setor:'Produção Madeiras',funcao:'Aux. Produção Madeira',agente:'Ruído',valor:87.18,unidade:'dB(A)',metodo:'NHO-01',conclusao:'salubre',especial:'nao'},
  {setor:'Produção Madeiras',funcao:'Aux. Produção Madeira',agente:'Poeira de madeira',conclusao:'nao_avaliado'},
  {setor:'Montagem',funcao:'Aux. Montagem',agente:'Ruído',valor:73.8,unidade:'dB(A)',metodo:'NR-15',conclusao:'salubre'},
  {setor:'Açougue',funcao:'Açougueiro',agente:'Frio (câmara fria)',conclusao:'insalubre',grau:'20%'},
  {setor:'Serraria',funcao:'Operador',agente:'Ruído',valor:91,unidade:'dB(A)',metodo:'NR-15',conclusao:'salubre'},
  {setor:'Manutenção',funcao:'Eletricista',agente:'Energia elétrica',conclusao:'perigoso'},
  {setor:'Manutenção',funcao:'Eletricista',agente:'Ruído',valor:88,unidade:'dB(A)',metodo:'NR-15',conclusao:'insalubre',grau:'20%'},
  {setor:'Pátio',funcao:'Abastecedor',agente:'Inflamáveis (diesel)',conclusao:''}].map(S.normRisco));
const V=Object.fromEntries(A.map(a=>[a.funcao,a.veredito]));
eq('vereditos por função',V,{'Açougueiro':'pagar','Operador':'pagar','Eletricista':'pagar','Aux. Produção Madeira':'verificar','Abastecedor':'verificar','Aux. Montagem':'nao_devido'});
const op=A.find(a=>a.funcao==='Operador'), el=A.find(a=>a.funcao==='Eletricista'), md=A.find(a=>a.funcao==='Aux. Produção Madeira');
eq('valor acima do limite com laudo "salubre" = divergência',[op.divergencia,op.grau],[true,'20%']);
eq('insalubridade e periculosidade não acumulam',/não acumulam/.test(el.resumo),true);
eq('NHO-01 acima de 85: alerta de aposentadoria especial',md.especial.length,1);
eq('normRisco: conclusão e grau',[S.normRisco({conclusao:'Não avaliado',grau:'grau médio 20'}).conclusao,S.normRisco({grau:'grau médio 20'}).grau,S.normRisco({valor:'87,18'}).valor],['nao_avaliado','20%',87.18]);
eq('arco elétrico da solda não é periculosidade',S.analisar([S.normRisco({funcao:'Soldador',agente:'Radiação do arco elétrico',conclusao:'nao_avaliado'})])[0].verificar.length,1);
console.log(`sst: ${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
