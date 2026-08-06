# Corporate Windows constraints on BAT/PowerShell self-bootstrap

Evidence gathered 2026-08-03 from Microsoft Learn / Microsoft Support primary sources
(plus noted gaps). Distinguishes default consumer Windows from managed enterprise Windows.

## Support matrix: "blank laptop" self-bootstrap (BAT launcher -> PowerShell payload)

| # | Constraint | Consumer default (Win10/11 retail) | Managed enterprise (Intune/GPO/AD) | Verdict for bootstrap |
|---|-----------|------------------------------------|-----------------------------------|------------------------|
| 1 | App Installer / winget | Present on Win11 + modern Win10 (Store-delivered); auto-updated | Often absent or stale: Store blocked by policy, LTSC has no in-box apps, never-registered until first Store sync | DEGRADED - never require winget; treat as optional accelerator |
| 2 | PowerShell execution policy | Default `Restricted` (clients); `powershell -ExecutionPolicy Bypass -File x.ps1` works | GPO "Turn on Script Execution" overrides ALL scopes incl. `-ExecutionPolicy Bypass`; may force AllSigned/Restricted | DEGRADED - always launch via `-ExecutionPolicy Bypass`; detect MachinePolicy/UserPolicy first and degrade to pure-BAT path |
| 3 | Proxy / network | Direct internet or simple WPAD | Authenticating proxies, PAC/WPAD, TLS inspection; WinHTTP tools (certutil) ignore user proxy | DEGRADED - download only via BITS or Invoke-WebRequest (both honor per-user Internet Options proxy); fail gracefully with offline/USB payload |
| 4 | Admin rights | First user is typically local admin | Standard user, no elevation, UAC prompts cannot be answered | DEGRADED - bootstrap must run fully per-user (%LOCALAPPDATA%, HKCU); never require HKLM/Program Files |
| 5 | Antivirus / SmartScreen / ASR | SmartScreen warns on unsigned downloads w/o reputation (click-through possible); AMSI scans PS | SmartScreen may be enforced (block, no bypass); ASR rules block obfuscated scripts, JS/VBS launching downloaded exes, low-prevalence exes; AppLocker/WDAC can block .bat/.ps1 entirely and force ConstrainedLanguage | DEGRADED to UNSUPPORTED - unsigned downloads trigger warnings; AppLocker/WDAC script rules are a hard stop; ship plain, readable scripts |
| 6 | Font install | Right-click Install = admin (C:\Windows\Fonts). Per-user install (Win10 1803+) needs no admin: %LOCALAPPDATA%\Microsoft\Windows\Fonts + HKCU\...\CurrentVersion\Fonts | Same per-user path works, BUT "Untrusted Font Blocking" GPO (System\Mitigation Options) blocks GDI-loaded fonts outside %windir%\Fonts; doc explicitly says Office embedded fonts fall back to default font when blocking is on | DEGRADED - per-user install first; detect MitigationOptions; final fallback = font embedding in PPTX (also blocked under that GPO) or font substitution/PDF |
| 7 | Office availability | Usually preinstalled (trial) or user-installed; not part of Windows | Deployed as separate suite via Intune/ODT; may be absent, MSI vs Click-to-Run conflicts; blank laptop = not guaranteed | DEGRADED - detect before promising; fallback = PowerPoint for the web or shipped PDF |
| 8 | MOTW / file origin | Downloads from internet get Zone.Identifier: Protected View in Office, RemoteSigned blocks unsigned .ps1 | Same, plus macro-blocking by default and admins can lock Protected View | SUPPORTED with handling - deliver via internal share/UNC (no SmartScreen check, intranet zone) or strip MOTW via Unblock-File |

## Evidence (all quotes paraphrased from pages fetched and read in full)

1. **Execution policy** - https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_execution_policies
   - Default: "Restricted for Windows clients and RemoteSigned for Windows Server."
   - "-ExecutionPolicy [for a session] doesn't take precedence over the execution policy set by using a Group Policy." GPO "Turn on Script Execution" (Administrative Templates\Windows Components\Windows PowerShell) "overrides the execution policies set in PowerShell in all scopes"; disable = no scripts at all.
   - RemoteSigned: scripts "downloaded from the internet" need a trusted signature unless "unblocked, such as by using the Unblock-File cmdlet" (MOTW mechanism).
   - Execution policy "isn't a security system that restricts user actions" (not a boundary; AppLocker/WDAC is).

2. **winget / App Installer** - https://learn.microsoft.com/en-us/windows/package-manager/winget/ and /winget/troubleshooting
   - "WinGet ... is available on Windows 11, modern versions of Windows 10, and Windows Server 2025 as a part of the App Installer. The App Installer is a System Component delivered and updated by the Microsoft store on Windows Desktop versions."
   - "only supported on Windows 10 version 1809 (build 17763) or later"; not available until first user logon triggers Store registration; "It's possible that App Installer is not installed on your device."
   - Windows Sandbox (Store-less) ships with neither WinGet nor Store - proxy case for Store-less enterprise images.
   - "some applications may require elevation to install"; WinGet CLI unsupported in SYSTEM context.

3. **Store blocking** - https://learn.microsoft.com/en-us/windows/configuration/stop-employees-from-using-microsoft-store (retitled "Configure access to the Microsoft Store app")
   - Documented Intune/CSP/GPO: "Turn off the Store application" (CSP ADMX_WindowsStore/RemoveWindowsStore_2). Nuance: "Users might still be able to install applications using Windows Package Manager (winget) ... if they don't need to acquire the package from Microsoft Store" - i.e., a pre-existing App Installer keeps working but never updates.

4. **LTSC** - https://learn.microsoft.com/en-us/windows/whats-new/ltsc/overview and /ltsc/whats-new-windows-11-2024
   - "Features ... that could be updated with new functionality, including Microsoft Edge and in-box Windows apps, are also not included." LTSC 2024: support "by apps and tools, such as in-box apps and Microsoft Store ... might be limited." => no Store, no App Installer out of box.

5. **ASR rules** - https://learn.microsoft.com/en-us/defender-endpoint/attack-surface-reduction-rules-reference
   - Rules directly targeting bootstrap behavior (Win10 1709/1803+, Defender): "Block execution of potentially obfuscated scripts"; "Block JavaScript or VBScript from launching downloaded executable content"; "Block executable content from email client and webmail"; "Block executable files from running unless they meet a prevalence, age, or trusted list criterion" (SmartScreen-prevalence gate on new unsigned exes).

6. **SmartScreen** - https://learn.microsoft.com/en-us/windows/security/operating-system-security/virus-and-threat-protection/microsoft-defender-smartscreen/
   - Reputation checks on downloaded apps; unknown file => warning. Manageable by GPO/Intune (can be enforced). "It doesn't protect against malicious files on internal locations or network shares (UNC/SMB)" => internal-share delivery bypasses the warning legitimately.

7. **Untrusted Font Blocking** - https://learn.microsoft.com/en-us/windows/security/threat-protection/block-untrusted-fonts-in-enterprise
   - "Untrusted fonts are any font installed outside of the %windir%\Fonts directory." GPO: Computer Config\Administrative Templates\System\Mitigation Options\Untrusted Font Blocking (or HKLM\SYSTEM\CCS\Control\Session Manager\Kernel\MitigationOptions). Off by default.
   - "Using desktop Office to look at documents with embedded fonts. In this situation, content shows up using a default font picked by Office." => embedded-font fallback also fails under this policy.
   - Confirms normal font install targets %windir%\Fonts (admin). Per-user install (Win10 1803+, Settings > Fonts drag-drop / HKCU registration) is the no-admin path; it lives outside %windir%\Fonts, so it is exactly what this GPO blocks for GDI consumers.

8. **AppLocker / WDAC / Constrained Language** - https://learn.microsoft.com/en-us/windows/security/application-security/application-control/app-control-for-business/applocker/applocker-overview and about_Language_Modes
   - AppLocker controls "executable files, scripts, Windows Installer files, DLLs, packaged apps" - script rules cover .ps1/.bat/.cmd => a hard, policy-level block possible.
   - Under AppLocker/WDAC, PowerShell "automatically runs in ConstrainedLanguage mode" - many script constructs (COM, some .NET, Add-Type) fail even when scripts are allowed.

9. **MOTW in Office** - https://learn.microsoft.com/en-us/deployoffice/security/internet-macros-blocked and https://support.microsoft.com/en-us/office/what-is-protected-view-d6f09ac7-e6b9-4495-8e43-2bbcdbcb6653
   - Macros from the internet blocked by default; unblock per file (Properties > Unblock / Unblock-File), Trusted Locations, or intranet zone for network shares.
   - Protected View: internet/Outlook-origin files open read-only; "your systems administrator [can have] rules established that prevent leaving Protected View."

10. **Proxy behavior of download channels**
    - BITS: https://learn.microsoft.com/en-us/windows/win32/api/bits/ne-bits-bg_job_proxy_usage - default BG_JOB_PROXY_USAGE_PRECONFIG = "proxy ... settings defined by each user ... from Control Panel, Internet Options" => Start-BitsTransfer rides the logged-in user's proxy incl. PAC/WPAD.
    - Invoke-WebRequest: PS 7.4 reads HTTP(S)_PROXY/NO_PROXY env vars, else "derived from the user's proxy settings" (https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.utility/invoke-webrequest); PS 5.1 documents -Proxy/-ProxyCredential/-ProxyUseDefaultCredentials and uses the WinINet/system proxy chain.

11. **Office deployment is a separate act** - https://learn.microsoft.com/en-us/intune/intune-service/apps/apps-add-office365
    - Office is deployed as its own app suite (licenses, 32/64-bit choice, Remove-MSI step, Autopilot ESP caveats) => a blank laptop has no Office guarantee.

12. **Font install (consumer doc)** - https://support.microsoft.com/en-us/office/add-a-font-b7c5f17c-4426-4b53-967f-455339c564c1
    - Right-click > Install prompts UAC; fonts land in C:\Windows\Fonts (admin path).

## Exact detection + fallback actions for the bootstrap

| Check | How (works unelevated) | If bad -> fallback |
|-------|------------------------|--------------------|
| GPO execution policy | `powershell -NoProfile -Command "Get-ExecutionPolicy -List"`; non-Undefined MachinePolicy/UserPolicy = GPO-enforced | Pure-.BAT payload path; or request signed script / IT-run |
| ConstrainedLanguage | `%__PSLockdownPolicy%` / `$ExecutionContext.SessionState.LanguageMode` | Avoid COM/Add-Type/.NET-only steps; BAT-only |
| winget | `where winget`; version check | Direct-download payload (BITS/IWR); never hard-depend |
| Proxy reachability | Probe payload URL with `Start-BitsTransfer` (user proxy) before large download | Offline/USB payload; skip with clear message |
| Admin | `net session` or IsInRole(WindowsBuiltInRole::Administrator) | Per-user everything (%LOCALAPPDATA%, HKCU) |
| SmartScreen/MOTW | `Get-Item file -Stream Zone.Identifier` on own payload | Instruct Unblock-File; prefer internal-share delivery |
| Font policy | Read HKLM\SYSTEM\CCS\Control\Session Manager\Kernel\MitigationOptions (0x1000000000000 = block) | Embed fonts in PPTX; else substitute fonts / ship PDF |
| Office present | `Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\powerpnt.exe"` or HKLM\SOFTWARE\Microsoft\Office\ClickToRun\Configuration | PowerPoint for the web link; ship PDF |
