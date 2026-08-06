#!/usr/bin/env bash
# KCHPPT 원격 설치 (WSL / Linux / macOS)
#   curl -fsSL https://raw.githubusercontent.com/lee90-creator/pptkit/main/setup/install.sh | bash
set -euo pipefail

ASSET_URL="${KCH_ASSET_URL:-https://github.com/lee90-creator/pptkit/releases/latest/download/kch-ppt-lightweight.zip}"
APP_ROOT="${KCH_INSTALL_ROOT:-$HOME/.local/share/kchppt}"
BIN_DIR="${KCH_BIN_DIR:-$HOME/.local/bin}"
CLAUDE_SKILLS="${KCH_CLAUDE_SKILLS_ROOT:-$HOME/.claude/skills}"
CODEX_SKILLS="${KCH_CODEX_SKILLS_ROOT:-$HOME/.agents/skills}"

step() { printf '{"id":"%s","state":"%s","message":"%s"}\n' "$1" "$2" "$3"; }
blocked() {
	step "$1" BLOCKED "$2"
	exit 21
}

command -v node >/dev/null 2>&1 || blocked node "Node.js 20 이상이 필요합니다. https://nodejs.org 에서 설치하세요."
NODE_MAJOR="$(node --version | sed -n 's/^v\([0-9]\{1,\}\)\..*/\1/p')"
[ -n "$NODE_MAJOR" ] || blocked node "Node.js 버전을 확인할 수 없습니다."
[ "$NODE_MAJOR" -ge 20 ] || blocked node "Node.js 20 이상이 필요합니다. 현재 $(node --version)"
step node CHECK "기존 Node.js $(node --version)을 사용합니다."

for tool in curl unzip; do
	command -v "$tool" >/dev/null 2>&1 || blocked "$tool" "$tool 명령이 필요합니다."
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
curl -fsSL "$ASSET_URL" -o "$WORK/kchppt.zip" || blocked download "배포 파일을 내려받지 못했습니다: $ASSET_URL"
unzip -q "$WORK/kchppt.zip" -d "$WORK/src" || blocked archive "배포 파일 압축을 풀 수 없습니다."
SRC="$WORK/src"
[ -f "$SRC/dist/manifest.json" ] || blocked manifest "경량 배포 manifest가 없습니다."

if command -v sha256sum >/dev/null 2>&1; then
	digest() { sha256sum "$1" | cut -d' ' -f1; }
elif command -v shasum >/dev/null 2>&1; then
	digest() { shasum -a 256 "$1" | cut -d' ' -f1; }
else
	blocked sha256 "sha256sum 또는 shasum 명령이 필요합니다."
fi

node -e '
const fs = require("fs");
const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
if (manifest.schemaVersion !== 2 || manifest.profile !== "lightweight") {
	console.error("경량 배포 manifest 계약이 올바르지 않습니다.");
	process.exit(1);
}
process.stdout.write(manifest.files.map((f) => `${f.sha256}  ${f.path}`).join("\n"));
' "$SRC/dist/manifest.json" >"$WORK/expected.txt" || blocked manifest "경량 배포 manifest 계약이 올바르지 않습니다."

while IFS='  ' read -r expected path; do
	[ -n "$path" ] || continue
	[ -f "$SRC/$path" ] || blocked manifest "배포 파일이 없습니다: $path"
	[ "$(digest "$SRC/$path")" = "$expected" ] || blocked manifest "배포 파일 SHA-256이 일치하지 않습니다: $path"
done <"$WORK/expected.txt"
step manifest CHECK "경량 배포 파일과 SHA-256을 확인했습니다."

sync_dir() {
	if [ -d "$2" ] && diff -rq "$1" "$2" >/dev/null 2>&1; then
		printf SKIP
		return
	fi
	rm -rf "$2"
	mkdir -p "$(dirname "$2")"
	cp -r "$1" "$2"
	printf INSTALL
}

mkdir -p "$APP_ROOT/app" "$BIN_DIR"
if [ -f "$APP_ROOT/app/kch-ppt.cjs" ] &&
	[ "$(digest "$SRC/dist/app/kch-ppt.cjs")" = "$(digest "$APP_ROOT/app/kch-ppt.cjs")" ]; then
	APP_STATE=SKIP
else
	cp "$SRC/dist/app/kch-ppt.cjs" "$APP_ROOT/app/kch-ppt.cjs"
	APP_STATE=INSTALL
fi
step application "$APP_STATE" "KCHPPT CLI를 준비했습니다."
step assets "$(sync_dir "$SRC/assets" "$APP_ROOT/assets")" "KCH 자산과 글꼴을 준비했습니다."
step office-qa "$(sync_dir "$SRC/dist/office-qa" "$APP_ROOT/office-qa")" "선택적 PowerPoint QA를 준비했습니다."
step claude-kchppt "$(sync_dir "$SRC/plugins/claude-code/skills/kchppt" "$CLAUDE_SKILLS/kchppt")" \
	"Claude Code 스킬을 준비했습니다."
step codex-kchppt "$(sync_dir "$SRC/plugins/codex/skills/kchppt" "$CODEX_SKILLS/kchppt")" "Codex 스킬을 준비했습니다."

LAUNCHER="$BIN_DIR/kch-ppt"
LAUNCHER_BODY="#!/usr/bin/env bash
export KCH_INSTALL_ROOT=\"$APP_ROOT\"
exec node \"$APP_ROOT/app/kch-ppt.cjs\" \"\$@\"
"
if [ -f "$LAUNCHER" ] && [ "$(cat "$LAUNCHER")" = "$(printf '%s' "$LAUNCHER_BODY")" ]; then
	step launcher SKIP "kch-ppt 실행 명령을 준비했습니다."
else
	printf '%s' "$LAUNCHER_BODY" >"$LAUNCHER"
	chmod +x "$LAUNCHER"
	step launcher INSTALL "kch-ppt 실행 명령을 준비했습니다."
fi

case ":$PATH:" in
*":$BIN_DIR:"*) ;;
*) step path WARN "$BIN_DIR 가 PATH에 없습니다. 셸 설정 파일에 PATH를 추가하세요." ;;
esac

step done CHECK "설치를 마쳤습니다. Claude Code나 Codex에서 kchppt 만들어줘 라고 말하세요."
