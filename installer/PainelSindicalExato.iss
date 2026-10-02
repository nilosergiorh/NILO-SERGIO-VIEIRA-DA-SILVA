; Instalador do Painel Sindical Exato (Inno Setup 6)
; Compilado pelo GitHub Actions: iscc /DMyAppVersion=2.0.0 installer\PainelSindicalExato.iss

#ifndef MyAppVersion
  #define MyAppVersion "2.0.0"
#endif
#define MyAppName "Painel Sindical Exato"
#define MyAppExe "PainelSindicalExato.exe"

[Setup]
AppId={{6E4C2B1A-3D7F-4C1E-9A55-0B8E2F7D9C41}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Exato Soluções Contábeis
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
; Instala só para o usuário atual: não precisa de senha de administrador
PrivilegesRequired=lowest
OutputDir=..\dist\instalador
OutputBaseFilename=PainelSindicalExato-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExe}

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\PainelSindicalExato\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

; Os dados (banco, PDFs, backups) ficam em %APPDATA%\PainelSindicalExato e NÃO são apagados ao desinstalar.
