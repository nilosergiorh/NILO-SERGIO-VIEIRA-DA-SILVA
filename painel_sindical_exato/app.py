"""Abre o Painel Sindical Exato numa janela própria (Edge/Chrome em modo aplicativo)."""

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

from . import config
from .server import Estado, criar_servidor, iniciar_em_segundo_plano, registrar_erro
from .store import Store

# Sem sinal da janela por este tempo, o programa entende que ela foi fechada e encerra.
SEM_SINAL_MAX = 90
FECHAMENTO_CONFIRMADO = 5
ESPERA_PRIMEIRO_SINAL = 180


def localizar_navegador() -> str | None:
    candidatos = []
    if sys.platform.startswith("win"):
        for base in (os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramFiles"), os.environ.get("LOCALAPPDATA")):
            if base:
                candidatos += [Path(base) / "Microsoft/Edge/Application/msedge.exe",
                               Path(base) / "Google/Chrome/Application/chrome.exe"]
    else:
        candidatos += [shutil.which(n) for n in ("microsoft-edge", "google-chrome", "chromium", "chromium-browser")]
    for c in candidatos:
        if c and Path(c).exists():
            return str(c)
    return None


def abrir_janela(url: str, pasta: Path) -> None:
    navegador = localizar_navegador()
    if navegador:
        perfil = pasta / "navegador"
        subprocess.Popen([
            navegador, f"--app={url}", f"--user-data-dir={perfil}", "--window-size=1440,900",
            "--no-first-run", "--no-default-browser-check",
            "--disable-background-timer-throttling", "--disable-renderer-backgrounding",
        ])
    else:
        webbrowser.open(url)


def instancia_ativa(arquivo: Path) -> str | None:
    """Se o programa já está aberto, devolve o endereço dele."""
    try:
        info = json.loads(arquivo.read_text(encoding="utf-8"))
        req = urllib.request.Request(f"http://127.0.0.1:{info['porta']}/api/ping", data=b"", method="POST",
                                     headers={"X-Token": info["token"]})
        with urllib.request.urlopen(req, timeout=2) as r:
            if r.status == 200:
                return info["url"]
    except (OSError, ValueError, KeyError):
        pass
    return None


def main() -> None:
    pasta = config.pasta_dados()
    trava = pasta / "instancia.json"
    url_existente = instancia_ativa(trava)
    if url_existente:
        abrir_janela(url_existente, pasta)
        return

    store = Store(pasta)
    estado = Estado(store, config.Preferencias(pasta))
    servidor = criar_servidor(estado)
    iniciar_em_segundo_plano(servidor)
    url = f"http://127.0.0.1:{estado.porta}/"
    trava.write_text(json.dumps({"porta": estado.porta, "token": estado.token, "url": url}), encoding="utf-8")

    try:
        abrir_janela(url, pasta)
        inicio = time.monotonic()
        while True:
            time.sleep(1)
            agora = time.monotonic()
            if estado.ultimo_ping is None:
                if agora - inicio > ESPERA_PRIMEIRO_SINAL:
                    break
                continue
            if estado.fechando_em and agora - estado.fechando_em > FECHAMENTO_CONFIRMADO:
                break
            if agora - estado.ultimo_ping > SEM_SINAL_MAX:
                break
    except KeyboardInterrupt:
        pass
    except Exception as erro:  # noqa: BLE001
        registrar_erro(pasta, erro)
    finally:
        servidor.shutdown()
        store.fechar()
        trava.unlink(missing_ok=True)
