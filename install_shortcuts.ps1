$wsh = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$startMenu = [Environment]::GetFolderPath('Programs')
$target = 'D:\AI\VeloxTab\launch.vbs'
$icon = 'D:\AI\VeloxTab\icon.ico'
$workingDir = 'D:\AI\VeloxTab'

# 1. Desktop Shortcut
$desktopPath = Join-Path $desktop "VeloxTab.lnk"
$s1 = $wsh.CreateShortcut($desktopPath)
$s1.TargetPath = "wscript.exe"
$s1.Arguments = "`"$target`""
$s1.WorkingDirectory = $workingDir
$s1.IconLocation = "$icon,0"
$s1.Description = "VeloxTab — Ultra-Fast Multi-Tab Universal Media Player"
$s1.Save()

# 2. Start Menu Shortcut
$startMenuPath = Join-Path $startMenu "VeloxTab.lnk"
$s2 = $wsh.CreateShortcut($startMenuPath)
$s2.TargetPath = "wscript.exe"
$s2.Arguments = "`"$target`""
$s2.WorkingDirectory = $workingDir
$s2.IconLocation = "$icon,0"
$s2.Description = "VeloxTab — Ultra-Fast Multi-Tab Universal Media Player"
$s2.Save()

Write-Host "Created Desktop shortcut: $desktopPath"
Write-Host "Created Start Menu shortcut: $startMenuPath"
