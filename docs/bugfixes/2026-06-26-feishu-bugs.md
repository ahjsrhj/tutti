# 2026-06-26 Feishu Bug Records

## Avz6rluJkenUiBclttvcETu9nNb - user prompt image/text spacing

- Link: https://ccn53rwonxso.feishu.cn/record/Avz6rluJkenUiBclttvcETu9nNb
- Base record id: `recvmIdLrHJPZm`
- Bug: 复制图片到输入框，和文字一起发送后，会话详情里图片和文字间隔较远。
- Evidence: Feishu attachment `image.png` shows a narrow screenshot preview above the user text bubble with a large visual gap before the text.
- Cause: User prompt image thumbnails were rendered inside a fixed 80px square preview. Wide clipboard screenshots could make the preview area read as empty spacing before the following text bubble.
- Fix: Render single user prompt images as proportional thumbnails with a 160px column and 80px max height, while keeping multi-image grids compact at 80px columns.
- Verification:
  - `corepack pnpm --dir packages/agent/gui exec vitest run --environment jsdom shared/agentConversation/components/AgentTranscriptItemView.spec.tsx`
  - `corepack pnpm --filter @tutti-os/agent-gui typecheck`
  - Web check: opened `http://127.0.0.1:5173/`; page rendered Agent GUI without framework overlay. Current local workspace had no user image message to reproduce visually.
- Status: fixed locally
- Commit: pending
- Feishu status update: pending after commit.
