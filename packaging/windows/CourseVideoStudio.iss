; Bộ cài Windows cho Course Video Studio (Inno Setup 6). Dựng bằng scripts/package-win.ps1 (CI: .github/workflows/release.yml):
;   iscc /DAppVersion=0.9.0 /DAppVersionNum=0.9.0 /DPayload=<thư mục payload> /O<thư mục ra> packaging\windows\CourseVideoStudio.iss
; Payload: <Payload>\node (Node.js portable) + <Payload>\app (mã + node_modules, do stage.mjs gom).
; Cài cho người dùng hiện tại (không cần quyền quản trị) vào %LOCALAPPDATA%\Programs\Course Video Studio.
; Dữ liệu ở %LOCALAPPDATA%\Course Video Studio (storage = dự án/video, runtime = trình duyệt/CIT tải về) – cập nhật/gỡ cài giữ nguyên,
; trừ khi người dùng chọn xoá cả dữ liệu khi gỡ.
; Cập nhật im lặng từ ứng dụng: Setup.exe /VERYSILENT /SUPPRESSMSGBOXES /CLOSEAPPLICATIONS /NORESTART /AUTOSTART=1

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef AppVersionNum
  #define AppVersionNum AppVersion
#endif
#ifndef Payload
  #define Payload "build\payload"
#endif
#define AppName "Course Video Studio"
#define DataDir "{localappdata}\Course Video Studio"
#define Launch "{app}\app\packaging\windows\launch.vbs"
#define LauncherJs "{app}\app\packaging\windows\launcher.mjs"
#define AppIcon "{app}\app\packaging\windows\app.ico"

[Setup]
AppId={{8F3C2A51-6B7E-4D2A-9C1E-5A0B7D4E2F19}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=Team E-learning, TÜV NORD Việt Nam
AppSupportURL=mailto:supportelearning@tuvnord.vn
VersionInfoVersion={#AppVersionNum}
DefaultDirName={localappdata}\Programs\{#AppName}
DisableDirPage=yes
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputBaseFilename=Course-Video-Studio-Setup-{#AppVersion}
SetupIconFile=app.ico
UninstallDisplayIcon={#AppIcon}
UninstallDisplayName={#AppName}
WizardStyle=modern
Compression=lzma2/max
SolidCompression=yes
LZMAUseSeparateProcess=yes
LZMANumBlockThreads=4
CloseApplications=yes
CloseApplicationsFilter=*.exe,*.dll,*.node
RestartApplications=no
ShowLanguageDialog=auto
UsedUserAreasWarning=no
SetupLogging=yes

[Languages]
#if FileExists(AddBackslash(SourcePath) + "Vietnamese.isl")
Name: "vi"; MessagesFile: "Vietnamese.isl"
#endif
Name: "en"; MessagesFile: "compiler:Default.isl"

[CustomMessages]
en.DeleteDataQuestion=Also delete all Course Video Studio data on this computer (projects, videos, voices, downloaded browsers)?%n%n%1%n%nChoose "No" to keep it — reinstalling later brings everything back.
en.DataLocation=Data folder:
#if FileExists(AddBackslash(SourcePath) + "Vietnamese.isl")
vi.DeleteDataQuestion=Xoá cả dữ liệu của Course Video Studio trên máy này (dự án, video, giọng đọc, trình duyệt đã tải)?%n%n%1%n%nChọn "Không" để giữ lại – cài lại sau này sẽ thấy đủ dự án.
vi.DataLocation=Thư mục dữ liệu:
#endif

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[InstallDelete]
; bản cũ (kể cả liên kết node_modules launcher đã tạo) – tránh sót tệp thừa sau khi cập nhật
Type: filesandordirs; Name: "{app}\app"

[Files]
Source: "{#Payload}\node\*"; DestDir: "{app}\node"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#Payload}\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs

[Dirs]
Name: "{#DataDir}\storage"; Flags: uninsneveruninstall

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{sys}\wscript.exe"; Parameters: """{#Launch}"""; WorkingDir: "{app}"; IconFilename: "{#AppIcon}"; Comment: "Tạo video e-learning tự động từ Word/Excel"
Name: "{autodesktop}\{#AppName}"; Filename: "{sys}\wscript.exe"; Parameters: """{#Launch}"""; WorkingDir: "{app}"; IconFilename: "{#AppIcon}"; Tasks: desktopicon

[Run]
Filename: "{sys}\wscript.exe"; Parameters: """{#Launch}"""; Description: "{cm:LaunchProgram,{#AppName}}"; Flags: nowait postinstall skipifsilent
; cập nhật im lặng từ trong ứng dụng (/AUTOSTART=1) → mở lại ứng dụng
Filename: "{sys}\wscript.exe"; Parameters: """{#Launch}"""; Flags: nowait; Check: AutoStartAfterUpdate

[UninstallDelete]
; junction node_modules + bộ nhớ đệm launcher/Remotion tạo trong lúc chạy
Type: filesandordirs; Name: "{app}\app"

[Code]
var
  DeleteData: Boolean;

function AutoStartAfterUpdate: Boolean;
begin
  Result := WizardSilent and (ExpandConstant('{param:AUTOSTART|0}') = '1');
end;

{ Ứng dụng đang chạy → yêu cầu thoát hẳn (worker, giao diện, CIT/ZeroTTS) trước khi chép đè / gỡ. }
procedure StopRunningApp;
var
  Node, Launcher: String;
  Code: Integer;
begin
  Node := ExpandConstant('{app}\node\node.exe');
  Launcher := ExpandConstant('{#LauncherJs}');
  if FileExists(Node) and FileExists(Launcher) then
    Exec(Node, '"' + Launcher + '" --quit', '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopRunningApp;
  Result := '';
end;

function InitializeUninstall: Boolean;
begin
  Result := True;
  DeleteData := False;
  if not UninstallSilent then
    DeleteData := MsgBox(FmtMessage(CustomMessage('DeleteDataQuestion'), [CustomMessage('DataLocation') + ' ' + ExpandConstant('{#DataDir}')]),
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  CitUninstaller: String;
  Code: Integer;
begin
  if CurUninstallStep = usUninstall then
    StopRunningApp;
  if CurUninstallStep = usPostUninstall then
  begin
    DelTree(ExpandConstant('{#DataDir}\edge-profile'), True, True, True);
    if DeleteData then
    begin
      { CIT Voice Studio được cài bằng bộ cài riêng của nó (có mục gỡ cài riêng) → gỡ đúng cách trước khi xoá thư mục }
      CitUninstaller := ExpandConstant('{#DataDir}\runtime\cit\app\unins000.exe');
      if FileExists(CitUninstaller) then
        Exec(CitUninstaller, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', '', SW_HIDE, ewWaitUntilTerminated, Code);
      DelTree(ExpandConstant('{#DataDir}'), True, True, True);
    end;
  end;
end;
