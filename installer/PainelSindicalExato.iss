; Instalador do EXATO FLOW (Inno Setup 6) — antigo Painel Sindical Exato
; Compilado pelo GitHub Actions: iscc /DMyAppVersion=3.0.0 installer\PainelSindicalExato.iss

#ifndef MyAppVersion
  #define MyAppVersion "3.0.0"
#endif
#define MyAppName "EXATO FLOW"
#define MyAppExe "ExatoFlow.exe"

[Setup]
AppId={{6E4C2B1A-3D7F-4C1E-9A55-0B8E2F7D9C41}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher=Exato Soluções Contábeis
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
; o menu Iniciar passa a se chamar EXATO FLOW (não reaproveita o grupo antigo)
UsePreviousGroup=no
; Instala só para o usuário atual: não precisa de senha de administrador
PrivilegesRequired=lowest
OutputDir=..\dist\instalador
OutputBaseFilename=ExatoFlow-Setup-{#MyAppVersion}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\{#MyAppExe}
SetupIconFile=icone.ico

[Languages]
Name: "ptbr"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\ExatoFlow\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; versão anterior (Painel Sindical Exato): remove o executável e os atalhos antigos
Type: files; Name: "{app}\PainelSindicalExato.exe"
Type: filesandordirs; Name: "{autoprograms}\Painel Sindical Exato"
Type: files; Name: "{autodesktop}\Painel Sindical Exato.lnk"

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"
Name: "{group}\Desinstalar {#MyAppName}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExe}"; Description: "{cm:LaunchProgram,{#MyAppName}}"; Flags: nowait postinstall skipifsilent

; Os dados (banco, PDFs, backups) ficam em %APPDATA%\PainelSindicalExato e NÃO são apagados ao desinstalar.
