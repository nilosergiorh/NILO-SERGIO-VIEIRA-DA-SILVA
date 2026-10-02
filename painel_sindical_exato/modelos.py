"""Definição das tabelas e campos exibidos nas telas de cadastro."""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Campo:
    nome: str
    rotulo: str
    tipo: str = "texto"  # texto | texto_longo | data | moeda | inteiro | opcao | ref | arquivo | cnpj
    opcoes: tuple = ()
    ref: str = ""  # tabela referenciada quando tipo == "ref"
    obrigatorio: bool = False
    na_lista: bool = False  # aparece como coluna na listagem
    largura: int = 140
    padrao: str = ""


@dataclass(frozen=True)
class Tabela:
    nome: str
    titulo: str
    campos: tuple = field(default_factory=tuple)
    busca: tuple = ()  # colunas usadas na pesquisa
    ordem: str = "id"

    def campo(self, nome: str) -> Campo:
        for c in self.campos:
            if c.nome == nome:
                return c
        raise KeyError(nome)


SINDICATOS = Tabela(
    nome="sindicatos",
    titulo="Sindicatos",
    campos=(
        Campo("nome", "Nome", obrigatorio=True, na_lista=True, largura=320),
        Campo("cnpj", "CNPJ", tipo="cnpj", na_lista=True, largura=140),
        Campo("tipo", "Tipo", tipo="opcao", opcoes=("Laboral", "Patronal"), obrigatorio=True, na_lista=True, largura=80),
        Campo("base_territorial", "Base territorial", tipo="texto_longo", na_lista=True, largura=260),
        Campo("telefone", "Telefone"),
        Campo("email", "E-mail"),
        Campo("site", "Site"),
        Campo("observacoes", "Observações", tipo="texto_longo"),
    ),
    busca=("nome", "cnpj", "base_territorial"),
    ordem="nome",
)

CCTS = Tabela(
    nome="ccts",
    titulo="CCTs",
    campos=(
        Campo("titulo", "Título / ramo", obrigatorio=True, na_lista=True, largura=260),
        Campo("registro_mte", "Registro MTE", na_lista=True, largura=120),
        Campo("sindicato_laboral_id", "Sindicato laboral", tipo="ref", ref="sindicatos", na_lista=True, largura=200),
        Campo("sindicato_patronal_id", "Sindicato patronal", tipo="ref", ref="sindicatos", largura=200),
        Campo("vigencia_inicio", "Vigência início", tipo="data", na_lista=True, largura=95),
        Campo("vigencia_fim", "Vigência fim", tipo="data", na_lista=True, largura=95),
        Campo("data_base", "Data-base (mês)", tipo="opcao",
              opcoes=("", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho",
                      "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro")),
        Campo("abrangencia", "Abrangência (municípios)", tipo="texto_longo"),
        Campo("cnaes", "CNAEs / atividades", tipo="texto_longo"),
        Campo("arquivo", "Arquivo da CCT (PDF)", tipo="arquivo"),
        Campo("observacoes", "Observações", tipo="texto_longo"),
    ),
    busca=("titulo", "registro_mte", "abrangencia", "cnaes"),
    ordem="titulo",
)

CLIENTES = Tabela(
    nome="clientes",
    titulo="Clientes",
    campos=(
        Campo("razao_social", "Razão social", obrigatorio=True, na_lista=True, largura=280),
        Campo("cnpj", "CNPJ", tipo="cnpj", na_lista=True, largura=140),
        Campo("cnae_principal", "CNAE principal", na_lista=True, largura=110),
        Campo("cnaes_secundarios", "CNAEs secundários", tipo="texto_longo"),
        Campo("municipio", "Município", na_lista=True, largura=120),
        Campo("cct_id", "CCT aplicável", tipo="ref", ref="ccts", na_lista=True, largura=240),
        Campo("grau_confianca", "Grau de confiança", tipo="opcao", opcoes=("", "ALTO", "MÉDIO", "BAIXO"), na_lista=True, largura=90),
        Campo("observacoes", "Observações", tipo="texto_longo"),
    ),
    busca=("razao_social", "cnpj", "cnae_principal", "municipio"),
    ordem="razao_social",
)

PISOS = Tabela(
    nome="pisos",
    titulo="Pisos por função",
    campos=(
        Campo("cct_id", "CCT", tipo="ref", ref="ccts", obrigatorio=True, na_lista=True, largura=240),
        Campo("funcao", "Função / faixa", obrigatorio=True, na_lista=True, largura=220),
        Campo("piso_experiencia", "Piso experiência (R$)", tipo="moeda", na_lista=True, largura=120),
        Campo("piso_efetivo", "Piso efetivo (R$)", tipo="moeda", na_lista=True, largura=120),
        Campo("carga_horaria_mensal", "Carga horária mensal (h)", tipo="inteiro", na_lista=True, largura=90, padrao="220"),
        Campo("clausula", "Cláusula"),
        Campo("observacoes", "Observações", tipo="texto_longo"),
    ),
    busca=("funcao", "clausula"),
    ordem="funcao",
)

CONTRIBUICOES = Tabela(
    nome="contribuicoes",
    titulo="Contribuições e prazos",
    campos=(
        Campo("cct_id", "CCT", tipo="ref", ref="ccts", obrigatorio=True, na_lista=True, largura=220),
        Campo("tipo", "Tipo", tipo="opcao",
              opcoes=("Assistencial", "Negocial", "Confederativa", "Sindical", "Outra"),
              obrigatorio=True, na_lista=True, largura=100),
        Campo("responsavel", "Quem paga", tipo="opcao", opcoes=("Empregado", "Empresa"), na_lista=True, largura=90),
        Campo("valor_descricao", "Valor / regra", na_lista=True, largura=200),
        Campo("vencimento", "Vencimento", tipo="data", na_lista=True, largura=95),
        Campo("prazo_oposicao", "Prazo de oposição", tipo="data", na_lista=True, largura=110),
        Campo("clausula", "Cláusula"),
        Campo("observacoes", "Observações", tipo="texto_longo"),
    ),
    busca=("tipo", "valor_descricao", "clausula"),
    ordem="vencimento",
)

TABELAS = {t.nome: t for t in (CLIENTES, CCTS, SINDICATOS, PISOS, CONTRIBUICOES)}
