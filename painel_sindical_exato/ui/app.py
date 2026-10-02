"""Janela principal do Painel Sindical Exato."""

import tkinter as tk
from datetime import datetime
from tkinter import filedialog, messagebox, ttk

from .. import NOME_APP, VERSAO, config, db
from ..modelos import TABELAS
from .crud import CrudFrame, abrir_arquivo
from .painel import PainelFrame
from .verificador import VerificadorFrame


class App(tk.Tk):
    def __init__(self, caminho_banco=None):
        super().__init__()
        self.caminho_banco = caminho_banco or config.caminho_banco()
        self.conn = db.conectar(self.caminho_banco)
        self.title(f"{NOME_APP} {VERSAO}")
        self.geometry("1280x760")
        self.minsize(980, 600)
        estilo = ttk.Style(self)
        if "vista" in estilo.theme_names():
            estilo.theme_use("vista")
        elif "clam" in estilo.theme_names():
            estilo.theme_use("clam")
        estilo.configure("Treeview", rowheight=22)

        self._menu()
        self.abas = ttk.Notebook(self)
        self.abas.pack(fill="both", expand=True)

        self.painel = PainelFrame(self.abas, self.conn, ir_para=self.ir_para)
        self.abas.add(self.painel, text="  Painel  ")
        self.cruds: dict[str, CrudFrame] = {}
        for nome, tabela in TABELAS.items():
            frame = CrudFrame(self.abas, self.conn, tabela, ao_alterar=self.painel.atualizar)
            self.cruds[nome] = frame
            self.abas.add(frame, text=f"  {tabela.titulo}  ")
        self.verificador = VerificadorFrame(self.abas, self.conn)
        self.abas.add(self.verificador, text="  Conferir piso  ")
        self.abas.bind("<<NotebookTabChanged>>", self._ao_trocar_aba)

        rodape = ttk.Label(self, text=f"Banco de dados: {self.caminho_banco}", foreground="#666", padding=(8, 2))
        rodape.pack(fill="x", side="bottom")
        self.protocol("WM_DELETE_WINDOW", self.sair)

    def _menu(self):
        barra = tk.Menu(self)
        arquivo = tk.Menu(barra, tearoff=False)
        arquivo.add_command(label="Fazer backup do banco…", command=self.fazer_backup)
        arquivo.add_command(label="Exportar tudo para CSV (Excel)…", command=self.exportar_csv)
        arquivo.add_command(label="Abrir pasta de dados", command=lambda: abrir_arquivo(str(config.pasta_dados())))
        arquivo.add_separator()
        arquivo.add_command(label="Sair", command=self.sair)
        barra.add_cascade(label="Arquivo", menu=arquivo)
        ajuda = tk.Menu(barra, tearoff=False)
        ajuda.add_command(label="Sobre", command=self.sobre)
        barra.add_cascade(label="Ajuda", menu=ajuda)
        self.config(menu=barra)

    def _ao_trocar_aba(self, _evento=None):
        atual = self.nametowidget(self.abas.select())
        if hasattr(atual, "atualizar"):
            atual.atualizar()

    def ir_para(self, tabela: str, id_: int):
        frame = self.cruds.get(tabela)
        if frame:
            self.abas.select(frame)
            frame.atualizar()
            frame.selecionar(id_)

    def fazer_backup(self):
        nome = f"painel_sindical_backup_{datetime.now():%Y%m%d_%H%M}.db"
        destino = filedialog.asksaveasfilename(title="Salvar backup", initialfile=nome, defaultextension=".db",
                                               filetypes=[("Banco SQLite", "*.db")])
        if destino:
            db.backup(self.conn, destino)
            messagebox.showinfo("Backup", f"Backup salvo em:\n{destino}")

    def exportar_csv(self):
        pasta = filedialog.askdirectory(title="Escolha a pasta para os arquivos CSV")
        if pasta:
            arquivos = db.exportar_csv(self.conn, pasta)
            messagebox.showinfo("Exportar", f"{len(arquivos)} arquivos gerados em:\n{pasta}")

    def sobre(self):
        messagebox.showinfo("Sobre", f"{NOME_APP} {VERSAO}\n\nControle de sindicatos, CCTs, pisos, contribuições "
                            "e enquadramento sindical de clientes.\n\nAs informações dependem do que for cadastrado: "
                            "sempre confirme CCT, registro e vigência no Mediador/MTE.")

    def sair(self):
        self.conn.close()
        self.destroy()


def main():
    App().mainloop()
