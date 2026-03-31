@echo off
echo ================================================
echo   ABC Backflow Invoice Management
echo ================================================
echo.

:: Check if Node.js is installed
where.exe node >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js is not installed!
    echo Please install Node.js from https://nodejs.org/ ^(LTS version^)
    echo Then run this file again.
    pause
    exit
)

:: Install root dependencies if missing
if not exist "node_modules" (
    echo Installing application dependencies... This may take a few minutes...
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install dependencies.
        pause
        exit
    )
    echo Done.
    echo.
)

:: Install server dependencies if missing
if not exist "server\node_modules" (
    echo Installing server dependencies...
    cd server
    call npm install
    if %ERRORLEVEL% NEQ 0 (
        echo ERROR: Failed to install server dependencies.
        pause
        exit
    )
    cd ..
    echo Done.
    echo.
)

:: Set Node options for compatibility
set NODE_OPTIONS=--openssl-legacy-provider

echo Starting the application...
echo Once started, open your browser to: http://localhost:3000
echo.
echo (Close this window to stop the application)
echo.

npm run dev

pause
