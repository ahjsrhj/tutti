package agentstatus

import (
	"log/slog"
	"strings"
	"sync"
)

var activeActions = struct {
	sync.Mutex
	byProvider map[string]ActiveAction
}{
	byProvider: map[string]ActiveAction{},
}

func setActiveAction(provider string, action ActiveAction) {
	activeActions.Lock()
	activeActions.byProvider[provider] = action
	activeActions.Unlock()
	bytes, lines := activeActionOutputStats(action.Stdout)
	slog.Info(
		"agent provider active action set",
		"event", "tutti.agent_provider.active_action.set",
		"provider", provider,
		"actionId", action.ID,
		"status", action.Status,
		"step", action.Step,
		"registryPresent", strings.TrimSpace(action.Registry) != "",
		"stdoutBytes", bytes,
		"stdoutLines", lines,
	)
}

func appendActiveActionStdout(provider string, output string) {
	if output == "" {
		return
	}
	activeActions.Lock()
	action, ok := activeActions.byProvider[provider]
	if !ok {
		activeActions.Unlock()
		return
	}
	action.Stdout = trimActionOutput(action.Stdout + output)
	activeActions.byProvider[provider] = action
	activeActions.Unlock()
	bytes, lines := activeActionOutputStats(action.Stdout)
	slog.Info(
		"agent provider active action output appended",
		"event", "tutti.agent_provider.active_action.output_appended",
		"provider", provider,
		"chunkBytes", len(output),
		"stdoutBytes", bytes,
		"stdoutLines", lines,
	)
}

func activeActionStdoutAppender(provider string) func(string) {
	return func(output string) {
		appendActiveActionStdout(provider, output)
	}
}

func clearActiveAction(provider string) {
	activeActions.Lock()
	action, ok := activeActions.byProvider[provider]
	delete(activeActions.byProvider, provider)
	activeActions.Unlock()
	if !ok {
		return
	}
	bytes, lines := activeActionOutputStats(action.Stdout)
	slog.Info(
		"agent provider active action cleared",
		"event", "tutti.agent_provider.active_action.cleared",
		"provider", provider,
		"actionId", action.ID,
		"status", action.Status,
		"step", action.Step,
		"stdoutBytes", bytes,
		"stdoutLines", lines,
	)
}

func activeActionForProvider(provider string) *ActiveAction {
	activeActions.Lock()
	defer activeActions.Unlock()
	action, ok := activeActions.byProvider[provider]
	if !ok {
		return nil
	}
	return &action
}

func activeActionOutputStats(output string) (int, int) {
	trimmed := strings.TrimSpace(output)
	if trimmed == "" {
		return 0, 0
	}
	return len(trimmed), strings.Count(trimmed, "\n") + 1
}
