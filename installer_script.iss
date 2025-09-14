[Setup]
AppName=Video Downloader IDM
AppVersion=1.0.0
AppPublisher=VideoDownloader Team
AppPublisherURL=https://github.com/usuario/video-downloader
AppSupportURL=https://github.com/usuario/video-downloader/issues
AppUpdatesURL=https://github.com/usuario/video-downloader/releases
DefaultDirName={autopf}\VideoDownloader
DefaultGroupName=Video Downloader
AllowNoIcons=yes
#if FileExists("LICENSE")
LicenseFile=LICENSE
#endif
#if FileExists("README.md")
InfoBeforeFile=README.md
#endif
OutputDir=dist\installer
OutputBaseFilename=VideoDownloader_Setup
#if FileExists("assets\icon.ico")
SetupIconFile=assets\icon.ico
#endif
Compression=lzma
SolidCompression=yes
PrivilegesRequired=admin
ArchitecturesInstallIn64BitMode=x64
WizardStyle=modern

[Languages]
Name: "portuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "Criar ícone na área de trabalho"
Name: "installextension"; Description: "Instalar extensão do Chrome"

[Files]
Source: "dist\VideoDownloader.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "browser-extension\*"; DestDir: "{app}\extension"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "install_extension.ps1"; DestDir: "{app}"; Flags: ignoreversion
#if FileExists("README.md")
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme
#endif
#if FileExists("LICENSE")
Source: "LICENSE"; DestDir: "{app}"; Flags: ignoreversion
#endif
#if FileExists("INSTALLER_GUIDE.md")
Source: "INSTALLER_GUIDE.md"; DestDir: "{app}"; Flags: ignoreversion
#endif

[Icons]
Name: "{group}\Video Downloader"; Filename: "{app}\VideoDownloader.exe"
Name: "{group}\Instalar Extensão"; Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install_extension.ps1"""
Name: "{group}\{cm:UninstallProgram,Video Downloader}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\Video Downloader"; Filename: "{app}\VideoDownloader.exe"; Tasks: desktopicon

[Run]
Filename: "{app}\VideoDownloader.exe"; Description: "Executar Video Downloader"; Flags: nowait postinstall skipifsilent
Filename: "powershell.exe"; Parameters: "-ExecutionPolicy Bypass -File ""{app}\install_extension.ps1"""; Description: "Instalar extensão do Chrome"; Flags: runhidden postinstall; Tasks: installextension

[UninstallDelete]
Type: filesandordirs; Name: "{app}\extension"
Type: filesandordirs; Name: "{app}\logs"
Type: files; Name: "{app}\*.log"

[Registry]
Root: HKCU; Subkey: "Software\VideoDownloader"; ValueType: string; ValueName: "InstallPath"; ValueData: "{app}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\VideoDownloader"; ValueType: string; ValueName: "Version"; ValueData: "1.0.0"; Flags: uninsdeletekey

[Messages]
portuguese.WelcomeLabel2=Este assistente irá instalar o [name/ver] no seu computador.%n%nO Video Downloader é uma ferramenta poderosa para baixar vídeos da internet com suporte completo a headers e cookies para sites protegidos.%n%nRecomenda-se fechar todos os outros aplicativos antes de continuar.
english.WelcomeLabel2=This will install [name/ver] on your computer.%n%nVideo Downloader is a powerful tool for downloading videos from the internet with full support for headers and cookies for protected sites.%n%nIt is recommended that you close all other applications before continuing.

[Code]
procedure InitializeWizard;
begin
  WizardForm.LicenseAcceptedRadio.Checked := True;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpSelectTasks then
  begin
    if IsTaskSelected('installextension') then
    begin
      MsgBox('A extensão do Chrome será instalada automaticamente após a instalação do programa. Você pode instalá-la manualmente mais tarde se preferir.', mbInformation, MB_OK);
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    // Criar arquivo de configuração inicial
    SaveStringToFile(ExpandConstant('{app}\config.ini'), '[General]' + #13#10 + 'FirstRun=true' + #13#10, False);
  end;
end;