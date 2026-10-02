"""Local dos dados do programa no computador do usuário."""

import os
import sys
from pathlib import Path


def pasta_dados() -> Path:
    """Pasta onde fica o banco de dados (criada se não existir).

    Windows: %APPDATA%\\PainelSindicalExato
    Outros:  ~/.painel_sindical_exato
    Pode ser trocada pela variável de ambiente PAINEL_SINDICAL_DADOS
    (útil para deixar o banco numa pasta de rede/OneDrive).
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


def caminho_banco() -> Path:
    return pasta_dados() / "painel_sindical.db"
