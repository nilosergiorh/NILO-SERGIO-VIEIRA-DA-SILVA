@echo off
title Ponto - Gerar TXT para o Dominio
set PY=%LOCALAPPDATA%\Programs\Python\Python312\python.exe
if not exist "%PY%" set PY=python
set PYTHONIOENCODING=utf-8
"%PY%" -W ignore "%~dp0ponto.py" txt
echo.
pause
