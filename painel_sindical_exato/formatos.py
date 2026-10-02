"""Conversão entre o formato brasileiro exibido na tela e o formato gravado no banco."""

import re
import unicodedata
from datetime import date, datetime


def data_para_banco(texto: str) -> str:
    """'31/12/2026' -> '2026-12-31'. Vazio -> ''. Lança ValueError se inválida."""
    texto = (texto or "").strip()
    if not texto:
        return ""
    for formato in ("%d/%m/%Y", "%d/%m/%y", "%Y-%m-%d"):
        try:
            return datetime.strptime(texto, formato).date().isoformat()
        except ValueError:
            continue
    raise ValueError(f"Data inválida: '{texto}'. Use dd/mm/aaaa.")


def data_para_tela(iso: str) -> str:
    if not iso:
        return ""
    try:
        return date.fromisoformat(iso).strftime("%d/%m/%Y")
    except ValueError:
        return iso


def data_iso(iso: str):
    """Converte texto ISO em date, ou None."""
    if not iso:
        return None
    try:
        return date.fromisoformat(iso)
    except ValueError:
        return None


def moeda_para_banco(texto: str):
    """'1.234,56' / '1234.56' / 'R$ 1.234' -> float. Vazio -> None."""
    texto = (texto or "").replace("R$", "").replace(" ", "").strip()
    if not texto:
        return None
    if "," in texto or re.fullmatch(r"\d{1,3}(\.\d{3})+", texto):
        # formato brasileiro: ponto é separador de milhar
        texto = texto.replace(".", "").replace(",", ".")
    try:
        return round(float(texto), 2)
    except ValueError:
        raise ValueError(f"Valor inválido: '{texto}'. Use 1.234,56.") from None


def moeda_para_tela(valor) -> str:
    if valor is None or valor == "":
        return ""
    texto = f"{float(valor):,.2f}"
    return texto.replace(",", "X").replace(".", ",").replace("X", ".")


def inteiro_para_banco(texto: str):
    texto = (texto or "").strip()
    if not texto:
        return None
    try:
        return int(texto)
    except ValueError:
        raise ValueError(f"Número inteiro inválido: '{texto}'.") from None


def somente_digitos(texto: str) -> str:
    return re.sub(r"\D", "", texto or "")


def cnpj_valido(cnpj: str) -> bool:
    """Valida os dígitos verificadores de um CNPJ numérico (14 dígitos)."""
    d = somente_digitos(cnpj)
    if len(d) != 14 or d == d[0] * 14:
        return False

    def dv(base: str) -> str:
        pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2][-len(base):]
        resto = sum(int(n) * p for n, p in zip(base, pesos)) % 11
        return "0" if resto < 2 else str(11 - resto)

    return d[12] == dv(d[:12]) and d[13] == dv(d[:13])


def cnpj_formatado(cnpj: str) -> str:
    d = somente_digitos(cnpj)
    if len(d) != 14:
        return (cnpj or "").strip()
    return f"{d[:2]}.{d[2:5]}.{d[5:8]}/{d[8:12]}-{d[12:]}"


def normalizar(texto: str) -> str:
    """Minúsculas e sem acentos, para comparações de nomes de municípios."""
    texto = unicodedata.normalize("NFKD", texto or "")
    return "".join(c for c in texto if not unicodedata.combining(c)).lower().strip()
