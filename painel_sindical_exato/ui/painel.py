"""Aba inicial: indicadores e alertas."""

import tkinter as tk
from tkinter import ttk

from .. import regras
from ..formatos import data_para_tela

CORES = {regras.ALTA: "#f8d7da", regras.MEDIA: "#fff3cd", regras.BAIXA: "#e2e3e5"}


class PainelFrame(ttk.Frame):
    def __init__(self, master, conn, ir_para=None):
        super().__init__(master, padding=10)
        self.conn = conn
        self.ir_para = ir_para or (lambda tabela, id_: None)
        self.alertas: list[regras.Alerta] = []

        self.cartoes = ttk.Frame(self)
        self.cartoes.pack(fill="x")

        filtro = ttk.Frame(self)
        filtro.pack(fill="x", pady=(12, 4))
        ttk.Label(filtro, text="Alertas", font=("TkDefaultFont", 11, "bold")).pack(side="left")
        ttk.Button(filtro, text="Atualizar", command=self.atualizar).pack(side="right")
        self.var_dias = tk.IntVar(value=60)
        ttk.Spinbox(filtro, from_=15, to=365, increment=15, width=5, textvariable=self.var_dias,
                    command=self.atualizar).pack(side="right", padx=4)
        ttk.Label(filtro, text="Avisar CCT a vencer em (dias):").pack(side="right")

        quadro = ttk.Frame(self)
        quadro.pack(fill="both", expand=True)
        colunas = ("severidade", "categoria", "data", "mensagem")
        self.tree = ttk.Treeview(quadro, columns=colunas, show="headings")
        for col, titulo, larg, estica in (("severidade", "Severidade", 90, False), ("categoria", "Categoria", 150, False),
                                          ("data", "Data", 90, False), ("mensagem", "Mensagem", 700, True)):
            self.tree.heading(col, text=titulo)
            self.tree.column(col, width=larg, stretch=estica)
        for sev, cor in CORES.items():
            self.tree.tag_configure(sev, background=cor)
        rolagem = ttk.Scrollbar(quadro, orient="vertical", command=self.tree.yview)
        self.tree.configure(yscrollcommand=rolagem.set)
        self.tree.pack(side="left", fill="both", expand=True)
        rolagem.pack(side="right", fill="y")
        self.tree.bind("<Double-1>", self._abrir_alerta)
        ttk.Label(self, text="Dê dois cliques num alerta para abrir o cadastro correspondente.",
                  foreground="#666").pack(anchor="w", pady=(4, 0))
        self.atualizar()

    def atualizar(self):
        for w in self.cartoes.winfo_children():
            w.destroy()
        for rotulo, valor in regras.resumo(self.conn).items():
            cartao = ttk.LabelFrame(self.cartoes, text=rotulo, padding=(14, 6))
            cartao.pack(side="left", padx=(0, 10))
            ttk.Label(cartao, text=str(valor), font=("TkDefaultFont", 18, "bold")).pack()

        try:
            dias = int(self.var_dias.get())
        except (tk.TclError, ValueError):
            dias = 60
        self.alertas = regras.gerar_alertas(self.conn, dias_cct=dias)
        self.tree.delete(*self.tree.get_children())
        for i, a in enumerate(self.alertas):
            data = data_para_tela(a.data.isoformat()) if a.data else ""
            self.tree.insert("", "end", iid=str(i), values=(a.severidade, a.categoria, data, a.mensagem),
                             tags=(a.severidade,))
        if not self.alertas:
            self.tree.insert("", "end", values=("", "", "", "Nenhum alerta. Tudo em dia."))

    def _abrir_alerta(self, _evento=None):
        sel = self.tree.selection()
        if not sel or not sel[0].isdigit() or int(sel[0]) >= len(self.alertas):
            return
        alerta = self.alertas[int(sel[0])]
        if alerta.tabela and alerta.id_:
            self.ir_para(alerta.tabela, alerta.id_)
