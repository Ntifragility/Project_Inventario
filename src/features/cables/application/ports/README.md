# Cable dispatch ports

## CableDispatchRepository

- `listForCable({ cableId, tag, areaId })`
- `create(dispatch)`
- `update(dispatchId, dispatch)`
- `remove(dispatchId)`

## CableDispatchExporter

- `exportHistory({ tag, dispatches })`

Database row mapping belongs to the Supabase adapter. Workbook labels and formatting belong to the XLSX adapter.
