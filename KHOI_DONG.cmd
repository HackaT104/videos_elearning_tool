@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
title Course Video Studio

echo ================================================
echo   Course Video Studio - tao video e-learning
echo ================================================

where node >nul 2>nul
if errorlevel 1 (
  echo [!] Chua cai Node.js. Hay cai Node.js 22 LTS tu https://nodejs.org roi chay lai.
  pause
  exit /b 1
)
node -e "process.exit(Number(process.versions.node.split(\".\")[0])>=22?0:1)"
if errorlevel 1 (
  echo [!] Can Node.js phien ban 22 tro len.
  pause
  exit /b 1
)

where pnpm >nul 2>nul
if errorlevel 1 (
  echo Dang bat pnpm...
  call corepack enable >nul 2>nul
  where pnpm >nul 2>nul || call npm install -g pnpm@10
)

if not exist ".env" (
  copy ".env.example" ".env" >nul
  echo Da tao file .env - mo file nay de dien ANTHROPIC_API_KEY va cau hinh CIT neu can.
)

if not exist "node_modules\.cvs-installed" (
  echo.
  echo [Lan dau] Cai phu thuoc - mat vai phut...
  call pnpm install
  if errorlevel 1 goto :loi
  call pnpm run cai-dat
  if errorlevel 1 goto :loi
  echo ok> "node_modules\.cvs-installed"
)

if not exist "apps\web\.next\BUILD_ID" (
  call pnpm --filter @cvs/web build
  if errorlevel 1 goto :loi
)

echo.
echo Luu y: CIT Voice Studio phai dang chay tren may nay (http://127.0.0.1:8001).
echo Giao dien: http://localhost:3000   (dong cua so nay de dung ung dung)
echo.
start "" cmd /c "timeout /t 6 >nul & start http://localhost:3000"
call pnpm start
goto :eof

:loi
echo.
echo [!] Co loi khi cai dat. Xem thong bao phia tren.
pause
exit /b 1
