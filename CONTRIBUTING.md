# KCHPPT 기여 가이드

## 기여할 수 있는 영역

- 새로운 편집 가능 슬라이드 표현
- KCH 브랜드와 레이아웃 규칙
- Claude Code·Codex 대화 절차
- 입력 명세와 경계 검증
- Windows 설치 및 진단
- 재현 가능한 테스트와 예제

## 작업 절차

1. 작업 목적이 하나인 브랜치를 만듭니다.
2. 동작 변경은 실패하는 테스트를 먼저 추가합니다.
3. Claude Code와 Codex가 동일한 명세 계약과 CLI를 사용하도록 유지합니다.
4. 아래 검증을 통과시킵니다.
5. 변경 이유, 사용자 동작, 검증 결과를 Pull Request에 기록합니다.

```bash
bun run typecheck
bun run lint
bun run test
bun run build
bun run build:release
```

## 설계 원칙

- 웹사이트, 브라우저, 로컬 웹 서버를 추가하지 않습니다.
- 플러그인은 대화를 구조화하고 CLI를 호출하는 얇은 계층으로 유지합니다.
- PowerPoint 생성과 KCH 양식 규칙은 공통 CLI에 둡니다.
- AI가 좌표, 색상, 폰트를 결정하게 하지 않습니다.
- 출처가 없는 사실이나 수치를 예제와 테스트에 추가하지 않습니다.
- 텍스트, 표, 차트와 도형을 이미지로 대체하지 않습니다.
- 기존 출력 파일을 조용히 덮어쓰지 않습니다.
- 설치된 스킬을 직접 수정하지 말고 저장소에서 변경한 뒤 Pull Request를 만듭니다.

## 플러그인 변경

Claude Code와 Codex 스킬은 플랫폼별 경로에 있습니다.

```text
plugins/claude-code/skills/kchppt/SKILL.md
plugins/codex/skills/kchppt/SKILL.md
```

플랫폼 이름과 실행 환경을 제외한 질문 순서, JSON 계약, 금지사항과 완료 보고는 동일하게 유지합니다.

