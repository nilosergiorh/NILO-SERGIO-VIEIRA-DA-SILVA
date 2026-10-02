"""Servidor HTTP local (só 127.0.0.1) que entrega a tela do app e guarda os dados no computador."""

import json
import os
import re
import secrets
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from . import NOME_APP, VERSAO, ia
from .config import Preferencias, pasta_downloads
from .store import ErroDados, Store

LIMITE_UPLOAD = 60 * 1024 * 1024
ESTATICOS = {"local.js": "text/javascript; charset=utf-8", "tema3d.css": "text/css; charset=utf-8",
             "mascote_padrao.png": "image/png", "mascote_rosto.png": "image/png"}
IMAGENS = {b"\x89PNG": ("png", "image/png"), b"\xff\xd8\xff": ("jpg", "image/jpeg"),
           b"RIFF": ("webp", "image/webp"), b"GIF8": ("gif", "image/gif")}


def tipo_imagem(conteudo: bytes):
    for assinatura, tipo in IMAGENS.items():
        if conteudo.startswith(assinatura):
            if tipo[0] == "webp" and conteudo[8:12] != b"WEBP":
                continue
            return tipo
    return None


def arquivo_mascote(pasta: Path):
    for ext in ("png", "jpg", "webp", "gif"):
        alvo = Path(pasta) / f"mascote.{ext}"
        if alvo.exists():
            return alvo
    return None


def pasta_web() -> Path:
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent.parent))
    pasta = base / "painel_sindical_exato" / "web"
    return pasta if pasta.is_dir() else Path(__file__).resolve().parent / "web"


def abrir_no_sistema(caminho: str) -> None:
    if sys.platform.startswith("win"):
        os.startfile(caminho)  # noqa: S606 - abre com o programa padrão do Windows
    elif sys.platform == "darwin":
        subprocess.Popen(["open", caminho])
    else:
        subprocess.Popen(["xdg-open", caminho])


def nome_livre(pasta: Path, nome: str) -> Path:
    nome = re.sub(r'[\\/:*?"<>|]+', "_", nome).strip() or "arquivo"
    alvo = pasta / nome
    base, ext = alvo.stem, alvo.suffix
    n = 1
    while alvo.exists():
        n += 1
        alvo = pasta / f"{base} ({n}){ext}"
    return alvo


class Estado:
    """O que o servidor compartilha entre as requisições."""

    def __init__(self, store: Store, prefs: Preferencias):
        self.store = store
        self.prefs = prefs
        self.token = secrets.token_urlsafe(24)
        self.ultimo_ping = None
        self.fechando_em = None
        self.porta = 0


class Handler(BaseHTTPRequestHandler):
    server_version = "PainelSindicalExato"
    estado: Estado  # definido em criar_servidor

    def log_message(self, *args):  # silencioso
        pass

    # ---------- utilitários ----------
    def _responder(self, codigo: int, corpo=b"", tipo="application/json; charset=utf-8"):
        if not isinstance(corpo, bytes):
            corpo = json.dumps(corpo, ensure_ascii=False).encode("utf-8")
        self.send_response(codigo)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(len(corpo)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(corpo)

    def _erro(self, codigo: int, mensagem: str, code: str = "erro"):
        self._responder(codigo, {"error": mensagem, "code": code})

    def _corpo(self) -> bytes:
        tamanho = int(self.headers.get("Content-Length") or 0)
        if tamanho > LIMITE_UPLOAD:
            raise ErroDados("too_large")
        return self.rfile.read(tamanho) if tamanho else b""

    def _json(self):
        corpo = self._corpo()
        return json.loads(corpo) if corpo else {}

    def _host_ok(self) -> bool:
        # protege contra outros sites tentando falar com o servidor local (DNS rebinding)
        return self.headers.get("Host") in (f"127.0.0.1:{self.estado.porta}", f"localhost:{self.estado.porta}")

    def _autorizado(self, url) -> bool:
        token = self.headers.get("X-Token") or parse_qs(url.query).get("t", [""])[0]
        return secrets.compare_digest(token, self.estado.token)

    # ---------- roteamento ----------
    def do_GET(self):
        self._rotear("GET")

    def do_POST(self):
        self._rotear("POST")

    def do_PUT(self):
        self._rotear("PUT")

    def do_PATCH(self):
        self._rotear("PATCH")

    def do_DELETE(self):
        self._rotear("DELETE")

    def _rotear(self, metodo: str):
        if not self._host_ok():
            return self._erro(403, "Acesso negado.")
        url = urlparse(self.path)
        partes = [unquote(p) for p in url.path.strip("/").split("/") if p]
        try:
            if metodo == "GET" and url.path in ("/", "/index.html"):
                return self._pagina()
            if metodo == "GET" and url.path.lstrip("/") in ESTATICOS:
                nome = url.path.lstrip("/")
                return self._responder(200, (pasta_web() / nome).read_bytes(), ESTATICOS[nome])
            if not partes or partes[0] != "api":
                return self._erro(404, "Não encontrado.")
            if not self._autorizado(url):
                return self._erro(403, "Acesso negado.")
            return self._api(metodo, partes[1:])
        except ErroDados as erro:
            code = "too_large" if str(erro) == "too_large" else "invalid_argument"
            return self._erro(400, str(erro), code)
        except (ValueError, KeyError) as erro:
            return self._erro(400, f"Requisição inválida: {erro}", "invalid_argument")
        except Exception as erro:  # noqa: BLE001 - registra e devolve 500 sem derrubar o servidor
            registrar_erro(self.estado.store.pasta, erro)
            return self._erro(500, "Erro interno. Veja painel.log na pasta de dados.")

    def _pagina(self):
        html = (pasta_web() / "index.html").read_text(encoding="utf-8")
        injecao = f'<script>window.__PSE={{token:{json.dumps(self.estado.token)},versao:{json.dumps(VERSAO)}}};</script>'
        html = html.replace("<!--LOCAL-->", injecao, 1)
        self._responder(200, html.encode("utf-8"), "text/html; charset=utf-8")

    def _api(self, metodo: str, p: list[str]):
        st, prefs = self.estado.store, self.estado.prefs
        rota = (metodo, p[0] if p else "")

        if rota == ("GET", "col") and len(p) == 2:
            return self._responder(200, st.listar(p[1]))
        if p and p[0] == "doc" and len(p) == 3:
            col, id_ = p[1], p[2]
            if metodo == "GET":
                return self._responder(200, {"exists": st.obter(col, id_) is not None, "data": st.obter(col, id_)})
            if metodo == "PUT":
                st.definir(col, id_, self._json())
                return self._responder(200, {"ok": True})
            if metodo == "PATCH":
                st.atualizar(col, id_, self._json())
                return self._responder(200, {"ok": True})
            if metodo == "DELETE":
                st.excluir(col, id_)
                return self._responder(200, {"ok": True})

        if rota == ("POST", "assets"):
            id_ = st.salvar_pdf(self._corpo())
            return self._responder(200, {"id": id_, "sizeBytes": st.caminho_pdf(id_).stat().st_size})
        if rota == ("DELETE", "assets") and len(p) == 2:
            st.excluir_pdf(p[1])
            return self._responder(200, {"ok": True})

        if rota == ("POST", "abrir"):
            alvo = str(self._json().get("url", ""))
            if alvo.startswith("/_blob/"):
                caminho = st.caminho_pdf(alvo.split("/")[-1])
                if not caminho.exists():
                    return self._erro(404, "Arquivo não encontrado.", "not_found")
                abrir_no_sistema(str(caminho))
            elif re.match(r"^https?://", alvo):
                webbrowser.open(alvo)
            else:
                return self._erro(400, "Endereço não permitido.", "invalid_argument")
            return self._responder(200, {"ok": True})
        if rota == ("POST", "abrir_pasta"):
            abrir_no_sistema(str(st.pasta))
            return self._responder(200, {"ok": True})

        if rota == ("POST", "salvar"):
            dados = self._json()
            alvo = nome_livre(pasta_downloads(), str(dados.get("filename") or "arquivo.txt"))
            conteudo = dados.get("data", "")
            alvo.write_bytes(conteudo.encode("utf-8") if isinstance(conteudo, str) else bytes(conteudo))
            return self._responder(200, {"status": "saved", "path": str(alvo)})

        if rota == ("POST", "backup"):
            alvo = nome_livre(pasta_downloads(), f"Painel_Sindical_backup_{datetime.now():%Y-%m-%d_%H%M}.zip")
            st.exportar_zip(alvo)
            return self._responder(200, {"status": "saved", "path": str(alvo)})
        if rota == ("POST", "importar"):
            with tempfile.TemporaryDirectory() as tmp:
                arq = Path(tmp) / "importar.zip"
                arq.write_bytes(self._corpo())
                try:
                    contagem = st.importar_zip(arq)
                except (OSError, ValueError) as erro:
                    raise ErroDados(f"Não foi possível importar: {erro}") from None
            return self._responder(200, {"ok": True, "contagem": contagem})

        if rota == ("GET", "mascote"):
            alvo = arquivo_mascote(st.pasta)
            if not alvo:
                return self._erro(404, "Sem imagem do mascote.", "not_found")
            mime = dict(IMAGENS.values())[alvo.suffix.lstrip(".")]
            return self._responder(200, alvo.read_bytes(), mime)
        if rota == ("POST", "mascote"):
            conteudo = self._corpo()
            tipo = tipo_imagem(conteudo)
            if not tipo:
                raise ErroDados("Envie uma imagem PNG, JPG, WEBP ou GIF.")
            antigo = arquivo_mascote(st.pasta)
            if antigo:
                antigo.unlink()
            (st.pasta / f"mascote.{tipo[0]}").write_bytes(conteudo)
            return self._responder(200, {"ok": True})
        if rota == ("DELETE", "mascote"):
            antigo = arquivo_mascote(st.pasta)
            if antigo:
                antigo.unlink()
            return self._responder(200, {"ok": True})

        if rota == ("GET", "info"):
            return self._responder(200, {
                "app": NOME_APP, "versao": VERSAO, "nome": prefs.nome(), "pasta": str(st.pasta),
                "ia": bool(prefs.chave_ia()), "vazio": st.vazio(), "contagem": st.contagem(),
                "mascote": arquivo_mascote(st.pasta) is not None,
            })
        if rota == ("POST", "config"):
            dados = self._json()
            prefs.salvar(nome=(dados.get("nome") or "").strip() or None,
                         api_key=(dados.get("api_key") or "").strip() or None)
            if dados.get("remover_chave"):
                prefs.salvar(api_key="")
            return self._responder(200, {"ok": True, "ia": bool(prefs.chave_ia()), "nome": prefs.nome()})
        if rota == ("POST", "ia"):
            prompt = str(self._json().get("prompt", ""))
            try:
                return self._responder(200, ia.sugerir(prefs.chave_ia(), prompt))
            except ia.ErroIA as erro:
                return self._erro(400, str(erro), erro.codigo)

        if rota == ("POST", "ping"):
            self.estado.ultimo_ping = time.monotonic()
            self.estado.fechando_em = None
            return self._responder(200, {"ok": True})
        if rota == ("POST", "fechar"):
            self.estado.fechando_em = time.monotonic()
            return self._responder(200, {"ok": True})

        return self._erro(404, "Não encontrado.", "not_found")


def registrar_erro(pasta: Path, erro: BaseException) -> None:
    import traceback

    try:
        with open(Path(pasta) / "painel.log", "a", encoding="utf-8") as f:
            f.write(f"\n[{datetime.now():%Y-%m-%d %H:%M:%S}] {erro!r}\n")
            f.write("".join(traceback.format_exception(erro)))
    except OSError:
        pass


def criar_servidor(estado: Estado, porta: int = 0) -> ThreadingHTTPServer:
    handler = type("HandlerPainel", (Handler,), {"estado": estado})
    servidor = ThreadingHTTPServer(("127.0.0.1", porta), handler)
    servidor.daemon_threads = True
    estado.porta = servidor.server_address[1]
    return servidor


def iniciar_em_segundo_plano(servidor: ThreadingHTTPServer) -> threading.Thread:
    t = threading.Thread(target=servidor.serve_forever, name="servidor", daemon=True)
    t.start()
    return t
