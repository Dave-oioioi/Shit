!macro NSIS_HOOK_PREINSTALL
  nsExec::ExecToStack 'powershell -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Name shit-vault -ErrorAction SilentlyContinue) { exit 1 } else { exit 0 }"'
  Pop $0
  Pop $1

  StrCmp $0 "0" done
    MessageBox MB_ICONEXCLAMATION|MB_OK "SHIT VAULT is currently running. Exit it from the tray menu before installing or updating."
    Abort
  done:
!macroend
