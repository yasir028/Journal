import React, { useState, useMemo } from 'react';
import { Trade, DailyAnalysis, DailyReview, Note, NoteCategory } from '../types';
import { 
  Search, Plus, 
  Target, ShieldAlert, File, PenTool, Book, Trash2
} from 'lucide-react';
import RichTextEditor from './RichTextEditor';

interface NotebookProps {
  trades: Trade[];
  dailyAnalysis: DailyAnalysis; 
  dailyReviews: DailyReview; 
  notes: Note[]; 
  onSaveDailyReview: (date: string, text: string) => void;
  onSaveNote: (note: Note) => void;
  onDeleteNote: (id: string) => void;
  onNavigateToTrade?: (tradeId: string) => void;
  initialDate?: string;
}

const Notebook: React.FC<NotebookProps> = ({ 
  notes, 
  onSaveNote, 
  onDeleteNote,
}) => {
  // --- STATE ---
  const [activeFolder, setActiveFolder] = useState<NoteCategory>('plan');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);

  // --- HELPER: FILTERED LISTS ---
  const filteredNotes = useMemo(() => {
    return notes.filter(n => n.category === activeFolder && n.title.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [notes, activeFolder, searchQuery]);

  // --- HANDLERS ---
  const handleCreateNote = () => {
       const newNote: Note = {
         id: Date.now().toString(),
         title: 'Untitled Note',
         content: '',
         category: activeFolder,
         createdAt: new Date().toISOString(),
         updatedAt: new Date().toISOString()
       };
       onSaveNote(newNote);
       setSelectedNoteId(newNote.id);
  };

  const handleUpdateNoteContent = (text: string) => {
    if (selectedNoteId) {
      const note = notes.find(n => n.id === selectedNoteId);
      if (note) {
        onSaveNote({ ...note, content: text, updatedAt: new Date().toISOString() });
      }
    }
  };

  const handleUpdateNoteTitle = (title: string) => {
    if (selectedNoteId) {
      const note = notes.find(n => n.id === selectedNoteId);
      if (note) {
        onSaveNote({ ...note, title, updatedAt: new Date().toISOString() });
      }
    }
  };

  return (
    <div className="flex h-full bg-background text-text overflow-hidden rounded-xl border border-surfaceHighlight shadow-sm">
      
      {/* 1. SIDEBAR (Folders & Lists) */}
      <div className="w-72 bg-surface border-r border-surfaceHighlight flex flex-col shrink-0">
        
        {/* Search & Add */}
        <div className="p-4 border-b border-surfaceHighlight space-y-3">
          <div className="flex items-center gap-2 bg-background border border-surfaceHighlight rounded-lg px-3 py-2">
             <Search size={14} className="text-textMuted" />
             <input 
               type="text" 
               placeholder="Search..." 
               value={searchQuery}
               onChange={e => setSearchQuery(e.target.value)}
               className="bg-transparent text-sm outline-none w-full text-text placeholder-textMuted" 
             />
          </div>
          <button 
            onClick={handleCreateNote}
            className="w-full flex items-center justify-center gap-2 bg-primary/10 hover:bg-primary/20 text-primary py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Plus size={16} /> New Note
          </button>
        </div>

        {/* Folder Tree */}
        <div className="flex-1 overflow-y-auto flex flex-col">
           {/* Folder List */}
           <div className="p-2 space-y-1 border-b border-surfaceHighlight">
             <button onClick={() => setActiveFolder('plan')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolder === 'plan' ? 'bg-primary text-white' : 'text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}>
               <PenTool size={16} /> Trading Plans
             </button>
             <button onClick={() => setActiveFolder('goal')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolder === 'goal' ? 'bg-primary text-white' : 'text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}>
               <Target size={16} /> Goals
             </button>
             <button onClick={() => setActiveFolder('rule')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolder === 'rule' ? 'bg-primary text-white' : 'text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}>
               <ShieldAlert size={16} /> Rules
             </button>
             <button onClick={() => setActiveFolder('general')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${activeFolder === 'general' ? 'bg-primary text-white' : 'text-textMuted hover:bg-surfaceHighlight hover:text-text'}`}>
               <File size={16} /> Notes
             </button>
           </div>
           
           {/* Items List */}
           <div className="flex-1 overflow-y-auto p-2">
             <h4 className="px-3 py-2 text-xs font-bold text-textMuted uppercase tracking-wider">Notes</h4>
             
             {filteredNotes.map(note => (
                <div 
                  key={note.id}
                  onClick={() => setSelectedNoteId(note.id)}
                  className={`group px-3 py-3 rounded-lg cursor-pointer mb-1 transition-all ${selectedNoteId === note.id ? 'bg-surfaceHighlight border-l-2 border-primary' : 'hover:bg-surfaceHighlight/50 border-l-2 border-transparent'}`}
                >
                    <div className="flex justify-between items-center mb-1 gap-2">
                      <span className={`text-sm font-medium truncate flex-1 ${selectedNoteId === note.id ? 'text-text' : 'text-textMuted group-hover:text-text'}`}>{note.title}</span>
                      <button 
                        onClick={(e) => {
                            e.stopPropagation();
                            if(window.confirm('Delete this note?')) {
                                onDeleteNote(note.id);
                                if (selectedNoteId === note.id) setSelectedNoteId(null);
                            }
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 text-textMuted hover:text-danger transition-all"
                        title="Delete Note"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <span className="text-xs text-textMuted">{new Date(note.updatedAt).toLocaleDateString()}</span>
                </div>
              ))}
           </div>
        </div>
      </div>

      {/* 2. MAIN CONTENT AREA */}
      <div className="flex-1 bg-background flex flex-col overflow-y-auto relative">
        
        {/* VIEW: GENERAL NOTE */}
        {selectedNoteId && (
           <div className="flex flex-col h-full">
             <div className="p-8 border-b border-surfaceHighlight flex justify-between items-start gap-4">
               <div className="flex-1">
                 <input 
                   type="text" 
                   value={notes.find(n => n.id === selectedNoteId)?.title || ''}
                   onChange={e => handleUpdateNoteTitle(e.target.value)}
                   className="text-3xl font-bold bg-transparent outline-none text-text w-full placeholder-textMuted"
                   placeholder="Note Title"
                 />
                 <div className="text-xs text-textMuted mt-2 flex items-center gap-4">
                   <span>Created: {new Date(notes.find(n => n.id === selectedNoteId)?.createdAt || '').toLocaleDateString()}</span>
                   <span>Last Updated: {new Date(notes.find(n => n.id === selectedNoteId)?.updatedAt || '').toLocaleDateString()}</span>
                   <span className="px-2 py-0.5 bg-surfaceHighlight rounded capitalize">{activeFolder}</span>
                 </div>
               </div>
               <button 
                 onClick={() => {
                   if(window.confirm('Delete this note?')) {
                       onDeleteNote(selectedNoteId);
                       setSelectedNoteId(null);
                   }
                 }}
                 className="p-2 text-textMuted hover:text-danger hover:bg-surfaceHighlight rounded-lg transition-colors"
                 title="Delete Note"
               >
                 <Trash2 size={20} />
               </button>
             </div>
             
             <div className="flex-1 p-8">
                <RichTextEditor 
                    value={notes.find(n => n.id === selectedNoteId)?.content || ''}
                    onChange={handleUpdateNoteContent}
                    placeholder="Start typing your note..."
                    className="h-full"
                />
             </div>
           </div>
        )}

        {/* EMPTY STATE */}
        {!selectedNoteId && (
           <div className="flex flex-col items-center justify-center h-full text-textMuted">
             <Book size={64} className="mb-4 opacity-20" />
             <p className="text-lg font-medium">Select a note or create a new one</p>
           </div>
        )}

      </div>
    </div>
  );
};

export default Notebook;