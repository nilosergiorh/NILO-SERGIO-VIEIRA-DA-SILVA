@echo off
REM Executa o Painel Sindical Exato direto do codigo-fonte (precisa do Python 3.10+).
cd /d "%~dp0"
python -m pip install --quiet -r requirements.txt
where pythonw >nul 2>nul && (start "" pythonw main.py) || (python main.py)
