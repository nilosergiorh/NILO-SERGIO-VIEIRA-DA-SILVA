# Ponto → Folha Domínio: como usar todo mês

Tudo roda **neste computador**, com dois cliques. Não precisa mais do projeto no claude.ai.

## Jeito mais fácil: o aplicativo

Dois cliques em **"Ponto - Dominio"** na Área de Trabalho (ou `PONTO - Abrir aplicativo.bat`).
Abre no navegador um painel com todos os clientes e meses. Deixe a janela preta aberta enquanto usa.

1. **+ Novo mês** → arraste os arquivos do cliente → *Gerar planilha do mês*.
2. Veja o painel: horas extras, faltas, noturno, DSR, **pendências** (com mensagens prontas para
   copiar e mandar ao cliente) e irregularidades legais.
3. Com as respostas do cliente: **Abrir planilha no Excel** → corrija no PONTO_BRUTO → salve e feche →
   **Atualizar**.
4. Quando ficar verde (**Pronto para importar**): **Gerar TXT para o Domínio** → o arquivo é baixado.

**📋 Cadastro da empresa** (na lista à esquerda, abaixo do nome de cada cliente): tudo do cliente numa tela só,
em 5 abas: **Empresa** (nome, CNPJ, código no Domínio), **Sindicato / CCT**, **Rubricas**, **Jornada e feriados**
e **Funcionários** (código, cargo, admissão, férias, afastamento, rescisão, quem não bate ponto).
Depois de mexer, clique em **💾 Salvar**. Vale na próxima planilha gerada ou no próximo **Atualizar**.
- A aba **Sindicato / CCT** é só para consulta: o cálculo usa a aba **Jornada e feriados** e as **Rubricas**.
  Se a vigência da CCT vencer, aparece um aviso vermelho.
- Cada vez que salva, a versão anterior fica guardada em `clientes\NOME\_historico\`.
- Cliente novo: botão **+ Novo cliente** no fim da lista → preencha o cadastro → Salvar.

**E-exato, o mascote lobo-robô** (canto inferior direito; passe o mouse para ver as qualidades girando):
comenta o mês aberto e, clicando nele, conversa com você
sobre os números reais ("quem fez mais extra?", "escreve a mensagem de pendências para o cliente",
"já posso importar?"). Precisa da chave da API da Anthropic (pedida no próprio chat na primeira vez;
a mesma chave serve para ler fotos e PDFs). Cada conversa tem um custo pequeno na API.

## Pelos atalhos (sem o aplicativo)

1. **Receba do cliente** o ponto: espelho do relógio (Excel), planilha-modelo preenchida, fotos ou PDF.
   Se houver **férias, rescisões ou afastamentos**, anote no `clientes\NOME\config.json`
   (datas no formato AAAA-MM-DD).
2. Dois cliques em **`PONTO - 1 Gerar planilha do mes.bat`**
   → escolha o cliente → escolha os arquivos (pode escolher vários de uma vez).
   A planilha é criada em `clientes\NOME\AAAA-MM\` e abre sozinha.
   Os arquivos recebidos ficam guardados em `clientes\NOME\AAAA-MM\recebidos\`.
3. No **PAINEL**, veja as pendências. Pergunte ao cliente e corrija no **PONTO_BRUTO**
   (horários nas colunas D a I ou a ocorrência na J, com o motivo na K). **Salve e feche.**
4. Dois cliques em **`PONTO - 2 Gerar TXT para o Dominio.bat`** → escolha a planilha.
   O arquivo `lancamentos_dominio_AAAAMM.txt` é gravado na mesma pasta.
   Se ainda houver pendências, o programa avisa antes de gerar.
5. No Domínio: **Utilitários > Importação > De Arquivo Texto > De Lançamentos** → escolha o TXT.

## Outras opções (`PONTO - 3 Outras opcoes.bat`)

- **Planilha-modelo para o cliente**: gera um Excel já com os nomes dos funcionários e os dias do mês.
  O cliente só preenche os horários, e o programa lê sem erro e sem custo de IA.
- **Cadastrar novo cliente**: cria a pasta e o `config.json` (código da empresa, rubricas, jornada,
  códigos dos funcionários). Mais fácil pelo aplicativo: **+ Novo cliente** e **📋 Cadastro da empresa**.
- **Configurar chave da IA**: necessária só para **fotos e PDFs** (cada leitura tem custo na API
  da Anthropic; o resultado fica guardado e não é cobrado de novo).

## O que mudou em relação à versão anterior

- **Feriados nacionais entram sozinhos** (ex.: 07/09, 12/10, 02/11, 20/11 e Sexta-feira Santa).
  Estaduais e municipais vão em `"feriados"` no config.
- **Lê foto, PDF e planilha-modelo**, além do espelho do relógio.
- **Regerar sem perder correções**: escolha a planilha já corrigida como arquivo de entrada.
- **TXT gerado automaticamente** (acabou o copiar/colar no Bloco de Notas).
- Códigos por nome **não confundem mais nomes parecidos** (RAFAEL ≠ RAFAELA). A lista de avisos mostra
  quem ficou sem código.
- DSR correto também em fechamentos 21→20; textos que não falam mais de agosto; espaço para mais de
  30 funcionários.

## Para funcionar

- Python 3.12 (já instalado) com openpyxl, anthropic e pillow.
- **LibreOffice** (gratuito): faz o recálculo automático para o TXT. Sem ele, abra a planilha
  no Excel, salve (Ctrl+S) e feche antes do passo 4.
