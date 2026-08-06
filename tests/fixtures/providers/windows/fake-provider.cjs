const { appendFileSync } = require("node:fs");

const provider = process.argv[2];
const args = process.argv.slice(3);
const scenario = process.env.KCH_FAKE_SCENARIO ?? "neither";
appendFileSync(process.env.KCH_FAKE_LOG, `${provider}:${args.join(" ")}\n`);

function emit(value) {
	process.stdout.write(`${typeof value === "string" ? value : JSON.stringify(value)}\n`);
}

const enabled =
	scenario === "both" ||
	scenario === "image-failure" ||
	scenario === "malformed" ||
	(scenario === "codex-only" && provider === "codex") ||
	(scenario === "claude-only" && provider === "claude");
const authProbe = (provider === "codex" && args[0] === "login") || (provider === "claude" && args[0] === "auth");
if (authProbe) {
	if (!enabled) process.exit(1);
	emit(provider === "codex" ? "Logged in using ChatGPT" : '{"loggedIn":true,"authMethod":"claude.ai"}');
	process.exit(0);
}
if (!enabled) process.exit(1);

const slides = Array.from({ length: 17 }, (_, index) => ({
	id: `matrix-${index + 1}`,
	purpose: `검증 목적 ${index + 1}`,
	claim: `검증 주장 ${index + 1}`,
	title: `검증 슬라이드 ${index + 1}`,
	bodyBlocks: [{ title: "핵심", text: "KCH provider matrix 검증 본문입니다." }],
	visual: { type: "diagram", sourceData: [{ label: "검증", value: index + 1, unit: "건" }], unit: "건" },
	imageIntent: { action: "none", query: "이미지 없음", nativeFallback: "diagram" },
	headerSkin: "kch-framed-right",
	usePanorama: false,
}));
const narrative =
	scenario === "malformed"
		? { invalid: true }
		: {
				title: "KCH provider matrix",
				purpose: "provider routing 검증",
				audience: "KCH 임직원",
				mode: "corporate",
				slides,
			};
if (provider === "codex") {
	emit({ type: "thread.started", thread_id: "matrix" });
	emit({ type: "turn.started" });
	emit({
		type: "item.completed",
		item: { id: "matrix-item", type: "agent_message", text: JSON.stringify(narrative) },
	});
	emit({ type: "turn.completed", usage: { input_tokens: 1, output_tokens: 1 } });
} else {
	emit({ type: "result", subtype: "success", is_error: false, structured_output: narrative });
}
