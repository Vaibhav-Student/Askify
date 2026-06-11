import { useState, useEffect } from 'react';
import { Terminal, Cpu, HardDrive, Sparkles, X, Activity, RefreshCw } from './Icons';

export default function AgentDashboard({ isOpen, onCloseDashboard, documents = [], totalChunks = 0, theme }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  
  // Mock live metrics that dynamically change slightly to simulate a real running agent
  const [latency, setLatency] = useState(142);
  const [cpuUsage, setCpuUsage] = useState(12.4);
  const [memoryUsage, setMemoryUsage] = useState(242);

  useEffect(() => {
    if (!isOpen) return;
    const interval = setInterval(() => {
      setLatency(prev => Math.max(80, Math.min(320, prev + Math.floor(Math.random() * 41) - 20)));
      setCpuUsage(prev => Math.max(5, Math.min(45, Number((prev + (Math.random() * 4 - 2)).toFixed(1)))));
      setMemoryUsage(prev => Math.max(200, Math.min(300, prev + Math.floor(Math.random() * 11) - 5)));
    }, 3000);
    return () => clearInterval(interval);
  }, [isOpen]);

  async function handleChunkSearch(e) {
    if (e) e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError('');
    try {
      const response = await fetch(`/api/documents/search?query=${encodeURIComponent(searchQuery.trim())}`);
      if (!response.ok) {
        throw new Error(`Search failed with status ${response.status}`);
      }
      const data = await response.json();
      setSearchResults(data.results || []);
      if (data.info) {
        setSearchError(data.info);
      }
    } catch (err) {
      setSearchError(err.message || 'Could not query vector database');
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <aside className={`agent-dashboard ${isOpen ? 'open' : ''}`}>
      <div className="dashboard-header">
        <div className="dashboard-title">
          <Terminal size={16} className="title-icon glow-purple" />
          <span>Agent Operations</span>
        </div>
        <button className="dashboard-close-btn" onClick={onCloseDashboard} title="Collapse Panel">
          <X size={16} />
        </button>
      </div>

      <div className="dashboard-content">
        {/* Section 1: System Telemetry */}
        <div className="dashboard-card">
          <div className="card-header">
            <Activity size={14} className="card-icon" />
            <span>Agent Operations Telemetry</span>
          </div>
          
          <div className="telemetry-grid">
            <div className="telemetry-item">
              <span className="telemetry-label">Latency</span>
              <span className="telemetry-value glow-text-purple">{latency}ms</span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-label">Memory Footprint</span>
              <span className="telemetry-value">{memoryUsage} MB</span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-label">CPU (Embedding)</span>
              <span className="telemetry-value">{cpuUsage}%</span>
            </div>
            <div className="telemetry-item">
              <span className="telemetry-label">Task Queue</span>
              <span className="telemetry-value status-idle">IDLE</span>
            </div>
          </div>
        </div>

        {/* Section 2: Model Specifications */}
        <div className="dashboard-card">
          <div className="card-header">
            <Cpu size={14} className="card-icon" />
            <span>Active Inference Spec</span>
          </div>
          
          <div className="model-spec-info">
            <div className="spec-row">
              <span className="spec-label">Provider</span>
              <span className="spec-value">NVIDIA NIM</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Active Model</span>
              <span className="spec-value highlight-text">Study AI</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Context Limit</span>
              <span className="spec-value">8,192 tokens</span>
            </div>
            <div className="spec-row">
              <span className="spec-label">Temperature</span>
              <span className="spec-value">1.0 (Strict Logic)</span>
            </div>
            
            <div className="capability-badges">
              <span className="spec-badge">Reasoning</span>
              <span className="spec-badge">Vector RAG</span>
              <span className="spec-badge">Agentic Loop</span>
              <span className="spec-badge">Fast NIM</span>
            </div>
          </div>
        </div>

        {/* Section 3: Knowledge Index Status */}
        <div className="dashboard-card">
          <div className="card-header">
            <HardDrive size={14} className="card-icon" />
            <span>Knowledge Index State</span>
          </div>
          
          <div className="index-info">
            <div className="index-stats">
              <div className="stat-circle">
                <span className="stat-number">{documents.length}</span>
                <span className="stat-label">Files</span>
              </div>
              <div className="stat-circle accent-circle">
                <span className="stat-number">{totalChunks}</span>
                <span className="stat-label">Chunks</span>
              </div>
            </div>
          </div>
        </div>

        {/* Section 4: FAISS Vector Chunk Browser */}
        <div className="dashboard-card chunk-browser-card">
          <div className="card-header">
            <Sparkles size={14} className="card-icon glow-gold" />
            <span>Vector Db Query Inspector</span>
          </div>
          
          <form onSubmit={handleChunkSearch} className="chunk-search-form">
            <input
              type="text"
              className="chunk-search-input"
              placeholder="Query FAISS similarity index..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            <button type="submit" className="chunk-search-btn" disabled={isSearching || !searchQuery.trim()}>
              {isSearching ? <RefreshCw size={12} className="spin" /> : 'Retrieve'}
            </button>
          </form>

          {searchError && <div className="chunk-error">{searchError}</div>}

          <div className="chunk-results-container">
            {searchResults.length === 0 ? (
              <div className="chunk-results-empty">
                <p>Enter a query above to inspect exact matched semantic chunks from FAISS database.</p>
              </div>
            ) : (
              searchResults.map((res, index) => (
                <div key={index} className="chunk-result-item">
                  <div className="chunk-result-header">
                    <span className="chunk-badge">Rank {index + 1}</span>
                    <span className="chunk-source" title={res.metadata?.source || 'Document text'}>
                      {res.metadata?.source || 'Global Index'}
                    </span>
                  </div>
                  <div className="chunk-result-body">
                    {res.content}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
