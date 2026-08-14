import React, { useMemo, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { normalizeOneDriveUrl } from './pdfService';
import './PdfViewer.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url);

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export default function PdfViewer({
  pdfUrl,
  initialPage = 1,
  initialScale = 1.25,
  minScale = 0.5,
  maxScale = 3,
  scaleStep = 0.25,
  onLoadError,
}) {
  const [numPages, setNumPages] = useState(null);
  const [pageNumber, setPageNumber] = useState(initialPage);
  const [scale, setScale] = useState(initialScale);
  const [loadError, setLoadError] = useState('');

  const normalizedUrl = useMemo(() => normalizeOneDriveUrl(pdfUrl), [pdfUrl]);

  const handleDocumentLoadSuccess = ({ numPages }) => {
    setNumPages(numPages);
    setPageNumber(initialPage <= numPages ? initialPage : 1);
    setLoadError('');
  };

  const handleDocumentLoadError = (error) => {
    const message = error?.message || 'Error cargando el PDF.';
    setLoadError(message);
    if (typeof onLoadError === 'function') {
      onLoadError(error);
    }
  };

  const zoomIn = () => setScale((current) => clamp(current + scaleStep, minScale, maxScale));
  const zoomOut = () => setScale((current) => clamp(current - scaleStep, minScale, maxScale));
  const previousPage = () => setPageNumber((current) => Math.max(current - 1, 1));
  const nextPage = () => setPageNumber((current) => Math.min(current + 1, numPages || current + 1));

  return (
    <div className="pdf-viewer-root">
      <div className="pdf-viewer-toolbar">
        <div className="pdf-viewer-group">
          <button type="button" onClick={zoomOut} disabled={scale <= minScale}>
            - Zoom
          </button>
          <span>{Math.round(scale * 100)}%</span>
          <button type="button" onClick={zoomIn} disabled={scale >= maxScale}>
            + Zoom
          </button>
        </div>

        <div className="pdf-viewer-group">
          <button type="button" onClick={previousPage} disabled={pageNumber <= 1}>
            Previous
          </button>
          <span>
            {pageNumber} / {numPages || '--'}
          </span>
          <button type="button" onClick={nextPage} disabled={!numPages || pageNumber >= numPages}>
            Next
          </button>
        </div>
      </div>

      <div className="pdf-viewer-frame">
        {!pdfUrl ? (
          <div className="pdf-viewer-placeholder">Select a drawing code to load the PDF.</div>
        ) : loadError ? (
          <div className="pdf-viewer-error">{loadError}</div>
        ) : (
          <Document
            file={normalizedUrl}
            loading={<div className="pdf-viewer-placeholder">Loading PDF...</div>}
            onLoadSuccess={handleDocumentLoadSuccess}
            onLoadError={handleDocumentLoadError}
            options={{ cMapUrl: 'cmaps/', cMapPacked: true }}
          >
            <Page pageNumber={pageNumber} scale={scale} className="pdf-viewer-page" />
          </Document>
        )}
      </div>
    </div>
  );
}
