!macro customInstall
  WriteRegStr HKCU "Software\Classes\*\shell\MDEditorEdit" "" "Edit with MD Editor"
  WriteRegStr HKCU "Software\Classes\*\shell\MDEditorEdit" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\*\shell\MDEditorEdit\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Directory\shell\MDEditorOpen" "" "Open folder in MD Editor"
  WriteRegStr HKCU "Software\Classes\Directory\shell\MDEditorOpen" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\Directory\shell\MDEditorOpen\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%1"'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\MDEditorOpen" "" "Open folder in MD Editor"
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\MDEditorOpen" "Icon" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr HKCU "Software\Classes\Directory\Background\shell\MDEditorOpen\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "%V"'
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\Directory\Background\shell\MDEditorOpen"
  DeleteRegKey HKCU "Software\Classes\Directory\shell\MDEditorOpen"
  DeleteRegKey HKCU "Software\Classes\*\shell\MDEditorEdit"
!macroend
