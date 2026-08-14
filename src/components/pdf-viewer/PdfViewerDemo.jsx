import React, { useMemo, useState } from 'react';
import { PdfViewer } from './index';
import './PdfViewer.css';

const exampleDrawings = [
  {
    code: 'DRWG-101',
    description: 'Main electrical layout',
    pdfUrl: 'https://file-examples-com.github.io/uploads/2017/10/file-sample_150kB.pdf',
  },
  {
    code: 'DRWG-202',
    description: 'Panel wiring diagram',
    pdfUrl: 'https://file-examples-com.github.io/uploads/2017/10/file-example_PDF_1MB.pdf',
  },
  {
    code: 'DRWG-303',
    description: 'Cable tray detail',
    pdfUrl: 'https://file-examples-com.github.io/uploads/2017/10/file-example_PDF_500_kB.pdf',
  },
];

export default function PdfViewerDemo() {
  const [selectedDrawing, setSelectedDrawing] = useState(exampleDrawings[0]);

  const tableRows = useMemo(
    () =>
      exampleDrawings.map((drawing) => (
        <tr key={drawing.code}>
          <td>
            <button
              type="button"
              className={drawing.code === selectedDrawing.code ? 'pdf-demo-link active' : 'pdf-demo-link'}
              onClick={() => setSelectedDrawing(drawing)}
            >
              {drawing.code}
            </button>
          </td>
          <td>{drawing.description}</td>
        </tr>
      )),
    [selectedDrawing]
  );

  return (
    <div className="pdf-demo-container">
      <h2>PDF Viewer Demo</h2>
      <p>
        Click a drawing code to load its PDF. Replace the example URLs with your OneDrive public share links for your
        drawing repository.
      </p>

      <table className="pdf-demo-table">
        <thead>
          <tr>
            <th>Drawing Code</th>
            <th>Description</th>
          </tr>
        </thead>
        <tbody>{tableRows}</tbody>
      </table>

      <div className="pdf-demo-viewer">
        <h3>Selected: {selectedDrawing.code}</h3>
        <PdfViewer pdfUrl={selectedDrawing.pdfUrl} />
      </div>
    </div>
  );
}
