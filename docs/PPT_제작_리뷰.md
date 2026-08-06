# PPT 제작 리뷰 — 앞으로 이렇게 만든다

첫 번째 결과물(`KCHPPT_경량판_실무자가이드.pptx`)에 대한 사용자 지적과 자체 리뷰를 정리한다.
다음 PPT를 만들 때 이 문서를 먼저 읽는다.

## 1. 사용자 지적 (확정 규칙)

| 항목 | 지적 | 조치 |
|---|---|---|
| 상단 넘버링 | 너무 작음 | `fontSizes.sectionNumber` 42pt → **50pt** |
| 상단 주제명 | 2~3줄로 깨짐 | 제목 박스 폭을 breadcrumb 앞(678pt)까지 확장 + `wrap: false` → **무조건 1줄** |
| GROUP 문구 | 불필요 | 헤더/standalone 브랜드의 `GROUP` 텍스트 **삭제** |
| 이미지 | 하나도 없음 | 아래 3장 참조 |
| 테이블 | 안 예쁨 | 아래 4장 참조 |
| 본문 | 문제 있음 | 아래 2장 참조 |

> "이따구로 할거면 안하는게 맞지" — 통과 기준은 "생성됨"이 아니라 **"실무자가 그대로 발표할 수 있는가"**다.

## 2. 본문 문제 — 자체 리뷰

렌더링 6장을 실제로 보고 확인한 결함이다.

### 2.1 왼쪽 본문 카드의 세로 여백 낭비 (가장 큼)
`bodyBlocks`가 2개일 때 각 카드 높이가 2.2인치인데 텍스트는 2~3줄이다.
결과적으로 카드 상단에 제목, 중앙에 본문, 아래 40%가 빈 공간이 된다.
1장·2장·6장에서 동일하게 발생했다.

**규칙**: 본문 블록은 **3개를 기본**으로 채운다. 2개만 쓸 거면 카드가 아니라
한 덩어리 서술로 쓰는 편이 낫다. 블록 수가 적으면 시각 요소 폭을 넓힌다.

### 2.2 카드 안 텍스트가 문장으로 끝남
"설치 준비부터 실제 PPT 생성과 결과 확인까지 한 번에 익힙니다." — 슬라이드 본문이
말하기 원고처럼 쓰였다. 슬라이드는 **읽는 것이 아니라 보는 것**이다.

**규칙**: 카드 본문은 **한 줄 60자 이내, 명사형 종결**. 서술은 발표자 노트로 뺀다.

### 2.3 `metric` 카드에 텍스트 값을 넣어 KPI가 죽음
1장의 "안내 대상 / 실무 사용자", "작업 화면 / 현재 AI 터미널"은 숫자가 아니라 라벨이다.
`metric` 렌더러는 숫자일 때만 24pt 볼드로 강조하므로, 문자열을 넣으면 15pt 평문이 되어
빈 카드처럼 보인다. 6장의 "7 MB / 13 MB / 211 개"는 제대로 살아났다 — 그 차이가 근거다.

**규칙**: `visual.type: "metric"`에는 **숫자만** 넣는다. 라벨 나열은 `diagram`이나 `text`로.

### 2.4 claim과 body가 같은 말을 반복
2장 claim "기존 터미널 환경을 재사용해 배포 크기와 설치 부담을 줄였습니다."와
body "미포함 / Node.js와 Claude Code·Codex 실행 환경은 번들하지 않고..."가 중복이다.

**규칙**: claim은 **결론**, body는 **근거**. 같은 사실을 두 번 쓰지 않는다.

### 2.5 슬라이드 6장이 전부 같은 레이아웃
왼쪽 카드 + 오른쪽 시각 요소 구조가 1~6장 동일하다. 넘겨도 넘겨도 같은 화면이라
발표 리듬이 없다.

**규칙**: **연속 3장 이상 같은 `visual.type`을 쓰지 않는다.** 최소 1장은 전폭
(bodyBlocks 없이 시각 요소만)으로 배치해 호흡을 끊는다.

## 3. 이미지가 없는 문제

현재 `spec-workflow`는 대화형 생성에서 이미지를 **차단**한다
(`ConversationNarrativeSchema`가 `imageIntent.action !== "none"`과 `visual.type === "image"`를 거부).
그래서 "이미지가 없다"는 건 사용자 실수가 아니라 **파이프라인의 현재 한계**다.

지금 쓸 수 있는 대안은 세 가지다.

1. `wind-industrial` 모드 + `usePanorama: true` → 하단 풍력 파노라마가 들어간다.
   corporate 모드는 파노라마가 금지되어 있어 이번 자료에서는 못 썼다.
2. `--demo` 경로(`runWorkflow`)를 쓰면 `imageIntent`가 살아나 Codex/OpenAI 이미지나
   라이선스 스톡을 붙일 수 있다. 대화형 `generate`에는 없다.
3. 그대로 네이티브 도형으로 간다 — 편집 가능성은 최고지만 표지가 밋밋하다.

**규칙**: 표지·섹션 구분에 이미지가 필요하면 **`generate`가 아니라 `demo` 경로**를 쓰거나,
대화형에도 이미지를 허용하도록 스키마를 열어야 한다. 이건 별도 개발 건이다.

## 4. 테이블이 안 예쁜 문제

`renderNarrativeVisual`의 `renderTable`은 헤더 행에 **흰 글씨를 쓰면서 배경은 흰색**으로
둔다(`fill: KCH_TOKENS.colors.background`). 그래서 첫 렌더링에서 "항목 / 내용" 머리글이
보이지 않았다. 이번 자료는 표를 `diagram`으로 교체해 회피했을 뿐, **버그는 남아 있다**.

**해야 할 수정** (`src/renderer/narrative-visual.ts`):
- 헤더 행 `fill`을 `colors.primary`로 지정하거나 글씨색을 `colors.navy`로 되돌린다.
- 짝수 행 zebra(`colors.sectionNumber`)를 적용한다 — `src/renderer/tables.ts`에는
  이미 구현되어 있으니 그 규칙을 가져오면 된다.
- 2열 고정(`38% / 62%`)을 데이터 열 수에 맞게 일반화한다.

**규칙**: 대화형 표는 이 수정 전까지 **3행 이상일 때만** 쓴다. 2~3항목이면 `diagram`이 낫다.

## 5. 다음 PPT 제작 체크리스트

생성 전:
- [ ] 슬라이드마다 `bodyBlocks` 3개를 채웠는가
- [ ] 카드 본문이 60자 이내 명사형인가
- [ ] `metric`에 숫자만 들어갔는가
- [ ] claim과 body가 다른 말을 하는가
- [ ] 같은 `visual.type`이 3연속이 아닌가
- [ ] 제목이 25자 이내인가 (1줄 강제이므로 길면 축소된다)

생성 후 — **반드시 실제 렌더링을 눈으로 본다**:
```bash
bun src/index.ts generate --spec <spec> --output <out> --no-office-qa
# 그 다음 PowerPoint COM으로 PNG 추출해 6장 전부 확인
```
OOXML 문자열 검사만으로 "확인했다"고 말하지 않는다. 첫 번째 결과물의 표 머리글 실종과
제목 줄바꿈은 문자열 검사로는 전부 통과했고, **PNG를 봐야만 발견됐다**.

## 6. 이번에 적용한 코드 변경

- `src/design-system/tokens.ts` — `sectionNumber` 42 → 50
- `src/design-system/header-render.ts` — 제목 폭 확장 + `wrap: false` + 세로 중앙
- `src/design-system/header-skins.ts` — 양 스킨에서 `groupLabel` 제거
- `src/renderer/slide.ts` — standalone 브랜드의 `GROUP` 텍스트 제거
- `tests/design-system/design-system.test.ts` — 기대 텍스트에서 `GROUP` 제거

표지 슬라이드의 `KCH\nGROUP` 로고 락업(`src/renderer/diagram-sections.ts`)은 상단 deck이
아니라 표지 브랜드 마크라 그대로 뒀다. 이것도 지워야 하면 알려달라.
