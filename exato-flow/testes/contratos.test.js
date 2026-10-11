// Documentos do contrato: validações legais e cláusulas condicionais
const K=require('../nucleo/contratos.js');
let ok=0, fail=0;
const eq=(n,a,b)=>{ const s=JSON.stringify(a)===JSON.stringify(b); s?ok++:fail++; if(!s) console.log('FALHA',n,'\n  obtido ',JSON.stringify(a),'\n  esperado',JSON.stringify(b)); };
const H='08:00-12:00 13:30-18:00', hor={seg:H,ter:H,qua:H,qui:H,sex:H,sab:'',dom:''};
const base={emp:{nome:'EMPRESA TESTE LTDA',cnpj:'00.000.000/0001-00',endereco:'Rua X, 1'},func:{nome:'FULANO',cpf:'1',endereco:'Rua Y',nascimento:'2000-01-01',cargo:'AUXILIAR',admissao:'2026-10-13',salario:2400,horario:hor,exp1:45,exp2:45},
  modelo:{...K.MODELO_PADRAO,compensacao:'sabado'},cct:{ramo:'Oficinas',reg:'SC000688/2026',pmin:2101.70,pref:2329.40},cidade:'Meleiro/SC',data:'2026-10-13'};
const txt=d=>d.blocos.map(b=>b.t).join('\n');
let d=K.montar('experiencia',base);
eq('experiência sem erros',d.erros,[]);
eq('datas: 45 dias contando a admissão e prorrogação automática',[/término em \*\*26\/11\/2026/.test(txt(d)),/prorrogado uma única vez por mais 45/.test(txt(d)),/até \*\*10\/01\/2027/.test(txt(d))],[true,true,true]);
eq('jornada semanal e compensação do sábado',[/42h30 semanais/.test(txt(d)),/Súmula 85/.test(txt(d))],[true,true]);
eq('sem cláusula assecuratória: arts. 479 e 480',[/art\. 479/.test(txt(d)),/art\. 481/.test(txt(d))],[true,false]);
eq('com cláusula assecuratória: art. 481',/art\. 481/.test(txt(K.montar('experiencia',{...base,modelo:{...base.modelo,assecuratoria:true}}))),true);
eq('prorrogação por termo quando não é automática',/mediante termo de prorrogação/.test(txt(K.montar('experiencia',{...base,modelo:{...base.modelo,prorroga_auto:false}}))),true);
eq('CCT citada com registro',/Oficinas, registro SC000688\/2026/.test(txt(d)),true);
eq('mínimos legais de HE e noturno',[/nunca inferior a 50%/.test(txt(d)),/nunca inferior a 20%/.test(txt(d))],[true,true]);
eq('salário abaixo do menor piso bloqueia',K.montar('experiencia',{...base,func:{...base.func,salario:2000}}).erros.some(e=>/menor piso/.test(e)),true);
eq('acima de 90 dias bloqueia',K.montar('experiencia',{...base,func:{...base.func,exp2:60}}).erros.some(e=>/90/.test(e)),true);
eq('menor sem responsável bloqueia',K.montar('experiencia',{...base,func:{...base.func,nascimento:'2010-01-01'}}).erros.some(e=>/responsável/.test(e)),true);
eq('menor de 16 fora de aprendizagem bloqueia',K.montar('indeterminado',{...base,func:{...base.func,nascimento:'2011-01-01',resp_nome:'X'}}).erros.some(e=>/aprendiz/.test(e)),true);
eq('mais de 44h sem compensação bloqueia',K.montar('indeterminado',{...base,modelo:{...base.modelo,compensacao:'nenhuma'},func:{...base.func,horario:{...hor,sab:'08:00-12:00'}}}).erros.some(e=>/44h/.test(e)),true);
eq('intervalo menor que 1h bloqueia',K.montar('indeterminado',{...base,func:{...base.func,horario:{seg:'08:00-12:00 12:30-17:00'}}}).erros.some(e=>/art\. 71/.test(e)),true);
eq('assinatura depois da admissão avisa',K.montar('experiencia',{...base,data:'2026-10-20'}).avisos.some(a=>/depois da admissão/.test(a)),true);
eq('termo de prorrogação fora do prazo bloqueia',K.montar('prorrogacao',{...base,data:'2026-11-27'}).erros.some(e=>/451/.test(e)),true);
eq('indeterminado não fala em experiência',/a título de experiência/.test(txt(K.montar('indeterminado',base))),false);
eq('docx bem formado',/^<\?xml[\s\S]*<w:sectPr>/.test(K.docxXml(d))&&!/[<>]\s*\*\*/.test(K.docxXml(d)),true);
eq('extenso',[K.extenso(45),K.extenso(30),K.extenso(90)],['quarenta e cinco','trinta','noventa']);
console.log(`${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
