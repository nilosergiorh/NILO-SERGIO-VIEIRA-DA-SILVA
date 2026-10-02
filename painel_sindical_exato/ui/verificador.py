"""Aba de conferência: salário x piso da CCT (proporcional à jornada) e risco retroativo."""

import tkinter as tk
from tkinter import messagebox, ttk

from .. import db, regras
from ..formatos import moeda_para_banco, moeda_para_tela


class VerificadorFrame(ttk.Frame):
    def __init__(self, master, conn):
        super().__init__(master, padding=12)
        self.conn = conn
        self.ccts: dict[str, int] = {}
        self.pisos: dict[str, dict] = {}

        form = ttk.LabelFrame(self, text="Conferir salário x piso da CCT", padding=10)
        form.pack(fill="x")
        form.columnconfigure(1, weight=1)

        self.cb_cct = ttk.Combobox(form, state="readonly")
        self.cb_funcao = ttk.Combobox(form, state="readonly")
        self.var_tipo = tk.StringVar(value="piso_efetivo")
        tipo = ttk.Frame(form)
        ttk.Radiobutton(tipo, text="Efetivo", value="piso_efetivo", variable=self.var_tipo).pack(side="left")
        ttk.Radiobutton(tipo, text="Experiência", value="piso_experiencia", variable=self.var_tipo).pack(side="left", padx=8)
        self.en_horas = ttk.Entry(form, width=10)
        self.en_horas.insert(0, "220")
        self.en_salario = ttk.Entry(form, width=15)
        self.en_meses = ttk.Entry(form, width=10)
        self.en_meses.insert(0, "0")

        linhas = (("CCT", self.cb_cct), ("Função", self.cb_funcao), ("Piso", tipo),
                  ("Horas mensais contratadas", self.en_horas), ("Salário atual (R$)", self.en_salario),
                  ("Meses com diferença (retroativo)", self.en_meses))
        for i, (rotulo, w) in enumerate(linhas):
            ttk.Label(form, text=rotulo).grid(row=i, column=0, sticky="w", pady=3, padx=(0, 8))
            w.grid(row=i, column=1, sticky="w" if i > 1 else "ew", pady=3)
        ttk.Button(form, text="Conferir", command=self.conferir).grid(row=len(linhas), column=1, sticky="w", pady=(8, 0))
        self.cb_cct.bind("<<ComboboxSelected>>", lambda _e: self._carregar_funcoes())

        self.saida = tk.Text(self, height=16, wrap="word", font=("Consolas", 10), state="disabled")
        self.saida.pack(fill="both", expand=True, pady=(10, 0))
        self.atualizar()

    def atualizar(self):
        self.ccts = {rot: i for i, rot in db.rotulos(self.conn, "ccts").items()}
        self.cb_cct["values"] = list(self.ccts)
        if self.cb_cct.get() not in self.ccts:
            self.cb_cct.set("")
        self._carregar_funcoes()

    def _carregar_funcoes(self):
        id_cct = self.ccts.get(self.cb_cct.get())
        pisos = db.listar(self.conn, "pisos", filtros={"cct_id": id_cct}) if id_cct else []
        self.pisos = {p["funcao"]: p for p in pisos}
        self.cb_funcao["values"] = list(self.pisos)
        if self.cb_funcao.get() not in self.pisos:
            self.cb_funcao.set("")

    def _escrever(self, texto):
        self.saida.config(state="normal")
        self.saida.delete("1.0", "end")
        self.saida.insert("1.0", texto)
        self.saida.config(state="disabled")

    def conferir(self):
        piso = self.pisos.get(self.cb_funcao.get())
        if not piso:
            messagebox.showwarning("Conferir", "Selecione a CCT e a função.", parent=self)
            return
        try:
            horas = float(self.en_horas.get().replace(",", "."))
            salario = moeda_para_banco(self.en_salario.get())
            meses = int(self.en_meses.get() or 0)
            if salario is None:
                raise ValueError("Informe o salário atual.")
            valor_piso = piso[self.var_tipo.get()]
            r = regras.conferir_piso(valor_piso, piso["carga_horaria_mensal"], horas, salario)
        except ValueError as erro:
            messagebox.showwarning("Conferir", str(erro), parent=self)
            return

        carga = piso["carga_horaria_mensal"] or 220
        linhas = [
            f"CCT:     {self.cb_cct.get()}",
            f"Função:  {piso['funcao']}" + (f"  (cláusula {piso['clausula']})" if piso["clausula"] else ""),
            "",
            "FATOS (cadastro)",
            f"  {f'Piso da CCT ({carga} h/mês)':.<34} R$ {moeda_para_tela(r.piso_cct)}",
            f"  {'Salário informado':.<34} R$ {moeda_para_tela(r.salario)}",
            "",
            "CÁLCULO",
            f"  {f'Piso proporcional a {horas:g} h':.<34} R$ {moeda_para_tela(r.piso_proporcional)}"
            f"   (= {moeda_para_tela(r.piso_cct)} × {min(horas, carga):g} ÷ {carga})",
        ]
        if r.abaixo:
            linhas += [f"  >>> SALÁRIO ABAIXO DO PISO: diferença de R$ {moeda_para_tela(r.diferenca_mensal)} por mês"]
            if meses > 0:
                linhas += ["", f"ESTIMATIVA DE PASSIVO ({meses} meses)"]
                for rotulo, valor in regras.estimar_passivo(r.diferenca_mensal, meses).items():
                    linhas.append(f"  {rotulo:.<34} R$ {moeda_para_tela(valor)}")
                linhas += ["  Não inclui INSS patronal, correção, juros nem reflexos em HE/adicionais."]
        else:
            linhas += ["  OK: salário igual ou acima do piso proporcional."]
        linhas += ["", "Observações: proporcionalidade conforme OJ 358 SDI-1/TST — confirmar se a CCT "
                   "veda o pagamento proporcional. Conferir se o piso cadastrado é o da vigência correta."]
        self._escrever("\n".join(linhas))
