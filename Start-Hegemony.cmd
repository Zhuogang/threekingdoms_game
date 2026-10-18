@echo off
setlocal
pushd "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS, then run this launcher again.
  pause
  popd
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Dependencies are missing. Run npm ci in this folder first.
  pause
  popd
  exit /b 1
)
echo Starting Hegemony of the Three Kingdoms.
echo Open the Local address below in your browser.
echo Keep this window open while playing. Press Ctrl+C to stop.
call npm run dev
popd
