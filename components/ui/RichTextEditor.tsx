'use client'

// Tiptap rich-text editor with optional paragraph/sentence focus mode.
//
// Focus-mode implementation: ProseMirror plugin emits inline decorations
// (.ap-focus-dim / .ap-focus-active) keyed off the current selection's
// block + a sentence-boundary regex. Pattern lifted from
// authorproof/src/views/EditorPage.jsx:48-160 and adapted to TypeScript.
//
// The toolbar is intentionally minimal — invoice emails do not need
// headings, color, alignment, etc. Allowlist: bold, italic, underline,
// strike, bullet list, ordered list, link.

import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { Extension } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import type { EditorState } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { useEffect, useState, useCallback } from 'react'

export type FocusLevel = 'off' | 'paragraph' | 'sentence'

interface Props {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  focusLevel?: FocusLevel
  className?: string
  // When true (default), shows the toolbar inside the editor card.
  showToolbar?: boolean
}

// ProseMirror plugin storage type for our focus extension.
interface FocusStorage {
  enabled: boolean
  level: 'paragraph' | 'sentence'
}

// Build the focus extension once. Each editor instance gets its own
// storage (Tiptap clones extensions per editor).
const SentenceFocusExtension = Extension.create<unknown, FocusStorage>({
  name: 'sentenceFocus',
  addStorage() {
    return { enabled: false, level: 'paragraph' }
  },
  addProseMirrorPlugins() {
    const storage = this.storage
    return [
      new Plugin({
        props: {
          decorations(state: EditorState) {
            if (!storage.enabled) return null

            const { doc, selection } = state
            const { $head } = selection

            let depth = $head.depth
            while (depth > 0 && !$head.node(depth).isTextblock) depth--
            if (!$head.node(depth)?.isTextblock) return null

            const blockStart = $head.start(depth)
            const blockEnd = $head.end(depth)
            const blockText = doc.textBetween(blockStart, blockEnd, '\n', '\n')
            const decorations: Decoration[] = [
              Decoration.inline(1, doc.content.size, { class: 'ap-focus-dim' }),
            ]

            if (!blockText) return DecorationSet.create(doc, decorations)

            if (storage.level === 'paragraph') {
              decorations.push(
                Decoration.inline(blockStart, blockEnd, { class: 'ap-focus-active' }),
              )
              return DecorationSet.create(doc, decorations)
            }

            // Sentence-level focus.
            const cursorPos = Math.min(selection.head, blockEnd)
            const cursorOffset = doc.textBetween(blockStart, cursorPos, '\n', '\n').length

            const boundaries = [0]
            const re = /[.!?](?:["”')\]]+)?(?=\s|$)/g
            let m: RegExpExecArray | null
            while ((m = re.exec(blockText)) !== null) {
              let next = m.index + m[0].length
              while (next < blockText.length && /\s/.test(blockText[next])) next++
              boundaries.push(next)
            }
            boundaries.push(blockText.length)

            let sStart = 0
            let sEnd = blockText.length
            for (let i = 0; i < boundaries.length - 1; i++) {
              if (
                cursorOffset >= boundaries[i] &&
                cursorOffset <= boundaries[i + 1]
              ) {
                sStart = boundaries[i]
                sEnd = boundaries[i + 1]
                break
              }
            }
            while (sStart < sEnd && /\s/.test(blockText[sStart])) sStart++
            while (sEnd > sStart && /\s/.test(blockText[sEnd - 1])) sEnd--

            const from = blockStart + sStart
            const to = blockStart + sEnd
            if (to > from) {
              decorations.push(
                Decoration.inline(from, to, { class: 'ap-focus-active' }),
              )
            }
            return DecorationSet.create(doc, decorations)
          },
        },
      }),
    ]
  },
})

export default function RichTextEditor({
  value,
  onChange,
  placeholder,
  focusLevel = 'off',
  className,
  showToolbar = true,
}: Props) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: false,
        horizontalRule: false,
        blockquote: false,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        autolink: true,
      }),
      Placeholder.configure({
        placeholder: placeholder ?? 'Type your message…',
      }),
      SentenceFocusExtension,
    ],
    content: value,
    editorProps: {
      attributes: {
        class:
          'prose-invoice min-h-[260px] outline-none px-5 py-4 font-serif text-[15px] leading-[1.7] text-hm-text',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // Sync incoming value (e.g. AI rewrite swapped the body).
  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, false)
    }
  }, [editor, value])

  // Refresh decorations whenever focus level changes.
  useEffect(() => {
    if (!editor) return
    const storage = editor.storage.sentenceFocus as FocusStorage
    storage.enabled = focusLevel !== 'off'
    storage.level = focusLevel === 'sentence' ? 'sentence' : 'paragraph'
    // Force a redraw of decorations.
    const view = editor.view as EditorView
    view.dispatch(view.state.tr.setMeta('sentenceFocusRefresh', Date.now()))
  }, [editor, focusLevel])

  if (!editor) return <div className="min-h-[280px]" />

  return (
    <div
      className={`border border-hm-text/10 bg-white ${focusLevel !== 'off' ? `ap-focus-mode ap-focus-${focusLevel}` : ''} ${className ?? ''}`}
    >
      {showToolbar ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const [, force] = useState(0)
  // Tiptap's command state changes don't notify React; tick on transactions.
  useEffect(() => {
    const onTx = () => force((n) => n + 1)
    editor.on('selectionUpdate', onTx)
    editor.on('transaction', onTx)
    return () => {
      editor.off('selectionUpdate', onTx)
      editor.off('transaction', onTx)
    }
  }, [editor])

  const onLink = useCallback(() => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL (leave empty to remove)', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().unsetLink().run()
      return
    }
    const href = url.startsWith('http') || url.startsWith('mailto:') ? url : `https://${url}`
    editor.chain().focus().extendMarkRange('link').setLink({ href }).run()
  }, [editor])

  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-hm-text/10 bg-hm-bg/40 px-2 py-1.5">
      <TB onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold (⌘B)">
        <strong style={{ fontSize: 12 }}>B</strong>
      </TB>
      <TB onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic (⌘I)">
        <em style={{ fontSize: 12, fontFamily: 'Georgia,serif' }}>I</em>
      </TB>
      <TB onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Strikethrough">
        <span style={{ fontSize: 12, textDecoration: 'line-through' }}>S</span>
      </TB>
      <div className="mx-1 h-4 w-px bg-hm-text/15" />
      <TB onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">
        <span style={{ fontSize: 12 }}>•</span>
      </TB>
      <TB onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">
        <span style={{ fontSize: 11 }}>1.</span>
      </TB>
      <div className="mx-1 h-4 w-px bg-hm-text/15" />
      <TB onClick={onLink} active={editor.isActive('link')} title="Link">
        <span style={{ fontSize: 12 }}>🔗</span>
      </TB>
    </div>
  )
}

function TB({
  active,
  onClick,
  title,
  children,
}: {
  active?: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-7 w-8 items-center justify-center border text-[11px] tracking-[0.18em] ${active ? 'border-hm-text bg-hm-text text-white' : 'border-transparent text-hm-text hover:border-hm-text/30'}`}
    >
      {children}
    </button>
  )
}
