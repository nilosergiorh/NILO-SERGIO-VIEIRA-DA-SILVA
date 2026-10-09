import json
import tempfile
import unittest
import urllib.error
import urllib.request
import zipfile
from pathlib import Path
from unittest import mock

from painel_sindical_exato import ia
from painel_sindical_exato.config import Preferencias
from painel_sindical_exato.server import Estado, criar_servidor, iniciar_em_segundo_plano
from painel_sindical_exato.store import ErroDados, Store

PDF = b"%PDF-1.4\n%teste\n"


class TestStore(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name) / "dados")

    def tearDown(self):
        self.store.fechar()
        self.tmp.cleanup()

    def test_crud_documentos(self):
        self.assertTrue(self.store.vazio())
        self.store.definir("clientes", "c1", {"nome": "LOJA X", "cct": "Comércio"})
        self.store.atualizar("clientes", "c1", {"conf": "ALTA"})
        self.assertEqual(self.store.obter("clientes", "c1"), {"nome": "LOJA X", "cct": "Comércio", "conf": "ALTA"})
        self.store.atualizar("alertas", "novo", {"feito": False})  # update cria se não existir
        self.assertEqual([d["id"] for d in self.store.listar("clientes")], ["c1"])
        self.store.excluir("clientes", "c1")
        self.assertIsNone(self.store.obter("clientes", "c1"))

    def test_validacao(self):
        with self.assertRaises(ErroDados):
            self.store.listar("usuarios")
        with self.assertRaises(ErroDados):
            self.store.definir("clientes", "../x", {})
        with self.assertRaises(ErroDados):
            self.store.caminho_pdf("../../segredo")
        with self.assertRaises(ErroDados):
            self.store.salvar_pdf(b"MZ executavel")

    def test_backup_e_importacao(self):
        self.store.definir("ccts", "k1", {"ramo": "Academias", "fim": "2027-04-30"})
        pdf = self.store.salvar_pdf(PDF)
        destino = Path(self.tmp.name) / "bkp.zip"
        self.store.exportar_zip(destino)

        outro = Store(Path(self.tmp.name) / "outro")
        outro.definir("clientes", "velho", {"nome": "SERÁ SUBSTITUÍDO"})
        contagem = outro.importar_zip(destino)
        self.assertEqual(contagem, {"ccts": 1})
        self.assertIsNone(outro.obter("clientes", "velho"))
        self.assertEqual(outro.caminho_pdf(pdf).read_bytes(), PDF)
        self.assertEqual(len(list((outro.pasta / "backups").glob("*.zip"))), 1)  # cópia de segurança
        outro.fechar()

    def test_importacao_rejeita_arquivo_estranho(self):
        ruim = Path(self.tmp.name) / "ruim.zip"
        with zipfile.ZipFile(ruim, "w") as z:
            z.writestr("dados.json", json.dumps({"formato": "outro", "colecoes": {}}))
        with self.assertRaises(ErroDados):
            self.store.importar_zip(ruim)


class TestServidor(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        pasta = Path(self.tmp.name)
        self.store = Store(pasta)
        self.estado = Estado(self.store, Preferencias(pasta))
        self.servidor = criar_servidor(self.estado)
        iniciar_em_segundo_plano(self.servidor)
        self.base = f"http://127.0.0.1:{self.estado.porta}"

    def tearDown(self):
        self.servidor.shutdown()
        self.servidor.server_close()
        self.store.fechar()
        self.tmp.cleanup()

    def req(self, metodo, caminho, corpo=None, token=True, host=None):
        dados = json.dumps(corpo).encode() if isinstance(corpo, dict) else corpo
        headers = {"Content-Type": "application/json"}
        if token:
            headers["X-Token"] = self.estado.token
        if host:
            headers["Host"] = host
        r = urllib.request.Request(self.base + caminho, data=dados, method=metodo, headers=headers)
        try:
            with urllib.request.urlopen(r) as resp:
                return resp.status, resp.read()
        except urllib.error.HTTPError as erro:
            return erro.code, erro.read()

    def test_pagina_recebe_token(self):
        status, corpo = self.req("GET", "/", token=False)
        self.assertEqual(status, 200)
        self.assertIn(self.estado.token.encode(), corpo)
        self.assertIn(b"EXATO FLOW", corpo)
        self.assertIn(b"/local.js", corpo)
        self.assertIn("Painel do Departamento Pessoal".encode(), corpo)   # a tela é a mesma do app no Claude
        self.assertNotIn(b"cdnjs.cloudflare.com", corpo)

    def test_api_exige_token_e_host(self):
        self.assertEqual(self.req("GET", "/api/col/clientes", token=False)[0], 403)
        self.assertEqual(self.req("GET", "/api/col/clientes", host="malicioso.com")[0], 403)
        self.assertEqual(self.req("GET", "/api/col/clientes")[0], 200)

    def test_ciclo_documento(self):
        self.assertEqual(self.req("PUT", "/api/doc/prazos/p1", {"obr": "Guia", "feito": False})[0], 200)
        self.assertEqual(self.req("PATCH", "/api/doc/prazos/p1", {"feito": True})[0], 200)
        status, corpo = self.req("GET", "/api/doc/prazos/p1")
        self.assertEqual(json.loads(corpo), {"exists": True, "data": {"obr": "Guia", "feito": True}})
        self.assertEqual(json.loads(self.req("GET", "/api/col/prazos")[1]),
                         [{"id": "p1", "data": {"obr": "Guia", "feito": True}}])
        self.req("DELETE", "/api/doc/prazos/p1")
        self.assertFalse(json.loads(self.req("GET", "/api/doc/prazos/p1")[1])["exists"])
        self.assertEqual(self.req("GET", "/api/col/senhas")[0], 400)

    def test_upload_pdf(self):
        status, corpo = self.req("POST", "/api/assets", PDF)
        self.assertEqual(status, 200)
        info = json.loads(corpo)
        self.assertEqual(info["sizeBytes"], len(PDF))
        self.assertTrue(self.store.caminho_pdf(info["id"]).exists())
        self.assertEqual(self.req("POST", "/api/abrir", {"url": "file:///etc/passwd"})[0], 400)

    def test_arquivos_do_flow(self):
        for caminho, trecho in [("/nucleo/tema-exato.css", b"fx-bg"), ("/nucleo/flow-dados.js", b"FlowDados"),
                                ("/modulos/clientes.html", b"flow-dados.js"), ("/modulos/painel-sindical.html", b"tema-sindical.css"),
                                ("/modulos/auditoria-guias.html", b"/vendor/pdf-lib.min.js"), ("/vendor/pdf.min.mjs", b""),
                                ("/modulos/ponto.html", b"/vendor/xlsx.full.min.js"), ("/nucleo/ponto-calculo.js", b"apurar"),
                                ("/nucleo/dominio-relatorios.js", b"/vendor/"), ("/vendor/xlsx.full.min.js", b"SheetJS")]:
            status, corpo = self.req("GET", caminho, token=False)
            self.assertEqual(status, 200, caminho)
            self.assertIn(trecho, corpo, caminho)
            self.assertNotIn(b"cdnjs.cloudflare.com/ajax", corpo, caminho)   # funciona sem internet
        # nada fora da pasta da tela, nem tipos não previstos
        for caminho in ["/../server.py", "/%2e%2e/server.py", "/modulos/../../config.py", "/nao-existe.html"]:
            self.assertEqual(self.req("GET", caminho, token=False)[0], 404, caminho)
        self.assertEqual(self.req("PUT", "/api/doc/auditorias/12345678000190", {"ultima": {"st": "ok"}})[0], 200)

    def test_pdf_guardado_exige_token(self):
        info = json.loads(self.req("POST", "/api/assets", PDF)[1])
        self.assertEqual(self.req("GET", "/_blob/" + info["id"], token=False)[0], 403)
        self.assertEqual(self.req("GET", "/_blob/" + info["id"]), (200, PDF))
        self.assertEqual(self.req("GET", "/_blob/" + "0" * 32)[0], 404)

    def test_colecoes_do_ponto(self):
        for col in ("ponto", "ponto_regras", "funcionarios", "cct_ponto"):
            self.assertEqual(self.req("PUT", f"/api/doc/{col}/11657101000156_202610", {"x": 1})[0], 200, col)

    def test_mascote(self):
        status, corpo = self.req("GET", "/nucleo/mascote.png", token=False)
        self.assertEqual(status, 200)
        padrao = corpo
        self.assertTrue(padrao.startswith(b"\x89PNG"))
        self.assertEqual(self.req("POST", "/api/mascote", b"nao e imagem")[0], 400)
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 20
        self.assertEqual(self.req("POST", "/api/mascote", png)[0], 200)
        self.assertTrue(json.loads(self.req("GET", "/api/info")[1])["mascote"])
        self.assertEqual(self.req("GET", "/nucleo/mascote.png", token=False), (200, png))
        self.assertEqual(self.req("GET", "/nucleo/mascote-rosto.png", token=False), (200, png))
        self.req("DELETE", "/api/mascote")
        self.assertEqual(self.req("GET", "/nucleo/mascote.png", token=False), (200, padrao))

    def test_salvar_binario(self):
        with tempfile.TemporaryDirectory() as casa, mock.patch("painel_sindical_exato.server.pasta_downloads", return_value=Path(casa)):
            status, corpo = self.req("POST", "/api/salvar_bin", PDF)
            self.assertEqual(status, 200)
            self.assertEqual(Path(json.loads(corpo)["path"]).read_bytes(), PDF)

    def test_ia_sem_chave(self):
        with mock.patch.dict("os.environ", {"ANTHROPIC_API_KEY": ""}):
            status, corpo = self.req("POST", "/api/ia", {"prompt": "x"})
        self.assertEqual(status, 400)
        self.assertEqual(json.loads(corpo)["code"], "sem_chave")

    def test_nome_nao_usa_usuario_do_windows(self):
        with mock.patch("getpass.getuser", return_value="jonatha"):
            self.assertEqual(json.loads(self.req("GET", "/api/info")[1])["nome"], "")

    def test_info_e_config(self):
        self.req("POST", "/api/config", {"nome": "Nilo"})
        info = json.loads(self.req("GET", "/api/info")[1])
        self.assertEqual(info["nome"], "Nilo")
        self.assertTrue(info["vazio"])

    def test_ping_e_fechar(self):
        self.req("POST", "/api/ping")
        self.assertIsNotNone(self.estado.ultimo_ping)
        status, _ = self.req("POST", f"/api/fechar?t={self.estado.token}", b"", token=False)
        self.assertEqual(status, 200)
        self.assertIsNotNone(self.estado.fechando_em)


class TestIA(unittest.TestCase):
    def test_extrair_json(self):
        self.assertEqual(ia.extrair_json('{"cct_no_app": "Academias"}'), {"cct_no_app": "Academias"})
        self.assertEqual(ia.extrair_json('```json\n{"a": 1}\n```'), {"a": 1})
        with self.assertRaises(ia.ErroIA):
            ia.extrair_json("sem json aqui")


if __name__ == "__main__":
    unittest.main()
