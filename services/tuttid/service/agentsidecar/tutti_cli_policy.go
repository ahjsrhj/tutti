package agentsidecar

import (
	"strings"
)

func tuttiCLIPolicy(input PrepareInput) string {
	return strings.TrimSpace(renderProviderSkillTemplate(
		"policy_templates/tutti-runtime.md",
		map[string]string{
			"{{COMMAND_GUIDE}}":             commandGuide(input),
			"{{AGENT_SESSION_ID}}":          strings.TrimSpace(input.AgentSessionID),
			"{{PROVIDER}}":                  strings.TrimSpace(input.Provider),
			"{{BROWSER_USE_SKILL_LINES}}":   browserUseSkillPolicyLines(input),
			"{{BROWSER_USE_HANDOFF_LINES}}": browserUseHandoffPolicyLines(input),
		},
	)) + "\n\n" + strings.TrimSpace(renderProviderSkillTemplate("policy_templates/host-app-context.md", nil))
}

func browserUseSkillPolicyLines(input PrepareInput) string {
	if !input.BrowserUse || !BrowserUseDefaultEnabled() {
		return ""
	}
	return "- `browser-use`: browser automation through the daemon-owned `tutti browser` CLI. Prefer this over any generic `browser` skill or direct CDP scripts.\n"
}

func browserUseHandoffPolicyLines(input PrepareInput) string {
	if !input.BrowserUse || !BrowserUseDefaultEnabled() {
		return ""
	}
	return "- For browser tasks — visiting URLs, reading pages, clicking, filling forms, or screenshots — use `browser-use` and `tutti browser` only; do not use provider-native `browser` skills or direct CDP automation.\n"
}

func commandGuide(input PrepareInput) string {
	guide := strings.TrimSpace(input.CommandGuide)
	if guide == "" {
		return fallbackCommandGuide(input.CLICommand)
	}
	return guide
}
