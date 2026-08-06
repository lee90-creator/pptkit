---
name: kchppt
description: Codex 터미널 대화에서 요구사항을 확인하고 KCH 양식의 편집 가능한 PPTX를 생성한다. 사용자가 kchppt, KCH PPT, 회사 양식 PPT, 발표자료 생성을 말하면 사용한다.
---

# KCHPPT

모든 상호작용은 현재 Codex 터미널 대화 안에서 진행한다. 웹사이트, 브라우저, 로컬 웹 서버,
폼 UI를 열지 않는다.

## 대화 절차

1. 현재 대화와 사용자가 지정한 로컬 자료에서 이미 확인된 사실을 정리한다.
2. 아래 필수 항목 중 빠진 것만 한 번에 하나씩 질문한다.
   - 발표 목적
   - 청중
   - 원하는 슬라이드 수
   - 반드시 포함할 사실, 수치, 출처
   - `corporate` 또는 `wind-industrial` 양식
   - 출력 PPTX 경로
3. 사용자가 지정하지 않은 사실과 수치를 만들지 않는다.
4. 생성 직전에 제목, 목적, 청중, 페이지 수, 목차, 출력 경로를 짧게 보여주고 확인받는다.
5. 확인 후에만 구조화 명세를 작성하고 `kch-ppt generate`를 실행한다.

이미 답한 내용을 다시 질문하지 않는다. 질문은 선택지를 제시할 수 있지만 터미널 텍스트로만 한다.

## 명세 계약

명세는 UTF-8 JSON으로 작성한다. 최상위 필드는 다음과 같다.

```json
{
	"title": "문서 제목",
	"purpose": "발표 목적",
	"audience": "청중",
	"mode": "corporate",
	"slides": []
}
```

각 슬라이드는 다음 필드를 모두 포함한다.

```json
{
	"id": "unique-kebab-case-id",
	"purpose": "이 슬라이드의 역할",
	"claim": "슬라이드가 전달할 한 문장",
	"title": "슬라이드 제목",
	"bodyBlocks": [
		{ "title": "선택 제목", "text": "본문" }
	],
	"visual": {
		"type": "metric",
		"sourceData": [
			{ "label": "항목", "value": 12, "unit": "%" }
		]
	},
	"imageIntent": {
		"action": "none",
		"nativeFallback": "metric"
	},
	"usePanorama": false
}
```

- `bodyBlocks`는 최대 3개다.
- `visual.type`은 `chart`, `table`, `diagram`, `process`, `timeline`, `metric`, `text` 중 하나다.
- 대화형 생성에서는 이미지를 지원하지 않으므로 `imageIntent.action`은 항상 `none`으로 둔다.
- 근거 없는 수치는 넣지 않는다.
- 좌표, 색상, 폰트는 넣지 않는다. KCH 렌더러가 결정한다.
- `corporate`에서는 `usePanorama`를 반드시 `false`로 둔다.
- 슬라이드 배열 길이는 사용자가 확정한 페이지 수와 같아야 한다.

## 실행

명세는 작업공간의 `.kchppt/<출력파일명>.json`에 파일 편집 도구로 저장한다. 비밀정보는 저장하지 않는다.

실행 파일은 다음 순서로 찾는다.

1. PATH의 `kch-ppt`
2. Windows 경량 설치:
   `%LOCALAPPDATA%\KCH\PptAutomation\bin\kch-ppt.cmd`
3. 기존 Node를 사용한 Windows 경량 설치:
   `node "%LOCALAPPDATA%\KCH\PptAutomation\app\kch-ppt.cjs"`
4. pptkit 저장소 안에서는 `bun src/index.ts`

동등한 실행 예:

```text
kch-ppt generate --spec .kchppt/사업계획.json --output 사업계획.pptx
```

명령의 JSON 영수증에서 `status`, `slides`, `sha256`, `renderStatus`, `provenance`를 확인한다.
실패하면 한국어 오류 코드와 원인을 설명하고 명세 또는 입력만 수정한다. 웹 UI로 우회하지 않는다.

완료 시 출력 PPTX 경로, 슬라이드 수, 렌더 검증 상태를 터미널에 보고한다.
