# NILO-SERGIO-VIEIRA-DA-SILVA

Repositório pessoal de Nilo Sergio Vieira da Silva.

## Painel Sindical Exato — versão para computador

Programa para Windows com **as mesmas telas e funções do app "Painel Sindical Exato" do Claude**,
com os dados guardados no próprio computador (funciona sem internet).
Visual 3D: painéis em vidro com profundidade, cartões que inclinam com o mouse, cubo da Exato girando e fundo animado.
O mascote E-exato é o lobo de óculos com moletom vermelho e a logo da Exato (também é o ícone do programa),
com o anel de qualidades ao passar o mouse;
pode ser trocado por outra imagem em *Dados e configurações*.

| Tela | O que faz |
|---|---|
| **Visão geral** | Indicadores, atalhos, calendário de obrigações, clientes por convenção, CCTs a renovar, cobertura da carteira, resultado da última busca de convenções |
| **Clientes** | Filtros (convenção, status, confiança, confirmado), edição do enquadramento, exportar CSV |
| **Convenções** | Cartões com vigência, pisos, sindicatos, pontos de atenção, base territorial, links e PDFs (anexar/abrir/remover) |
| **Pisos por função** | Piso da CCT x piso estadual SC 2026 |
| **Prazos** | Contribuições e obrigações, marcar como feito |
| **Alertas** | Pendências por prioridade, marcar como resolvido |
| **Buscar por município** | Quais CCTs cobrem a cidade |
| **Enquadrar empresa** | Pedidos de enquadramento com sugestão da IA (E-exato) e "Aplicar ao cliente" |
| **Sindicatos e sites** | Sites e páginas de CCT de cada sindicato |
| **Dados e configurações** | Importar dados, backup, pasta de dados, seu nome, chave da IA, imagem do mascote |

### Instalar

1. GitHub → aba **Actions** → *Gerar instalador Windows* → execução mais recente (verde) → **Artifacts** →
   baixe `PainelSindicalExato-Instalador`, descompacte e rode o `Setup`. Não precisa de administrador.
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
  web/index.html                     tela do app (mesma do Claude)
  web/local.js                       adaptador: liga a tela ao banco local
  web/tema3d.css                     visual 3D aplicado sobre a tela do app
installer/PainelSindicalExato.iss    instalador (Inno Setup)
.github/workflows/build-windows.yml  gera o .exe e o instalador
tests/                               testes automatizados
```

> Confirme registro e vigência no Mediador antes de aplicar uma CCT na folha.
