# KCHPPT

KCHPPT는 Claude Code 또는 Codex의 터미널 대화에서 발표 요구사항을 확인한 뒤 KCH 양식의 편집 가능한
PowerPoint를 생성하는 사내 CLI 프로젝트입니다.

별도 웹사이트, 브라우저, 로컬 웹 서버를 사용하지 않습니다. 요구사항 확인, 최종 확인, 생성 결과 보고가
모두 현재 AI 터미널 대화 안에서 끝납니다.

## 사용 흐름

Claude Code나 Codex에서 평소처럼 자료를 논의한 뒤 다음과 같이 말합니다.

```text
지금까지 이야기한 내용으로 kchppt 만들어줘.
```

AI는 현재 대화에서 확인되지 않은 항목만 한 번에 하나씩 질문합니다.

- 발표 목적
- 청중
- 슬라이드 수
- 반드시 포함할 사실과 수치
- `corporate` 또는 `wind-industrial` 양식
- 출력 파일 경로

사용자가 최종 구성을 확인하면 AI가 구조화 명세를 만들고 다음 CLI를 실행합니다.

```bash
kch-ppt generate --spec .kchppt/사업계획.json --output 사업계획.pptx
```

## 아키텍처

```text
Claude Code / Codex 터미널 대화
             |
             v
       kchppt skill
             |
             v
    Presentation JSON contract
             |
             v
        kch-ppt CLI
             |
             v
 KCH design system + editable PPTX + QA receipt
```

AI 플러그인은 대화를 구조화하고 누락된 요구사항을 확인합니다. 좌표, 색상, 폰트와 실제 PowerPoint
생성은 공통 CLI가 담당하므로 Claude Code와 Codex에서 동일한 양식 규칙을 적용합니다.

## 설치

경량 Release는 Node·Claude Code·Codex를 포함하지 않습니다. 직원 PC에 다음 항목이 먼저 있어야 합니다.

- Node.js 20 이상
- Claude Code 또는 Codex 중 실제로 사용하는 터미널 AI

압축을 푼 폴더에서 다음 명령으로 설치합니다.

```bat
setup\run.bat --install-only
```

설치 후 Claude Code·Codex 연결 상태까지 확인하려면 다음을 실행합니다.

```bat
setup\run.bat --diagnose
```

설치되는 항목은 다음과 같습니다.

- KCHPPT CLI
- Claude Code용 `kchppt` 스킬: `%USERPROFILE%\.claude\skills\kchppt`
- Codex용 `kchppt` 스킬: `%USERPROFILE%\.agents\skills\kchppt`
- KCH 자산과 Pretendard 글꼴

관리자 권한, 별도 웹사이트, 브라우저 또는 로컬 서버는 필요하지 않습니다. Node가 없거나 회사 정책이
스크립트 실행을 차단하면 우회하지 않고 한국어 오류 영수증을 출력합니다.

## 개발

```bash
bun install --frozen-lockfile
bun run verify
bun run build:release
```

예제 명세로 직접 생성할 수 있습니다.

```bash
bun src/index.ts generate \
  --spec examples/conversation-spec.json \
  --output example.pptx \
  --no-office-qa
```

## 공동 기여

슬라이드 렌더러, KCH 디자인 규칙, 대화 스킬, 테스트와 문서를 Pull Request로 함께 개선합니다. 기여
절차와 검증 기준은 [CONTRIBUTING.md](CONTRIBUTING.md)를 확인하세요.

