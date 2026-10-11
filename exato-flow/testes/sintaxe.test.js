// Sintaxe dos scripts embutidos nas páginas: um erro aqui deixa o módulo inteiro parado em "Conectando…"
const fs=require('fs'), path=require('path'), vm=require('vm');
const raiz=path.join(__dirname,'..');
const paginas=['index.html',...fs.readdirSync(path.join(raiz,'modulos')).filter(f=>f.endsWith('.html')).map(f=>'modulos/'+f)];
let ok=0, fail=0;
for(const p of paginas){
  const html=fs.readFileSync(path.join(raiz,p),'utf8');
  for(const m of html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)){
    if(/type=["']?(module|application\/json|text\/template)/.test(m[1])) { ok++; continue; }
    try{ new vm.Script(m[2],{filename:p}); ok++; }
    catch(e){ fail++; console.log('FALHA',p,'linha',html.slice(0,m.index).split('\n').length,'→',e.message); }
  }
}
for(const f of fs.readdirSync(path.join(raiz,'nucleo')).filter(f=>f.endsWith('.js'))){
  try{ new vm.Script(fs.readFileSync(path.join(raiz,'nucleo',f),'utf8'),{filename:f}); ok++; }
  catch(e){ fail++; console.log('FALHA nucleo/'+f,'→',e.message); }
}
console.log(`sintaxe: ${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
