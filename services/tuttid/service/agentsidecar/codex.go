package agentsidecar

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type CodexPreparer struct{}

func (CodexPreparer) Provider() string {
	return "codex"
}

func (CodexPreparer) Prepare(_ context.Context, input ProviderPrepareInput) (ProviderPrepareResult, error) {
	codexHome := filepath.Join(input.RuntimeRoot, "codex-home")
	if err := prepareCodexHome(codexHome, input.PrepareInput); err != nil {
		return ProviderPrepareResult{}, err
	}
	instructionsPath := filepath.Join(codexHome, "AGENTS.md")
	writeResult, err := input.Store.WriteManagedBlock(instructionsPath, tuttiCLIPolicy(input.PrepareInput))
	if err != nil {
		return ProviderPrepareResult{}, err
	}
	if input.Manifest != nil {
		input.Manifest.RecordManagedFile(instructionsPath, "provider-instructions", writeResult.Created)
		input.Manifest.RecordManagedFile(codexHome, "codex-home", true)
	}
	return ProviderPrepareResult{
		Cwd: input.Cwd,
		Env: []string{
			"CODEX_HOME=" + codexHome,
		},
	}, nil
}

func prepareCodexHome(codexHome string, input PrepareInput) error {
	if err := os.MkdirAll(codexHome, 0o700); err != nil {
		return fmt.Errorf("create codex home: %w", err)
	}
	if err := exposeUserCodexFiles(codexHome); err != nil {
		return err
	}
	if err := exposeUserCodexSkillFolders(filepath.Join(codexHome, "skills"), input); err != nil {
		return err
	}
	if _, err := installProviderNativeSkills(filepath.Join(codexHome, "skills"), input); err != nil {
		return err
	}
	return installCodexApprovalRules(codexHome, input)
}

func installCodexApprovalRules(codexHome string, input PrepareInput) error {
	rulesDir := filepath.Join(codexHome, "rules")
	if err := os.MkdirAll(rulesDir, 0o700); err != nil {
		return fmt.Errorf("create codex rules directory: %w", err)
	}
	content := codexApprovalRules(input.CLICommand)
	if err := os.WriteFile(filepath.Join(rulesDir, "default.rules"), []byte(content), 0o644); err != nil {
		return fmt.Errorf("write codex approval rules: %w", err)
	}
	return nil
}

func codexApprovalRules(cliCommand string) string {
	command := normalizeCLICommandName(cliCommand)
	return "prefix_rule(pattern=[" + strconv.Quote(command) + "], decision=\"allow\")\n"
}

func exposeUserCodexFiles(codexHome string) error {
	userHome, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(userHome) == "" {
		return nil
	}
	userCodexHome := filepath.Join(userHome, ".codex")
	for _, name := range []string{"auth.json", "config.toml"} {
		source := filepath.Join(userCodexHome, name)
		if _, err := os.Stat(source); err != nil {
			continue
		}
		target := filepath.Join(codexHome, name)
		if _, err := os.Lstat(target); err == nil {
			continue
		}
		if err := os.Symlink(source, target); err != nil {
			if copyErr := copyFile(source, target, 0o600); copyErr != nil {
				return fmt.Errorf("expose codex %s: symlink failed: %v; copy failed: %w", name, err, copyErr)
			}
		}
	}
	return nil
}

func exposeUserCodexSkillFolders(targetRoot string, input PrepareInput) error {
	userHome, err := os.UserHomeDir()
	if err != nil || strings.TrimSpace(userHome) == "" {
		return nil
	}
	sourceRoot := filepath.Join(userHome, ".codex", "skills")
	entries, err := os.ReadDir(sourceRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("read user codex skills: %w", err)
	}
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		return fmt.Errorf("create codex skills directory: %w", err)
	}
	for _, entry := range entries {
		name := strings.TrimSpace(entry.Name())
		if name == "" || strings.HasPrefix(name, ".") {
			continue
		}
		if shouldSkipUserCodexSkillForTuttiBrowserUse(name, input) {
			continue
		}
		source := filepath.Join(sourceRoot, name)
		sourceInfo, err := os.Stat(source)
		if err != nil || !sourceInfo.IsDir() {
			continue
		}
		skillInfo, err := os.Stat(filepath.Join(source, "SKILL.md"))
		if err != nil || skillInfo.IsDir() {
			continue
		}
		target := filepath.Join(targetRoot, name)
		if _, err := os.Lstat(target); err == nil {
			continue
		} else if !os.IsNotExist(err) {
			return fmt.Errorf("inspect codex skill %s: %w", name, err)
		}
		if err := os.Symlink(source, target); err != nil {
			return fmt.Errorf("expose codex skill %s: %w", name, err)
		}
	}
	return nil
}

func shouldSkipUserCodexSkillForTuttiBrowserUse(name string, input PrepareInput) bool {
	if !input.BrowserUse || !BrowserUseDefaultEnabled() {
		return false
	}
	return strings.EqualFold(strings.TrimSpace(name), "browser")
}

func copyFile(source string, target string, mode os.FileMode) error {
	content, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return os.WriteFile(target, content, mode)
}
