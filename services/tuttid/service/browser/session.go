package browser

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	agentruntime "github.com/tutti-os/tutti/packages/agentactivity/daemon/runtime"
)

// mcpProtocolVersion is the MCP version advertised at initialize. We do NOT
// declare the `elicitation` client capability: a compliant server then never
// asks us to elicit, which is exactly the behavior that broke when codex (as
// the MCP client) advertised elicitation and forwarded the request.
const mcpProtocolVersion = "2025-06-18"

// ToolResult is the flattened result of an MCP tools/call.
type ToolResult struct {
	Text    string
	Images  []ToolImage
	IsError bool
}

// ToolImage is a base64 image returned by a tool (e.g. take_screenshot).
type ToolImage struct {
	Data     string
	MimeType string
}

// browserSession owns one chrome-devtools-mcp subprocess (one Chrome). Tool
// calls are serialized because the underlying Chrome is single-instance.
type browserSession struct {
	transport      agentruntime.ProcessTransport
	command        func(context.Context) []string
	connectionMode string

	startOnce sync.Once
	startErr  error
	conn      agentruntime.ProcessConnection
	client    *mcpClient

	callMu sync.Mutex

	idleMu sync.Mutex
	idle   *time.Timer
}

func (s *browserSession) start(ctx context.Context, cwd string) error {
	s.startOnce.Do(func() {
		resolveCommand := s.command
		if resolveCommand == nil {
			resolveCommand = func(ctx context.Context) []string {
				return resolveBrowserMCPCommand(ctx, nil)
			}
		}
		command := resolveCommand(ctx)
		conn, err := s.transport.Start(ctx, agentruntime.ProcessSpec{
			Provider: "browser",
			CWD:      cwd,
			Command:  command,
			Env:      browserMCPSubprocessEnv(),
		})
		if err != nil {
			s.startErr = fmt.Errorf("browser MCP failed to start: %w", err)
			return
		}
		s.conn = conn
		s.client = newMCPClient(conn)
		if _, err := s.client.call(ctx, "initialize", map[string]any{
			"protocolVersion": mcpProtocolVersion,
			"capabilities":    map[string]any{},
			"clientInfo":      map[string]any{"name": "tuttid-browser", "version": "1"},
		}); err != nil {
			s.startErr = fmt.Errorf("browser MCP initialize failed: %w", err)
			_ = conn.Close()
			return
		}
		_ = s.client.notify("notifications/initialized", map[string]any{})
	})
	return s.startErr
}

func (s *browserSession) callTool(ctx context.Context, name string, args map[string]any) (ToolResult, error) {
	if s.client == nil {
		return ToolResult{}, errors.New("browser session not started")
	}
	s.callMu.Lock()
	defer s.callMu.Unlock()
	raw, err := s.client.call(ctx, "tools/call", map[string]any{"name": name, "arguments": args})
	if err != nil {
		return ToolResult{}, err
	}
	return parseToolResult(raw)
}

func (s *browserSession) close() {
	if s.conn != nil {
		_ = s.conn.Close()
	}
}

type mcpToolCallResult struct {
	IsError bool `json:"isError"`
	Content []struct {
		Type     string `json:"type"`
		Text     string `json:"text"`
		Data     string `json:"data"`
		MimeType string `json:"mimeType"`
	} `json:"content"`
}

func parseToolResult(raw json.RawMessage) (ToolResult, error) {
	var parsed mcpToolCallResult
	if err := json.Unmarshal(raw, &parsed); err != nil {
		return ToolResult{}, fmt.Errorf("decode browser tool result: %w", err)
	}
	result := ToolResult{IsError: parsed.IsError}
	var texts []string
	for _, item := range parsed.Content {
		switch item.Type {
		case "text":
			texts = append(texts, item.Text)
		case "image":
			result.Images = append(result.Images, ToolImage{Data: item.Data, MimeType: item.MimeType})
		}
	}
	result.Text = strings.Join(texts, "\n")
	if result.IsError {
		msg := strings.TrimSpace(result.Text)
		if msg == "" {
			msg = "browser tool reported an error"
		}
		return result, errors.New(msg)
	}
	return result, nil
}
