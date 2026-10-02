"""Acesso ao banco SQLite local."""

import csv
import sqlite3
from pathlib import Path

from .modelos import TABELAS

ESQUEMA = """
CREATE TABLE IF NOT EXISTS sindicatos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    cnpj TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('Laboral', 'Patronal')),
    base_territorial TEXT,
    telefone TEXT,
    email TEXT,
    site TEXT,
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS ccts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    registro_mte TEXT,
    sindicato_laboral_id INTEGER REFERENCES sindicatos(id) ON DELETE SET NULL,
    sindicato_patronal_id INTEGER REFERENCES sindicatos(id) ON DELETE SET NULL,
    vigencia_inicio TEXT,
    vigencia_fim TEXT,
    data_base TEXT,
    abrangencia TEXT,
    cnaes TEXT,
    arquivo TEXT,
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    razao_social TEXT NOT NULL,
    cnpj TEXT,
    cnae_principal TEXT,
    cnaes_secundarios TEXT,
    municipio TEXT,
    cct_id INTEGER REFERENCES ccts(id) ON DELETE SET NULL,
    grau_confianca TEXT,
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS pisos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cct_id INTEGER NOT NULL REFERENCES ccts(id) ON DELETE CASCADE,
    funcao TEXT NOT NULL,
    piso_experiencia REAL,
    piso_efetivo REAL,
    carga_horaria_mensal INTEGER DEFAULT 220,
    clausula TEXT,
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS contribuicoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cct_id INTEGER NOT NULL REFERENCES ccts(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL,
    responsavel TEXT,
    valor_descricao TEXT,
    vencimento TEXT,
    prazo_oposicao TEXT,
    clausula TEXT,
    observacoes TEXT
);
"""


def conectar(caminho) -> sqlite3.Connection:
    conn = sqlite3.connect(str(caminho))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    conn.executescript(ESQUEMA)
    return conn


def _tabela(nome: str):
    if nome not in TABELAS:
        raise ValueError(f"Tabela desconhecida: {nome}")
    return TABELAS[nome]


def listar(conn, tabela: str, busca: str = "", filtros: dict | None = None) -> list[dict]:
    t = _tabela(tabela)
    sql = f"SELECT * FROM {t.nome}"
    condicoes, params = [], []
    if busca:
        condicoes.append("(" + " OR ".join(f"{c} LIKE ?" for c in t.busca) + ")")
        params += [f"%{busca}%"] * len(t.busca)
    for coluna, valor in (filtros or {}).items():
        t.campo(coluna)  # valida o nome da coluna
        condicoes.append(f"{coluna} = ?")
        params.append(valor)
    if condicoes:
        sql += " WHERE " + " AND ".join(condicoes)
    sql += f" ORDER BY {t.ordem} COLLATE NOCASE, id"
    return [dict(r) for r in conn.execute(sql, params)]


def obter(conn, tabela: str, id_: int) -> dict | None:
    t = _tabela(tabela)
    linha = conn.execute(f"SELECT * FROM {t.nome} WHERE id = ?", (id_,)).fetchone()
    return dict(linha) if linha else None


def salvar(conn, tabela: str, dados: dict) -> int:
    """Insere (sem 'id') ou atualiza (com 'id'). Retorna o id."""
    t = _tabela(tabela)
    colunas = [c.nome for c in t.campos if c.nome in dados]
    valores = [dados[c] for c in colunas]
    id_ = dados.get("id")
    with conn:
        if id_:
            atribuicoes = ", ".join(f"{c} = ?" for c in colunas)
            conn.execute(f"UPDATE {t.nome} SET {atribuicoes} WHERE id = ?", valores + [id_])
            return id_
        marcadores = ", ".join("?" for _ in colunas)
        cur = conn.execute(
            f"INSERT INTO {t.nome} ({', '.join(colunas)}) VALUES ({marcadores})", valores
        )
        return cur.lastrowid


def excluir(conn, tabela: str, id_: int) -> None:
    t = _tabela(tabela)
    with conn:
        conn.execute(f"DELETE FROM {t.nome} WHERE id = ?", (id_,))


def dependencias(conn, tabela: str, id_: int) -> dict:
    """Quantos registros ficam afetados ao excluir este item."""
    consultas = {
        "sindicatos": {
            "CCTs": "SELECT COUNT(*) FROM ccts WHERE sindicato_laboral_id = ? OR sindicato_patronal_id = ?",
        },
        "ccts": {
            "clientes": "SELECT COUNT(*) FROM clientes WHERE cct_id = ?",
            "pisos": "SELECT COUNT(*) FROM pisos WHERE cct_id = ?",
            "contribuições": "SELECT COUNT(*) FROM contribuicoes WHERE cct_id = ?",
        },
    }
    resultado = {}
    for rotulo, sql in consultas.get(tabela, {}).items():
        n = conn.execute(sql, (id_,) * sql.count("?")).fetchone()[0]
        if n:
            resultado[rotulo] = n
    return resultado


def rotulos(conn, tabela: str) -> dict[int, str]:
    """Texto curto e único para exibir referências (id -> rótulo)."""
    if tabela == "sindicatos":
        res = {r["id"]: f"{r['nome']} ({r['tipo']})" for r in listar(conn, "sindicatos")}
    elif tabela == "ccts":
        from .formatos import data_para_tela

        res = {}
        for r in listar(conn, "ccts"):
            vig = data_para_tela(r["vigencia_fim"])
            res[r["id"]] = f"{r['titulo']} (até {vig})" if vig else r["titulo"]
    else:
        raise ValueError(f"Sem rótulos para {tabela}")
    contagem: dict[str, int] = {}
    for rot in res.values():
        contagem[rot] = contagem.get(rot, 0) + 1
    return {i: (f"{rot} [#{i}]" if contagem[rot] > 1 else rot) for i, rot in res.items()}


def backup(conn, destino) -> None:
    alvo = sqlite3.connect(str(destino))
    with alvo:
        conn.backup(alvo)
    alvo.close()


def exportar_csv(conn, pasta) -> list[Path]:
    """Exporta todas as tabelas em CSV (separador ';', UTF-8 com BOM para abrir no Excel)."""
    pasta = Path(pasta)
    pasta.mkdir(parents=True, exist_ok=True)
    arquivos = []
    for nome, t in TABELAS.items():
        caminho = pasta / f"{nome}.csv"
        linhas = listar(conn, nome)
        colunas = ["id"] + [c.nome for c in t.campos]
        with open(caminho, "w", newline="", encoding="utf-8-sig") as f:
            w = csv.writer(f, delimiter=";")
            w.writerow(["id"] + [c.rotulo for c in t.campos])
            for linha in linhas:
                w.writerow(["" if linha[c] is None else linha[c] for c in colunas])
        arquivos.append(caminho)
    return arquivos
