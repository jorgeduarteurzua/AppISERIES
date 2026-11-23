' Crea el acceso directo "AppISERIES" (en esta carpeta y, si se acepta, en el escritorio).
'
' El acceso directo llama a cmd.exe por su ruta completa en vez de abrir el .bat
' directamente. Asi funciona aunque la variable de entorno ComSpec este mal
' definida en el equipo (en ese caso Windows no puede abrir ningun .bat).
'
' Doble clic para ejecutarlo. Con el argumento /solo-carpeta no pregunta y no toca el escritorio.
Option Explicit

Dim sh, fso, carpeta, bat, cmd, soloCarpeta, i
Set sh = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

carpeta = fso.GetParentFolderName(WScript.ScriptFullName)
bat = carpeta & "\Iniciar AppISERIES.bat"
cmd = sh.ExpandEnvironmentStrings("%SystemRoot%") & "\System32\cmd.exe"

soloCarpeta = False
For i = 0 To WScript.Arguments.Count - 1
  If LCase(WScript.Arguments(i)) = "/solo-carpeta" Then soloCarpeta = True
Next

If Not fso.FileExists(bat) Then
  WScript.Echo "No se encontro 'Iniciar AppISERIES.bat' en " & carpeta
  WScript.Quit 1
End If

Sub CrearAcceso(ruta)
  Dim s
  Set s = sh.CreateShortcut(ruta)
  s.TargetPath = cmd
  ' /c "<ruta del .bat>": las comillas dobles externas hacen falta si la ruta tiene espacios.
  s.Arguments = "/c """"" & bat & """"""
  s.WorkingDirectory = carpeta
  s.WindowStyle = 7
  s.IconLocation = carpeta & "\node_modules\electron\dist\electron.exe,0"
  s.Description = "AppISERIES - Generador para IBM i"
  s.Save
End Sub

CrearAcceso carpeta & "\AppISERIES.lnk"

If soloCarpeta Then
  WScript.Quit 0
End If

If MsgBox("Se creo AppISERIES.lnk en la carpeta del proyecto." & vbCrLf & vbCrLf & _
          "Quieres crear tambien un acceso directo en el escritorio?", vbYesNo + vbQuestion, "AppISERIES") = vbYes Then
  CrearAcceso sh.SpecialFolders("Desktop") & "\AppISERIES.lnk"
  MsgBox "Listo: ya tienes AppISERIES en el escritorio.", vbInformation, "AppISERIES"
End If
