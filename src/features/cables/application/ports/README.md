# Cable dispatch ports

## CableDispatchRepository

- `listForCable({ cableId, tag, areaId })`
- `create(dispatch)`
- `update(dispatchId, dispatch)`
- `remove(dispatchId)`

## CableDispatchExporter

- `exportHistory({ tag, dispatches })`

Database row mapping belongs to the Supabase adapter. Workbook labels and formatting belong to the XLSX adapter.

## CableScheduleRepository

- `listCircuitCables(areaId)`
- `listDispatchLengths(areaId)`
- `listCables({ areaId, filters, search, sort })`
- `listDispatchesForTag({ areaId, tag })`
- `getCableImpact({ cableId, areaId })`
- `renameCable(command)`
- `deleteCable(command)`
- `updateMeasurement(command)`
- `registerPatWeld(command)`
- `listMeasurementChanges(query)`
- `getDispatchExportData(areaId)`
- `getPatWeldExportData({ areaId, cableIds })`

The Supabase adapter reads in batches so dashboard results are not truncated by the PostgREST row limit.
