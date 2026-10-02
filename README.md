# NILO-SERGIO-VIEIRA-DA-SILVA

Repositório pessoal de Nilo Sergio Vieira da Silva.

## EXATO FLOW — versão para computador

Ecossistema de Departamento Pessoal da Exato, igual ao app **EXATO FLOW** do Claude, com os dados
guardados no próprio computador (funciona sem internet). Antes se chamava *Painel Sindical Exato*.

| Módulo | O que faz |
|---|---|
| **Início** | Resumo do cadastro, fluxo da competência (CCT → Ponto → Folha → Guias) e atalhos para os módulos |
| **Clientes** | Cadastro único (CNPJ, código do Domínio, dados de DP), pendências e resultado das auditorias |
| **Painel Sindical** | Enquadramento por sindicato e CCT, pisos, prazos, alertas, PDFs das convenções, enquadramento com IA |
| **Auditoria de Guias** | Extrato Mensal do Domínio × DARFs da DCTFWeb (INSS 1082/1099/1138, IRRF 0561), lote para impressão |
| **Ponto** | Em construção |
| **Dados** | Importar dados, backup, pasta de dados, seu nome, chave da IA, imagem do mascote |

Visual tecnológico em todos os módulos (vidro com profundidade, luzes, cartões 3D) e o mascote **E-exato**
— o lobo de óculos com moletom da Exato — no Início e no trilho lateral, com o anel de qualidades.
Os PDFs são lidos só no computador: pdf.js, pdf-lib e JSZip vão embutidos em `web/vendor/`.

### Instalar

1. GitHub → aba **Actions** → *Gerar instalador Windows* → execução mais recente (verde) → **Artifacts** →
   baixe `ExatoFlow-Instalador`, descompacte e rode o `ExatoFlow-Setup`. Não precisa de administrador.
2. Se o SmartScreen avisar "editor desconhecido": *Mais informações* → *Executar assim mesmo*.
3. Na primeira abertura, clique em **Importar dados (.zip)** e escolha o arquivo de dados exportado do app.

O programa abre numa janela própria do Microsoft Edge (já vem no Windows 10/11) e fecha sozinho quando a janela é fechada.

### Dados

- Ficam em `%APPDATA%\PainelSindicalExato` (banco `painel_sindical.db`, pasta `pdfs`, `backups`). Não são apagados ao desinstalar.
- **Faça backup** em *Dados e configurações → Fazer backup* (gera um .zip na pasta Downloads). Para backup automático,
  defina a variável de ambiente `PAINEL_SINDICAL_DADOS` apontando para uma pasta do OneDrive.
- Os dados de clientes **não** ficam neste repositório (`exportacao/` e `*.zip` estão no `.gitignore`).

### IA (opcional)

A sugestão de enquadramento usa a API do Claude (modelo `claude-opus-5-5`). Crie uma chave em
console.anthropic.com e informe em *Dados e configurações*. O uso é cobrado pela Anthropic, por consulta.
Sem a chave, todo o resto funciona. A busca automática de convenções vencidas continua sendo feita pelo Claude
(o botão mostra o texto para colar numa conversa).

### Rodar a partir do código

```bash
pip install -r requirements.txt
python main.py                          # ou executar_windows.bat
python -m unittest discover -s tests    # testes
```

### Estrutura

```
main.py                              ponto de entrada
painel_sindical_exato/
  app.py                             abre a janela e encerra quando ela fecha
  server.py                          servidor local (127.0.0.1, com token) e API
  store.py                           banco SQLite, PDFs, backup e importação
  ia.py                              sugestão de enquadramento via API do Claude
  config.py                          pasta de dados e preferências
  web/index.html                     tela inicial do EXATO FLOW (trilho de módulos)
  web/modulos/                       Clientes, Painel Sindical, Auditoria de Guias
  web/nucleo/                        dados compartilhados, tema tecnológico, mascote
  web/vendor/                        pdf.js, pdf-lib, JSZip (offline)
  web/local.js                       adaptador: liga os módulos ao banco local
installer/PainelSindicalExato.iss    instalador (Inno Setup)
.github/workflows/build-windows.yml  gera o .exe e o instalador
tests/                               testes automatizados
```

> Confirme registro e vigência no Mediador antes de aplicar uma CCT na folha.
