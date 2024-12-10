@echo off
echo Starting deployment process...

:: Install dependencies
call npm install

:: Build the React application
call npm run build

:: Start the server
call npm run server