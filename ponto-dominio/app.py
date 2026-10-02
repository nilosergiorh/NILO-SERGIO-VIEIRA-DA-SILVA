#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Aplicativo "Ponto -> Domínio": painel no navegador, só neste computador (http://127.0.0.1:8765).
Abra com dois cliques em "PONTO - Abrir aplicativo.bat". Não feche a janela preta enquanto usa.
"""
import json, os, re, shutil, sys, threading, traceback, webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlparse

PASTA = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, PASTA)
import servicos, fechar_mes, cadastro

PORTA = 8765
TRAVA = threading.Lock()  # uma operação pesada por vez (LibreOffice/IA)


def _cliente(q):
    c = (q.get('cliente') or [''])[0]
    if c not in servicos.clientes(): raise ValueError('cliente inválido')
    return c


def _mes(q):
    m = (q.get('mes') or [''])[0]
    if not servicos.R_MES.match(m): raise ValueError('mês inválido')
    return m


def _planilha(q):
    c, m = _cliente(q), _mes(q)
    pl = servicos.planilha_do_mes(c, m)
    if not pl: raise ValueError('planilha do mês não encontrada')
    return c, m, pl


def _entrada(c):
    return os.path.join(servicos.CLIENTES, c, '_entrada')


class App(BaseHTTPRequestHandler):
    def log_message(self, *a): pass

    def _send(self, code, body, tipo='application/json; charset=utf-8', extra=None):
        if isinstance(body, (dict, list)): body = json.dumps(body, ensure_ascii=False, default=str)
        if isinstance(body, str): body = body.encode('utf-8')
        self.send_response(code); self.send_header('Content-Type', tipo); self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        for k, v in (extra or {}).items(): self.send_header(k, v)
        self.end_headers(); self.wfile.write(body)

    def _rota(self, metodo):
        u = urlparse(self.path); q = parse_qs(u.query)
        try:
            fn = getattr(self, f'{metodo}_{u.path.strip("/").replace("/", "_") or "inicio"}', None)
            if not fn: return self._send(404, {'erro': 'não encontrado'})
            fn(q)
        except Exception as e:
            traceback.print_exc()
            self._send(400, {'erro': str(e)})

    def do_GET(self): self._rota('get')
    def do_POST(self): self._rota('post')

    # ---------- páginas e consultas
    def get_inicio(self, q):
        self._send(200, open(os.path.join(PASTA, 'app.html'), encoding='utf-8').read(), 'text/html; charset=utf-8')

    def get_logo(self, q):
        self._send(200, open(os.path.join(PASTA, 'static', 'logo_exato.png'), 'rb').read(), 'image/png')

    def _corpo(self):
        n = int(self.headers.get('Content-Length') or 0)
        return json.loads(self.rfile.read(n) or b'{}')

    def post_api_chat(self, q):
        b = self._corpo()
        try:
            resp = servicos.conversar(b.get('cliente'), b.get('mes'), b.get('mensagens') or [])
            self._send(200, {'resposta': resp})
        except RuntimeError as e:
            if str(e) == 'sem_chave': return self._send(200, {'sem_chave': True})
            raise

    def post_api_chave(self, q):
        servicos.salvar_chave(self._corpo().get('chave')); self._send(200, {'ok': True})

    def get_api_estado(self, q):
        self._send(200, {'clientes': servicos.estado(), 'ia': bool(servicos.leitores.chave_api()),
                         'libreoffice': bool(fechar_mes.soffice_python())})

    def get_api_painel(self, q):
        c, m, pl = _planilha(q)
        with TRAVA:
            d = servicos.dados_painel(pl, recalcular=(q.get('recalcular') or ['0'])[0] == '1')
        self._send(200, dict(d, cliente=c, mes=m, desatualizado=d['mtime'] != os.path.getmtime(pl)))

    def get_api_arquivo(self, q):
        c, m = _cliente(q), _mes(q)
        nome = os.path.basename((q.get('nome') or [''])[0])
        p = os.path.join(servicos.CLIENTES, c, m, nome)
        if not nome or not os.path.isfile(p): raise ValueError('arquivo não encontrado')
        self._send(200, open(p, 'rb').read(), 'application/octet-stream',
                   {'Content-Disposition': f"attachment; filename*=UTF-8''{quote(nome)}"})

    def get_api_cadastro(self, q):
        self._send(200, cadastro.ler(_cliente(q)))

    # ---------- ações
    def post_api_cadastro(self, q):
        self._send(200, cadastro.salvar(_cliente(q), self._corpo()))

    def post_api_cliente_novo(self, q):
        self._send(200, {'cliente': cadastro.novo_cliente(self._corpo().get('nome'))})

    def post_api_upload(self, q):
        c = _cliente(q)
        nome = os.path.basename((q.get('nome') or [''])[0]).strip()
        if not nome or nome.startswith('.'): raise ValueError('nome de arquivo inválido')
        n = int(self.headers.get('Content-Length') or 0)
        os.makedirs(_entrada(c), exist_ok=True)
        with open(os.path.join(_entrada(c), nome), 'wb') as f: f.write(self.rfile.read(n))
        self._send(200, {'ok': True})

    def post_api_gerar(self, q):
        c = _cliente(q); ent = _entrada(c)
        arqs = [os.path.join(ent, f) for f in sorted(os.listdir(ent)) if not f.endswith('.leitura.json')] if os.path.isdir(ent) else []
        if not arqs: raise ValueError('nenhum arquivo enviado')
        with TRAVA:
            try:
                saida, mes, out = servicos.gerar_mes(c, arqs)
            finally:
                shutil.rmtree(ent, ignore_errors=True)
            servicos.dados_painel(saida)
        avisos = [l.strip().replace('AVISO: ', '') for l in out.splitlines() if 'AVISO' in l]
        fer = next((l.split(':', 1)[1].strip() for l in out.splitlines() if 'Feriados no período' in l), '')
        self._send(200, {'mes': mes, 'avisos': avisos, 'feriados': fer})

    def post_api_cancelar_envio(self, q):
        shutil.rmtree(_entrada(_cliente(q)), ignore_errors=True); self._send(200, {'ok': True})

    def post_api_txt(self, q):
        c, m, pl = _planilha(q)
        with TRAVA:
            ok, msg, destino = fechar_mes.fechar(pl, forcar=(q.get('forcar') or ['0'])[0] == '1')
            if ok: servicos.dados_painel(pl, recalcular=True)
        self._send(200, {'ok': ok, 'mensagem': msg, 'arquivo': os.path.basename(destino) if destino else None})

    def post_api_abrir(self, q):
        c, m, pl = _planilha(q)
        os.startfile(pl); self._send(200, {'ok': True})

    def post_api_pasta(self, q):
        c, m = _cliente(q), _mes(q)
        os.startfile(os.path.join(servicos.CLIENTES, c, m)); self._send(200, {'ok': True})


def _sem_congelar_janela():
    """Desliga o 'modo de edição rápida' da janela preta do Windows: com ele ligado, um clique na janela
    congela o programa (a importação fica parada até alguém apertar uma tecla)."""
    if os.name != 'nt': return
    try:
        import ctypes
        k = ctypes.windll.kernel32
        h = k.GetStdHandle(-10)  # entrada do console
        modo = ctypes.c_uint32()
        if k.GetConsoleMode(h, ctypes.byref(modo)):
            k.SetConsoleMode(h, (modo.value & ~0x0040) | 0x0080)  # tira QUICK_EDIT, mantém EXTENDED_FLAGS
    except Exception:
        pass


def main():
    _sem_congelar_janela()
    url = f'http://127.0.0.1:{PORTA}/'
    try:
        srv = ThreadingHTTPServer(('127.0.0.1', PORTA), App)
    except OSError:
        print('O aplicativo já está aberto. Abrindo o navegador...')
        webbrowser.open(url); return
    print('=' * 60)
    print('  Aplicativo Ponto -> Domínio')
    print(f'  Endereço: {url}')
    print('  NÃO feche esta janela enquanto estiver usando o aplicativo.')
    print('=' * 60)
    if not os.environ.get('PONTO_SEM_NAVEGADOR'):  # aberto pelo painel do Claude: não abre o navegador comum
        threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == '__main__':
    main()
