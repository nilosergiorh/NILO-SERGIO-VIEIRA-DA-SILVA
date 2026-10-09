"""Sugestão de enquadramento pelo Claude (o mesmo prompt que o app usa)."""

import json
import re

MODELO = "claude-opus-5-5"


class ErroIA(Exception):
    def __init__(self, codigo: str, mensagem: str = ""):
        super().__init__(mensagem or codigo)
        self.codigo = codigo


def extrair_json(texto: str) -> dict:
    """Lê o objeto JSON da resposta (tolera texto ou cercas de código em volta)."""
    texto = (texto or "").strip()
    try:
        return json.loads(texto)
    except ValueError:
        pass
    achado = re.search(r"\{.*\}", texto, re.DOTALL)
    if achado:
        try:
            return json.loads(achado.group(0))
        except ValueError:
            pass
    raise ErroIA("invalid_json", "A IA respondeu fora do formato esperado.")


TIPOS_IMAGEM = ("image/jpeg", "image/png", "image/webp", "image/gif")
# nível pedido pelo módulo (o mesmo modelTier do app no Claude) -> esforço do modelo
ESFORCO = {"quick": "low", "default": "medium", "complex": "high"}


def sugerir(chave: str, prompt: str, imagens=None, nivel: str = "default") -> dict:
    """Pede ao Claude uma resposta em JSON. imagens: lista de (tipo, base64) - fotos de cartão ponto, fichas etc."""
    if not chave:
        raise ErroIA("sem_chave", "Chave da API do Claude não configurada.")
    import anthropic

    conteudo = [{"type": "image", "source": {"type": "base64", "media_type": t, "data": d}}
                for t, d in (imagens or []) if t in TIPOS_IMAGEM and d]
    conteudo.append({"type": "text", "text": prompt})
    client = anthropic.Anthropic(api_key=chave, timeout=300.0)
    try:
        resposta = client.beta.messages.create(
            model=MODELO,
            max_tokens=16000,
            output_config={"effort": ESFORCO.get(nivel, "medium")},
            # Se o modelo recusar por engano, a API refaz o pedido num modelo alternativo.
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
            messages=[{"role": "user", "content": conteudo}],
        )
    except anthropic.AuthenticationError:
        raise ErroIA("chave_invalida", "Chave da API inválida.") from None
    except anthropic.PermissionDeniedError:
        raise ErroIA("chave_invalida", "A chave não tem permissão para este modelo.") from None
    except anthropic.RateLimitError:
        raise ErroIA("rate_limited", "Muitos pedidos seguidos.") from None
    except anthropic.APIConnectionError:
        raise ErroIA("sem_internet", "Sem conexão com a internet.") from None
    except anthropic.APIStatusError as erro:
        raise ErroIA("erro_api", f"Erro da API ({erro.status_code}).") from None

    if resposta.stop_reason == "refusal":
        raise ErroIA("recusado", "A IA não respondeu a este pedido.")
    texto = "".join(b.text for b in resposta.content if b.type == "text")
    return extrair_json(texto)
