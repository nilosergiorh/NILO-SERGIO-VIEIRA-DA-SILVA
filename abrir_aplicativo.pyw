# -*- coding: utf-8 -*-
"""
Abre o aplicativo Ponto -> Domínio numa janela própria (como um programa).
É o que o ícone "Ponto - Dominio" (Área de Trabalho / barra de tarefas) executa.
- Se o aplicativo ainda não estiver funcionando, liga em segundo plano (sem janela preta).
- Abre a janela do aplicativo no Edge, sem barra de endereço.
Registro de erros: logs/app.log
"""
import os, socket, subprocess, sys, time, webbrowser

PASTA = os.path.dirname(os.path.abspath(__file__))
PORTA = 8765
URL = f'http://127.0.0.1:{PORTA}/'
EDGE = [r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
        r'C:\Program Files\Microsoft\Edge\Application\msedge.exe']


def no_ar():
    try:
        socket.create_connection(('127.0.0.1', PORTA), 0.5).close(); return True
    except OSError:
        return False


def aviso(msg):
    import ctypes
    ctypes.windll.user32.MessageBoxW(0, msg, 'Ponto - Domínio', 0x10)


def main():
    if not no_ar():
        os.makedirs(os.path.join(PASTA, 'logs'), exist_ok=True)
        log = open(os.path.join(PASTA, 'logs', 'app.log'), 'a', encoding='utf-8')
        log.write(f'\n===== {time.strftime("%d/%m/%Y %H:%M:%S")} iniciando =====\n'); log.flush()
        pyw = sys.executable if sys.executable.lower().endswith('pythonw.exe') else sys.executable.replace('python.exe', 'pythonw.exe')
        env = dict(os.environ, PONTO_SEM_NAVEGADOR='1', PYTHONIOENCODING='utf-8')
        subprocess.Popen([pyw, '-W', 'ignore', os.path.join(PASTA, 'app.py')], cwd=PASTA, env=env, stdout=log, stderr=log,
                         creationflags=0x00000008 | 0x00000200)  # DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP
        for _ in range(60):
            if no_ar(): break
            time.sleep(0.5)
        else:
            return aviso('O aplicativo não conseguiu iniciar.\nVeja o arquivo logs\\app.log na pasta do programa.')
    edge = next((e for e in EDGE if os.path.exists(e)), None)
    if edge:
        subprocess.Popen([edge, f'--app={URL}', '--window-size=1300,880'])
    else:
        webbrowser.open(URL)


if __name__ == '__main__':
    main()
