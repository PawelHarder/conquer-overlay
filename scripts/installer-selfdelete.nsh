!ifndef BUILD_UNINSTALLER
  Function SelfDeleteAfterInstall
    ExecShell "" 'cmd.exe' '/C ping 127.0.0.1 -n 2 > NUL & Del "$EXEPATH"' SW_HIDE
  FunctionEnd

  Function .onGUIEnd
    Call SelfDeleteAfterInstall
  FunctionEnd
!endif