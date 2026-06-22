/* eslint-disable react-hooks/set-state-in-effect */
import { useState, useEffect } from 'react';
import { Save, Eye, EyeOff, RotateCcw, Sparkles } from './Icons';

export default function ApiKeyInput({ toolId, toolName, onSave, showNotification }) {
    const [apiKey, setApiKey] = useState('');
    const [showKey, setShowKey] = useState(false);
    const [hasKey, setHasKey] = useState(false);

    // Load key from localStorage on mount and when tool changes
    useEffect(() => {
        const storedKey = localStorage.getItem(`api_key_${toolId}`);
        if (storedKey) {
            setApiKey(storedKey);
            setHasKey(true);
        } else {
            setApiKey('');
            setHasKey(false);
        }
    }, [toolId]);

    function handleSaveKey() {
        if (!apiKey.trim()) return;
        try {
            localStorage.setItem(`api_key_${toolId}`, apiKey);
            setHasKey(true);
            showNotification(`${toolName} API Key saved securely`, 'success');
            if (onSave) onSave(apiKey);
        } catch {
            showNotification('Failed to save API Key locally', 'error');
        }
    }

    return (
        <div className="sb-section">
            <div className="sb-section-title">
                <Sparkles size={13} style={{ color: 'var(--accent-text)' }} />
                <span>{toolName} Key</span>
                {hasKey && (
                    <div className="sb-status-badge shimmer">
                        <span>Active</span>
                    </div>
                )}
            </div>
            <div className="sb-config-group">
                <div className="key-row">
                    <input
                        type={showKey ? "text" : "password"}
                        className="key-input"
                        placeholder="Paste sk-..."
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                    />
                    <button
                        className="key-toggle"
                        title={showKey ? "Hide Key" : "Show Key"}
                        onClick={() => setShowKey(!showKey)}
                      >
                        {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
                      </button>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <button
                        className="elite-btn elite-btn-primary"
                        onClick={handleSaveKey}
                        title="Save API Key"
                        style={{ width: '100%', padding: '10px' }}
                    >
                        <Save size={16} />
                        <span>Save Key</span>
                    </button>
                    
                    {hasKey && (
                        <button 
                            className="elite-btn elite-btn-ghost" 
                            onClick={() => {
                                localStorage.removeItem(`api_key_${toolId}`);
                                setApiKey('');
                                setHasKey(false);
                                showNotification(`${toolName} API Key cleared`, 'info');
                            }}
                            title="Reset Key"
                            style={{ width: '100%', padding: '8px', fontSize: '0.75rem', opacity: 0.8 }}
                        >
                            <RotateCcw size={14} />
                            <span>Reset Connection</span>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
