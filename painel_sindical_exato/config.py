"""Pasta de dados e preferências do programa no computador do usuário."""

import json
import os
import sys
from pathlib import Path


def pasta_dados() -> Path:
    """Pasta onde ficam banco, PDFs e configurações (criada se não existir).

    Windows: %APPDATA%\\PainelSindicalExato
    Outros:  ~/.painel_sindical_exato
    Pode ser trocada pela variável de ambiente PAINEL_SINDICAL_DADOS
    (ex.: uma pasta do OneDrive, para ter backup automático).
    """
    personalizada = os.environ.get("PAINEL_SINDICAL_DADOS")
    if personalizada:
        pasta = Path(personalizada)
    elif sys.platform.startswith("win") and os.environ.get("APPDATA"):
        pasta = Path(os.environ["APPDATA"]) / "PainelSindicalExato"
    else:
        pasta = Path.home() / ".painel_sindical_exato"
    pasta.mkdir(parents=True, exist_ok=True)
    return pasta


def pasta_downloads() -> Path:
    pasta = Path.home() / "Downloads"
    if not pasta.is_dir():
        pasta = Path.home()
    return pasta


class Preferencias:
    """Nome de quem usa e chave da API do Claude (arquivo preferencias.json na pasta de dados)."""

    def __init__(self, pasta: Path):
        self.arquivo = Path(pasta) / "preferencias.json"

    def ler(self) -> dict:
        try:
            return json.loads(self.arquivo.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}

    def salvar(self, **campos) -> dict:
        dados = self.ler()
        dados.update({k: v for k, v in campos.items() if v is not None})
        self.arquivo.write_text(json.dumps(dados, ensure_ascii=False, indent=1), encoding="utf-8")
        return dados

    def nome(self) -> str:
        """Nome informado por quem usa ('' se ainda não informou).

        Não usa o usuário do Windows: o computador pode estar em nome de outra pessoa.
        """
        return (self.ler().get("nome") or "").strip()

    def chave_ia(self) -> str:
        return os.environ.get("ANTHROPIC_API_KEY") or self.ler().get("api_key") or ""
