!macro customInstall
  WriteRegStr HKCU "Software\Classes\*\shell\SolidMDEdit" "" "Edit with SolidMD"
  WriteRegStr HKCU "Software\Classes\*\shell\SolidMDEdit" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\*\shell\SolidMDEdit\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Directory\shell\SolidMDOpen" "" "Open folder in SolidMD"
  WriteRegStr HKCU "Software\Classes\Directory\shell\SolidMDOpen" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\SolidMDOpen\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\SolidMDOpen" "" "Open folder in SolidMD"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\SolidMDOpen" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\SolidMDOpen\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\SolidMDOpen"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\SolidMDOpen"
  DeleteRegKey HKCU "Software\Classes\*\shell\SolidMDEdit"
!macroend
