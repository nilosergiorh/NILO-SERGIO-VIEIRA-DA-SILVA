import tempfile
import unittest
from datetime import date
from pathlib import Path

from painel_sindical_exato import db, regras
from painel_sindical_exato.formatos import (cnpj_formatado, cnpj_valido, data_para_banco, data_para_tela,
                                            moeda_para_banco, moeda_para_tela)
from painel_sindical_exato.modelos import TABELAS

HOJE = date(2026, 10, 2)


class TestFormatos(unittest.TestCase):
    def test_datas(self):
        self.assertEqual(data_para_banco("31/12/2026"), "2026-12-31")
        self.assertEqual(data_para_banco(""), "")
        self.assertEqual(data_para_tela("2026-12-31"), "31/12/2026")
        with self.assertRaises(ValueError):
            data_para_banco("31/02/2026")

    def test_moeda(self):
        self.assertEqual(moeda_para_banco("1.234,56"), 1234.56)
        self.assertEqual(moeda_para_banco("R$ 2.000"), 2000.0)
        self.assertEqual(moeda_para_banco("1850.5"), 1850.5)
        self.assertIsNone(moeda_para_banco(""))
        self.assertEqual(moeda_para_tela(1234567.8), "1.234.567,80")

    def test_cnpj(self):
        self.assertTrue(cnpj_valido("11.222.333/0001-81"))
        self.assertFalse(cnpj_valido("11.222.333/0001-82"))
        self.assertFalse(cnpj_valido("00000000000000"))
        self.assertEqual(cnpj_formatado("11222333000181"), "11.222.333/0001-81")


class TestBanco(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.conn = db.conectar(Path(self.tmp.name) / "teste.db")

    def tearDown(self):
        self.conn.close()
        self.tmp.cleanup()

    def _cct(self, **extra):
        dados = {"titulo": "Comércio", "registro_mte": "SC000123/2026", "vigencia_inicio": "2026-01-01",
                 "vigencia_fim": "2026-12-31", "abrangencia": "Araranguá, Criciúma"}
        dados.update(extra)
        return db.salvar(self.conn, "ccts", dados)

    def test_modelos_batem_com_esquema(self):
        for nome, t in TABELAS.items():
            colunas = {r[1] for r in self.conn.execute(f"PRAGMA table_info({nome})")}
            for c in t.campos:
                self.assertIn(c.nome, colunas, f"{nome}.{c.nome}")

    def test_crud_e_cascata(self):
        sind = db.salvar(self.conn, "sindicatos", {"nome": "Sind. Comerciários", "tipo": "Laboral"})
        cct = self._cct(sindicato_laboral_id=sind)
        db.salvar(self.conn, "pisos", {"cct_id": cct, "funcao": "Vendedor", "piso_efetivo": 2000.0})
        cli = db.salvar(self.conn, "clientes", {"razao_social": "Loja X", "cct_id": cct})
        self.assertEqual(db.dependencias(self.conn, "ccts", cct), {"clientes": 1, "pisos": 1})
        self.assertEqual(db.dependencias(self.conn, "sindicatos", sind), {"CCTs": 1})

        db.salvar(self.conn, "clientes", {"id": cli, "razao_social": "Loja X Ltda"})
        self.assertEqual(db.obter(self.conn, "clientes", cli)["razao_social"], "Loja X Ltda")
        self.assertEqual(len(db.listar(self.conn, "clientes", "x ltda")), 1)

        db.excluir(self.conn, "ccts", cct)
        self.assertEqual(db.listar(self.conn, "pisos"), [])
        self.assertIsNone(db.obter(self.conn, "clientes", cli)["cct_id"])

    def test_rotulos_unicos(self):
        a = self._cct()
        b = self._cct()
        rot = db.rotulos(self.conn, "ccts")
        self.assertNotEqual(rot[a], rot[b])

    def test_tabela_invalida(self):
        with self.assertRaises(ValueError):
            db.listar(self.conn, "usuarios; DROP TABLE ccts")

    def test_exportar_e_backup(self):
        self._cct()
        arquivos = db.exportar_csv(self.conn, Path(self.tmp.name) / "csv")
        self.assertEqual(len(arquivos), len(TABELAS))
        texto = (Path(self.tmp.name) / "csv" / "ccts.csv").read_text(encoding="utf-8-sig")
        self.assertIn("Comércio", texto)
        destino = Path(self.tmp.name) / "bkp.db"
        db.backup(self.conn, destino)
        copia = db.conectar(destino)
        self.assertEqual(len(db.listar(copia, "ccts")), 1)
        copia.close()

    def test_alertas(self):
        vencida = self._cct(titulo="Vencida", vigencia_fim="2026-04-30")
        self._cct(titulo="A vencer", vigencia_fim="2026-11-15")
        self._cct(titulo="Sem registro", registro_mte="")
        db.salvar(self.conn, "clientes", {"razao_social": "Cli vencida", "cct_id": vencida, "municipio": "Araranguá"})
        db.salvar(self.conn, "clientes", {"razao_social": "Cli sem CCT"})
        db.salvar(self.conn, "clientes", {"razao_social": "Cli fora", "cct_id": vencida, "municipio": "Tubarão"})
        db.salvar(self.conn, "contribuicoes", {"cct_id": vencida, "tipo": "Assistencial", "responsavel": "Empregado",
                                               "prazo_oposicao": "2026-10-05"})

        alertas = regras.gerar_alertas(self.conn, hoje=HOJE)
        categorias = [a.categoria for a in alertas]
        self.assertIn("CCT vencida", categorias)
        self.assertIn("CCT a vencer", categorias)
        self.assertIn("Cliente sem CCT", categorias)
        self.assertIn("Prazo de oposição", categorias)
        fora = [a for a in alertas if a.categoria == "Base territorial"]
        self.assertEqual(len(fora), 1)  # Araranguá (com acento) bate; Tubarão não
        self.assertIn("Tubarão", fora[0].mensagem)
        self.assertTrue(any("Sem registro" in a.mensagem and "MTE" in a.mensagem for a in alertas))
        self.assertEqual(alertas[0].severidade, regras.ALTA)

        resumo = regras.resumo(self.conn, hoje=HOJE)
        self.assertEqual(resumo["CCTs cadastradas"], 3)
        self.assertEqual(resumo["CCTs vigentes"], 2)


class TestPiso(unittest.TestCase):
    def test_proporcional_abaixo(self):
        r = regras.conferir_piso(2200.0, 220, 110, 1000.0)
        self.assertEqual(r.piso_proporcional, 1100.0)
        self.assertTrue(r.abaixo)
        self.assertEqual(r.diferenca_mensal, 100.0)

    def test_acima(self):
        r = regras.conferir_piso(2000.0, 220, 220, 2100.0)
        self.assertFalse(r.abaixo)
        self.assertEqual(r.diferenca_mensal, 0.0)

    def test_horas_acima_da_carga_nao_aumentam_piso(self):
        self.assertEqual(regras.conferir_piso(2000.0, 220, 240, 0).piso_proporcional, 2000.0)

    def test_passivo(self):
        p = regras.estimar_passivo(120.0, 12)
        self.assertEqual(p["Diferenças salariais"], 1440.0)
        self.assertEqual(p["Reflexo 13º salário"], 120.0)
        self.assertEqual(p["Reflexo férias + 1/3"], 160.0)
        self.assertEqual(p["FGTS 8%"], 137.6)
        self.assertEqual(p["Total estimado"], 1857.6)

    def test_piso_invalido(self):
        with self.assertRaises(ValueError):
            regras.conferir_piso(None, 220, 220, 1000)


if __name__ == "__main__":
    unittest.main()
