!macro customInstall
MessageBox MB_OK "Self-delete macro"
  ExecShell "" 'cmd.exe' '/C ping 127.0.0.1 -n 5 > NUL & Del "$EXEPATH"' SW_HIDE
!macroend