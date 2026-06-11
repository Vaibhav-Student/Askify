import { AI_TOOLS } from '../config/toolsData';

export default function ModelSelector({ selectedToolId, selectedModelId, onModelChange }) {
    const activeTool = AI_TOOLS.find(t => t.id === selectedToolId) || AI_TOOLS[0];
    const activeModel = activeTool.models.find(m => m.id === selectedModelId);

    return (
        <div className="selector-container" style={{ marginTop: '14px' }}>
            <label className="selector-label" htmlFor="model-select">Model</label>
            <select
                id="model-select"
                className="form-select"
                value={selectedModelId}
                onChange={(e) => onModelChange(e.target.value)}
                aria-label="Select Model"
            >
                {activeTool.models.map(model => (
                    <option key={model.id} value={model.id}>
                        {model.name}
                    </option>
                ))}
            </select>
        </div>
    );
}
