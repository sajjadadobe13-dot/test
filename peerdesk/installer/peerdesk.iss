; PeerDesk - Inno Setup installer wizard
; Build the app first (pyinstaller installer/peerdesk.spec --noconfirm),
; then compile this script with Inno Setup 6:  ISCC.exe installer\peerdesk.iss
;
; Download Inno Setup (free): https://jrsoftware.org/isdl.php

#define MyAppName "PeerDesk"
#define MyAppVersion "1.0.0"
#define MyAppPublisher "PeerDesk"
#define MyAppExeName "PeerDesk.exe"
#define MyAppPort "7420"

[Setup]
AppId={{A2D1F0C4-7E6B-4C3A-9B21-PEERDESK0001}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
DisableProgramGroupPage=yes
OutputDir=..\dist\installer
OutputBaseFilename=PeerDesk-{#MyAppVersion}-Setup
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Admin rights are needed to add the firewall rule and install to Program Files.
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64compatible
; SetupIconFile=assets\peerdesk.ico
UninstallDisplayName={#MyAppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "firewall"; Description: "Allow PeerDesk through the Windows Firewall (incoming, port {#MyAppPort})"; GroupDescription: "Network:"
Name: "autostart"; Description: "Start PeerDesk host automatically when I sign in"; GroupDescription: "Startup:"; Flags: unchecked

[Files]
; The entire one-folder PyInstaller output.
Source: "..\dist\PeerDesk\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{#MyAppName} (Host)"; Filename: "{app}\{#MyAppExeName}"; Parameters: "host"
Name: "{group}\{#MyAppName} (Viewer)"; Filename: "{app}\{#MyAppExeName}"; Parameters: "viewer"
Name: "{group}\Uninstall {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Registry]
; Autostart the host for the current user when the task is selected.
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; \
    ValueType: string; ValueName: "PeerDesk"; \
    ValueData: """{app}\{#MyAppExeName}"" host"; \
    Flags: uninsdeletevalue; Tasks: autostart

[Run]
; Add an inbound firewall rule for the host listener.
Filename: "netsh"; \
    Parameters: "advfirewall firewall add rule name=""PeerDesk"" dir=in action=allow protocol=TCP localport={#MyAppPort}"; \
    Flags: runhidden; Tasks: firewall
; Offer to launch after install.
Filename: "{app}\{#MyAppExeName}"; Description: "Launch {#MyAppName} now"; \
    Flags: nowait postinstall skipifsilent

[UninstallRun]
; Remove the firewall rule on uninstall (ignore errors if it was never added).
Filename: "netsh"; \
    Parameters: "advfirewall firewall delete rule name=""PeerDesk"""; \
    Flags: runhidden; RunOnceId: "DelPeerDeskFwRule"

[UninstallDelete]
Type: filesandordirs; Name: "{app}"
