/*
 * EXATO FLOW · agenda fixa do DP: vencimentos que se repetem todo mês para todos os clientes com empregados.
 * Datas calculadas com os feriados NACIONAIS (os municipais e estaduais não entram: confira o do cliente).
 *  - Salário: até o 5º dia útil do mês seguinte (CLT, art. 459, § 1º). Sábado conta como dia útil; domingo e feriado não.
 *  - eSocial (fechamento da folha) e DCTFWeb: dia 15; em dia não útil, antecipa.
 *  - FGTS Digital: dia 20 (Lei 8.036/1990, art. 15); em dia não útil, antecipa (Portaria MTE 240/2024).
 *  - DARF da DCTFWeb (INSS e IRRF): dia 20 (Lei 8.212/1991, art. 30, I, "b"; Lei 11.196/2005, art. 70, I, "d"); sem expediente bancário, antecipa.
 *  - 13º salário: 1ª parcela até 30/11 e 2ª até 20/12 (Lei 4.749/1965, arts. 1º e 2º).
 */
(function(raiz){
  "use strict";
  const p2=n=>String(n).padStart(2,"0");
  const iso=d=>d.getUTCFullYear()+"-"+p2(d.getUTCMonth()+1)+"-"+p2(d.getUTCDate());
  const dt=(a,m,d)=>new Date(Date.UTC(a,m-1,d));
  const soma=(d,n)=>{ const x=new Date(d.getTime()); x.setUTCDate(x.getUTCDate()+n); return x; };
  function pascoa(a){ // algoritmo de Meeus/Jones/Butcher
    const b=a%19,c=Math.floor(a/100),d=a%100,e=Math.floor(c/4),f=c%4,g=Math.floor((c+8)/25),h=Math.floor((c-g+1)/3),i=(19*b+c-e-h+15)%30,
      k=Math.floor(d/4),l=d%4,m=(32+2*f+2*k-i-l)%7,n=Math.floor((b+11*i+22*m)/451),mes=Math.floor((i+m-7*n+114)/31),dia=((i+m-7*n+114)%31)+1;
    return dt(a,mes,dia); }
  const memo={};
  // nacionais: feriados de lei (inclui 20/11, Lei 14.759/2023) e Sexta-feira Santa. bancarios: + Carnaval (seg e ter) e Corpus Christi, sem expediente bancário.
  function feriados(a){
    if(memo[a]) return memo[a];
    const P=pascoa(a), nac={}, ban={};
    [["01-01","Confraternização Universal"],["04-21","Tiradentes"],["05-01","Dia do Trabalho"],["09-07","Independência"],["10-12","Nossa Senhora Aparecida"],
     ["11-02","Finados"],["11-15","Proclamação da República"],["11-20","Dia da Consciência Negra"],["12-25","Natal"]].forEach(([md,n])=>nac[a+"-"+md]=n);
    nac[iso(soma(P,-2))]="Sexta-feira Santa";
    Object.assign(ban,nac); ban[iso(soma(P,-48))]="Carnaval"; ban[iso(soma(P,-47))]="Carnaval"; ban[iso(soma(P,60))]="Corpus Christi";
    return memo[a]={nac,ban};
  }
  const nomeFeriado=(s,bancario)=>{ const F=feriados(+s.slice(0,4)); return (bancario?F.ban:F.nac)[s]||""; };
  // dia útil "trabalhista" (salário): segunda a sábado, sem feriado nacional. "bancário" (guias): segunda a sexta, sem feriado nem dia sem expediente bancário.
  function util(d,bancario){ const w=d.getUTCDay(), s=iso(d); if(w===0) return false; if(bancario&&w===6) return false; return !nomeFeriado(s,bancario); }
  function antecipa(d){ let x=d; while(!util(x,true)) x=soma(x,-1); return x; }
  function quintoUtil(a,m){ let d=dt(a,m,1), n=0; for(;;){ if(util(d,false)&&++n===5) return d; d=soma(d,1); } }
  const MES=["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
  const rotComp=(a,m)=>MES[m-1]+"/"+a;
  // obrigações que VENCEM no mês a/m (competência = mês anterior)
  function doMes(a,m){
    const ca=m===1?a-1:a, cm=m===1?12:m-1, comp=rotComp(ca,cm), out=[];
    const add=(d,o)=>{ const s=iso(d), orig=o.orig&&o.orig!==s?o.orig:""; out.push({data:s,fixo:true,cct:"Todos os clientes com empregados",quem:o.quem,tipo:o.tipo,obr:o.obr,fund:o.fund,
      ajuste:orig?`${orig.split("-").reverse().join("/")} é ${nomeFeriado(orig,true)||(new Date(orig+"T12:00:00Z").getUTCDay()===0?"domingo":"sábado")}: antecipado`:"",id:o.id+"-"+s}); };
    add(quintoUtil(a,m),{id:"salario",tipo:"Folha",quem:"Empresa → empregados",obr:`Pagamento dos salários de ${comp} (5º dia útil)`,fund:"CLT, art. 459, § 1º. Sábado conta como dia útil; confira se a CCT antecipa a data."});
    const d15=dt(a,m,15), d20=dt(a,m,20);
    add(antecipa(d15),{id:"esocial",tipo:"Mensal",quem:"Escritório",obr:`eSocial: fechamento da folha de ${comp} e transmissão da DCTFWeb`,fund:"Prazo do dia 15; em dia não útil, antecipa.",orig:iso(d15)});
    add(antecipa(d20),{id:"fgts",tipo:"Guia",quem:"Empresa → Caixa",obr:`FGTS Digital de ${comp}`,fund:"Lei 8.036/1990, art. 15: dia 20; em dia não útil, antecipa para o dia útil anterior. Pix até 21h59 de Brasília.",orig:iso(d20)});
    add(antecipa(d20),{id:"darf",tipo:"Guia",quem:"Empresa → Receita",obr:`DARF da DCTFWeb de ${comp}: INSS e IRRF`,fund:"Lei 8.212/1991, art. 30, I, b, e Lei 11.196/2005, art. 70, I, d: dia 20; sem expediente bancário, antecipa.",orig:iso(d20)});
    if(m===11){ const d=dt(a,11,30); add(util(d,false)?d:antecipa(d),{id:"13a",tipo:"Folha",quem:"Empresa → empregados",obr:`13º salário de ${a}: 1ª parcela`,fund:"Lei 4.749/1965, art. 2º: até 30 de novembro. Em domingo ou feriado, pague antes.",orig:iso(d)}); }
    if(m===12){ const d=dt(a,12,20); add(util(d,false)?d:antecipa(d),{id:"13b",tipo:"Folha",quem:"Empresa → empregados",obr:`13º salário de ${a}: 2ª parcela`,fund:"Lei 4.749/1965, art. 1º: até 20 de dezembro. Em domingo ou feriado, pague antes.",orig:iso(d)}); }
    return out.sort((x,y)=>x.data.localeCompare(y.data));
  }
  // de "desde" (AAAA-MM-DD) até "meses" meses à frente
  function periodo(desde,meses){ const a=+desde.slice(0,4), m=+desde.slice(5,7), out=[];
    for(let i=0;i<(meses||3);i++){ const t=(m-1+i), aa=a+Math.floor(t/12), mm=t%12+1; out.push(...doMes(aa,mm)); } return out; }

  const API={feriados,nomeFeriado,util,antecipa,quintoUtil,doMes,periodo,pascoa:a=>iso(pascoa(a))};
  raiz.AgendaDP=API;
  if(typeof module!=="undefined") module.exports=API;
})(typeof window!=="undefined"?window:globalThis);
