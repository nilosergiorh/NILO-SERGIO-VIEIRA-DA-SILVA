# NILO-SERGIO-VIEIRA-DA-SILVA

Repositório pessoal de Nilo Sergio Vieira da Silva.

## Painel Sindical Exato

Programa de computador (Windows) para controlar o **enquadramento sindical** dos clientes da Exato:
sindicatos, CCTs, pisos por função, contribuições e prazos — com alertas automáticos.

### O que ele faz

| Aba | Função |
|---|---|
| **Painel** | Indicadores (clientes, CCTs vigentes etc.) e lista de alertas por severidade. Dois cliques abrem o cadastro. |
| **Clientes** | Razão social, CNPJ (com validação), CNAE, município, CCT aplicável, grau de confiança do enquadramento. |
| **CCTs** | Registro MTE, sindicatos laboral/patronal, vigência, data-base, abrangência, CNAEs, PDF da CCT (botão *Abrir*). |
| **Sindicatos** | Laborais e patronais, CNPJ, base territorial, contatos. |
| **Pisos por função** | Piso de experiência e efetivo por CCT, carga horária e cláusula. |
| **Contribuições e prazos** | Assistencial/negocial/confederativa, quem paga, vencimento e prazo de oposição. |
| **Conferir piso** | Salário x piso proporcional à jornada (OJ 358 TST) e estimativa de passivo retroativo com reflexos. |

**Alertas gerados:** CCT vencida ou a vencer (prazo configurável), CCT sem registro no MTE, prazo de oposição/vencimento
de contribuição nos próximos 30 dias, cliente sem CCT, município do cliente fora da abrangência da CCT,
enquadramento com confiança BAIXA.

**Menu Arquivo:** backup do banco, exportar tudo para CSV (abre no Excel), abrir pasta de dados.

### Como instalar no Windows

1. No GitHub, abra a aba **Actions** → *Gerar instalador Windows* → execução mais recente (verde).
2. Em **Artifacts**, baixe `PainelSindicalExato-Instalador` e descompacte.
3. Execute `PainelSindicalExato-Setup-x.y.z.exe`. Não precisa de senha de administrador.
   O Windows SmartScreen pode avisar "editor desconhecido" (o programa não tem certificado digital pago):
   clique em *Mais informações* → *Executar assim mesmo*.

Para publicar uma versão na aba **Releases**, crie uma tag `v1.0.0` (o instalador é anexado automaticamente).

### Onde ficam os dados

- Banco local SQLite em `%APPDATA%\PainelSindicalExato\painel_sindical.db` (não é apagado ao desinstalar).
- Para usar outra pasta (ex.: OneDrive), defina a variável de ambiente `PAINEL_SINDICAL_DADOS`.
- Faça backups periódicos pelo menu *Arquivo → Fazer backup do banco*.

### Rodar a partir do código (opcional)

Requer Python 3.10+ (com Tkinter, que já vem no instalador oficial do Python para Windows).

```bash
python main.py              # ou dê dois cliques em executar_windows.bat
python -m unittest discover -s tests   # testes
```

### Estrutura

```
main.py                         ponto de entrada
painel_sindical_exato/
  modelos.py                    campos de cada cadastro
  db.py                         banco SQLite, backup, exportação CSV
  regras.py                     alertas, conferência de piso, estimativa de passivo
  formatos.py                   datas, valores em R$, CNPJ
  ui/                           telas (Tkinter)
installer/PainelSindicalExato.iss   instalador (Inno Setup)
.github/workflows/build-windows.yml gera o .exe e o instalador
tests/                          testes automatizados
```

> As informações do painel dependem do que for cadastrado. Sempre confirme registro, vigência e cláusulas
> da CCT no Mediador/MTE. A estimativa de passivo é aproximada (não inclui INSS patronal, correção e juros).
