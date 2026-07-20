<script lang="ts">
import { onMount } from 'svelte';
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { Compartment, EditorSelection, EditorState, Transaction, type Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, type KeyBinding } from '@codemirror/view';
import {
  getEditorBodyValueSyncReplacement,
  normalizeEditorBodyValue
} from './editor-shell-helpers';
import {
  getMarkdownOutlineSelectionRange,
  type MarkdownOutlineJumpCommand
} from '../markdown/editor-outline-helpers';
import {
  applyMarkdownToolbarCommandToText,
  applyMarkdownToolToText,
  type EditorTextSelection,
  type MarkdownTextEdit
} from '../markdown/editor-markdown-transforms';
import {
  findEditableImageBlockAtSelection,
  type EditableImageBlock
} from '../media-insert/editor-image-blocks';
import type { EditableGalleryBlock } from '../media-insert/editor-gallery-blocks';
import { getAboutDirectiveHighlightExtension } from '../markdown/editor-about-directive-highlight';
import { getImageEditTooltipExtension } from '../media-insert/editor-image-edit-tooltip';
import { getMarkdownCodeDecorationsExtension } from '../markdown/editor-markdown-code-decorations';
import { getMarkdownHighlightExtension } from '../markdown/editor-markdown-highlight-extension';
import type {
  MarkdownToolbarCommand,
  MarkdownToolId
} from '../markdown/markdown-tools';
import {
  EDITOR_FOCUS_BAND_CENTER_RATIO,
  EDITOR_FOCUS_BAND_END_RATIO,
  EDITOR_FOCUS_BAND_START_RATIO,
  PREVIEW_FOCUS_TARGET_RATIO,
  type EditorSourcePosition
} from './editor-preview-follow';

type Props = {
  value: string;
  disabled?: boolean;
  toolbarCommand?: MarkdownToolbarCommand | null;
  outlineJumpCommand?: MarkdownOutlineJumpCommand | null;
  lineNumbersEnabled?: boolean;
  aboutDirectiveHighlightEnabled?: boolean;
  mediaEditEnabled?: boolean;
  galleryEditEnabled?: boolean;
  onScrollElementChange?: (element: HTMLElement | null) => void;
  onOutlineJump?: (element: HTMLElement) => void;
  onImageToolRequest?: (block: EditableImageBlock | null) => void;
  onGalleryEditRequest?: (block: EditableGalleryBlock) => void;
  onChange?: (value: string) => void;
  onSourcePositionChange?: (position: EditorSourcePosition | null) => void;
  onViewportPositionChange?: (position: EditorSourcePosition) => void;
  onShortcutTool?: (toolId: MarkdownToolId) => void;
};

let {
  value = $bindable(''),
  disabled = false,
  toolbarCommand = null,
  outlineJumpCommand = null,
  lineNumbersEnabled = false,
  aboutDirectiveHighlightEnabled = false,
  mediaEditEnabled = true,
  galleryEditEnabled = true,
  onScrollElementChange,
  onOutlineJump,
  onImageToolRequest,
  onGalleryEditRequest,
  onChange,
  onSourcePositionChange,
  onViewportPositionChange,
  onShortcutTool
}: Props = $props();

let editorHostEl = $state<HTMLDivElement | null>(null);
let view = $state<EditorView | null>(null);
let appliedToolbarCommandId = 0;
let appliedOutlineJumpCommandId = 0;
let lastKnownEditorValue = '';

const readOnlyCompartment = new Compartment();
const editableCompartment = new Compartment();
const lineNumbersCompartment = new Compartment();

const getEditorSelection = (editorView: EditorView): EditorTextSelection => {
  const selection = editorView.state.selection.main;
  return {
    from: selection.from,
    to: selection.to
  };
};

const getActiveSourcePosition = (editorView: EditorView): EditorSourcePosition => {
  const offset = editorView.state.selection.main.head;
  const line = editorView.state.doc.lineAt(offset).number;
  const scrollerRect = editorView.scrollDOM.getBoundingClientRect();
  const cursorRect = editorView.coordsAtPos(offset);
  const viewportRatio = cursorRect && editorView.scrollDOM.clientHeight > 0
    ? (cursorRect.top - scrollerRect.top) / editorView.scrollDOM.clientHeight
    : 0.3;

  return { offset, line, viewportRatio };
};

const getViewportSourcePosition = (editorView: EditorView): EditorSourcePosition => {
  const scrollerRect = editorView.scrollDOM.getBoundingClientRect();
  const contentRect = editorView.contentDOM.getBoundingClientRect();
  const x = Math.min(
    scrollerRect.right - 1,
    Math.max(scrollerRect.left + 1, contentRect.left + 12)
  );
  const sampleRatios = [
    EDITOR_FOCUS_BAND_CENTER_RATIO,
    0.4,
    0.5,
    0.35,
    0.55,
    EDITOR_FOCUS_BAND_START_RATIO,
    EDITOR_FOCUS_BAND_END_RATIO
  ];
  const sampledOffsets = sampleRatios.map((ratio) => {
    const y = scrollerRect.top + editorView.scrollDOM.clientHeight * ratio;
    return editorView.posAtCoords({ x, y }, false) ?? editorView.viewport.from;
  });
  const offset = sampledOffsets.find((sampledOffset) => (
    editorView.state.doc.lineAt(sampledOffset).text.trim().length > 0
  )) ?? sampledOffsets[0] ?? editorView.viewport.from;
  const line = editorView.state.doc.lineAt(offset).number;

  return { offset, line, viewportRatio: PREVIEW_FOCUS_TARGET_RATIO };
};

const dispatchMarkdownEdit = (edit: MarkdownTextEdit) => {
  if (!view) return;

  const currentSelection = view.state.selection.main;
  if (
    edit.from === edit.to
    && edit.insert === ''
    && edit.selection.from === currentSelection.from
    && edit.selection.to === currentSelection.to
  ) {
    return;
  }

  const nextLength = view.state.doc.length - (edit.to - edit.from) + edit.insert.length;
  view.dispatch({
    changes: {
      from: edit.from,
      to: edit.to,
      insert: edit.insert
    },
    selection: {
      anchor: Math.min(edit.selection.from, nextLength),
      head: Math.min(edit.selection.to, nextLength)
    },
    scrollIntoView: true
  });
  if (edit.clipboardText) {
    void navigator.clipboard?.writeText(edit.clipboardText).catch(() => {});
  }
  view.focus();
};

const getOutlineScrollYMargin = (
  scroller: HTMLElement,
  targetOffsetRatio: number | undefined
): number => {
  if (!targetOffsetRatio) return 0;
  return Math.max(0, Math.round(scroller.clientHeight * targetOffsetRatio));
};

const applyOutlineJumpCommand = (
  editorView: EditorView,
  command: MarkdownOutlineJumpCommand
) => {
  const source = normalizeEditorBodyValue(editorView.state.doc.toString());
  const { selectionStart: from, selectionEnd: to } = getMarkdownOutlineSelectionRange(source, command.item);
  const selectionRange = EditorSelection.range(from, to);

  editorView.dispatch({
    selection: { anchor: from, head: to },
    effects: EditorView.scrollIntoView(selectionRange, {
      y: 'start',
      yMargin: getOutlineScrollYMargin(editorView.scrollDOM, command.targetOffsetRatio)
    })
  });
  editorView.focus();
  onOutlineJump?.(editorView.scrollDOM);
};

const applyMarkdownTool = (toolId: MarkdownToolId): boolean => {
  if (disabled || !view) return false;

  dispatchMarkdownEdit(
    applyMarkdownToolToText(
      view.state.doc.toString(),
      getEditorSelection(view),
      toolId
    )
  );
  return true;
};

const applyToolbarCommand = (command: MarkdownToolbarCommand) => {
  if (disabled || !view) return;

  if (command.kind === 'tool' && command.toolId === 'image') {
    if (!mediaEditEnabled) return;
    onImageToolRequest?.(
      findEditableImageBlockAtSelection(
        view.state.doc.toString(),
        getEditorSelection(view)
      )
    );
    return;
  }

  dispatchMarkdownEdit(
    applyMarkdownToolbarCommandToText(
      view.state.doc.toString(),
      getEditorSelection(view),
      command
    )
  );
};

const applyShortcutTool = (toolId: MarkdownToolId): boolean => {
  if (disabled) return false;
  if (onShortcutTool) {
    onShortcutTool(toolId);
    return true;
  }

  return applyMarkdownTool(toolId);
};

const markdownKeymap: readonly KeyBinding[] = [
  { key: 'Mod-b', run: () => applyShortcutTool('bold') },
  { key: 'Mod-i', run: () => applyShortcutTool('italic') },
  { key: 'Mod-k', run: () => applyShortcutTool('link') }
];

const createMediaEditExtensions = (): Extension[] => {
  if (!mediaEditEnabled) return [];

  return [
    getImageEditTooltipExtension({
      isDisabled: () => disabled,
      onEditImageBlock: (block) => {
        onImageToolRequest?.(block);
      },
      ...(galleryEditEnabled
        ? {
            onEditGalleryBlock: (block: EditableGalleryBlock) => {
              onGalleryEditRequest?.(block);
            }
          }
        : {})
    })
  ];
};

const createEditorExtensions = (): Extension[] => [
  markdown({
    completeHTMLTags: false,
    pasteURLAsLink: true
  }),
  getMarkdownHighlightExtension(),
  getMarkdownCodeDecorationsExtension(),
  ...(aboutDirectiveHighlightEnabled ? [getAboutDirectiveHighlightExtension()] : []),
  ...createMediaEditExtensions(),
  history(),
  EditorView.lineWrapping,
  lineNumbersCompartment.of(lineNumbersEnabled ? lineNumbers() : []),
  EditorView.contentAttributes.of({
    'aria-label': 'Markdown 正文',
    spellcheck: 'false'
  }),
  keymap.of([
    ...markdownKeymap,
    ...historyKeymap,
    ...defaultKeymap
  ]),
  readOnlyCompartment.of(EditorState.readOnly.of(disabled)),
  editableCompartment.of(EditorView.editable.of(!disabled)),
  EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const nextValue = normalizeEditorBodyValue(update.state.doc.toString());
      lastKnownEditorValue = nextValue;
      if (nextValue !== value) {
        value = nextValue;
      }
      if (!update.transactions.some((transaction) => transaction.annotation(Transaction.addToHistory) === false)) {
        onChange?.(nextValue);
      }
    }

    if (update.docChanged || update.selectionSet || (update.focusChanged && update.view.hasFocus)) {
      onSourcePositionChange?.(getActiveSourcePosition(update.view));
    }
  })
];

onMount(() => {
  if (!editorHostEl) return;

  const initialValue = normalizeEditorBodyValue(value);
  if (initialValue !== value) {
    value = initialValue;
  }
  lastKnownEditorValue = initialValue;

  const editorView = new EditorView({
    state: EditorState.create({
      doc: initialValue,
      extensions: createEditorExtensions()
    }),
    parent: editorHostEl
  });

  view = editorView;
  onScrollElementChange?.(editorView.scrollDOM);
  onSourcePositionChange?.(getActiveSourcePosition(editorView));

  let viewportFollowFrame: number | null = null;

  const queueViewportPosition = () => {
    if (!onViewportPositionChange || viewportFollowFrame !== null) return;

    viewportFollowFrame = window.requestAnimationFrame(() => {
      viewportFollowFrame = null;
      onViewportPositionChange?.(getViewportSourcePosition(editorView));
    });
  };

  const handleViewportScroll = () => {
    queueViewportPosition();
  };

  editorView.scrollDOM.addEventListener('scroll', handleViewportScroll, { passive: true });

  return () => {
    if (viewportFollowFrame !== null) window.cancelAnimationFrame(viewportFollowFrame);
    editorView.scrollDOM.removeEventListener('scroll', handleViewportScroll);
    onScrollElementChange?.(null);
    onSourcePositionChange?.(null);
    editorView.destroy();
    view = null;
  };
});

$effect(() => {
  const editorView = view;
  if (!editorView) return;

  editorView.dispatch({
    effects: [
      readOnlyCompartment.reconfigure(EditorState.readOnly.of(disabled)),
      editableCompartment.reconfigure(EditorView.editable.of(!disabled))
    ]
  });
});

$effect(() => {
  const editorView = view;
  if (!editorView) return;

  editorView.dispatch({
    effects: lineNumbersCompartment.reconfigure(lineNumbersEnabled ? lineNumbers() : [])
  });
});

$effect(() => {
  const editorView = view;
  if (!editorView) return;

  const normalizedValue = normalizeEditorBodyValue(value);
  if (normalizedValue !== value) {
    value = normalizedValue;
    return;
  }
  if (normalizedValue === lastKnownEditorValue) return;

  const replacement = getEditorBodyValueSyncReplacement(editorView.state.doc.toString(), normalizedValue);
  if (replacement === null) {
    lastKnownEditorValue = normalizedValue;
    return;
  }

  lastKnownEditorValue = replacement;
  editorView.dispatch({
    changes: {
      from: 0,
      to: editorView.state.doc.length,
      insert: replacement
    },
    annotations: Transaction.addToHistory.of(false)
  });
});

$effect(() => {
  const command = toolbarCommand;
  if (!command || command.id === appliedToolbarCommandId) return;

  appliedToolbarCommandId = command.id;
  applyToolbarCommand(command);
});

$effect(() => {
  const command = outlineJumpCommand;
  const editorView = view;
  if (!command || !editorView || command.id === appliedOutlineJumpCommandId) return;

  appliedOutlineJumpCommandId = command.id;
  applyOutlineJumpCommand(editorView, command);
});
</script>

<section class="admin-editor-body" aria-label="Markdown body editor">
  <div class="admin-field admin-editor-body__field">
    <span class="admin-sr-only">Markdown 正文</span>
    <div
      class="admin-editor-body__codemirror"
      bind:this={editorHostEl}
    ></div>
  </div>
</section>
