import type {
  ListChildrenResult,
  ReferenceNode,
  ReferencePreview,
  ReferenceScope,
  ReferenceSourceCapabilities,
  ReferenceSourceService,
  SelectedReference
} from "../contracts/referenceSource.ts";
import type {
  WorkspaceFileReference,
  WorkspaceFileReferenceAdapter
} from "../contracts/index.ts";

/**
 * 统一的「引用列表协议」—— 与 app references 同一套 group/reference/parentGroupId/cursor 形状。
 * 各源(应用 / issue / 任务…)各自实现一个 ReferenceListBackend 把自家数据映射成此协议;
 * createReferenceListSource 把协议 item 映射成 ReferenceNode,各源前端逻辑完全复用。
 * 设计见 docs/architecture/agent-reference-source-services.md。
 */

export interface ReferenceListGroup {
  type: "group";
  /** 不透明分组 id;作为下钻的 parentGroupId 原样回传。 */
  id: string;
  displayName: string;
  referenceCount?: number | null;
}

export interface ReferenceListFile {
  /** daemon/host 可解析的文件路径。 */
  path: string;
  displayName?: string | null;
  sizeBytes?: number | null;
  mtimeMs?: number | null;
  mimeType?: string | null;
}

export interface ReferenceListReference {
  type: "reference";
  reference: ReferenceListFile;
}

export type ReferenceListItem = ReferenceListGroup | ReferenceListReference;

export interface ReferenceListRequest {
  /** null = 根层级。 */
  parentGroupId: string | null;
  cursor?: string | null;
  filter?: string | null;
  signal?: AbortSignal;
}

export interface ReferenceListResult {
  items: ReferenceListItem[];
  nextCursor?: string | null;
}

/** 各源自治的取数适配器:把自家数据映射成统一协议。 */
export interface ReferenceListBackend {
  list(
    scope: ReferenceScope,
    request: ReferenceListRequest
  ): Promise<ReferenceListResult>;
}

export interface CreateReferenceListSourceInput {
  sourceId: string;
  label: string;
  order?: number;
  capabilities: ReferenceSourceCapabilities;
  isAvailable: (scope: ReferenceScope) => boolean | Promise<boolean>;
  backend: ReferenceListBackend;
  /** open/preview 复用 host 链路(协议返回的 path 可被解析打开)。 */
  adapter: WorkspaceFileReferenceAdapter;
}

const GROUP_PREFIX = "g:";
const FILE_PREFIX = "f:";

export function createReferenceListSource(
  input: CreateReferenceListSourceInput
): ReferenceSourceService {
  const { sourceId, label, capabilities, isAvailable, backend, adapter } =
    input;

  function fileReferenceOf(node: ReferenceNode): WorkspaceFileReference {
    return { path: decodeSegment(FILE_PREFIX, node.ref.nodeId), kind: "file" };
  }

  return {
    metadata: { id: sourceId, label, order: input.order ?? 0 },
    capabilities,
    isAvailable,

    async listChildren(
      scope: ReferenceScope,
      { node, cursor, filter }
    ): Promise<ListChildrenResult> {
      // file 节点没有子节点。
      if (node && node.nodeId.startsWith(FILE_PREFIX)) {
        return { entries: [], nextCursor: null };
      }
      const parentGroupId = node
        ? decodeSegment(GROUP_PREFIX, node.nodeId)
        : null;
      const result = await backend.list(scope, {
        parentGroupId,
        cursor: cursor ?? null,
        filter: filter ?? null
      });
      return {
        entries: result.items.map((item) => itemToNode(sourceId, item)),
        nextCursor: result.nextCursor ?? null
      };
    },

    async open(_scope: ReferenceScope, node: ReferenceNode): Promise<void> {
      await adapter.openReference?.(fileReferenceOf(node));
    },

    async readPreview(
      scope: ReferenceScope,
      node: ReferenceNode
    ): Promise<ReferencePreview | null> {
      if (!adapter.readReferencePreview) {
        return null;
      }
      return adapter.readReferencePreview({
        workspaceId: scope.workspaceId,
        reference: fileReferenceOf(node)
      });
    },

    resolveSelection(node: ReferenceNode): SelectedReference {
      return {
        path: decodeSegment(FILE_PREFIX, node.ref.nodeId),
        kind: "file",
        ...(node.displayName ? { displayName: node.displayName } : {})
      };
    }
  };
}

function itemToNode(sourceId: string, item: ReferenceListItem): ReferenceNode {
  if (item.type === "group") {
    return {
      ref: { sourceId, nodeId: GROUP_PREFIX + base64UrlEncode(item.id) },
      kind: "folder",
      displayName: item.displayName,
      hasChildren: true,
      ...(item.referenceCount == null
        ? {}
        : { childCount: item.referenceCount })
    };
  }
  const reference = item.reference;
  return {
    ref: { sourceId, nodeId: FILE_PREFIX + base64UrlEncode(reference.path) },
    kind: "file",
    displayName: reference.displayName?.trim() || basename(reference.path),
    ...(reference.sizeBytes == null ? {} : { sizeBytes: reference.sizeBytes }),
    ...(reference.mtimeMs == null ? {} : { mtimeMs: reference.mtimeMs }),
    ...(reference.mimeType ? { mimeType: reference.mimeType } : {})
  };
}

function decodeSegment(prefix: string, nodeId: string): string {
  if (!nodeId.startsWith(prefix)) {
    throw new Error(
      `reference-list nodeId missing ${prefix} prefix: ${nodeId}`
    );
  }
  return base64UrlDecode(nodeId.slice(prefix.length));
}

function basename(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const index = trimmed.lastIndexOf("/");
  return index >= 0 ? trimmed.slice(index + 1) : trimmed;
}

/** UTF-8 安全的 base64url(浏览器/Node 通用)。 */
export function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
