# -*- coding: utf-8 -*-
"""Recalcula uma planilha no LibreOffice (sem abrir janela) e salva uma cópia com os valores.
Roda com o python do LibreOffice (tem o módulo uno):  recalc_lo.py ORIGEM.xlsx DESTINO.xlsx
Chamado por fechar_mes.py - não é preciso usar direto."""
import os, subprocess, sys, tempfile, time
import uno
from com.sun.star.beans import PropertyValue


def pv(n, v):
    p = PropertyValue(); p.Name = n; p.Value = v; return p


src, dst = sys.argv[1], sys.argv[2]
soffice = os.path.join(os.path.dirname(sys.executable), 'soffice.exe')
porta = 20000 + os.getpid() % 10000
perfil = uno.systemPathToFileUrl(os.path.join(tempfile.gettempdir(), 'ponto_lo_perfil'))
proc = subprocess.Popen([soffice, '--headless', '--invisible', '--nologo', '--norestore', '--nodefault', '--nolockcheck',
                         f'-env:UserInstallation={perfil}', f'--accept=socket,host=127.0.0.1,port={porta};urp;'])
try:
    local = uno.getComponentContext()
    resolver = local.ServiceManager.createInstanceWithContext('com.sun.star.bridge.UnoUrlResolver', local)
    ctx = None
    for _ in range(240):
        try:
            ctx = resolver.resolve(f'uno:socket,host=127.0.0.1,port={porta};urp;StarOffice.ComponentContext'); break
        except Exception:
            time.sleep(0.5)
    if ctx is None: sys.exit('LibreOffice não respondeu.')
    desktop = ctx.ServiceManager.createInstanceWithContext('com.sun.star.frame.Desktop', ctx)
    doc = desktop.loadComponentFromURL(uno.systemPathToFileUrl(os.path.abspath(src)), '_blank', 0, (pv('Hidden', True),))
    doc.calculateAll()
    doc.storeToURL(uno.systemPathToFileUrl(os.path.abspath(dst)), (pv('FilterName', 'Calc MS Excel 2007 XML'),))
    doc.close(True)
    try: desktop.terminate()
    except Exception: pass
finally:
    try: proc.wait(timeout=30)
    except Exception: proc.kill()
