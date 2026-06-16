package browser

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseDevToolsActivePort(t *testing.T) {
	activePort, ok := parseDevToolsActivePort("9222\n/devtools/browser/abc\n")
	if !ok {
		t.Fatal("parseDevToolsActivePort() = false, want true")
	}
	if activePort.port != 9222 || activePort.path != "/devtools/browser/abc" {
		t.Fatalf("activePort = %#v", activePort)
	}
}

func TestStableChromeDevToolsWebSocketEndpointFromDevToolsActivePort(t *testing.T) {
	home := t.TempDir()
	chromeDir := filepath.Join(home, "Library", "Application Support", "Google", "Chrome")
	if err := os.MkdirAll(chromeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	portFile := filepath.Join(chromeDir, "DevToolsActivePort")
	if err := os.WriteFile(portFile, []byte("9222\n/devtools/browser/live\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)

	endpoint, ok := stableChromeDevToolsWebSocketEndpoint()
	if !ok {
		t.Fatal("stableChromeDevToolsWebSocketEndpoint() = false, want true")
	}
	if endpoint != "ws://127.0.0.1:9222/devtools/browser/live" {
		t.Fatalf("endpoint = %q", endpoint)
	}
}

func TestValidateAutoConnectChromeReadyAcceptsDevToolsActivePortWithoutJsonVersion(t *testing.T) {
	home := t.TempDir()
	chromeDir := filepath.Join(home, "Library", "Application Support", "Google", "Chrome")
	if err := os.MkdirAll(chromeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	portFile := filepath.Join(chromeDir, "DevToolsActivePort")
	if err := os.WriteFile(portFile, []byte("9222\n/devtools/browser/live\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)

	if err := validateAutoConnectChromeReady(); err != nil {
		t.Fatalf("validateAutoConnectChromeReady() error = %v, want nil", err)
	}
}

func TestValidateAutoConnectChromeReadyReturnsSetupHintWhenPortFileMissing(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)

	err := validateAutoConnectChromeReady()
	if err == nil {
		t.Fatal("validateAutoConnectChromeReady() error = nil, want setup hint")
	}
	if !strings.Contains(err.Error(), "chrome://inspect/#remote-debugging") || !strings.Contains(err.Error(), "reuse mode") {
		t.Fatalf("error = %q, want setup hint", err.Error())
	}
}

func TestResolveAutoConnectMCPConnectionArgsUsesDevToolsActivePortEndpoint(t *testing.T) {
	home := t.TempDir()
	chromeDir := filepath.Join(home, "Library", "Application Support", "Google", "Chrome")
	if err := os.MkdirAll(chromeDir, 0o755); err != nil {
		t.Fatal(err)
	}
	portFile := filepath.Join(chromeDir, "DevToolsActivePort")
	if err := os.WriteFile(portFile, []byte("9222\n/devtools/browser/live\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	t.Setenv("HOME", home)

	args := resolveAutoConnectMCPConnectionArgs()
	if len(args) != 3 || args[0] != "--wsEndpoint" || args[1] != "ws://127.0.0.1:9222/devtools/browser/live" {
		t.Fatalf("args = %#v", args)
	}
}
