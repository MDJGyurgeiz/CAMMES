@echo off
echo ========================================
echo   CAMMES - Aggiornamento da GitHub
echo ========================================
echo.
cd /d "%~dp0"
git pull
if %errorlevel% == 0 (
    echo.
    echo ========================================
    echo   Aggiornato con successo!
    echo ========================================
) else (
    echo.
    echo ERRORE: aggiornamento fallito. Controlla la connessione.
)
echo.
pause
