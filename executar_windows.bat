@echo off
REM Executa o Painel Sindical Exato direto do codigo-fonte (precisa do Python 3.10+ instalado).
cd /d "%~dp0"
where pythonw >nul 2>nul && (start "" pythonw main.py) || (python main.py)
