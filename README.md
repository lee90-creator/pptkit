# KCHPPT

Claude Code나 Codex에서 **평소처럼 대화하다가 "kchppt 만들어줘"라고 말하면**, KCH 양식의 편집 가능한
PowerPoint가 나옵니다.

웹사이트도, 브라우저도, 로그인도 없습니다. 지금 쓰고 있는 터미널 안에서 전부 끝납니다.

```text
나:  이번 신안 사업 PF 조기상환 건, 아까 정리한 내용으로 kchppt 만들어줘
AI:  이 PPT를 누구에게 보여줄 예정인가요?
나:  경영진
AI:  몇 장으로 만들까요?
나:  6장
     ...
AI:  output/신안_PF조기상환.pptx 생성 완료 (6장)
```

---

# 1부. 그냥 쓰고 싶은 분들 (설치)

## 준비물 2가지

이미 있으실 겁니다. 없으면 아래 링크에서 받으세요.

| 필요한 것 | 확인 방법 | 없으면 |
|---|---|---|
| **Node.js 20 이상** | 터미널에 `node --version` | [nodejs.org](https://nodejs.org) 에서 LTS 다운로드 |
| **Claude Code 또는 Codex** | 평소 쓰시던 그거 | 둘 중 하나만 있으면 됩니다 |

> 관리자 권한 필요 없습니다. Bun 설치도 필요 없습니다. 회사 PC 그대로 됩니다.

## 설치 — 터미널에 한 줄

다운로드도 압축 풀기도 없습니다. 쓰시는 터미널에 그대로 붙여넣으세요.

**Windows (PowerShell)**

```powershell
irm https://raw.githubusercontent.com/lee90-creator/pptkit/main/setup/install-remote.ps1 | iex
```

**WSL / macOS / Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/lee90-creator/pptkit/main/setup/install.sh | bash
```

Claude Code나 Codex 터미널 안에서 그대로 돌리셔도 됩니다.
이런 화면이 나오면 끝입니다.

```text
{"id":"node","state":"CHECK","message":"기존 Node.js v22.0.0을 사용합니다."}
{"id":"application","state":"INSTALL","message":"KCHPPT CLI를 준비했습니다."}
{"id":"claude-kchppt","state":"INSTALL","message":"Claude Code 스킬을 준비했습니다."}
{"id":"codex-kchppt","state":"INSTALL","message":"Codex 스킬을 준비했습니다."}
{"id":"done","state":"CHECK","message":"설치를 마쳤습니다."}
```

### 업데이트도 같은 명령

같은 줄을 다시 실행하면 최신판으로 갱신됩니다.
바뀐 게 없으면 `SKIP`만 찍고 아무것도 건드리지 않습니다.

> 사내망이 GitHub를 막아서 위 명령이 안 되면,
> [Release 페이지](https://github.com/lee90-creator/pptkit/releases/latest)에서 `kch-ppt-lightweight.zip`을
> 받아 압축을 푼 폴더에서 `setup\run.bat --install-only`를 실행하세요.

## 이제 쓰면 됩니다

Claude Code나 Codex를 켜고, **평소처럼 자료 이야기를 하다가** 이렇게 말하세요.

```text
지금까지 이야기한 내용으로 kchppt 만들어줘
```

AI가 아직 모르는 것만 하나씩 물어봅니다.

- 누구에게 보여줄 자료인가요 (청중)
- 왜 만드는 자료인가요 (목적)
- 몇 장인가요
- 꼭 들어가야 할 숫자나 사실이 있나요
- `corporate`(일반 업무) / `wind-industrial`(풍력·산업) 중 어떤 양식인가요
- 어디에 저장할까요

마지막에 구성안을 보여주고, "진행"이라고 하면 만듭니다.

## 자주 나오는 상황

**"Node.js를 찾을 수 없습니다"**
Node.js가 없거나 PATH에 없습니다. [nodejs.org](https://nodejs.org)에서 LTS를 설치하고 터미널을 새로 여세요.

**회사 정책(AppLocker 등)에 막혔다는 메시지가 나옴**
우회하지 않습니다. 화면에 나온 **한국어 오류 영수증을 그대로 복사해서 IT 담당자에게** 전달하세요.
필요한 정보(경로, 해시, 차단 지점)가 다 들어 있습니다.

**만들어진 PPT가 마음에 안 듦**
그대로 PowerPoint에서 편집하시면 됩니다. 이미지가 아니라 **전부 편집 가능한 도형·텍스트·표**입니다.
구조적으로 개선하고 싶으면 2부로 가세요. 팀원 누구나 고칠 수 있습니다.

## 설치되는 위치

**Windows**

```text
%LOCALAPPDATA%\KCH\PptAutomation\        KCHPPT CLI, KCH 자산, PowerPoint QA
%LOCALAPPDATA%\Microsoft\Windows\Fonts\  Pretendard 글꼴
%USERPROFILE%\.claude\skills\kchppt\      Claude Code용 스킬
%USERPROFILE%\.agents\skills\kchppt\      Codex용 스킬
```

**WSL / macOS / Linux**

```text
~/.local/share/kchppt/     KCHPPT CLI와 KCH 자산
~/.local/bin/kch-ppt       실행 명령
~/.claude/skills/kchppt/   Claude Code용 스킬
~/.agents/skills/kchppt/   Codex용 스킬
```

전부 사용자 폴더입니다. `Program Files`나 `/usr/local`을 건드리지 않습니다.
스킬이 사용자 전역 경로에 설치되므로 **어느 폴더에서 쓰든 동일하게 동작**합니다.

---

# 2부. 같이 고치고 싶은 분들 (기여)

**환영합니다.** 이 프로젝트는 팀 전체가 같이 만드는 도구입니다.
"이 슬라이드 좀 이상한데"라고 느꼈으면, 그게 바로 기여 시작점입니다.

## 뭘 고치면 되나요

실제로 지금 필요한 것들입니다. 아무거나 골라 잡으세요.

| 난이도 | 할 일 | 어디를 보면 되나 |
|---|---|---|
| 쉬움 | 대화 질문 순서·문구 다듬기 | `plugins/*/skills/kchppt/SKILL.md` |
| 쉬움 | 색상·글꼴 크기 조정 | `src/design-system/tokens.ts` |
| 보통 | **표 머리글이 안 보이는 버그** | `src/renderer/narrative-visual.ts` |
| 보통 | 새 슬라이드 종류 추가 | `src/renderer/` |
| 어려움 | 대화형 생성에 이미지 지원 열기 | `src/cli/spec-workflow.ts` |

알려진 문제와 개선 방향은 [`docs/PPT_제작_리뷰.md`](docs/PPT_제작_리뷰.md)에 정리해 뒀습니다.
**이 문서를 먼저 읽어 주세요.** 왜 지금 결과물이 이런지, 뭘 고쳐야 하는지 다 적혀 있습니다.

## 개발 환경 준비 (5분)

개발할 때만 **Bun**이 추가로 필요합니다. (사용자는 필요 없습니다)

```bash
# 1. Bun 설치 - 이미 있으면 건너뛰세요
curl -fsSL https://bun.sh/install | bash        # macOS / Linux / WSL
powershell -c "irm bun.sh/install.ps1|iex"      # Windows PowerShell

# 2. 코드 받기
git clone https://github.com/lee90-creator/pptkit.git
cd pptkit

# 3. 의존성 설치
bun install --frozen-lockfile

# 4. 잘 되는지 확인 - 211개 테스트가 다 통과해야 정상
bun run verify
```

`bun run verify` 하나로 타입 검사 → 린트 → 테스트 211개 → 빌드까지 전부 돕니다.

## 고친 걸 바로 눈으로 확인하기

설치 없이, 소스에서 바로 PPT를 만들어 볼 수 있습니다.

```bash
bun src/index.ts generate \
  --spec examples/conversation-spec.json \
  --output 확인용.pptx \
  --no-office-qa
```

**만든 PPT는 반드시 PowerPoint로 열어서 눈으로 보세요.**
이건 잔소리가 아니라 실제로 데인 부분입니다 — 표 머리글이 흰 배경에 흰 글씨로 나온 버그가
코드 검사는 전부 통과했고, 화면을 봐야만 발견됐습니다.

## 작업 순서

```bash
# 1. 브랜치 만들기 (목적 하나당 하나)
git checkout -b fix/table-header-contrast

# 2. 동작이 바뀌는 변경이면 -> 실패하는 테스트를 먼저 씁니다
#    (색상·문구만 바꾸는 거면 생략해도 됩니다)

# 3. 고치기

# 4. 검증 - 여기서 빨간불 나면 아직 끝난 게 아닙니다
bun run verify

# 5. 올리기
git push -u origin fix/table-header-contrast
```

그리고 GitHub에서 Pull Request를 엽니다. PR에는 세 가지만 적어 주세요.

1. **왜** 고쳤는지
2. 사용자 입장에서 **뭐가 달라지는지**
3. **어떻게 확인**했는지 (테스트 통과 / PowerPoint 렌더링 확인 등)

## 지켜야 할 선

이건 취향이 아니라 이 도구의 존재 이유입니다.

- ❌ **웹사이트·브라우저·로컬 서버를 만들지 않습니다.** 터미널 안에서 끝나야 합니다.
- ❌ **AI가 좌표·색상·글꼴을 정하게 하지 않습니다.** 그건 `src/design-system/`의 일입니다.
- ❌ **텍스트·표·차트를 이미지로 대체하지 않습니다.** 받는 사람이 편집할 수 있어야 합니다.
- ❌ **기존 파일을 조용히 덮어쓰지 않습니다.** 덮어쓰기 전에 멈추고 알립니다.
- ❌ **출처 없는 숫자를 예제나 테스트에 넣지 않습니다.**
- ⚠️ **설치된 스킬(`%USERPROFILE%\.claude\skills\`)을 직접 고치지 마세요.** 다음 설치 때 날아갑니다.
  저장소의 `plugins/`를 고치고 PR을 올리세요.

더 자세한 내용은 [CONTRIBUTING.md](CONTRIBUTING.md)에 있습니다.

## 프로젝트 구조

어디를 봐야 할지 모를 때 여기서 찾으세요.

```text
src/
  cli/              명령어 파싱, 생성 흐름 (여기가 시작점)
  design-system/    KCH 색상·글꼴·헤더 규칙 ← 디자인 바꾸려면 여기
  renderer/         슬라이드를 실제로 그리는 곳 ← 레이아웃 바꾸려면 여기
  schema/           입력 JSON 계약 (Zod)
  planner/          대화 내용을 슬라이드 명세로 정규화
  providers/        Claude Code / Codex 연동
  office-qa/        PowerPoint COM 검증 (선택)

plugins/
  claude-code/skills/kchppt/SKILL.md   ← Claude 대화 절차
  codex/skills/kchppt/SKILL.md         ← Codex 대화 절차

setup/              Windows 설치 스크립트
tests/              211개 테스트
docs/PPT_제작_리뷰.md   품질 리뷰와 개선 과제 ← 기여 전 필독
examples/           예제 명세
```

## 어떻게 굴러가나

```text
Claude Code / Codex 대화
        ↓  (AI가 요구사항을 캐물음)
   kchppt 스킬
        ↓  (JSON 명세로 정리)
Presentation JSON 계약
        ↓
    kch-ppt CLI          ← 좌표·색·글꼴은 전부 여기서 결정
        ↓
편집 가능한 PPTX + 검증 영수증
```

AI는 **대화를 구조화하는 일만** 합니다. 디자인 판단은 전부 CLI가 합니다.
그래서 Claude Code로 만들든 Codex로 만들든 **똑같은 양식**이 나옵니다.

## 배포판 만들기

```bash
bun run build:release
# → release/kch-ppt-lightweight.zip (약 7MB)
```

같은 내용이면 다시 만들지 않고 `SKIP`을 출력합니다.

---

## 라이선스와 자산

- Pretendard 글꼴: [`assets/licenses/Pretendard-LICENSE.txt`](assets/licenses/Pretendard-LICENSE.txt)
- KCH 로고·디자인 자산: 사내 자산입니다. 외부 배포 시 주의하세요.

질문은 Issue로, 개선은 Pull Request로 주세요. 작은 것도 환영합니다.
