# NILO-SERGIO-VIEIRA-DA-SILVA

Repositório pessoal de Nilo Sergio Vieira da Silva.

## EXATO FLOW

Ecossistema de Departamento Pessoal da Exato Soluções Contábeis: Painel, Painel Sindical, Cálculo de Ponto,
Auditoria de guias e folha e o cadastro único de Clientes.

**Um código só, dois jeitos de usar:**

| | Onde roda | Dados |
|---|---|---|
| App no Claude | link do claude.ai (onde o programa é desenvolvido e testado) | base do Claude |
| **Programa para computador** (Windows) | janela própria do Microsoft Edge, sem internet | banco no próprio computador |

As telas ficam em [`exato-flow/`](exato-flow/README.md). O programa para computador usa essa mesma pasta:
o servidor local entrega as páginas trocando as bibliotecas do cdnjs pelas cópias em
`painel_sindical_exato/web/vendor/`, e o `local.js` liga os módulos ao banco do computador
(mesma interface `claude.use`: db, user, assets, downloads, sample). Uma melhoria feita no Flow vale para os dois.

### Instalar no computador

1. GitHub → aba **Actions** → *Gerar instalador Windows* → execução mais recente (verde) → **Artifacts** →
   baixe `ExatoFlow-Instalador`, descompacte e rode o `ExatoFlow-Setup`. Não precisa de administrador.
2. Se o SmartScreen avisar "editor desconhecido": *Mais informações* → *Executar assim mesmo*.
3. Na primeira abertura, clique em **Importar dados (.zip)** e escolha o arquivo de dados exportado do app.

### Dados

- Ficam em `%APPDATA%\PainelSindicalExato` (banco `painel_sindical.db`, pasta `pdfs`, `backups`). Não são apagados ao desinstalar.
- **Faça backup** em *Dados → Fazer backup* (gera um .zip na pasta Downloads). Para backup automático,
  defina a variável de ambiente `PAINEL_SINDICAL_DADOS` apontando para uma pasta do OneDrive.
- Coleções: clientes, ccts, prazos, alertas, pedidos, auditorias, meta, ponto, ponto_regras, funcionarios, cct_ponto.
- Os dados de clientes **não** ficam neste repositório (`exportacao/` e `*.zip` estão no `.gitignore`).

### IA (opcional)

Fora do Claude, a leitura de **fotos de cartão ponto, fichas do Domínio e convenções** e a sugestão de enquadramento
usam a API do Claude (modelo `claude-opus-5-5`). Crie uma chave em console.anthropic.com e informe em
*Dados e configurações*. O uso é cobrado pela Anthropic, por leitura. Sem a chave funcionam o ponto em Excel,
o cálculo, o TXT do Domínio, o cadastro, o Painel Sindical e a Auditoria de Guias.

### Rodar a partir do código

```bash
pip install -r requirements.txt
python main.py                          # ou executar_windows.bat
python -m unittest discover -s tests    # testes do programa para computador
node exato-flow/testes/ponto-calculo.test.js   # testes do motor do ponto
```

### Estrutura

```
exato-flow/                          EXATO FLOW (telas, módulos, núcleo) - fonte única
main.py                              ponto de entrada do programa para computador
painel_sindical_exato/
  app.py                             abre a janela e encerra quando ela fecha
  server.py                          servidor local (127.0.0.1, com token): entrega exato-flow e a API
  store.py                           banco SQLite, PDFs, backup e importação
  ia.py                              leitura com o Claude (texto e fotos)
  config.py                          pasta de dados e preferências
  web/local.js                       adaptador: liga os módulos ao banco local
  web/vendor/                        pdf.js, pdf-lib, JSZip, SheetJS (offline)
installer/PainelSindicalExato.iss    instalador (Inno Setup)
.github/workflows/build-windows.yml  gera o .exe e o instalador a cada envio
tests/                               testes automatizados
```

> Confirme registro e vigência no Mediador antes de aplicar uma CCT na folha.
