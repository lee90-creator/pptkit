# KCH PPT Bootstrap — Decision-Complete BAT State Machine

Author: `windows-bootstrap` · 2026-08-03
Basis: `wave-1-microsoft-bootstrap.md`, `wave-1-provider-policy.md`, `wave-1-provider-probes.md`, `wave-1-renderer-engines.md`, `wave-1-brand-assets.md`, `research/windows-bootstrap-constraints.md` (all primary-sourced to Microsoft Learn / vendor docs).
Rule for the implementer: **every branch below is a decided route. If a machine hits a condition not listed here, stop and raise — do not improvise.**

---

## 1. Locked design decisions (no further policy input needed)

| # | Decision | Rationale (evidence) |
|---|----------|----------------------|
| D1 | Everything installs per-user under `%LOCALAPPDATA%\KCH\pptkit` (`PPTKIT_HOME`). No HKLM, no Program Files, no services, no scheduled tasks, no admin at any point. | Standard-user enterprise case is the norm (constraints #4); per-user font and env paths exist since Win10 1803. |
| D2 | Refuse to run elevated. If high-integrity token detected → abort with E-SEC-02. | Elevated-with-other-creds would write into the admin's profile, silently breaking per-user registration. |
| D3 | Two payload routes: `PS` (PowerShell 5.1-compatible script) and `BAT` (pure cmd.exe). Route chosen by probe, never assumed. | GPO overrides `-ExecutionPolicy Bypass` in all scopes (constraints #2). |
| D4 | PowerShell payload targets **5.1 syntax only** (in-box on Win10/11). No PS7 dependency. | PS7 is not in-box; installing it per-user adds a second runtime for zero gain. |
| D5 | Node.js ships as a **pinned per-user portable zip** extracted with in-box `tar.exe`; version pinned in the shipped manifest (`BOOTSTRAP.CFG`), not chosen by the worker. | PptxGenJS is the renderer (renderer-engines wave); portable zip needs no admin; `tar.exe` is in-box since Win10 17063 and extracts `.zip` unelevated. |
| D6 | The app payload is **pre-built and vendored** (node_modules bundled or esbuild single-file). No `npm install` / `npm ci` ever runs on the target. | Removes the entire npm-registry/proxy failure class; keeps target-side work to copy + unzip. |
| D7 | winget is **never used**. Not for detection gating, not for installs. | Absent/stale on LTSC, Store-blocked, and never-registered machines (constraints #1, #3, #4). Treating it as an accelerator adds a branch with no capability it provides that BITS + zip don't. |
| D8 | Payload acquisition precedence: (1) `payload\` folder next to the BAT (USB / internal share offline package) → (2) internal share URL in manifest via BITS → (3) vendor URLs (nodejs.org) via BITS. Offline-first; network only for what the local payload lacks. | Internal share delivery avoids SmartScreen (constraints #6) and most proxy pain; BITS honors the per-user Internet Options proxy incl. PAC/WPAD (constraints #10). |
| D9 | Downloads: PS route = `Start-BitsTransfer`; BAT route = `bitsadmin /transfer` (deprecated but in-box on Win10/11). `certutil -urlcache` permitted only as a direct-network fallback with a logged warning (it ignores the user proxy). Never `Invoke-WebRequest` for large payloads; never curl.exe (proxy behavior unverified in research). | Constraints #3, #10. |
| D10 | Fonts: ship **Pretendard only** (9 weights TTF + `LICENSE.txt`). Per-user install = copy to `%LOCALAPPDATA%\Microsoft\Windows\Fonts` + `reg add HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts`. Value-name map ships in the manifest. Mont/Mont Blanc excluded. | Brand-assets wave (OFL 1.1 evidence); per-user path is the no-admin install (constraints #6). |
| D11 | Provider CLIs (Claude, Codex) are **detect-and-report only**. Bootstrap never installs them, never touches credential/token files, never runs login. Missing CLI = capability flag off, Korean guidance printed. | Owner decision recorded in provider-policy wave; Codex native-Windows status explicitly unverified (codex-contract wave) — auto-installing it would be a policy guess. |
| D12 | Office is **detect-only**. Presence flips the `com.qa` capability flag for the optional PowerPoint COM render/export adapter. Absence is degraded, never fatal. | Constraints #7; renderer-engines wave. |
| D13 | Persistent PATH modification is avoided. The launcher (`bin\pptkit.bat`) builds `PATH` for its own process (`set "PATH=%PPTKIT_HOME%\runtime\node;%PATH%"`), which children inherit. Optional user-PATH convenience entry is written once via PS `[Environment]::SetEnvironmentVariable(...,'User')` or `reg add HKCU\Environment`, guarded by a substring check. **`setx` for PATH is forbidden** (1024-char truncation destroys existing user PATH). | Constraints (environment propagation finding); setx hazard is documented Microsoft behavior. |
| D14 | All scripts are plain, readable, unminified, comment-header Korean/English. No obfuscation, no encoded blobs, no `Add-Type` in the critical path, no COM outside the QA adapter. | AMSI + ASR "obfuscated script" rule + ConstrainedLanguage (constraints #5, #8). |
| D15 | MOTW handling: payloads re-copied through `type` before execution (`type file.ps1 > stripped.ps1`), which drops `Zone.Identifier`. PS route additionally runs `Unblock-File` on its own tree. Distribution via internal share is the primary channel (no SmartScreen on UNC). | Constraints #6, #8, #9. |

---

## 2. Install layout

```
%LOCALAPPDATA%\KCH\pptkit\
  app\                 vendored application (VERSION file at root)
  assets\fonts\        Pretendard TTF masters + LICENSE.txt (source of truth for repair)
  runtime\node\        node.exe, npm shims (portable, version-pinned)
  bin\pptkit.bat       user-facing launcher (sets process PATH, calls app)
  state\
    install-state.json per-step stamps: {step, version, sha256, timestamp}
    capabilities.json  { ps:full|constrained|none, office.com:true|false,
                         fonts.blocked:true|false, provider.claude:true|false,
                         provider.codex:true|false, fonts.mode:pretendard|substitute }
    logs\bootstrap-YYYYMMDD-HHMMSS.log
```

Font registration target (outside PPTKIT_HOME, per OS contract):
`%LOCALAPPDATA%\Microsoft\Windows\Fonts\Pretendard-*.ttf` + `HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts` REG_SZ entries.

---

## 3. State machine overview

```
S0 ENTRY → S1 PROBE (read-only) → S2 ROUTE → S3..S9 INSTALL STEPS → S10 VERIFY → S11 REPORT
                 │                     │
                 └─ any hard-fail ──────┴──→ SX UNSUPPORTED (Korean message + exit code)
```

Routes from S2:
- **R-PS**: MachinePolicy/UserPolicy both Undefined **and** shipped `probe.ps1` executes **and** LanguageMode = FullLanguage.
- **R-PS-CL**: scripts allowed but LanguageMode ≠ FullLanguage (AppLocker/WDAC present) → PS allowed for file/registry work; COM/Add-Type forbidden; `com.qa=false`.
- **R-BAT**: GPO policy set, or probe.ps1 blocked, or powershell.exe cannot start → pure-BAT path (§7).
- **R-STOP**: hard unsupported state (§9).

Every install step S3–S9 has the uniform shape: `STAMP? → skip : (ACTION → VERIFY → stamp)`. A step that cannot VERIFY retries the ACTION once, then fails the step (fatal or degraded per step definition).

---

## 4. S1 detection predicates (exact commands + parse rules)

All predicates have a PS form (R-PS route) and a BAT form (used for routing itself and for R-BAT). "BAT form" commands run in cmd.exe; `%ERRORLEVEL%` semantics given where non-obvious.

| ID | Predicate | PS form | BAT form | Parse / threshold |
|----|-----------|---------|----------|-------------------|
| P-OS | OS build | `[Environment]::OSVersion.Version.Build` | `for /f "tokens=6 delims=[]. " %%v in ('ver') do set B=%%v` | Hard floor **17134** (Win10 1803, per-user fonts). Below → U-OS. Warn below 17763 (winget-era baseline). `ver` output is not localized; build = 6th token. |
| P-ELEV | Elevated? | `[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole('Administrator')` | `whoami /groups | findstr /c:"S-1-16-12288"` | High-integrity SID present → abort (D2, E-SEC-02). SID is locale-independent; group names are not — do not match on "Administrators". |
| P-GPO | GPO execution policy | `(Get-ExecutionPolicy -List).MachinePolicy, .UserPolicy` | `powershell -NoProfile -Command "Get-ExecutionPolicy -List" ^| findstr /c:"MachinePolicy" /c:"UserPolicy" ^| findstr /v /c:"Undefined"` | Any surviving line = GPO enforced → R-BAT. Scope names are not localized. `-Command` still runs when script files are disabled by policy. |
| P-PSX | powershell.exe startable | `$PSVersionTable.PSVersion` | `powershell -NoProfile -Command "exit 0"` then `if errorlevel 1` | Non-zero / not found → PS unusable → R-BAT + flag `ps:none`. |
| P-PSF | .ps1 executable (AppLocker script rules) | run `state\probe.ps1` (ships `exit 0`) | `powershell -NoProfile -ExecutionPolicy Bypass -File "state\probe.ps1"` then `if errorlevel 1` | probe.ps1 must be MOTW-stripped copy (D15). Failure with GPO undefined = AppLocker/WDAC script rule → R-BAT + flag. |
| P-CLM | Language mode | `$ExecutionContext.SessionState.LanguageMode` | BAT pre-check: `if defined __PSLockdownPolicy` → assume Constrained; else defer to PS route result | ≠ FullLanguage → R-PS-CL: no COM, no Add-Type. |
| P-NET | Payload reachability | `Start-BitsTransfer -Source <manifestUrl> -Destination state\net.probe` | `bitsadmin /transfer pptkitprobe /download /priority FOREGROUND <manifestUrl> "%TEMP%\net.probe"` | Success = network route available. Failure → require local `payload\` (D8) else U-NET. BITS rides the user's Internet Options proxy incl. authenticated PAC/WPAD. |
| P-FONT | Untrusted Font Blocking | `(Get-ItemProperty 'HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\Kernel' -Name MitigationOptions -EA 0).MitigationOptions -band 0x3000000000000` | `reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Kernel" /v MitigationOptions` → `for /f "tokens=2,3" %%a in ('... ^| findstr REG_QWORD')` → string rule below | PS: result `0x1000000000000` → BLOCK; `0x3000000000000` → AUDIT (fonts load); else not blocking. BAT (no 64-bit arithmetic): strip `0x`, left-pad with zeros to 16 chars, examine 4th char: `1`=BLOCK, `3`=AUDIT, other = not blocking. Value absent = not blocking (default off). Read-only HKLM read works unelevated. |
| P-OFC | Office + COM | `Test-Path 'Registry::HKEY_CLASSES_ROOT\PowerPoint.Application'` | `reg query HKCR\PowerPoint.Application >nul 2>&1` | Present → `com.qa=true` (still ANDed with FullLanguage). HKCR ProgID covers 32/64-bit Office uniformly; do not probe WOW6432Node App Paths as primary. |
| P-WNG | winget presence | — | — | **Not performed** (D7). |
| P-CLI | Provider CLIs | `Get-Command claude,codex` + shim dirs | `where claude`, `where codex`; plus explicit checks: `%PPTKIT_HOME%\runtime\node\claude.cmd`, `%USERPROFILE%\.local\bin\claude.exe`, same for codex | Found → auth probe: `claude auth status --json` (parse `loggedIn`), `codex login status` (probe-verified on 2.1.220 / 0.145.0). Auth output may contain PII — log only the boolean and method, never email/org (provider-probes wave privacy note). Never read token files. |
| P-STP | Prior install stamps | read `state\install-state.json` | same file, findstr per-step keys | Drives §8 second-run behavior. |

---

## 5. Install steps (predicate → action → verify → fallback → Korean error)

Notation: **F** = fatal (step failure → R-STOP), **D** = degraded (flag + continue). Exit codes in §10.

### S3 Directories & state — F
- **Predicate**: `state\install-state.json` writable.
- **Action**: `md` the §2 tree; write log header (OS build, route, user, timestamp).
- **Verify**: create+delete a temp file in `state\`.
- **Fallback**: none. If `%LOCALAPPDATA%` is redirected/unwritable → E-DIR-01, exit 14.

### S4 Runtime (Node portable) — F
- **Predicate**: `runtime\node\node.exe --version` == manifest `NODE_VERSION`.
- **Acquire**: `payload\node-v<ver>-win-x64.zip` if present; else BITS from `https://nodejs.org/dist/v<ver>/node-v<ver>-win-x64.zip` (manifest carries expected SHA-256).
- **Action**: wipe `runtime\node.tmp\`; PS: `Expand-Archive` (5.1 in-box); BAT: `tar -xf <zip> -C runtime\node.tmp`; rename to `runtime\node\`.
- **Verify**: `runtime\node\node.exe --version` equals pin **and** `certutil -hashfile <zip> SHA256` matched the manifest before extraction (certutil hashing is local, proxy-independent — allowed).
- **Fallback**: hash mismatch → delete, try next acquisition source per D8; all fail → U-NET if network-sourced, E-PAY-01 if local payload corrupt. F.
- **Second run**: predicate true → skip entirely (no network hit).

### S5 App payload — F
- **Predicate**: `app\VERSION` == manifest `APP_VERSION` **and** stamp hash matches.
- **Action**: PS: `Copy-Item -Recurse`; BAT: `robocopy payload\app app /MIR /XD state logs` — **robocopy exit codes 0–7 are success**, 8+ failure; BAT must map this or every install "fails". Vendored deps included (D6) — no npm step exists.
- **Verify**: `runtime\node\node.exe app\cli.js --version` prints manifest version.
- **Fallback**: local payload preferred; network source per D8. Failure → E-PAY-01. F.

### S6 Fonts (Pretendard, per-user) — D (policy-dependent)
- **Predicate**: for each of 9 weights: file exists in `%LOCALAPPDATA%\Microsoft\Windows\Fonts` with matching SHA-256 **and** `HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts` value exists pointing at it.
- **Action**: copy TTFs; `reg add "HKCU\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts" /v "<Name> (TrueType)" /t REG_SZ /d "<full path>" /f` per the manifest's name map (`Pretendard-Regular.ttf` → `Pretendard (TrueType)`, `Pretendard-Bold.ttf` → `Pretendard Bold (TrueType)`, etc. — map ships in manifest, worker does not derive names). Copy `LICENSE.txt` alongside (OFL redistribution condition).
- **Verify**: re-read each registry value and file hash.
- **Policy route** (from P-FONT):
  - Not blocking / audit → `fonts.mode=pretendard`.
  - BLOCK → still install (harmless, self-heals if policy lifts) but set `fonts.mode=substitute`, app substitutes Malgun Gothic and warns on render. Print E-FONT-01 (informational). D, never fatal.
  - Requesting admin to install into `%windir%\Fonts` is **out of scope** — documented as the IT-escalation path in the runbook only.
- **Second run**: per-weight predicate → repair only missing/mismatched weights.

### S7 Launcher & environment — F
- **Action**: write `bin\pptkit.bat` (process-local PATH prepend per D13; calls `node app\cli.js %*`). Optional user-PATH entry: only on explicit manifest flag, substring-guarded, via PS User-scope or `reg add HKCU\Environment`; **never setx** (D13).
- **Verify**: `call bin\pptkit.bat --version` returns app version.
- **Fallback**: none beyond S3 prerequisites. F.

### S8 Provider CLI detect — D
- **Predicate/action**: P-CLI detection + auth probes; write `capabilities.json` provider flags. If a CLI is absent or unauthenticated: print E-CLI-01 (guidance, not failure). No install, no token handling (D11).
- **Verify**: flags written.
- **Fallback**: app runs with provider features disabled. D.

### S9 Office detect — D
- **Predicate/action**: P-OFC; `com.qa = (Office present) AND (route allows FullLanguage)`. Write flag.
- **Fallback**: absent → PDF/PNG export path only, COM render-QA skipped. D, E-OFC-01 informational.

### S10 Self-test — F
Run `node app\cli.js doctor --bootstrap-report state\last-report.json`: node OK, app OK, font registrations readable, capabilities consistent. Failure here means a VERIFY lied → fatal E-VER-01, exit 15.

### S11 Report
Print Korean summary (installed/repaired/skipped per step, capability flags, next-step guidance). Exit 0 on success **including degraded success** — degradation is data (`capabilities.json`), not a failing exit code.

---

## 6. Route decision table (S2)

| P-PSX | P-GPO | P-PSF | P-CLM | Route | Consequences |
|-------|-------|-------|-------|-------|--------------|
| OK | both Undefined | OK | Full | **R-PS** | full PS payload; COM QA per S9 |
| OK | both Undefined | OK | Constrained | **R-PS-CL** | PS for file/reg only; `com.qa=false`; no Add-Type |
| OK | policy set | — | — | **R-BAT** | pure-BAT; optionally request IT-signed scripts (runbook note) |
| OK | Undefined | FAIL | — | **R-BAT** | AppLocker script rule suspected; flag for report |
| FAIL | — | — | — | **R-BAT** + `ps:none` | likely AppLocker exe rule on powershell.exe; `com.qa=false` |

---

## 7. Pure-BAT escape path (R-BAT) — concrete capabilities

Everything R-PS does, R-BAT can do without any PowerShell, using only in-box tools. This is the committed escape path, not a sketch:

| Capability | Pure-BAT mechanism |
|---|---|
| OS check | `ver` token 6 parse (P-OS) |
| Elevation check | `whoami /groups` + `findstr S-1-16-12288` |
| Why-are-we-here record | attempt `powershell -NoProfile -Command "Get-ExecutionPolicy -List"`, log output verbatim |
| Payload copy | `robocopy /MIR` (exit 0–7 = success) |
| Node zip extract | `C:\Windows\System32\tar.exe -xf node.zip` (in-box since 17063) |
| Node download | `bitsadmin /transfer ... /priority FOREGROUND` (user proxy honored); `certutil -urlcache -split -f` only as logged direct-network fallback |
| Hash verify | `certutil -hashfile <file> SHA256` (local operation) |
| Font install | `copy` TTFs + `reg add HKCU\...\Fonts` (D10) |
| Font policy read | `reg query` + 16-char pad string rule (P-FONT) |
| Office detect | `reg query HKCR\PowerPoint.Application` |
| MOTW strip | `type in.ps1 > out.ps1` (drops Zone.Identifier ADS) |
| User env write | `reg add HKCU\Environment` with prior-value substring guard |
| Stamps | append `step=ok sha256=…` lines to `install-state.ini` (BAT route uses INI, not JSON; S10 tolerates both) |
| Self-test | `runtime\node\node.exe app\cli.js doctor` |

Explicitly **lost** in R-BAT (accepted, flagged): COM QA (already off), `Unblock-File` nicety (type-copy equivalent), BITS job telemetry richness. Nothing else.

---

## 8. Second-run and Nth-run behavior

| Scenario | Behavior |
|---|---|
| Clean second run | All predicates true → no writes at all, print "이미 설치되어 있습니다" + capability summary, exit 0. Target < 5 s, zero network. |
| Partial damage (e.g. one font deleted) | Only the failing step's predicate is false → only that step re-runs. Others untouched (verified by stamp mtimes). |
| Payload upgrade (manifest APP_VERSION newer) | S5 re-runs (robocopy /MIR); S4 untouched unless NODE_VERSION changed; fonts untouched unless font hashes changed. Old version replaced, state preserved (state\ excluded from /MIR). |
| Node upgrade | New zip → extract to `runtime\node.tmp` → verify → atomic-ish rename swap. Old dir deleted only after new one verifies. |
| Run as different user on same machine | Fully independent: per-user layout means no cross-user state. Each user bootstraps separately. |
| Interrupted previous run (no stamp, partial files) | Stamps are written only after VERIFY; partial dirs (`*.tmp`) are wiped at S0. Interrupted step re-runs from scratch. |
| Route flip between runs (GPO added later) | Re-probe every run; S2 re-routes; install state is route-agnostic (same files/registry), so a BAT→PS or PS→BAT flip is a no-op for installed artifacts. |

Idempotency contract: **predicate true ⇒ step performs zero writes and zero network I/O.** The worker must implement every action as check-then-act; act-then-check is a defect.

---

## 9. Hard unsupported states and verdicts for the seven mandated areas

| Area | Verdict | Condition | Behavior |
|---|---|---|---|
| No winget | **Fully supported, ignored** | any | D7: winget is never invoked. LTSC/Store-blocked machines are first-class. |
| GPO script policy | **Supported via R-BAT** | P-GPO policy set | Route flip, full functionality except COM QA if language mode constrained. |
| Proxy | **Supported via BITS** | any proxy incl. auth PAC/WPAD | BITS uses the user's Internet Options config. Failure with no local payload → **U-NET hard stop**. |
| Standard user | **Fully supported, the design center** | no admin | D1: nothing requires elevation; elevation is refused (E-SEC-02). |
| AV / AppLocker / WDAC | **Degraded, with one hard stop** | .ps1 blocked → R-BAT; powershell.exe blocked → R-BAT(ps:none) + `com.qa=false`; **.bat/.cmd blocked → U-AV**: the launcher itself cannot run, so no in-band message is possible — this is an IT-delivery case (software center / signed package), documented in the runbook as the only door. SmartScreen on internet-zone downloads is avoided by share delivery (D15). |
| Fonts | **Supported with degrade** | P-FONT = BLOCK | Install proceeds; `fonts.mode=substitute`; E-FONT-01. Admin install to `%windir%\Fonts` = IT-escalation path only. Font embedding is **not** a fallback — Office falls back to default fonts under the same policy (constraints #7). |
| Office | **Supported with degrade** | P-OFC absent | `com.qa=false`; PDF/PNG path; E-OFC-01. Installing/licensing Office is never attempted (constraints #11). |

Hard-stop catalog (all exit non-zero with Korean message):
- **U-OS** build < 17134 → exit 10.
- **U-NET** payload unreachable AND no local `payload\` → exit 11.
- **U-AV** .bat itself policy-blocked → cannot self-report; runbook/IT channel.
- **U-SEC** elevated execution → exit 13 (refusal by design, D2).
- **U-DIR** `%LOCALAPPDATA%` unwritable → exit 14.

---

## 10. Korean error catalog (verbatim strings for the worker)

```
E-SEC-02 (exit 13): 관리자 권한으로 실행하지 마세요. 이 설치 프로그램은 일반 사용자 권한으로
  동작하며, 관리자 권한 실행 시 다른 사용자 프로필에 잘못 설치될 수 있습니다.
  일반 로그온 상태에서 다시 실행하세요.

U-OS (exit 10): 지원되지 않는 Windows 버전입니다(빌드 %B%). Windows 10 1803(빌드 17134)
  이상이 필요합니다. IT 부서에 OS 업그레이드를 문의하세요.

U-NET (exit 11): 설치 파일을 가져올 수 있는 경로를 찾지 못했습니다. 회사 프록시 인증이
  필요하거나 네트워크가 차단되었을 수 있습니다. ① 회사 네트워크(VPN 포함) 연결 확인 후
  재실행, ② 전달받은 USB/공유 폴더의 오프라인 패키지(pptkit-setup 폴더 통째로)로
  다시 실행하세요.

E-PAY-01 (exit 11): 설치 패키지가 손상되었습니다(해시 불일치). 배포받은 원본 패키지를
  다시 복사한 뒤 실행하세요. 반복되면 IT 부서에 문의하세요.

U-DIR (exit 14): 사용자 폴더(%LOCALAPPDATA%)에 쓸 수 없습니다. 디스크 공간과 프로필
  상태를 확인한 뒤 다시 실행하세요.

E-FONT-01 (정보): 회사 보안 정책(신뢰할 수 없는 글꼴 차단)으로 Pretendard 글꼴이
  PowerPoint에서 표시되지 않을 수 있습니다. 맑은 고딕으로 대체하여 진행합니다.
  정품 글꼴 적용이 필요하면 IT 부서에 글꼴 배포를 요청하세요.

E-CLI-01 (정보): Claude/Codex CLI가 없거나 로그인되어 있지 않습니다. AI 기능 없이
  기본 기능만 사용할 수 있습니다. 각 CLI를 설치하고 본인 계정으로 로그인한 뒤
  이 프로그램을 다시 실행하면 자동으로 인식합니다.

E-OFC-01 (정보): 이 PC에서 PowerPoint(데스크톱)를 찾지 못했습니다. 생성된 파일의
  자동 화면 검수는 걸어너고, 결과물은 PDF/이미지로 남깁니다.

E-PS-01 (정보): 회사 보안 정책으로 PowerShell 스크립트가 제한되어 호환 모드로
  설치합니다. 기능 차이는 없으며 일부 검수 기능만 제한될 수 있습니다.

E-VER-01 (exit 15): 설치 후 자체 점검에 실패했습니다. state\logs 의 최근 로그를
  IT 부서 또는 개발 담당자에게 전달해 주세요.
```

Second-run message: `이미 설치되어 있습니다. (버전 %APP_VERSION%) 업데이트가 필요하면 새 패키지로 다시 실행하세요.`

---

## 11. Clean-machine test matrix

Each row = fresh VM snapshot, run `pptkit-setup\setup.bat`, record route, exit code, capabilities.json, and every message. Rows 12–15 run on the post-install state of row 1.

| # | Machine profile | Expected route | Expected end state |
|---|---|---|---|
| 1 | Win11 23H2 retail, local admin (non-elevated launch), direct net, Office C2R | R-PS | exit 0; full caps: `com.qa=true`, `fonts.mode=pretendard`, node/app stamped |
| 2 | Win10 22H2 retail, **standard user**, direct net, no Office | R-PS | exit 0; zero UAC prompts observed; `com.qa=false`, E-OFC-01 shown |
| 3 | Win11 Ent, standard user, GPO "Turn on Script Execution" = AllSigned | R-BAT | exit 0; probe.ps1 fails as expected; BAT completes node+app+fonts; E-PS-01 shown; no .ps1 executed |
| 4 | Win11 Ent, GPO Untrusted Font Blocking = On | R-PS | exit 0; fonts installed; `fonts.mode=substitute`; E-FONT-01 shown |
| 5 | Win11 Ent, authenticating WPAD proxy, no local payload | R-PS | BITS probe succeeds via user proxy → network install; exit 0 |
| 6 | Same as 5 but proxy denies + payload present next to BAT | R-PS | offline precedence (D8): no network attempted for payload; exit 0 |
| 7 | No network, no local payload | R-PS | **U-NET**, exit 11, Korean message, zero partial installs (S4/S5 not entered) |
| 8 | Win11 LTSC 2024 (no Store, no winget) | R-PS | exit 0; log shows no winget invocation; identical end state to row 1 minus Office |
| 9 | AppLocker: .ps1 denied, .bat allowed, powershell.exe allowed | R-BAT | exit 0; P-PSF failure logged as AppLocker-suspect; full install via BAT |
| 10 | WDAC policy → PowerShell ConstrainedLanguage | R-PS-CL | exit 0; `com.qa=false` despite Office present; no COM attempted |
| 11 | powershell.exe AppLocker-denied, .bat allowed | R-BAT(ps:none) | exit 0; full BAT install; `com.qa=false` |
| 12 | Second run on row 1 | R-PS | exit 0, "이미 설치되어 있습니다", <5 s, **zero writes** (assert dir mtimes), zero network |
| 13 | Row 1 + delete one font file + its reg value | R-PS | exit 0; only S6 repairs one weight; other stamps unchanged |
| 14 | Row 1 + newer APP_VERSION package | R-PS | exit 0; only S5 re-runs; node/fonts untouched; state preserved |
| 15 | Row 1 + launch elevated | — | refusal E-SEC-02, exit 13, zero writes |
| 16 | Payload delivered as internet-zone zip (MOTW on all files), run from %USERPROFILE%\Downloads | R-PS | D15 strip works; no RemoteSigned block; SmartScreen not triggered for .bat; exit 0 |
| 17 | Same files on UNC share `\\fileserver\pptkit` | R-PS | no SmartScreen/MOTW handling needed at all; exit 0 |
| 18 | Win10 1709 (build 16299) | — | **U-OS**, exit 10 |

---

## 12. Worker guardrails (coding rules, not decisions)

1. PS 5.1 syntax only (D4); no classes, no `??`, no ternary.
2. Every action check-then-act (§8 contract). Robocopy exit 0–7 = success (S5).
3. Never `setx` PATH (D13). Never write HKLM. Never request elevation — abort instead (D2).
4. Never read, copy, or log credential/token files; auth probes log booleans only (P-CLI privacy note).
5. Korean messages from §10 verbatim; new messages need lead sign-off (tone/consistency).
6. Log everything to `state\logs`; PII rule: OS build, route, step results — never account metadata.
7. Anything not in this document → raise to lead; do not improvise (governing rule).

## EXPAND
- LEAD: Pin `NODE_VERSION` + SHA-256 and `APP_VERSION` in `BOOTSTRAP.CFG` at build time; the state machine consumes the manifest, it never picks versions.
- LEAD: Decide the internal share URL and offline-package folder name before worker starts (D8 sources 1–2 need concrete values in the manifest).
- LEAD: Produce the 9-row font name map (file → registry value name) into the manifest; worker must not derive registry names (S6).
- LEAD: Execute one live row-5/row-9 style probe on a real managed KCH laptop if available; the matrix is doc-derived, not yet machine-executed.
- LEAD: Verify Codex CLI native-Windows install path before writing E-CLI-01 guidance links (codex-contract wave flags this unverified).

## CLAIMS
- CLAIM: Every install step in this state machine is per-user and idempotent, with check-then-act predicates and no HKLM/elevation dependency — RISK: normal — PRIMARY: constraints report #4/#6 (per-user font + env paths), D1/D2 layout decisions.
- CLAIM: The pure-BAT escape path (§7) is complete for all install capabilities using only in-box tools (robocopy, tar.exe, bitsadmin, reg, certutil, whoami) — RISK: normal — PRIMARY: in-box tool documentation cited via constraints report; tar.exe in-box since 17063; bitsadmin deprecated-but-present on Win10/11.
- CLAIM: winget exclusion (D7) loses no required capability while eliminating the Store/LTSC/registration failure class — RISK: low — PRIMARY: constraints report #1/#3/#4 (App Installer delivery model, Store blocking, LTSC).
- CLAIM: BITS is the only documented download channel that both honors the per-user authenticating proxy and is callable from pure BAT (bitsadmin) — RISK: normal — PRIMARY: constraints report #10 (BG_JOB_PROXY_USAGE_PRECONFIG).
- CLAIM: Untrusted Font Blocking, when On, defeats both per-user fonts and Office font embedding, making font substitution the only per-user fallback — RISK: normal — PRIMARY: Microsoft Learn block-untrusted-fonts (re-fetched 2026-08-03: QWORD 0x1000000000000 = on / 0x2000000000000 = off / 0x3000000000000 = audit; Office embedded-font fallback quoted).
- CLAIM: The only true hard stops are OS < 17134, unreachable payload without local copy, elevated launch (refusal), unwritable profile, and AppLocker blocking .bat itself (out-of-band IT case) — RISK: normal — PRIMARY: constraints report #5/#8 (AppLocker/WDAC scope), D2.
- CLAIM: Provider CLIs must remain detect-and-report (never installed, never credential-touching) for both policy and platform-verification reasons — RISK: high if violated — PRIMARY: provider-policy wave (owner decision, OAuth contract) + codex-contract wave (native Windows unverified).
