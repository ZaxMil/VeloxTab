Set WshShell = CreateObject("WScript.Shell")
scriptDir = CreateObject("Scripting.FileSystemObject").GetParentFolderName(WScript.ScriptFullName)
electronPath = scriptDir & "\node_modules\.bin\electron.cmd"

args = ""
For i = 0 To WScript.Arguments.Count - 1
    args = args & " """ & WScript.Arguments(i) & """"
Next

WshShell.CurrentDirectory = scriptDir
WshShell.Run """" & electronPath & """ """ & scriptDir & """" & args, 0, False
