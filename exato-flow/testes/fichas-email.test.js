// Fichas de Início por e-mail: busca no Gmail (mock), filtro de importadas/ignoradas e texto da ficha
const FE=require('../nucleo/fichas-email.js');
let ok=0, fail=0;
const eq=(n,a,b)=>{ const s=JSON.stringify(a)===JSON.stringify(b); s?ok++:(fail++,console.log('FALHA',n,JSON.stringify(a),'≠',JSON.stringify(b))); };
const corpo="Empresa:\nX\n\nRespostas:\nRESPOSTAS DA FICHA DE INÍCIO\nAlfa Ltda – CNPJ 11.222.333/0001-81\n== SUA EMPRESA ==\n- CNPJ: 11.222.333/0001-81";
const mcp={ chamadas:[], async callTool(srv,tool,inp){ this.chamadas.push(tool);
  if(tool==="search_threads") return {payload:{threads:[
    {id:"t1",messageCount:1,messages:[{id:"m3",date:"2026-10-22T13:09:18Z",sender:"formresponses@netlify.com",snippet:"Empresa: Alfa Ltda Cnpj: 11.222.333/0001-81 Responsavel: A"}]},
    {id:"t2",messageCount:6,messages:[{id:"m1",date:"2026-10-16T13:39:08Z",sender:"formresponses@netlify.com",snippet:"Empresa: Teste Cnpj: 01.110.111/0001-00 Responsavel: N"}]}]}};
  if(tool==="get_thread") return {payload:{messages:[{id:"m1",date:"2026-10-16T13:39:08Z",sender:"formresponses@netlify.com",snippet:"Empresa: Teste Cnpj: 01.110.111/0001-00 R"},{id:"m2",date:"2026-10-16T16:31:43Z",sender:"formresponses@netlify.com",snippet:"Empresa: Beta SA Cnpj: 44.555.666/0001-77 R"},{id:"mx",date:"2026-10-17T10:00:00Z",sender:"alguem@x.com",snippet:"Re: ficha"}]}};
  if(tool==="get_message") return {payload:{plaintextBody:corpo}};
  throw {code:"tool_error"}; } };
const db={ doc:p=>({ get:async()=>({exists:true,data:()=>({ignorados:{m1:{em:"x"}}})}), set:async()=>{} }) };
(async()=>{
  eq('prévia: empresa e CNPJ',FE.dadosDaPrevia("Empresa: Alfa Ltda Cnpj: 11.222.333/0001-81 Responsavel: A"),{empresa:"Alfa Ltda",cnpj:"11.222.333/0001-81"});
  const todas=await FE.listar(mcp);
  eq('lista: abre a conversa com mais de 5 e-mails e descarta respostas de outros remetentes',todas.map(f=>f.id),["m3","m2","m1"]);
  const nv=await FE.novas(mcp,db,[{email_id:"m3"}]);
  eq('novas: tira as importadas (m3) e as ignoradas (m1)',nv.map(f=>f.id),["m2"]);
  eq('texto da ficha começa em RESPOSTAS DA FICHA DE INÍCIO',(await FE.texto(mcp,"m3")).split("\n")[0],"RESPOSTAS DA FICHA DE INÍCIO");
  console.log(`fichas-email: ${ok} ok, ${fail} falha(s)`); process.exit(fail?1:0);
})();
