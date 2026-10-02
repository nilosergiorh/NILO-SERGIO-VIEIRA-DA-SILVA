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
├── index.html                    # tela principal: trilho de módulos + Início
└── modulos/
    ├── painel-sindical.html      # Painel Sindical Exato
    └── auditoria-guias.html      # Exato Auditoria de Guias (INSS e IRRF)
```

- `index.html` é a casca do programa. Ela abre cada módulo numa área própria e mantém o módulo aberto quando você troca de tela.
- Cada arquivo em `modulos/` é o aplicativo completo e também funciona sozinho.
- No topo de cada módulo há uma "ponte" (`FLOWCLAUDE`). Quando o módulo roda dentro do Flow, ela usa os recursos do claude.ai da tela principal: base de dados, PDFs anexados, usuário e downloads.

## Publicação

O programa é publicado como Artifact no claude.ai, no mesmo endereço do antigo Painel Sindical. Com isso, a base de dados, os PDFs das convenções e as permissões continuam os mesmos.

| Arquivo no repositório | Caminho publicado |
|---|---|
| `index.html` | página principal |
| `modulos/painel-sindical.html` | `modulos/painel-sindical.html` |
| `modulos/auditoria-guias.html` | `modulos/auditoria-guias.html` |

## Como adicionar um módulo novo (ex.: Ponto)

1. Crie `modulos/<nome>.html` como uma página HTML completa.
2. Logo após `<body>`, cole a mesma ponte `FLOWCLAUDE` dos outros módulos e use `FLOWCLAUDE.use(...)` no lugar de `window.claude.use(...)`.
3. Em `index.html`, inclua o módulo em `MODS` e `VIEWS`, crie o botão no trilho (`data-go="<nome>"`) e a `<section class="view" id="v-<nome>">`.
4. Publique de novo incluindo o arquivo novo.

## Próximos passos

- **Cadastro único de clientes**: hoje os clientes ficam no Painel Sindical. O próximo passo é a Auditoria e o Ponto lerem esse mesmo cadastro (CNPJ, CCT vinculada).
- **Módulo Ponto**: aplicar as regras de jornada e hora extra da CCT e exportar no leiaute de importação do Domínio.
- **Tabelas com vigência**: faixas do INSS, IRRF e valores de CCT guardados com data de início, para não ficarem fixos no código.
