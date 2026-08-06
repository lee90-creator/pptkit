@echo off
setlocal
chcp 65001 >nul
set "ROOT=%~dp0.."
powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "%ROOT%\setup\install.ps1" %*
set "EXIT_CODE=%ERRORLEVEL%"
if "%EXIT_CODE%"=="9009" echo {"id":"powershell","state":"BLOCKED","supportTier":"C","message":"Windows PowerShell을 실행할 수 없습니다.","path":"%SystemRoot%/System32/WindowsPowerShell/v1.0/powershell.exe","sha256":"0000000000000000000000000000000000000000000000000000000000000000","itAction":"IT 담당자에게 Windows PowerShell 실행 정책 확인을 요청하세요."}
exit /b %EXIT_CODE%
