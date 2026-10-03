# EXATO FLOW

**Processos conectados. Departamento Pessoal mais simples.**
por Exato Soluções Contábeis

Ecossistema dos aplicativos de Departamento Pessoal da Exato. Cada aplicativo é um **módulo** dentro do mesmo programa.

- **EXATO**: precisão, confiança e a identidade do escritório.
- **FLOW**: fluxo de trabalho, integração, automação e agilidade.

## Fluxo da competência

| Etapa | O que acontece | Módulo | Situação |
|---|---|---|---|
| 1 · CCT | Piso, reajuste, adicionais e jornada de cada cliente | Painel Sindical | Ativo |
| 2 · Ponto | Ponto em Excel ou foto: horas extras, faltas, DSR e noturno, com TXT para o Domínio | Ponto | Ativo |
| 3 · Folha | Lançamentos importados e folha calculada | Sistema Domínio | Externo |
| 4 · Guias | Extrato da folha conferido contra as DARFs da DCTFWeb | Auditoria de Guias | Ativo |

## Estrutura

```
exato-flow/
├── index.html                    # tela principal: trilho de módulos + Início com resumo do cadastro
├── nucleo/
│   ├── flow-dados.js             # núcleo compartilhado: CNPJ, status da CCT, pendências, conexão com a base
│   ├── ponto-calculo.js          # motor de apuração do ponto e do TXT do Domínio (sem tela; roda no Node)
│   ├── dominio-relatorios.js     # leitura de PDF, do Extrato Mensal e classificação das rubricas do Domínio
│   ├── tema-exato.css / .js      # tema escuro e mascote E-exato (todos os módulos)
│   ├── tema-sindical.css         # tema do Painel Sindical
│   └── mascote*.png
├── modulos/
│   ├── clientes.html             # Cadastro único de clientes
│   ├── painel-sindical.html      # Painel Sindical Exato
│   ├── ponto.html                # Conferência de ponto
│   └── auditoria-guias.html      # Exato Auditoria de Guias (INSS e IRRF)
└── testes/
    └── ponto-calculo.test.js     # node exato-flow/testes/ponto-calculo.test.js
```

- `index.html` é a casca do programa. Ela abre cada módulo numa área própria e mantém o módulo aberto quando você troca de tela.
- Cada arquivo em `modulos/` é o aplicativo completo e também funciona sozinho.
- No topo de cada módulo há uma "ponte" (`FLOWCLAUDE`). Quando o módulo roda dentro do Flow, ela usa os recursos do claude.ai da tela principal: base de dados, PDFs anexados, usuário e downloads.

## Cadastro único de clientes

A base do Flow tem uma coleção `clientes`, que é a mesma que o Painel Sindical sempre usou. Todos os módulos leem dela.

| Grupo | Campos | Quem preenche |
|---|---|---|
| Cadastrais | `cod` (código no Domínio), `nome`, `fant`, `cnpj`, `mun`, `cnae`, `ativ` | Clientes ou Painel Sindical |
| Sindical | `cct`, `lab`, `pat`, `conf`, `confirmado` | Painel Sindical |
| Departamento Pessoal | `dp_situacao`, `dp_regime`, `dp_func`, `dp_ponto`, `dp_resp`, `dp_contato`, `dp_email`, `dp_fone`, `dp_obs` | Clientes |

- **Chave de ligação entre módulos:** o CNPJ (só dígitos). O código do Domínio é conferido junto.
- **Pendências** (calculadas em `nucleo/flow-dados.js`):
  - **Graves:** sem CNPJ, CNPJ inválido ou repetido, código repetido, sem CCT, CCT vencida.
  - **Médias:** sem código do Domínio, CCT fora do Painel, sem regime tributário.
  - **Leves:** enquadramento não confirmado, sem número de funcionários.
- **Coleção `auditorias`:** um documento por CNPJ, com a última auditoria de guias (`ultima`) e as últimas 12 competências (`hist`). A Auditoria de Guias grava esses dados sozinha a cada auditoria, mas só quando o resultado muda.
- **Ficha da empresa** (botão "Anexar ficha da empresa", na ficha do cliente):
  - Lida pelo Claude: relatório Empresas do Domínio, cartão CNPJ ou documento parecido.
  - Propõe os campos para conferir: código, razão social, fantasia, CNAE, município/UF, endereço, CEP, regime e início das atividades, e também `emp_fpas`, `emp_rat`, `emp_fap`, `emp_terceiros`, inscrições, responsável e contatos.
  - Campos vazios no cadastro vêm marcados; campos que mudaram ficam desmarcados. O CNPJ nunca é trocado: se for diferente, aparece alerta.
  - O PDF fica anexado ao cliente (`emp_docs`, no armazenamento de arquivos do Flow).
- **Cadastro de funcionários** (`funcionarios/{cnpj}`, um documento por cliente com a `lista`). Pode ser alimentado pelo botão "Enviar fichas dos funcionários", na ficha do cliente, ou pela aba Arquivos do Ponto.
  - Guarda só o que os módulos usam: código, nome, cargo, situação, admissão, nascimento, horário por dia da semana, férias, afastamento e rescisão.
  - CPF, endereço, salário e dados bancários não são guardados, e o PDF das fichas não é armazenado (LGPD).
  - Funcionários com o mesmo código ou nome são atualizados, sem duplicar. Ao aplicar, o nº de funcionários do cliente (`dp_func`) pode ser atualizado.
- O módulo Clientes não exclui clientes. Para tirar um cliente da carteira, mude a situação para "Inativo" e o histórico fica preservado.

## Conferência de ponto

1. **Relatórios do Domínio** (uma vez por cliente; repita quando houver admissão ou mudança de rubrica):
   - **Extrato Mensal** (PDF): lido direto, sem custo, com o mesmo leitor da Auditoria de Guias. Traz os empregados com o código e todos os eventos lançados. O Flow escolhe, pela descrição, as rubricas de HE (com o percentual), HE 100%, adicional noturno, redução noturna, horas faltas, falta de dia inteiro e DSR. Reflexos e médias ficam de fora.
   - **Fichas de Empregado** e outros relatórios (PDF, planilha ou imagem): lidos pelo Claude. Trazem cargo, admissão, nascimento, horário de trabalho (vira jornada do funcionário), férias, afastamento e rescisão.
   - Tudo aparece numa **proposta para conferir**. Só é gravado depois de "Aplicar ao cliente": rubricas em `ponto_regras/{cnpj}` e funcionários no cadastro compartilhado `funcionarios/{cnpj}`.
   - A jornada de cada funcionário sai do horário da ficha. Código e jornada escolhidos no próprio Ponto prevalecem (`ponto_regras.funcs`).
   - Na apuração, férias, afastamento, dias antes da admissão e dias depois da rescisão entram sozinhos como ocorrência.
   - Na aba TXT aparecem os cruzamentos:
     - funcionário do Domínio sem ponto no mês;
     - funcionário do ponto que não está nas fichas;
     - menor de 18 anos com hora extra ou noturno;
     - rubricas ainda não conferidas com o Domínio.
2. **Ponto:** o cliente envia o ponto em Excel/CSV ou em foto do cartão.
   - A planilha no modelo da Exato (botão "Baixar modelo Excel") é lida direto, sem custo.
   - Planilhas em outro formato e fotos são organizadas pelo Claude. Isso consome o uso do Claude de quem está operando.
   - Nas fotos, os dias com leitura incerta ficam marcados para conferência.
3. **Conferência:** grade do período por funcionário, com as marcações editáveis, a ocorrência do dia e os alertas:
   - marcação ímpar ou ilegível;
   - intervalo menor que 1h;
   - mais de 2h extras no dia;
   - interjornada menor que 11h;
   - semana acima de 44h.

   Férias e afastamentos podem ser aplicados a um intervalo de datas de uma vez.
4. **Regras do cliente** (guardadas em `ponto_regras/{cnpj}`):
   - jornadas e tolerância;
   - faixas de hora extra, com limite por mês (ex.: 70% até 30h) ou por dia;
   - sábado a 100% e tratamento do dia com um só par de marcações;
   - perda do DSR por falta de meio período;
   - adicional noturno, com hora reduzida, prorrogação e rubrica de redução opcional;
   - feriados locais e período do ponto (ex.: 21 a 20);
   - rubricas, formato das horas e registro 11.
5. **TXT do Domínio:** leiaute "Importar Lançamentos". Registro 10 com 43 posições; registro 11 opcional, com a data de cada falta. Rubricas padrão da Exato: 150, 200, 8069, 40 e 42; a do adicional noturno é por cliente. O TXT só é liberado depois de "Marcar como conferido", sem pendências em vermelho.

A apuração de cada mês fica em `ponto/{cnpj}_{AAAAMM}`. O código do Domínio e a jornada de cada funcionário ficam lembrados para os meses seguintes.

As regras de cálculo seguem o sistema `ponto-dominio` (branch `claude/init-git-repo-mjhm65`). Diferenças a confirmar antes de usar em produção:
- Formato das horas: o `ponto-dominio` usa horas decimais (centesimal); a planilha de lançamentos usa sexagesimal. No Flow, a escolha é por cliente.
- Registro 11: o `ponto-dominio` não gera; a planilha de lançamentos gera para a rubrica 40. No Flow, também é escolha por cliente.

## Publicação

O programa é publicado como Artifact no claude.ai, no mesmo endereço do antigo Painel Sindical. Com isso, a base de dados, os PDFs das convenções e as permissões continuam os mesmos.

| Arquivo no repositório | Caminho publicado |
|---|---|
| `index.html` | página principal |
| `modulos/painel-sindical.html` | `modulos/painel-sindical.html` |
| `modulos/auditoria-guias.html` | `modulos/auditoria-guias.html` |
| `modulos/clientes.html` | `modulos/clientes.html` |
| `nucleo/flow-dados.js` | `nucleo/flow-dados.js` |
| `modulos/ponto.html` | `modulos/ponto.html` |
| `nucleo/ponto-calculo.js` | `nucleo/ponto-calculo.js` |
| `nucleo/dominio-relatorios.js` | `nucleo/dominio-relatorios.js` |
| `nucleo/tema-*.css`, `tema-exato.js`, `mascote*.png` | mesmo caminho |

## Como adicionar um módulo novo (ex.: Ponto)

1. Crie `modulos/<nome>.html` como uma página HTML completa.
2. Carregue `<script src="../nucleo/flow-dados.js" charset="utf-8"></script>` e use `FlowDados.assinar(...)` para receber clientes, CCTs e auditorias, e `FlowDados.use(...)` para os recursos do claude.ai.
3. Em `index.html`, inclua o módulo em `MODS` e `VIEWS`, crie o botão no trilho (`data-go="<nome>"`) e a `<section class="view" id="v-<nome>">`.
4. Publique de novo incluindo o arquivo novo.

## Próximos passos

- **Versão para computador** (branch `claude/gallant-lovelace-pidnih`): incluir o módulo Ponto em `web/modulos` e os arquivos de `nucleo`.
- **Tabelas com vigência**: faixas do INSS, IRRF e valores de CCT guardados com data de início, para não ficarem fixos no código.
