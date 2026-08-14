# PdfViewer module

This is a reusable PDF viewer module for React apps.

## Files

- `PdfViewer.jsx` - reusable viewer component with zoom and page navigation
- `PdfViewer.css` - styles for the viewer and demo
- `pdfService.js` - public OneDrive URL normalization helper
- `PdfViewerDemo.jsx` - example integration with clickable drawing codes
- `index.js` - exports the viewer

## Usage

Install dependencies:

```bash
npm install react-pdf pdfjs-dist
```

Import the component:

```jsx
import { PdfViewer } from './components/pdf-viewer';

function MyComponent() {
  return <PdfViewer pdfUrl="https://..." />;
}
```

## Dedicated demo page

The app includes a dedicated viewer page component at `PdfViewerPage.jsx` and a demo list at `PdfViewerDemo.jsx`.

```jsx
import PdfViewerPage from './components/pdf-viewer/PdfViewerPage';

export default function Page() {
  return <PdfViewerPage />;
}
```

## OneDrive links

For OneDrive public share links, the module attempts to normalize download URLs. If you have a short `1drv.ms` link, it uses the original URL.

## Portable module

To move this viewer into another React project, copy:

- `PdfViewer.jsx`
- `PdfViewer.css`
- `pdfService.js`
- `index.js`
- `PdfViewerDemo.jsx` (optional example)
- `PdfViewerPage.jsx` (optional route)

Then install:

```bash
npm install react-pdf pdfjs-dist
```

The only required dependency is `react-pdf` and `pdfjs-dist`.
