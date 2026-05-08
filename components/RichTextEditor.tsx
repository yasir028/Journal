import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import {
  Bold, Italic, Strikethrough, Heading1, Heading2,
  List, ListOrdered, Quote, Code, Link as LinkIcon,
  Undo, Redo, RemoveFormatting, Heading, ListChecks, Minus
} from 'lucide-react';
import clsx from 'clsx';

interface RichTextEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  minHeight?: string;
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) {
    return null;
  }

  const buttonClass = (isActive: boolean = false) => clsx(
    "p-1.5 rounded transition-colors text-textMuted hover:bg-surfaceHighlight hover:text-text",
    isActive && "bg-primary/20 text-primary hover:bg-primary/30"
  );

  const setLink = () => {
    const previousUrl = editor.getAttributes('link').href;
    const url = window.prompt('URL', previousUrl);

    if (url === null) return;
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  };

  return (
    <div className="flex items-center gap-1 p-2 border-b border-surfaceHighlight bg-surfaceHighlight/5 flex-wrap">
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={buttonClass(editor.isActive('bold'))} title="Bold">
        <Bold size={16} />
      </button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={buttonClass(editor.isActive('italic'))} title="Italic">
        <Italic size={16} />
      </button>
      <button onClick={() => editor.chain().focus().toggleStrike().run()} className={buttonClass(editor.isActive('strike'))} title="Strike">
        <Strikethrough size={16} />
      </button>
      
      <div className="w-px h-5 bg-surfaceHighlight mx-1" />
      
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={buttonClass(editor.isActive('heading', { level: 1 }))} title="Heading 1">
        <Heading1 size={16} />
      </button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={buttonClass(editor.isActive('heading', { level: 2 }))} title="Heading 2">
        <Heading2 size={16} />
      </button>
      
      <div className="w-px h-5 bg-surfaceHighlight mx-1" />
      
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={buttonClass(editor.isActive('bulletList'))} title="Bullet List">
        <List size={16} />
      </button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={buttonClass(editor.isActive('orderedList'))} title="Ordered List">
        <ListOrdered size={16} />
      </button>
      <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={buttonClass(editor.isActive('blockquote'))} title="Quote">
        <Quote size={16} />
      </button>
      <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={buttonClass(editor.isActive('codeBlock'))} title="Code Block">
        <Code size={16} />
      </button>
      
      <div className="w-px h-5 bg-surfaceHighlight mx-1" />

      <button onClick={setLink} className={buttonClass(editor.isActive('link'))} title="Link">
        <LinkIcon size={16} />
      </button>
      <button onClick={() => editor.chain().focus().unsetAllMarks().run()} className={buttonClass()} title="Clear Formatting">
        <RemoveFormatting size={16} />
      </button>

      <div className="flex-1" />

      <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className={buttonClass()} title="Undo">
        <Undo size={16} />
      </button>
      <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className={buttonClass()} title="Redo">
        <Redo size={16} />
      </button>
    </div>
  );
};

const RichTextEditor: React.FC<RichTextEditorProps> = ({ 
  value, 
  onChange, 
  placeholder = "Write something...", 
  className = "",
  minHeight = "200px"
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-primary underline cursor-pointer',
        },
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-invert focus:outline-none min-h-[150px] p-4 text-sm max-w-none',
      },
    },
    immediatelyRender: false, 
  });

  // --- Slash Command State (Feature 13) ---
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState('');
  const [slashMenuPos, setSlashMenuPos] = useState({ top: 0, left: 0 });
  const [slashSelectedIdx, setSlashSelectedIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const slashCommands = [
    { label: 'Heading', command: '/heading', icon: Heading, action: (ed: any) => ed.chain().focus().toggleHeading({ level: 2 }).run() },
    { label: 'Bullet List', command: '/bullet', icon: List, action: (ed: any) => ed.chain().focus().toggleBulletList().run() },
    { label: 'Blockquote', command: '/quote', icon: Quote, action: (ed: any) => ed.chain().focus().toggleBlockquote().run() },
    { label: 'Divider', command: '/divider', icon: Minus, action: (ed: any) => ed.chain().focus().setHorizontalRule().run() },
    { label: 'Checklist', command: '/checklist', icon: ListChecks, action: (ed: any) => ed.chain().focus().insertContent('- [ ] ').run() },
  ];

  const filteredSlashCommands = slashCommands.filter(c =>
    c.command.includes(('/' + slashFilter).toLowerCase()) || c.label.toLowerCase().includes(slashFilter.toLowerCase())
  );

  const executeSlashCommand = useCallback((cmd: typeof slashCommands[0]) => {
    if (!editor) return;
    // Delete the "/" and any filter text that was typed
    const { state } = editor;
    const { $anchor } = state.selection;
    const textBefore = $anchor.parent.textContent.slice(0, $anchor.parentOffset);
    const slashIdx = textBefore.lastIndexOf('/');
    if (slashIdx >= 0) {
      const from = $anchor.start() + slashIdx;
      const to = $anchor.pos;
      editor.chain().focus().deleteRange({ from, to }).run();
    }
    cmd.action(editor);
    setSlashMenuOpen(false);
    setSlashFilter('');
    setSlashSelectedIdx(0);
  }, [editor]);

  // Listen for "/" key and track slash command text
  useEffect(() => {
    if (!editor) return;

    const handleUpdate = () => {
      const { state } = editor;
      const { $anchor } = state.selection;
      const textBefore = $anchor.parent.textContent.slice(0, $anchor.parentOffset);
      const slashIdx = textBefore.lastIndexOf('/');

      if (slashIdx >= 0) {
        const afterSlash = textBefore.slice(slashIdx + 1);
        // Only show menu if slash is recent (no spaces after slash)
        if (!afterSlash.includes(' ') && afterSlash.length < 20) {
          setSlashFilter(afterSlash);
          setSlashMenuOpen(true);
          setSlashSelectedIdx(0);

          // Position the menu near the cursor
          const coords = editor.view.coordsAtPos($anchor.pos);
          if (containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setSlashMenuPos({
              top: coords.bottom - rect.top + 4,
              left: coords.left - rect.left,
            });
          }
          return;
        }
      }
      setSlashMenuOpen(false);
      setSlashFilter('');
    };

    editor.on('update', handleUpdate);
    editor.on('selectionUpdate', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      editor.off('selectionUpdate', handleUpdate);
    };
  }, [editor]);

  // Handle keyboard navigation in slash menu
  useEffect(() => {
    if (!slashMenuOpen || !editor) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashSelectedIdx(i => Math.min(i + 1, filteredSlashCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashSelectedIdx(i => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filteredSlashCommands.length > 0) {
        e.preventDefault();
        executeSlashCommand(filteredSlashCommands[slashSelectedIdx]);
      } else if (e.key === 'Escape') {
        setSlashMenuOpen(false);
        setSlashFilter('');
      }
    };

    // Use capture phase to intercept before TipTap
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [slashMenuOpen, slashSelectedIdx, filteredSlashCommands, executeSlashCommand, editor]);

  // Sync external value changes if necessary (e.g. template insertion or switching entries)
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      // Handle empty value (clearing the editor)
      if (!value) {
        if (editor.getHTML() !== '<p></p>') {
          editor.commands.setContent('');
        }
        return;
      }

      // Only update if the content is significantly different to avoid cursor jumps
      // A simple check is usually checking if it's empty vs populated
      if (editor.getText() === '' && value) {
         editor.commands.setContent(value);
      } else if (value && value !== editor.getHTML() && !editor.isFocused) {
         // Only force update if editor is not focused, otherwise typing is interrupted
         editor.commands.setContent(value);
      }
    }
  }, [value, editor]);

  return (
    <div ref={containerRef} className={`relative flex flex-col border border-surfaceHighlight rounded-xl overflow-hidden bg-surface ${className}`} style={{ minHeight }}>
      <MenuBar editor={editor} />
      <div className="flex-1 cursor-text" onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* Slash Command Menu (Feature 13) */}
      {slashMenuOpen && filteredSlashCommands.length > 0 && (
        <div
          className="absolute z-50 bg-surface border border-surfaceHighlight rounded-lg shadow-xl py-1 w-56 animate-in fade-in slide-in-from-top-2 duration-150"
          style={{ top: slashMenuPos.top, left: slashMenuPos.left }}
        >
          <div className="px-3 py-1.5 text-[10px] text-textMuted uppercase font-bold tracking-wider border-b border-surfaceHighlight mb-1">
            Slash Commands
          </div>
          {filteredSlashCommands.map((cmd, idx) => {
            const Icon = cmd.icon;
            return (
              <button
                key={cmd.command}
                onMouseDown={(e) => { e.preventDefault(); executeSlashCommand(cmd); }}
                className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors ${
                  idx === slashSelectedIdx ? 'bg-primary/10 text-primary' : 'text-text hover:bg-surfaceHighlight/50'
                }`}
              >
                <Icon size={16} className={idx === slashSelectedIdx ? 'text-primary' : 'text-textMuted'} />
                <div className="text-left">
                  <span className="font-medium">{cmd.label}</span>
                  <span className="text-textMuted text-xs ml-2">{cmd.command}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="px-4 py-1.5 bg-surfaceHighlight/5 border-t border-surfaceHighlight flex justify-between items-center text-[10px] text-textMuted">
         <span>Tiptap Editor &middot; Type / for commands</span>
         <span>{editor?.storage.characterCount?.characters?.() || 0} chars</span>
      </div>
    </div>
  );
};

export default RichTextEditor;
