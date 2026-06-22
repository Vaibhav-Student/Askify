import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, FileText, Sparkles, ChevronRight, Check, ChevronDown } from './Icons';

export function getShortDocumentName(filename) {
  if (!filename) return '';
  let base = filename.replace(/\.[^.]+$/, "");
  base = base.replace(/^\d+[_-]/, "");
  base = base.replace(/[_-]/g, " ").trim();
  if (base.includes(" - ")) {
    const parts = base.split(" - ");
    base = parts[parts.length - 1].trim();
  } else if (base.includes(" -")) {
    const parts = base.split(" -");
    base = parts[parts.length - 1].trim();
  } else if (base.includes("- ")) {
    const parts = base.split("- ");
    base = parts[parts.length - 1].trim();
  }
  return base;
}

export default function StudyHub({
  isOpen,
  onClose,
  documents = [],
  activeDocForViewer = null,
  setActiveDocForViewer = null,
  showNotification
}) {
  const [activeTab, setActiveTab] = useState('viewer');
  const [selectedDoc, setSelectedDoc] = useState('');
  const [docContent, setDocContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Study materials states
  const [flashcards, setFlashcards] = useState([]);
  const [flippedCards, setFlippedCards] = useState({});
  const [quiz, setQuiz] = useState([]);
  const [currentQuizIndex, setCurrentQuizIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState(null);
  const [quizScore, setQuizScore] = useState(0);
  const [quizFinished, setQuizFinished] = useState(false);
  const [roadmap, setRoadmap] = useState([]);
  const [completedTasks, setCompletedTasks] = useState({});

  const viewerRef = useRef(null);
  const dropdownRef = useRef(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const loadDocumentContent = useCallback(async (name) => {
    setLoading(true);
    setError('');
    setDocContent('');
    try {
      const response = await fetch(`/api/documents/content?name=${encodeURIComponent(name)}`);
      if (!response.ok) {
        let errMsg = 'Failed to load document text';
        try {
          const errData = await response.json();
          errMsg = errData.error || errMsg;
        } catch { /* ignore parse failure */ }
        throw new Error(errMsg);
      }
      const data = await response.json();
      setDocContent(data.text || '');
      
      // Auto-scroll to citation highlight
      if (activeDocForViewer && activeDocForViewer.name === name && activeDocForViewer.highlightText) {
        setTimeout(() => {
          const matchedEl = viewerRef.current?.querySelector('.citation-highlight');
          if (matchedEl) {
            matchedEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      }
    } catch (err) {
      setError(err.message || 'Error loading document content');
    } finally {
      setLoading(false);
    }
  }, [activeDocForViewer]);

  // Sync active document from Chat Area citations
  useEffect(() => {
    if (activeDocForViewer && activeDocForViewer.name) {
      setSelectedDoc(activeDocForViewer.name);
      setActiveTab('viewer');
      loadDocumentContent(activeDocForViewer.name);
    }
  }, [activeDocForViewer, loadDocumentContent]);

  const generateMaterials = async (type) => {
    if (!selectedDoc) {
      showNotification('Please select a document first', 'info');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/study/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, filename: selectedDoc })
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Failed to generate ${type}`);
      }
      const res = await response.json();
      
      if (type === 'flashcards') {
        setFlashcards(res.data || []);
        setFlippedCards({});
      } else if (type === 'quiz') {
        setQuiz(res.data || []);
        setCurrentQuizIndex(0);
        setSelectedOption(null);
        setQuizScore(0);
        setQuizFinished(false);
      } else if (type === 'roadmap') {
        setRoadmap(res.data || []);
        // Load initial checkbox states from localStorage
        const savedTasks = localStorage.getItem(`completed_tasks_${selectedDoc}`);
        setCompletedTasks(savedTasks ? JSON.parse(savedTasks) : {});
      }
      showNotification(`Generated ${type}!`, 'success');
    } catch (err) {
      setError(err.message);
      showNotification(`Generation error: ${err.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  // Flip flashcard toggler
  const toggleCardFlip = (index) => {
    setFlippedCards(prev => ({
      ...prev,
      [index]: !prev[index]
    }));
  };

  // Quiz submission handler
  const handleQuizAnswer = (optionIdx) => {
    if (selectedOption !== null) return; // Already answered this question
    setSelectedOption(optionIdx);
    const correctIdx = quiz[currentQuizIndex].correctIndex;
    if (optionIdx === correctIdx) {
      setQuizScore(prev => prev + 1);
    }
  };

  const handleNextQuiz = () => {
    setSelectedOption(null);
    if (currentQuizIndex + 1 < quiz.length) {
      setCurrentQuizIndex(prev => prev + 1);
    } else {
      setQuizFinished(true);
    }
  };

  // Toggle Kanban checklist state
  const toggleKanbanTask = (milestoneIdx, taskIdx) => {
    const key = `${milestoneIdx}-${taskIdx}`;
    const updated = {
      ...completedTasks,
      [key]: !completedTasks[key]
    };
    setCompletedTasks(updated);
    localStorage.setItem(`completed_tasks_${selectedDoc}`, JSON.stringify(updated));
  };

  // Render text with HTML tag marks formatted professionally
  const renderHighlightedContent = () => {
    if (!docContent) {
      if (error) return <p className="viewer-paragraph error">{error}</p>;
      return <p className="viewer-paragraph empty">Select a document to view content</p>;
    }

    let highlightTerm = '';
    let escapedHighlight = null;
    if (activeDocForViewer && activeDocForViewer.highlightText && selectedDoc === activeDocForViewer.name) {
      highlightTerm = activeDocForViewer.highlightText;
      escapedHighlight = highlightTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    const highlightBlock = (blockText) => {
      if (!highlightTerm || !blockText.toLowerCase().includes(highlightTerm.toLowerCase())) {
        return blockText;
      }
      const parts = blockText.split(new RegExp(`(${escapedHighlight})`, 'gi'));
      return parts.map((part, idx) => 
        part.toLowerCase() === highlightTerm.toLowerCase() ? 
        <mark key={idx} className="citation-highlight">{part}</mark> : part
      );
    };

    const lines = docContent.split('\n');
    const blocks = [];
    let currentBlock = null;

    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        continue;
      }

      // Check for list item
      const isListItem = /^\s*[•\-*\u2022\d+[.\])\u2713]\s/.test(trimmed);
      const cleanLine = trimmed.replace(/^\s*[•\-*\u2022\d+[.\])\u2713]\s*/, '');

      if (isListItem) {
        if (currentBlock && currentBlock.type !== 'ul') {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        if (!currentBlock) {
          currentBlock = { type: 'ul', items: [] };
        }
        currentBlock.items.push(cleanLine);
        continue;
      }

      // Check for heading (ALL-CAPS short line or numbered/keyword heading)
      const isHeading = (trimmed.length < 50 && trimmed === trimmed.toUpperCase() && /[A-Z]{2,}/.test(trimmed)) ||
                        /^\d+[\.\)]\s+[A-Z]/.test(trimmed) ||
                        /^(Chapter|Section|Part|Unit|Topic|Lesson|Module|Chapter)\b/i.test(trimmed);

      if (isHeading) {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        blocks.push({ type: 'h3', text: trimmed });
        continue;
      }

      // Check for subheading (ends with colon and is short, or starts with bold marker)
      const isSubheading = (trimmed.length < 80 && trimmed.endsWith(':') && !trimmed.endsWith('::')) ||
                           /^\*\*[^*]+\*\*\s*$/.test(trimmed);

      if (isSubheading) {
        if (currentBlock) {
          blocks.push(currentBlock);
          currentBlock = null;
        }
        blocks.push({ type: 'h4', text: trimmed.replace(/^\*\*|\*\*$/g, '') });
        continue;
      }

      // Normal paragraph line
      if (currentBlock && currentBlock.type !== 'p') {
        blocks.push(currentBlock);
        currentBlock = null;
      }

      if (!currentBlock) {
        currentBlock = { type: 'p', text: trimmed };
      } else {
        const lastChar = currentBlock.text.trim().slice(-1);
        if (['.', '?', '!', ':'].includes(lastChar)) {
          blocks.push(currentBlock);
          currentBlock = { type: 'p', text: trimmed };
        } else {
          currentBlock.text += " " + trimmed;
        }
      }
    }

    if (currentBlock) {
      blocks.push(currentBlock);
    }

    return (
      <div className="formatted-document-viewer">
        {blocks.map((block, idx) => {
          if (block.type === 'h3') {
            return <h3 key={idx} className="viewer-heading">{highlightBlock(block.text)}</h3>;
          }
          if (block.type === 'h4') {
            return <h4 key={idx} className="viewer-subheading">{highlightBlock(block.text)}</h4>;
          }
          if (block.type === 'ul') {
            return (
              <ul key={idx} className="viewer-list">
                {block.items.map((item, itemIdx) => (
                  <li key={itemIdx}>{highlightBlock(item)}</li>
                ))}
              </ul>
            );
          }
          return <p key={idx} className="viewer-paragraph">{highlightBlock(block.text)}</p>;
        })}
      </div>
    );
  };

  return (
    <>
      {isOpen && <div className="sh-overlay" onClick={onClose} />}
      <aside className={`study-hub ${isOpen ? 'sh-open' : ''}`}>
        <div className="sh-header">
          <div className="sh-title">
            <Sparkles size={16} className="title-icon glow-purple" />
            <span>Study Hub</span>
          </div>
          <button className="sh-close-btn" title="Close Study Hub" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        {/* Tab Controls */}
        <div className="sh-tabs">
          <button className={activeTab === 'viewer' ? 'active' : ''} onClick={() => setActiveTab('viewer')}>Viewer</button>
          <button className={activeTab === 'flashcards' ? 'active' : ''} onClick={() => setActiveTab('flashcards')}>Flashcards</button>
          <button className={activeTab === 'quiz' ? 'active' : ''} onClick={() => setActiveTab('quiz')}>Quiz</button>
          <button className={activeTab === 'roadmap' ? 'active' : ''} onClick={() => setActiveTab('roadmap')}>Roadmap</button>
        </div>

        {/* Global Document Selector */}
        <div className="sh-selector-panel" ref={dropdownRef}>
          <label className="selector-label">Target Document</label>
          <div className="custom-select-container">
            <button
              type="button"
              className={`custom-select-trigger ${isDropdownOpen ? 'active' : ''}`}
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-label="Select target document"
            >
              <span className="trigger-text">
                {selectedDoc ? selectedDoc : '-- Choose Document --'}
              </span>
              <ChevronDown className={`arrow-icon ${isDropdownOpen ? 'rotated' : ''}`} size={16} />
            </button>
            {isDropdownOpen && (
              <div className="custom-select-options">
                <div
                  className={`custom-select-option ${selectedDoc === '' ? 'selected' : ''}`}
                  onClick={() => {
                    setSelectedDoc('');
                    setDocContent('');
                    setIsDropdownOpen(false);
                    if (setActiveDocForViewer) {
                      setActiveDocForViewer(null);
                    }
                  }}
                >
                  -- Choose Document --
                </div>
                {documents.map(d => (
                  <div
                    key={d.name}
                    className={`custom-select-option ${selectedDoc === d.name ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedDoc(d.name);
                      loadDocumentContent(d.name);
                      setIsDropdownOpen(false);
                      if (setActiveDocForViewer) {
                        setActiveDocForViewer({ name: d.name });
                      }
                    }}
                  >
                    <span className="option-name">{d.name}</span>
                    <span className="option-size">({d.size_formatted})</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="sh-content">
          {loading && (
            <div className="sh-loading">
              <div className="sh-spinner" />
              <span>Generating study materials...</span>
            </div>
          )}

          {error && (
            <div className="sh-error">
              {error}
              {selectedDoc && (
                <button
                  className="sh-retry-btn"
                  onClick={() => loadDocumentContent(selectedDoc)}
                  style={{
                    marginLeft: '10px',
                    padding: '3px 10px',
                    fontSize: '0.72rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(255,255,255,0.06)',
                    color: 'inherit',
                    cursor: 'pointer',
                  }}
                >
                  Retry
                </button>
              )}
            </div>
          )}

          {!loading && !selectedDoc && (
            <div className="sh-empty-state">
              <FileText size={32} style={{ opacity: 0.3, marginBottom: '12px' }} />
              <p>Please select a document from the dropdown above to generate flashcards, quizzes, or roadmaps.</p>
            </div>
          )}

          {!loading && selectedDoc && (
            <AnimatePresence mode="wait">
              {/* Tab 1: Document Viewer */}
              {activeTab === 'viewer' && !error && (
                <motion.div
                  key="viewer"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="sh-tab-viewer"
                  ref={viewerRef}
                >
                  <div className="viewer-header">
                    <h4>{selectedDoc}</h4>
                    {activeDocForViewer?.highlightText && (
                      <span className="viewer-badge">Viewing Context Citation</span>
                    )}
                  </div>
                  <div className="viewer-text">{renderHighlightedContent()}</div>
                </motion.div>
              )}

              {/* Tab 2: Flashcards */}
              {activeTab === 'flashcards' && (
                <motion.div
                  key="flashcards"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="sh-tab-flashcards"
                >
                  {flashcards.length === 0 ? (
                    <div className="tab-actions-card">
                      <p>Generate study flashcards from the key concepts of your document.</p>
                      <button className="sh-action-btn" onClick={() => generateMaterials('flashcards')}>
                        Generate Flashcards
                      </button>
                    </div>
                  ) : (
                    <div className="flashcard-container">
                      <button className="sh-regenerate-btn" onClick={() => generateMaterials('flashcards')}>
                        Regenerate Cards
                      </button>
                      <div className="flashcard-grid">
                        {flashcards.map((card, idx) => (
                          <div 
                            key={idx} 
                            className={`flashcard ${flippedCards[idx] ? 'flipped' : ''}`}
                            onClick={() => toggleCardFlip(idx)}
                          >
                            <div className="flashcard-inner">
                              <div className="flashcard-front">
                                <div className="card-lbl">Question</div>
                                <div className="card-txt">{card.question}</div>
                                <div className="card-hint">Click to flip</div>
                              </div>
                              <div className="flashcard-back">
                                <div className="card-lbl">Answer</div>
                                <div className="card-txt">{card.answer}</div>
                                <div className="card-hint">Click to flip back</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Tab 3: Quiz Mode */}
              {activeTab === 'quiz' && (
                <motion.div
                  key="quiz"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="sh-tab-quiz"
                >
                  {quiz.length === 0 ? (
                    <div className="tab-actions-card">
                      <p>Test your knowledge with 5 multiple-choice questions from this document.</p>
                      <button className="sh-action-btn" onClick={() => generateMaterials('quiz')}>
                        Generate Quiz
                      </button>
                    </div>
                  ) : quizFinished ? (
                    <div className="quiz-results">
                      <h4>Quiz Completed!</h4>
                      <div className="score-badge">
                        <span>{quizScore} / {quiz.length} Correct</span>
                      </div>
                      <p>{quizScore === quiz.length ? 'Perfect Score! 🌟' : 'Good job! Keep practicing.'}</p>
                      <button className="sh-action-btn" onClick={() => generateMaterials('quiz')}>
                        Retake Quiz
                      </button>
                    </div>
                  ) : (
                    <div className="quiz-question-card">
                      <div className="quiz-header">
                        <span className="quiz-step">Question {currentQuizIndex + 1} of {quiz.length}</span>
                        <span className="quiz-score">Score: {quizScore}</span>
                      </div>
                      
                      <h4 className="question-title">{quiz[currentQuizIndex].question}</h4>
                      
                      <div className="quiz-options">
                        {quiz[currentQuizIndex].options.map((opt, idx) => {
                          const correctIdx = quiz[currentQuizIndex].correctIndex;
                          let optClass = '';
                          if (selectedOption !== null) {
                            if (idx === correctIdx) optClass = 'correct';
                            else if (idx === selectedOption) optClass = 'wrong';
                            else optClass = 'disabled';
                          }
                          
                          return (
                            <button 
                              key={idx} 
                              className={`quiz-option ${optClass}`}
                              onClick={() => handleQuizAnswer(idx)}
                              disabled={selectedOption !== null}
                            >
                              <span className="option-letter">{String.fromCharCode(65 + idx)}.</span>
                              <span className="option-text">{opt}</span>
                            </button>
                          );
                        })}
                      </div>

                      {selectedOption !== null && (
                        <div className="quiz-explanation">
                          <p><strong>Explanation:</strong> {quiz[currentQuizIndex].explanation}</p>
                          <button className="quiz-next-btn" onClick={handleNextQuiz}>
                            <span>{currentQuizIndex + 1 === quiz.length ? 'Finish Quiz' : 'Next Question'}</span>
                            <ChevronRight size={14} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}

              {/* Tab 4: Study Roadmap */}
              {activeTab === 'roadmap' && (
                <motion.div
                  key="roadmap"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="sh-tab-roadmap"
                >
                  {roadmap.length === 0 ? (
                    <div className="tab-actions-card">
                      <p>Generate a structured study roadmap with actionable tasks for this syllabus.</p>
                      <button className="sh-action-btn" onClick={() => generateMaterials('roadmap')}>
                        Generate Roadmap
                      </button>
                    </div>
                  ) : (
                    <div className="roadmap-container">
                      <button className="sh-regenerate-btn" onClick={() => generateMaterials('roadmap')}>
                        Regenerate Roadmap
                      </button>
                      <div className="roadmap-milestones">
                        {roadmap.map((m, mIdx) => {
                          // Calculate completed tasks in this milestone
                          const totalTasksCount = m.tasks ? m.tasks.length : 0;
                          const completedCount = m.tasks ? m.tasks.filter((_, tIdx) => completedTasks[`${mIdx}-${tIdx}`]).length : 0;
                          const percent = totalTasksCount ? Math.round((completedCount / totalTasksCount) * 100) : 0;

                          return (
                            <div key={mIdx} className="roadmap-milestone-card">
                              <div className="milestone-header">
                                <div className="milestone-num">Milestone {mIdx + 1}</div>
                                <div className="milestone-percent">{percent}%</div>
                              </div>
                              <h4 className="milestone-title">{m.title}</h4>
                              <p className="milestone-desc">{m.description}</p>
                              
                              <div className="milestone-tasks-list">
                                {m.tasks && m.tasks.map((task, tIdx) => {
                                  const isChecked = !!completedTasks[`${mIdx}-${tIdx}`];
                                  return (
                                    <div 
                                      key={tIdx} 
                                      className={`milestone-task-item ${isChecked ? 'completed' : ''}`}
                                      onClick={() => toggleKanbanTask(mIdx, tIdx)}
                                    >
                                      <div className="task-checkbox">
                                        {isChecked && <Check size={10} />}
                                      </div>
                                      <span className="task-text">{task}</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          )}
        </div>
      </aside>
    </>
  );
}
