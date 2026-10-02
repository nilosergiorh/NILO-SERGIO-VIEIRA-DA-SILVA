"""Regras de negócio: alertas de vigência/prazos e conferência de piso salarial."""

from dataclasses import dataclass
from datetime import date, timedelta

from . import db
from .formatos import data_iso, data_para_tela, normalizar

ALTA, MEDIA, BAIXA = "ALTA", "MÉDIA", "BAIXA"
_PESO = {ALTA: 0, MEDIA: 1, BAIXA: 2}


@dataclass
class Alerta:
    severidade: str
    categoria: str
    mensagem: str
    data: date | None = None
    tabela: str = ""
    id_: int | None = None


def gerar_alertas(conn, hoje: date | None = None, dias_cct: int = 60, dias_prazo: int = 30) -> list[Alerta]:
    hoje = hoje or date.today()
    alertas: list[Alerta] = []
    ccts = db.listar(conn, "ccts")
    clientes = db.listar(conn, "clientes")
    clientes_por_cct: dict[int, list[dict]] = {}
    for cli in clientes:
        if cli["cct_id"]:
            clientes_por_cct.setdefault(cli["cct_id"], []).append(cli)

    for cct in ccts:
        fim = data_iso(cct["vigencia_fim"])
        vinculados = len(clientes_por_cct.get(cct["id"], []))
        sufixo = f" — {vinculados} cliente(s) vinculado(s)" if vinculados else ""
        if fim is None:
            alertas.append(Alerta(BAIXA, "CCT", f"CCT '{cct['titulo']}' sem data de fim de vigência cadastrada",
                                  None, "ccts", cct["id"]))
        elif fim < hoje:
            alertas.append(Alerta(ALTA if vinculados else MEDIA, "CCT vencida",
                                  f"CCT '{cct['titulo']}' venceu em {data_para_tela(cct['vigencia_fim'])}{sufixo}. "
                                  "Verificar nova CCT/aditivo registrado no Mediador.",
                                  fim, "ccts", cct["id"]))
        elif fim <= hoje + timedelta(days=dias_cct):
            alertas.append(Alerta(MEDIA, "CCT a vencer",
                                  f"CCT '{cct['titulo']}' vence em {data_para_tela(cct['vigencia_fim'])} "
                                  f"({(fim - hoje).days} dias){sufixo}.",
                                  fim, "ccts", cct["id"]))
        if not (cct["registro_mte"] or "").strip():
            alertas.append(Alerta(BAIXA, "CCT", f"CCT '{cct['titulo']}' sem número de registro no MTE "
                                  "(minuta transmitida não é CCT registrada).", None, "ccts", cct["id"]))

    ccts_por_id = {c["id"]: c for c in ccts}
    limite = hoje + timedelta(days=dias_prazo)
    for contrib in db.listar(conn, "contribuicoes"):
        cct = ccts_por_id.get(contrib["cct_id"])
        nome_cct = cct["titulo"] if cct else "?"
        for coluna, rotulo in (("prazo_oposicao", "Prazo de oposição"), ("vencimento", "Vencimento")):
            d = data_iso(contrib[coluna])
            if d and hoje <= d <= limite:
                dias = (d - hoje).days
                alertas.append(Alerta(ALTA if dias <= 7 else MEDIA, rotulo,
                                      f"{rotulo} da contribuição {contrib['tipo'].lower()} "
                                      f"({contrib['responsavel'] or 's/ resp.'}) — CCT '{nome_cct}': "
                                      f"{data_para_tela(contrib[coluna])} ({dias} dias).",
                                      d, "contribuicoes", contrib["id"]))

    for cli in clientes:
        if not cli["cct_id"]:
            alertas.append(Alerta(MEDIA, "Cliente sem CCT",
                                  f"Cliente '{cli['razao_social']}' sem CCT vinculada (enquadramento pendente).",
                                  None, "clientes", cli["id"]))
            continue
        cct = ccts_por_id.get(cli["cct_id"])
        if cct and cli["municipio"] and (cct["abrangencia"] or "").strip():
            if normalizar(cli["municipio"]) not in normalizar(cct["abrangencia"]):
                alertas.append(Alerta(MEDIA, "Base territorial",
                                      f"Município '{cli['municipio']}' do cliente '{cli['razao_social']}' "
                                      f"não consta na abrangência da CCT '{cct['titulo']}'. Conferir.",
                                      None, "clientes", cli["id"]))
        if cli["grau_confianca"] == "BAIXO":
            alertas.append(Alerta(BAIXA, "Enquadramento",
                                  f"Enquadramento de '{cli['razao_social']}' com confiança BAIXA — "
                                  "confirmar com o sindicato.", None, "clientes", cli["id"]))

    alertas.sort(key=lambda a: (_PESO[a.severidade], a.data or date.max, a.mensagem))
    return alertas


def resumo(conn, hoje: date | None = None) -> dict:
    hoje = hoje or date.today()
    ccts = db.listar(conn, "ccts")
    vigentes = sum(
        1 for c in ccts
        if (data_iso(c["vigencia_fim"]) or date.min) >= hoje
        and (data_iso(c["vigencia_inicio"]) or date.min) <= hoje
    )
    return {
        "Clientes": len(db.listar(conn, "clientes")),
        "CCTs cadastradas": len(ccts),
        "CCTs vigentes": vigentes,
        "Sindicatos": len(db.listar(conn, "sindicatos")),
        "Pisos cadastrados": len(db.listar(conn, "pisos")),
    }


@dataclass
class ResultadoPiso:
    piso_cct: float
    piso_proporcional: float
    salario: float
    diferenca_mensal: float  # positivo = salário abaixo do piso
    abaixo: bool


def conferir_piso(piso: float, carga_cct: int, horas_contratadas: float, salario: float) -> ResultadoPiso:
    """Compara o salário com o piso, proporcional à jornada (OJ 358 SDI-1 TST)."""
    if piso is None or piso <= 0:
        raise ValueError("Piso não informado para esta função.")
    carga_cct = carga_cct or 220
    if horas_contratadas <= 0:
        raise ValueError("Horas mensais contratadas devem ser maiores que zero.")
    proporcional = round(piso * min(horas_contratadas, carga_cct) / carga_cct, 2)
    diferenca = round(proporcional - salario, 2)
    return ResultadoPiso(piso, proporcional, salario, max(diferenca, 0.0), diferenca > 0)


def estimar_passivo(diferenca_mensal: float, meses: int) -> dict:
    """Estimativa simples da diferença retroativa com reflexos.

    Não inclui INSS patronal, correção monetária, juros nem reflexos em horas
    extras/adicionais. Serve para dimensionar o risco, não para cálculo final.
    """
    principal = round(diferenca_mensal * meses, 2)
    decimo = round(principal / 12, 2)
    ferias = round(principal / 12 * 4 / 3, 2)
    fgts = round((principal + decimo + ferias) * 0.08, 2)
    return {
        "Diferenças salariais": principal,
        "Reflexo 13º salário": decimo,
        "Reflexo férias + 1/3": ferias,
        "FGTS 8%": fgts,
        "Total estimado": round(principal + decimo + ferias + fgts, 2),
    }
