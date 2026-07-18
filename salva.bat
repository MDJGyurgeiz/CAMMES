@echo off
setlocal enabledelayedexpansion
echo ========================================
echo   CAMMES - Salvataggio su GitHub
echo ========================================
echo.
cd /d "%~dp0"

REM AUDIT REL-08: staging SELETTIVO. Prima "git add -A" si affidava solo al
REM .gitignore per non committare misure/log; qui escludiamo esplicitamente i
REM dati (prove/, settings, log, dist, exe) come cintura in piu'. Cosi' un file
REM di misura non finisce mai nel repo per errore.
git add -A -- . ":(exclude)cammes/prove" ":(exclude)cammes/prove/**" ":(exclude)cammes/settings.json" ":(exclude)*.log" ":(exclude)cammes/*.log" ":(exclude)DIST_*" ":(exclude)*.exe"

REM git commit ritorna 1 se non c'e' nulla da committare: lo trattiamo come
REM "niente da salvare", non come errore.
git commit -m "Salvataggio %date% %time:~0,8%"
if errorlevel 1 (
    echo.
    echo Nessuna modifica da salvare.
    echo.
    pause
    exit /b 0
)

echo.
echo Invio su GitHub in corso...
git push
REM AUDIT REL-08: "if errorlevel 1" e' valutato a RUNTIME (dopo git push),
REM a differenza di "%errorlevel%" che veniva espanso al parse del blocco e
REM annunciava successo anche su push fallito.
if errorlevel 1 (
    echo.
    echo ERRORE: push fallito. Controlla la connessione e riprova.
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Salvato con successo!
echo ========================================
echo.
pause
