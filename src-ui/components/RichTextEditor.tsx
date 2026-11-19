import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Highlight from "@tiptap/extension-highlight";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "@tiptap/markdown";
import {
  Bold,
  Braces,
  Code2,
  Eraser,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from "lucide-react";

export interface RichTextEditorProps {
  value: string;
  onChange: (markdown: string) => void;
  editable?: boolean;
  onRestoreOriginal?: () => void;
  hasEdits?: boolean;
}

interface ToolbarButtonProps {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

const ToolbarButton = ({
  label,
  shortcut,
  active = false,
  disabled = false,
  onClick,
  children,
}: ToolbarButtonProps) => (
  <button
    type="button"
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    disabled={disabled}
    aria-label={label}
    aria-pressed={active}
    title={shortcut ? `${label} (${shortcut})` : label}
    className={`rich-editor-toolbar-button ${active ? "is-active" : ""}`}
  >
    {children}
  </button>
);

const normalizeLink = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:\/\/|mailto:)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
};

export const RichTextEditor = ({
  value,
  onChange,
  editable = true,
  onRestoreOriginal,
  hasEdits = false,
}: RichTextEditorProps) => {
  const [linkEditorOpen, setLinkEditorOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          linkOnPaste: true,
          HTMLAttributes: {
            rel: "noopener noreferrer",
            target: "_blank",
          },
        },
      }),
      Highlight,
      Placeholder.configure({
        placeholder: "Начните писать конспект…",
      }),
      Markdown,
    ],
    content: value,
    contentType: "markdown",
    editable,
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editorProps: {
      attributes: {
        class: "rich-editor-content",
        "aria-label": editable ? "Редактор конспекта" : "Текст конспекта",
        spellcheck: "true",
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.getMarkdown());
    },
  });

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editable, editor]);

  useEffect(() => {
    if (!editor || editor.getMarkdown() === value) return;
    editor.commands.setContent(value, {
      contentType: "markdown",
      emitUpdate: false,
    });
  }, [editor, value]);

  if (!editor) {
    return <div className="min-h-[360px]" aria-label="Загрузка редактора" />;
  }

  const openLinkEditor = () => {
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    setLinkValue(previousUrl ?? "");
    setLinkEditorOpen(true);
  };

  const applyLink = () => {
    const url = normalizeLink(linkValue);
    if (!url) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkEditorOpen(false);
      return;
    }

    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkEditorOpen(false);
  };

  return (
    <div className={`rich-editor ${editable ? "is-editable" : "is-readonly"}`}>
      {editable && (
        <div className="rich-editor-toolbar" role="toolbar" aria-label="Форматирование текста">
          <label className="sr-only" htmlFor="rich-editor-block-type">
            Стиль абзаца
          </label>
          <select
            id="rich-editor-block-type"
            aria-label="Стиль абзаца"
            value={
              editor.isActive("heading", { level: 1 })
                ? "h1"
                : editor.isActive("heading", { level: 2 })
                  ? "h2"
                  : editor.isActive("heading", { level: 3 })
                    ? "h3"
                    : "paragraph"
            }
            onChange={(event) => {
              const block = event.target.value;
              if (block === "paragraph") {
                editor.chain().focus().setParagraph().run();
              } else {
                const level = Number(block.slice(1)) as 1 | 2 | 3;
                editor.chain().focus().setHeading({ level }).run();
              }
            }}
            className="rich-editor-block-select"
          >
            <option value="paragraph">Обычный текст</option>
            <option value="h1">Заголовок 1</option>
            <option value="h2">Заголовок 2</option>
            <option value="h3">Заголовок 3</option>
          </select>

          <span className="rich-editor-toolbar-divider" />
          <ToolbarButton label="Жирный" shortcut="Ctrl+B" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold size={15} />
          </ToolbarButton>
          <ToolbarButton label="Курсив" shortcut="Ctrl+I" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic size={15} />
          </ToolbarButton>
          <ToolbarButton label="Подчёркивание" shortcut="Ctrl+U" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Underline size={15} />
          </ToolbarButton>
          <ToolbarButton label="Зачёркивание" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough size={15} />
          </ToolbarButton>
          <ToolbarButton label="Выделить маркером" active={editor.isActive("highlight")} onClick={() => editor.chain().focus().toggleHighlight().run()}>
            <Highlighter size={15} />
          </ToolbarButton>
          <ToolbarButton label="Строчный код" active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Braces size={15} />
          </ToolbarButton>

          <span className="rich-editor-toolbar-divider" />
          <ToolbarButton label="Маркированный список" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List size={16} />
          </ToolbarButton>
          <ToolbarButton label="Нумерованный список" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered size={16} />
          </ToolbarButton>
          <ToolbarButton label="Цитата" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote size={15} />
          </ToolbarButton>
          <ToolbarButton label="Блок кода" active={editor.isActive("codeBlock")} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
            <Code2 size={15} />
          </ToolbarButton>
          <ToolbarButton label="Разделитель" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus size={16} />
          </ToolbarButton>

          <span className="rich-editor-toolbar-divider" />
          <ToolbarButton label="Добавить ссылку" active={editor.isActive("link")} onClick={openLinkEditor}>
            <Link2 size={15} />
          </ToolbarButton>
          <ToolbarButton label="Удалить ссылку" disabled={!editor.isActive("link")} onClick={() => editor.chain().focus().unsetLink().run()}>
            <Unlink size={15} />
          </ToolbarButton>
          <ToolbarButton label="Очистить форматирование" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
            <RemoveFormatting size={15} />
          </ToolbarButton>

          <span className="rich-editor-toolbar-spacer" />
          <ToolbarButton label="Отменить" shortcut="Ctrl+Z" disabled={!editor.can().chain().undo().run()} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 size={15} />
          </ToolbarButton>
          <ToolbarButton label="Повторить" shortcut="Ctrl+Shift+Z" disabled={!editor.can().chain().redo().run()} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 size={15} />
          </ToolbarButton>
          {hasEdits && onRestoreOriginal && (
            <ToolbarButton label="Восстановить исходный текст" onClick={onRestoreOriginal}>
              <Eraser size={15} />
            </ToolbarButton>
          )}
        </div>
      )}

      {editable && linkEditorOpen && (
        <div className="rich-editor-link-panel" role="group" aria-label="Настройка ссылки">
          <Link2 size={15} aria-hidden="true" />
          <input
            type="url"
            value={linkValue}
            onChange={(event) => setLinkValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyLink();
              if (event.key === "Escape") setLinkEditorOpen(false);
            }}
            placeholder="https://example.ru"
            aria-label="Адрес ссылки"
            autoFocus
          />
          <button type="button" onClick={applyLink} className="rich-editor-link-apply">
            Применить
          </button>
          {editor.isActive("link") && (
            <button
              type="button"
              onClick={() => {
                editor.chain().focus().extendMarkRange("link").unsetLink().run();
                setLinkEditorOpen(false);
              }}
              className="rich-editor-link-remove"
            >
              Удалить
            </button>
          )}
          <button
            type="button"
            onClick={() => setLinkEditorOpen(false)}
            className="rich-editor-link-cancel"
            aria-label="Закрыть настройку ссылки"
          >
            ×
          </button>
        </div>
      )}

      <EditorContent editor={editor} />
      {editable && (
        <div className="rich-editor-hint">
          Выделите текст и выберите форматирование · Ctrl+Z отменяет последнее действие
        </div>
      )}
    </div>
  );
};
