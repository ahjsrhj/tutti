import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import type {
  ReferenceNode,
  ReferenceScope,
  SelectedReference,
  WorkspaceFileReference
} from "../../../contracts/index.ts";
import {
  nodeRefKey,
  selectedReferenceToWorkspaceFileReference
} from "../../../core/index.ts";
import type { ReferenceSourceAggregator } from "../../../core/referenceSourceAggregator.ts";
import {
  sortWorkspaceFileEntriesForArrangeMode,
  type WorkspaceFileEntry,
  type WorkspaceFileManagerArrangeMode
} from "@tutti-os/workspace-file-manager/services";
import {
  ROOT_CHILDREN_KEY,
  createReferenceSourcePickerController
} from "./referenceSourcePickerController.ts";

export type { WorkspaceFileManagerArrangeMode };

/**
 * 本地(非 navigable)源左栏二级里合成的「工作区根」节点 nodeId。
 * 选中它 = 回到源根(navigateToRoot),右侧展示根级树(含根目录散文件)。
 * 用 sentinel 而非真实路径:选中走 navigateToRoot 而非 ensureChildren,避免打后端。
 */
export const WORKSPACE_ROOT_GROUP_NODE_ID = "__workspace_root__";

/** 本地源「工作区根」二级节点展示名。 */
const WORKSPACE_ROOT_GROUP_LABEL = "工作区";

export interface UseReferenceSourcePickerViewInput {
  aggregator: ReferenceSourceAggregator;
  workspaceId: string;
  open: boolean;
  onClose: () => void;
  onConfirm: (refs: WorkspaceFileReference[]) => void;
}

/**
 * 多源 picker 的视图 hook。
 * controller 负责数据/缓存/分页/选中;hook 负责 UI 导航态(当前面包屑、焦点节点)。
 */
export function useReferenceSourcePickerView({
  aggregator,
  workspaceId,
  open,
  onClose,
  onConfirm
}: UseReferenceSourcePickerViewInput) {
  const readSnapshot = useSnapshot as <T extends object>(store: T) => T;
  const scope = useMemo<ReferenceScope>(() => ({ workspaceId }), [workspaceId]);

  const controller = useMemo(
    () => createReferenceSourcePickerController({ aggregator, scope }),
    [aggregator, scope]
  );
  const snapshot = readSnapshot(controller.store);

  // UI 导航态:每个源各一条面包屑栈([] = 源根)。
  const [breadcrumbBySource, setBreadcrumbBySource] = useState<
    Record<string, ReferenceNode[]>
  >({});
  const [focusedNode, setFocusedNode] = useState<ReferenceNode | null>(null);
  const [arrangeMode, setArrangeMode] =
    useState<WorkspaceFileManagerArrangeMode>("none");

  // 复用 file-manager 的排序能力:把 ReferenceNode 映射成 WorkspaceFileEntry 排序后映射回。
  const sortNodes = useCallback(
    (nodes: readonly ReferenceNode[]): ReferenceNode[] => {
      if (arrangeMode === "none") {
        return [...nodes];
      }
      const byKey = new Map<string, ReferenceNode>();
      const fileEntries: WorkspaceFileEntry[] = nodes.map((node) => {
        const key = nodeRefKey(node.ref);
        byKey.set(key, node);
        return {
          hasChildren: node.kind === "folder",
          kind: node.kind === "folder" ? "directory" : "file",
          mtimeMs: node.mtimeMs ?? null,
          name: node.displayName,
          path: key,
          sizeBytes: node.sizeBytes ?? null
        };
      });
      return sortWorkspaceFileEntriesForArrangeMode(fileEntries, arrangeMode)
        .map((entry) => byKey.get(entry.path))
        .filter((node): node is ReferenceNode => node !== undefined);
    },
    [arrangeMode]
  );
  // 每次打开对话框内,已自动进入过首个分组的源(避免覆盖用户手动导航/回到根)。
  const autoEnteredSourcesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      return;
    }
    controller.reset();
    controller.open();
    setBreadcrumbBySource({});
    setFocusedNode(null);
    autoEnteredSourcesRef.current = new Set();
    return () => {
      controller.close();
    };
  }, [controller, open]);

  const activeSourceId = snapshot.activeSourceId;
  const activeTab = useMemo(
    () => snapshot.tabs.find((tab) => tab.sourceId === activeSourceId) ?? null,
    [activeSourceId, snapshot.tabs]
  );
  const capabilities = activeTab?.capabilities ?? null;

  const breadcrumb = activeSourceId
    ? (breadcrumbBySource[activeSourceId] ?? [])
    : [];
  const currentNode = breadcrumb.at(-1) ?? null;
  const currentKey = currentNode
    ? nodeRefKey(currentNode.ref)
    : ROOT_CHILDREN_KEY;

  const activeTabState = activeSourceId
    ? snapshot.bySource[activeSourceId]
    : undefined;
  const isSearch =
    activeTabState?.mode === "search" &&
    activeTabState.searchQuery.trim() !== "";

  const currentChildren = activeTabState?.childrenByKey[currentKey];
  const rootChildren = activeTabState?.childrenByKey[ROOT_CHILDREN_KEY];

  // 浏览态内容区:当前选中二级节点(currentNode,本地根时为 null → 源根)的子节点,
  // 递归就地展开成文件树。搜索态:扁平搜索结果。
  const currentEntries = useMemo(
    () => sortNodes(currentChildren?.entries ?? []),
    [currentChildren?.entries, sortNodes]
  );
  const searchResults = useMemo(
    () => sortNodes(activeTabState?.searchEntries ?? []),
    [activeTabState?.searchEntries, sortNodes]
  );

  // 左栏二级分组:所有源都取源根下的 folder。
  // 本地(非 navigable)源额外在最前合成「工作区根」入口,保住根级散文件可达。
  const sidebarGroups = useMemo<ReferenceNode[]>(() => {
    if (!activeSourceId) {
      return [];
    }
    const folders = (rootChildren?.entries ?? []).filter(
      (node) => node.kind === "folder"
    );
    if (capabilities?.navigable) {
      return folders;
    }
    const workspaceRoot: ReferenceNode = {
      ref: { sourceId: activeSourceId, nodeId: WORKSPACE_ROOT_GROUP_NODE_ID },
      kind: "folder",
      displayName: WORKSPACE_ROOT_GROUP_LABEL
    };
    return [workspaceRoot, ...folders];
  }, [activeSourceId, capabilities?.navigable, rootChildren?.entries]);

  // 当前选中的二级分组 key(本地根选中时 = 合成「工作区根」节点的 key)。
  const selectedGroupKey =
    currentNode != null
      ? nodeRefKey(currentNode.ref)
      : activeSourceId && !capabilities?.navigable
        ? nodeRefKey({
            sourceId: activeSourceId,
            nodeId: WORKSPACE_ROOT_GROUP_NODE_ID
          })
        : null;

  const setActiveSource = useCallback(
    (sourceId: string) => {
      controller.setActiveSource(sourceId);
      setFocusedNode(null);
    },
    [controller]
  );

  const enterFolder = useCallback(
    (node: ReferenceNode) => {
      if (
        node.kind !== "folder" ||
        !activeSourceId ||
        node.ref.nodeId === WORKSPACE_ROOT_GROUP_NODE_ID
      ) {
        return;
      }
      controller.ensureChildren(node);
      setBreadcrumbBySource((current) => {
        const stack = current[activeSourceId] ?? [];
        const index = stack.findIndex(
          (item) => nodeRefKey(item.ref) === nodeRefKey(node.ref)
        );
        const nextStack =
          index >= 0 ? stack.slice(0, index + 1) : [...stack, node];
        return { ...current, [activeSourceId]: nextStack };
      });
      setFocusedNode(null);
    },
    [activeSourceId, controller]
  );

  // 切到可逐层进入的源(如「应用」)时,默认进入第一个分组(app),
  // 而非停在根列表。每个源每次打开只自动选一次,用户回到根/手动导航后不再覆盖。
  useEffect(() => {
    if (!open || !activeSourceId || !capabilities?.navigable) {
      return;
    }
    if (autoEnteredSourcesRef.current.has(activeSourceId)) {
      return;
    }
    const stack = breadcrumbBySource[activeSourceId] ?? [];
    if (stack.length > 0) {
      // 该源已有导航(例如此前已自动/手动进入过),视为已初始化。
      autoEnteredSourcesRef.current.add(activeSourceId);
      return;
    }
    const firstGroup = sidebarGroups[0];
    if (!firstGroup) {
      // 根分组尚未加载完,等加载后再触发。
      return;
    }
    autoEnteredSourcesRef.current.add(activeSourceId);
    enterFolder(firstGroup);
  }, [
    open,
    activeSourceId,
    capabilities?.navigable,
    sidebarGroups,
    breadcrumbBySource,
    enterFolder
  ]);

  const navigateToBreadcrumb = useCallback(
    (index: number) => {
      if (!activeSourceId) {
        return;
      }
      setBreadcrumbBySource((current) => {
        const stack = current[activeSourceId] ?? [];
        return { ...current, [activeSourceId]: stack.slice(0, index + 1) };
      });
      const target = (breadcrumbBySource[activeSourceId] ?? [])[index] ?? null;
      controller.ensureChildren(target);
      setFocusedNode(null);
    },
    [activeSourceId, breadcrumbBySource, controller]
  );

  const navigateToRoot = useCallback(() => {
    if (!activeSourceId) {
      return;
    }
    setBreadcrumbBySource((current) => ({ ...current, [activeSourceId]: [] }));
    controller.ensureChildren(null);
    setFocusedNode(null);
  }, [activeSourceId, controller]);

  // 选中左栏二级分组:合成「工作区根」→ 回源根;其余 → 进入该目录。
  const selectGroup = useCallback(
    (node: ReferenceNode) => {
      if (!activeSourceId) {
        return;
      }
      if (node.ref.nodeId === WORKSPACE_ROOT_GROUP_NODE_ID) {
        navigateToRoot();
        return;
      }
      enterFolder(node);
    },
    [activeSourceId, enterFolder, navigateToRoot]
  );

  const isSelected = useCallback(
    (node: ReferenceNode) =>
      snapshot.selection.some(
        (item) => nodeRefKey(item.ref) === nodeRefKey(node.ref)
      ),
    [snapshot.selection]
  );

  const confirm = useCallback(() => {
    const selected: SelectedReference[] = controller.confirm();
    onConfirm(selected.map(selectedReferenceToWorkspaceFileReference));
    onClose();
  }, [controller, onClose, onConfirm]);

  return {
    tabs: snapshot.tabs,
    activeSourceId,
    activeTabLabel: activeTab?.label ?? "",
    capabilities,
    // 内容区递归就地树:当前选中二级节点的子条目(本地根时为源根子条目)。
    currentEntries,
    // 搜索态:扁平搜索结果。
    searchResults,
    expandedKeys: activeTabState?.expandedKeys ?? {},
    childrenByKey: activeTabState?.childrenByKey ?? {},
    toggleNode: (node: ReferenceNode) => controller.toggleNode(node),
    sortNodes,
    isLoadingTabs: snapshot.isLoadingTabs,
    breadcrumb,
    currentNode,
    sidebarGroups,
    selectedGroupKey,
    arrangeMode,
    setArrangeMode,
    isSearch,
    searchQuery: activeTabState?.searchQuery ?? "",
    isLoading: isSearch
      ? (activeTabState?.isSearchLoading ?? false)
      : (currentChildren?.loading ?? false),
    hasMore: !isSearch && Boolean(currentChildren?.nextCursor),
    focusedNode,
    selection: snapshot.selection,
    selectionCount: snapshot.selection.length,
    setActiveSource,
    enterFolder,
    selectGroup,
    navigateToBreadcrumb,
    navigateToRoot,
    setFocusedNode,
    setSearchQuery: (query: string) => controller.setSearchQuery(query),
    toggleSelection: (node: ReferenceNode) => controller.toggleSelection(node),
    loadMore: () => controller.loadMore(currentNode),
    isSelected,
    confirm
  };
}
