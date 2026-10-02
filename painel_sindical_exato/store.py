"""Banco local: documentos JSON por coleção (mesmo formato do app no Claude) e PDFs das CCTs."""

import json
import re
import secrets
import shutil
import sqlite3
import threading
import zipfile
from datetime import datetime
from pathlib import Path

COLECOES = ("clientes", "ccts", "alertas", "prazos", "pedidos", "auditorias", "meta")
_ID = re.compile(r"^[A-Za-z0-9_\-.~:@+]{1,200}$")
_PDF_ID = re.compile(r"^[0-9a-f]{32}$")


class ErroDados(ValueError):
    pass


def _checar(colecao: str, id_: str | None = None) -> None:
    if colecao not in COLECOES:
        raise ErroDados(f"Coleção desconhecida: {colecao}")
    if id_ is not None and (not _ID.match(id_) or id_ in (".", "..")):
        raise ErroDados(f"Identificador inválido: {id_}")


class Store:
    def __init__(self, pasta):
        self.pasta = Path(pasta)
        self.pasta.mkdir(parents=True, exist_ok=True)
        self.pasta_pdfs = self.pasta / "pdfs"
        self.pasta_pdfs.mkdir(exist_ok=True)
        self._trava = threading.RLock()
        self.conn = sqlite3.connect(str(self.pasta / "painel_sindical.db"), check_same_thread=False)
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS docs (colecao TEXT NOT NULL, id TEXT NOT NULL, dados TEXT NOT NULL,"
            " PRIMARY KEY (colecao, id))"
        )
        self.conn.commit()

    def fechar(self) -> None:
        with self._trava:
            self.conn.close()

    # ---------- documentos ----------
    def listar(self, colecao: str) -> list[dict]:
        _checar(colecao)
        with self._trava:
            linhas = self.conn.execute("SELECT id, dados FROM docs WHERE colecao = ? ORDER BY id", (colecao,)).fetchall()
        return [{"id": i, "data": json.loads(d)} for i, d in linhas]

    def obter(self, colecao: str, id_: str) -> dict | None:
        _checar(colecao, id_)
        with self._trava:
            linha = self.conn.execute("SELECT dados FROM docs WHERE colecao = ? AND id = ?", (colecao, id_)).fetchone()
        return json.loads(linha[0]) if linha else None

    def definir(self, colecao: str, id_: str, dados: dict) -> None:
        _checar(colecao, id_)
        if not isinstance(dados, dict):
            raise ErroDados("O documento precisa ser um objeto.")
        with self._trava, self.conn:
            self.conn.execute("INSERT OR REPLACE INTO docs (colecao, id, dados) VALUES (?, ?, ?)",
                              (colecao, id_, json.dumps(dados, ensure_ascii=False)))

    def atualizar(self, colecao: str, id_: str, campos: dict) -> None:
        """Mescla os campos no documento (cria se não existir)."""
        if not isinstance(campos, dict):
            raise ErroDados("Os campos precisam ser um objeto.")
        with self._trava:
            atual = self.obter(colecao, id_) or {}
            atual.update(campos)
            self.definir(colecao, id_, atual)

    def excluir(self, colecao: str, id_: str) -> None:
        _checar(colecao, id_)
        with self._trava, self.conn:
            self.conn.execute("DELETE FROM docs WHERE colecao = ? AND id = ?", (colecao, id_))

    def vazio(self) -> bool:
        with self._trava:
            return self.conn.execute("SELECT COUNT(*) FROM docs").fetchone()[0] == 0

    def contagem(self) -> dict:
        with self._trava:
            linhas = self.conn.execute("SELECT colecao, COUNT(*) FROM docs GROUP BY colecao").fetchall()
        return dict(linhas)

    # ---------- PDFs ----------
    def caminho_pdf(self, id_: str) -> Path:
        if not _PDF_ID.match(id_ or ""):
            raise ErroDados("Identificador de arquivo inválido.")
        return self.pasta_pdfs / f"{id_}.pdf"

    def salvar_pdf(self, conteudo: bytes) -> str:
        if not conteudo.startswith(b"%PDF"):
            raise ErroDados("O arquivo enviado não é um PDF.")
        id_ = secrets.token_hex(16)
        self.caminho_pdf(id_).write_bytes(conteudo)
        return id_

    def excluir_pdf(self, id_: str) -> None:
        self.caminho_pdf(id_).unlink(missing_ok=True)

    # ---------- backup / importação ----------
    def exportar_zip(self, destino) -> Path:
        destino = Path(destino)
        with self._trava:
            dados = {c: {d["id"]: d["data"] for d in self.listar(c)} for c in COLECOES}
        with zipfile.ZipFile(destino, "w", zipfile.ZIP_DEFLATED) as z:
            z.writestr("dados.json", json.dumps(
                {"formato": "painel-sindical-exato", "exportado_em": datetime.now().isoformat(timespec="seconds"),
                 "colecoes": dados}, ensure_ascii=False, indent=1))
            for pdf in sorted(self.pasta_pdfs.glob("*.pdf")):
                z.write(pdf, f"pdfs/{pdf.name}")
        return destino

    def importar_zip(self, origem) -> dict:
        """Substitui todos os dados pelos do arquivo (o backup atual é guardado antes)."""
        with zipfile.ZipFile(origem) as z:
            try:
                pacote = json.loads(z.read("dados.json"))
            except KeyError:
                raise ErroDados("Arquivo inválido: não contém dados.json.") from None
            if pacote.get("formato") != "painel-sindical-exato":
                raise ErroDados("Arquivo não é um backup do Painel Sindical Exato.")
            colecoes = pacote.get("colecoes") or {}
            for col, docs in colecoes.items():
                _checar(col)
                for id_ in docs:
                    _checar(col, id_)
            pdfs = [n for n in z.namelist() if n.startswith("pdfs/") and n.endswith(".pdf")]
            for nome in pdfs:
                self.caminho_pdf(Path(nome).stem)  # valida o nome

            with self._trava:
                if not self.vazio():
                    seguranca = self.pasta / "backups"
                    seguranca.mkdir(exist_ok=True)
                    self.exportar_zip(seguranca / f"antes_importacao_{datetime.now():%Y%m%d_%H%M%S}.zip")
                with self.conn:
                    self.conn.execute("DELETE FROM docs")
                    for col, docs in colecoes.items():
                        for id_, dados in docs.items():
                            self.conn.execute("INSERT INTO docs (colecao, id, dados) VALUES (?, ?, ?)",
                                              (col, id_, json.dumps(dados, ensure_ascii=False)))
                for nome in pdfs:
                    with z.open(nome) as src, open(self.caminho_pdf(Path(nome).stem), "wb") as dst:
                        shutil.copyfileobj(src, dst)
        return self.contagem()
