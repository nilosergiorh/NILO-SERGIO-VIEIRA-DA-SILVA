@echo off
title Ponto - Outras opcoes
set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not exist "%PY%" set PY=python
set PYTHONIOENCODING=utf-8
"%PY%" -W ignore "%~dp0ponto.py" outros
echo.
pause
