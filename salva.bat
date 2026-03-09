@echo off
echo ========================================
echo   CAMMES - Salvataggio su GitHub
echo ========================================
echo.
cd /d "%~dp0"
git add -A
git commit -m "Salvataggio %date% %time:~0,8%"
if %errorlevel% == 0 (
    echo.
    echo Invio su GitHub in corso...
    git push
    if %errorlevel% == 0 (
        echo.
        echo ========================================
        echo   Salvato con successo!
        echo ========================================
    ) else (
        echo.
        echo ERRORE: push fallito. Controlla la connessione.
    )
) else (
    echo.
    echo Nessuna modifica da salvare.
)
echo.
pause
