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
| 2 · Ponto | Horas extras, faltas e adicionais pela regra da CCT | Ponto | Em construção |
| 3 · Folha | Lançamentos importados e folha calculada | Sistema Domínio | Externo |
| 4 · Guias | Extrato da folha conferido contra as DARFs da DCTFWeb | Auditoria de Guias | Ativo |

## Estrutura

```
exato-flow/
├── index.html                    # tela principal: trilho de módulos + Início com resumo do cadastro
├── nucleo/
│   └── flow-dados.js             # núcleo compartilhado: CNPJ, status da CCT, pendências, conexão com a base
└── modulos/
    ├── clientes.html             # Cadastro único de clientes
    ├── painel-sindical.html      # Painel Sindical Exato
    └── auditoria-guias.html      # Exato Auditoria de Guias (INSS e IRRF)
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
- O módulo Clientes não exclui clientes. Para tirar um cliente da carteira, mude a situação para "Inativo" e o histórico fica preservado.

## Publicação

O programa é publicado como Artifact no claude.ai, no mesmo endereço do antigo Painel Sindical. Com isso, a base de dados, os PDFs das convenções e as permissões continuam os mesmos.

| Arquivo no repositório | Caminho publicado |
|---|---|
| `index.html` | página principal |
| `modulos/painel-sindical.html` | `modulos/painel-sindical.html` |
| `modulos/auditoria-guias.html` | `modulos/auditoria-guias.html` |
| `modulos/clientes.html` | `modulos/clientes.html` |
| `nucleo/flow-dados.js` | `nucleo/flow-dados.js` |

## Como adicionar um módulo novo (ex.: Ponto)

1. Crie `modulos/<nome>.html` como uma página HTML completa.
2. Carregue `<script src="../nucleo/flow-dados.js" charset="utf-8"></script>` e use `FlowDados.assinar(...)` para receber clientes, CCTs e auditorias, e `FlowDados.use(...)` para os recursos do claude.ai.
3. Em `index.html`, inclua o módulo em `MODS` e `VIEWS`, crie o botão no trilho (`data-go="<nome>"`) e a `<section class="view" id="v-<nome>">`.
4. Publique de novo incluindo o arquivo novo.

## Próximos passos

- **Módulo Ponto**: aplicar as regras de jornada e hora extra da CCT e exportar no leiaute de importação do Domínio.
- **Tabelas com vigência**: faixas do INSS, IRRF e valores de CCT guardados com data de início, para não ficarem fixos no código.
