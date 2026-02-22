import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Bold, Italic, Strikethrough, Heading1, Heading2, 
  List, ListOrdered, Quote, Code, Link as LinkIcon, 
  Undo, Redo, RemoveFormatting 
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
    <div className={`flex flex-col border border-surfaceHighlight rounded-xl overflow-hidden bg-surface ${className}`} style={{ minHeight }}>
      <MenuBar editor={editor} />
      <div className="flex-1 cursor-text" onClick={() => editor?.commands.focus()}>
        <EditorContent editor={editor} className="h-full" />
      </div>
      <div className="px-4 py-1.5 bg-surfaceHighlight/5 border-t border-surfaceHighlight flex justify-between items-center text-[10px] text-textMuted">
         <span>Tiptap Editor</span>
         <span>{editor?.storage.characterCount?.characters?.() || 0} chars</span>
      </div>
    </div>
  );
};

export default RichTextEditor;
