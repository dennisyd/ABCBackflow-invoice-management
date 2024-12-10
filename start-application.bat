@echo off
echo Starting Invoice Management Application...

:: Check if Node.js is installed
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo Node.js is not installed! Please install Node.js from https://nodejs.org/
    pause
    exit
)

:: Check if dependencies are installed
if not exist "node_modules" (
    echo Installing dependencies... This may take a few minutes...
    call npm install
)

:: Set Node options for compatibility
set NODE_OPTIONS=--openssl-legacy-provider

:: Start the application
echo Starting the application...
npm run dev

pause