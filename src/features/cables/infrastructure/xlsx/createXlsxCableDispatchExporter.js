import * as XLSX from 'xlsx';

export function createXlsxCableDispatchExporter() {
  return {
    exportHistory({ tag, dispatches }) {
      const rows = dispatches.map((item, index) => ({
        'N°': index + 1,
        'TAG ÚNICO': tag,
        'FECHA DE DESPACHO': item.fecha_entrega ? item.fecha_entrega.slice(0, 10) : '—',
        'VALE (N° Vale Almacén)': item.vale_almacen || '—',
        'METRADO DESPACHADO (m)': Number.parseFloat(item.longitud_despachada_m || 0),
        'RECIBIDO POR': item.solicitado_por || '—',
        'COMENTARIOS': item.observaciones || '—',
        'REGISTRADO POR': item.created_by_name || 'Registro anterior',
        'FECHA DE REGISTRO': item.created_at
          ? new Date(item.created_at).toLocaleString('es-PE', { timeZone: 'America/Lima' })
          : '—',
      }));

      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 6 }, { wch: 22 }, { wch: 20 }, { wch: 22 }, { wch: 24 },
        { wch: 26 }, { wch: 42 }, { wch: 26 }, { wch: 22 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Despachos');
      const today = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Despachos_${tag}_${today}.xlsx`);
    },
  };
}
