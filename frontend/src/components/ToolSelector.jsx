import { AI_TOOLS } from '../config/toolsData';

export default function ToolSelector({ selectedToolId, onToolChange }) {
    return (
        <div className="selector-container">
            <label className="selector-label" htmlFor="tool-select">AI Provider</label>
            <select
                id="tool-select"
                className="form-select"
                value={selectedToolId}
                onChange={(e) => onToolChange(e.target.value)}
                aria-label="Select AI Provider"
            >
                {AI_TOOLS.map(tool => (
                    <option key={tool.id} value={tool.id}>
                        {tool.icon}  {tool.name}
                    </option>
                ))}
            </select>
        </div>
    );
}
