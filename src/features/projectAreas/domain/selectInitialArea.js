export function selectInitialArea(areas, savedAreaId) {
  if (!Array.isArray(areas) || areas.length === 0) return null;
  return areas.find(area => area.id === savedAreaId)
    || areas.find(area => area.code === 'SECA')
    || areas[0];
}
