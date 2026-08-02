import React from 'react';
import { MapPin } from 'lucide-react';
import { useProjectArea } from '../contexts/ProjectAreaContext';

export default function ProjectAreaSelector({ onAreaChange, compact = false }) {
  const {
    isAdmin,
    availableAreas,
    activeArea,
    setActiveArea
  } = useProjectArea();

  const handleChange = (event) => {
    const nextAreaId = event.target.value;
    if (!nextAreaId || nextAreaId === activeArea.id) return;

    const changed = setActiveArea(nextAreaId);
    if (changed) onAreaChange?.(nextAreaId);
  };

  return (
    <div className={`project-area-control ${compact ? 'compact' : ''}`}>
      <MapPin size={compact ? 15 : 17} aria-hidden="true" />
      <div className="project-area-control-text">
        {!compact && <span className="project-area-control-label">Área de trabajo</span>}
        {isAdmin && availableAreas.length > 1 ? (
          <select
            className="project-area-select"
            value={activeArea.id}
            onChange={handleChange}
            aria-label="Seleccionar área de trabajo"
          >
            {availableAreas.map((area) => (
              <option key={area.id} value={area.id}>{area.name}</option>
            ))}
          </select>
        ) : (
          <span className="project-area-fixed">{activeArea.name}</span>
        )}
      </div>
    </div>
  );
}
