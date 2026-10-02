"""Tela genérica de cadastro (lista + formulário) montada a partir de modelos.Tabela."""

import os
import subprocess
import sys
import tkinter as tk
from tkinter import filedialog, messagebox, ttk

from .. import db
from ..formatos import (cnpj_formatado, cnpj_valido, data_para_banco, data_para_tela,
                        inteiro_para_banco, moeda_para_banco, moeda_para_tela, somente_digitos)
from ..modelos import Tabela


def abrir_arquivo(caminho: str) -> None:
    if sys.platform.startswith("win"):
        os.startfile(caminho)  # noqa: S606 - abre com o programa padrão do Windows
    elif sys.platform == "darwin":
        subprocess.Popen(["open", caminho])
    else:
        subprocess.Popen(["xdg-open", caminho])


class CrudFrame(ttk.Frame):
    def __init__(self, master, conn, tabela: Tabela, ao_alterar=None):
        super().__init__(master, padding=8)
        self.conn = conn
        self.t = tabela
        self.ao_alterar = ao_alterar or (lambda: None)
        self.id_atual = None
        self.widgets: dict[str, tk.Widget] = {}
        self.refs: dict[str, dict] = {}  # campo -> {rótulo: id}
        self._montar()
        self.atualizar()

    # ---------- montagem ----------
    def _montar(self):
        self.columnconfigure(0, weight=3)
        self.columnconfigure(1, weight=2)
        self.rowconfigure(1, weight=1)

        barra = ttk.Frame(self)
        barra.grid(row=0, column=0, sticky="ew", pady=(0, 6))
        ttk.Label(barra, text="Pesquisar:").pack(side="left")
        self.var_busca = tk.StringVar()
        self.var_busca.trace_add("write", lambda *_: self._carregar_lista())
        ttk.Entry(barra, textvariable=self.var_busca, width=40).pack(side="left", padx=6, fill="x", expand=True)
        self.lbl_total = ttk.Label(barra, text="")
        self.lbl_total.pack(side="right")

        lista = ttk.Frame(self)
        lista.grid(row=1, column=0, sticky="nsew", padx=(0, 8))
        lista.rowconfigure(0, weight=1)
        lista.columnconfigure(0, weight=1)
        self.colunas = [c for c in self.t.campos if c.na_lista]
        self.tree = ttk.Treeview(lista, columns=[c.nome for c in self.colunas], show="headings", selectmode="browse")
        for c in self.colunas:
            self.tree.heading(c.nome, text=c.rotulo)
            anchor = "e" if c.tipo in ("moeda", "inteiro") else "w"
            self.tree.column(c.nome, width=c.largura, anchor=anchor, stretch=c.largura >= 200)
        rolagem_y = ttk.Scrollbar(lista, orient="vertical", command=self.tree.yview)
        rolagem_x = ttk.Scrollbar(lista, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=rolagem_y.set, xscrollcommand=rolagem_x.set)
        self.tree.grid(row=0, column=0, sticky="nsew")
        rolagem_y.grid(row=0, column=1, sticky="ns")
        rolagem_x.grid(row=1, column=0, sticky="ew")
        self.tree.bind("<<TreeviewSelect>>", self._ao_selecionar)

        form = ttk.LabelFrame(self, text=self.t.titulo, padding=8)
        form.grid(row=0, column=1, rowspan=2, sticky="nsew")
        form.columnconfigure(1, weight=1)
        for i, c in enumerate(self.t.campos):
            rotulo = c.rotulo + (" *" if c.obrigatorio else "")
            ttk.Label(form, text=rotulo).grid(row=i, column=0, sticky="nw", pady=2, padx=(0, 6))
            self.widgets[c.nome] = self._criar_widget(form, c, i)

        botoes = ttk.Frame(form)
        botoes.grid(row=len(self.t.campos), column=0, columnspan=2, sticky="ew", pady=(10, 0))
        ttk.Button(botoes, text="Novo", command=self.novo).pack(side="left")
        ttk.Button(botoes, text="Salvar", command=self.salvar).pack(side="left", padx=6)
        ttk.Button(botoes, text="Excluir", command=self.excluir).pack(side="left")
        ttk.Label(form, text="* obrigatório  ·  datas: dd/mm/aaaa  ·  valores: 1.234,56",
                  foreground="#666").grid(row=len(self.t.campos) + 1, column=0, columnspan=2, sticky="w", pady=(8, 0))

    def _criar_widget(self, form, c, linha):
        if c.tipo == "texto_longo":
            w = tk.Text(form, height=3, width=40, wrap="word", font="TkDefaultFont")
            w.grid(row=linha, column=1, sticky="ew", pady=2)
        elif c.tipo in ("opcao", "ref"):
            w = ttk.Combobox(form, values=c.opcoes, state="readonly")
            w.grid(row=linha, column=1, sticky="ew", pady=2)
        elif c.tipo == "arquivo":
            quadro = ttk.Frame(form)
            quadro.grid(row=linha, column=1, sticky="ew", pady=2)
            quadro.columnconfigure(0, weight=1)
            w = ttk.Entry(quadro)
            w.grid(row=0, column=0, sticky="ew")
            ttk.Button(quadro, text="…", width=3, command=lambda: self._escolher_arquivo(w)).grid(row=0, column=1, padx=2)
            ttk.Button(quadro, text="Abrir", width=6, command=lambda: self._abrir(w)).grid(row=0, column=2)
        else:
            w = ttk.Entry(form)
            w.grid(row=linha, column=1, sticky="ew", pady=2)
        return w

    def _escolher_arquivo(self, entry):
        caminho = filedialog.askopenfilename(
            title="Selecionar arquivo da CCT",
            filetypes=[("PDF", "*.pdf"), ("Todos os arquivos", "*.*")])
        if caminho:
            entry.delete(0, "end")
            entry.insert(0, caminho)

    def _abrir(self, entry):
        caminho = entry.get().strip()
        if not caminho or not os.path.exists(caminho):
            messagebox.showwarning("Arquivo", "Arquivo não encontrado.", parent=self)
            return
        abrir_arquivo(caminho)

    # ---------- dados ----------
    def atualizar(self):
        """Recarrega listas de referência e a listagem (chamado ao trocar de aba)."""
        for c in self.t.campos:
            if c.tipo == "ref":
                mapa = db.rotulos(self.conn, c.ref)
                self.refs[c.nome] = {rot: id_ for id_, rot in mapa.items()}
                self.widgets[c.nome]["values"] = [""] + list(self.refs[c.nome].keys())
        self._carregar_lista()

    def _carregar_lista(self):
        self.tree.delete(*self.tree.get_children())
        linhas = db.listar(self.conn, self.t.nome, self.var_busca.get().strip())
        rotulo_ref = {nome: {v: k for k, v in m.items()} for nome, m in self.refs.items()}
        for r in linhas:
            valores = []
            for c in self.colunas:
                v = r[c.nome]
                if c.tipo == "data":
                    v = data_para_tela(v)
                elif c.tipo == "moeda":
                    v = moeda_para_tela(v)
                elif c.tipo == "ref":
                    v = rotulo_ref.get(c.nome, {}).get(v, "")
                valores.append("" if v is None else str(v).replace("\n", " "))
            self.tree.insert("", "end", iid=str(r["id"]), values=valores)
        self.lbl_total.config(text=f"{len(linhas)} registro(s)")
        if self.id_atual and self.tree.exists(str(self.id_atual)):
            self.tree.selection_set(str(self.id_atual))

    def selecionar(self, id_: int):
        # guarda o alvo antes: recarregar a lista (troca de aba) mantém a seleção de id_atual
        self.id_atual = id_
        self.var_busca.set("")
        if self.tree.exists(str(id_)):
            self.tree.selection_set(str(id_))
            self.tree.see(str(id_))

    def _ao_selecionar(self, _evento=None):
        sel = self.tree.selection()
        if not sel:
            return
        registro = db.obter(self.conn, self.t.nome, int(sel[0]))
        if registro:
            self._preencher(registro)

    def _definir(self, c, valor):
        w = self.widgets[c.nome]
        if c.tipo == "texto_longo":
            w.delete("1.0", "end")
            w.insert("1.0", valor)
        elif c.tipo in ("opcao", "ref"):
            w.set(valor)
        else:
            w.delete(0, "end")
            w.insert(0, valor)

    def _preencher(self, registro):
        self.id_atual = registro["id"]
        for c in self.t.campos:
            v = registro.get(c.nome)
            if c.tipo == "data":
                v = data_para_tela(v)
            elif c.tipo == "moeda":
                v = moeda_para_tela(v)
            elif c.tipo == "ref":
                v = next((rot for rot, i in self.refs.get(c.nome, {}).items() if i == v), "")
            self._definir(c, "" if v is None else str(v))

    def _ler(self, c):
        w = self.widgets[c.nome]
        if c.tipo == "texto_longo":
            return w.get("1.0", "end").strip()
        return w.get().strip()

    def novo(self):
        self.id_atual = None
        self.tree.selection_remove(self.tree.selection())
        for c in self.t.campos:
            self._definir(c, c.padrao)

    def _coletar(self) -> dict | None:
        dados = {}
        for c in self.t.campos:
            texto = self._ler(c)
            if c.obrigatorio and not texto:
                messagebox.showwarning("Campo obrigatório", f"Preencha: {c.rotulo}", parent=self)
                return None
            try:
                if c.tipo == "data":
                    valor = data_para_banco(texto)
                elif c.tipo == "moeda":
                    valor = moeda_para_banco(texto)
                elif c.tipo == "inteiro":
                    valor = inteiro_para_banco(texto)
                elif c.tipo == "ref":
                    valor = self.refs.get(c.nome, {}).get(texto)
                elif c.tipo == "cnpj":
                    if somente_digitos(texto) and not cnpj_valido(texto):
                        if not messagebox.askyesno("CNPJ", f"O CNPJ '{texto}' parece inválido. Salvar mesmo assim?",
                                                   parent=self):
                            return None
                    valor = cnpj_formatado(texto)
                else:
                    valor = texto
            except ValueError as erro:
                messagebox.showwarning(c.rotulo, str(erro), parent=self)
                return None
            dados[c.nome] = valor
        if self.id_atual:
            dados["id"] = self.id_atual
        return dados

    def salvar(self):
        dados = self._coletar()
        if dados is None:
            return
        self.id_atual = db.salvar(self.conn, self.t.nome, dados)
        self._carregar_lista()
        self.ao_alterar()

    def excluir(self):
        if not self.id_atual:
            return
        deps = db.dependencias(self.conn, self.t.nome, self.id_atual)
        aviso = ""
        if deps:
            aviso = "\n\nAtenção — registros ligados: " + ", ".join(f"{n} {k}" for k, n in deps.items())
            if self.t.nome == "ccts":
                aviso += "\nPisos e contribuições desta CCT serão excluídos; clientes ficarão sem CCT."
            else:
                aviso += "\nAs CCTs ficarão sem este sindicato."
        if not messagebox.askyesno("Excluir", "Excluir o registro selecionado?" + aviso, parent=self):
            return
        db.excluir(self.conn, self.t.nome, self.id_atual)
        self.novo()
        self._carregar_lista()
        self.ao_alterar()
