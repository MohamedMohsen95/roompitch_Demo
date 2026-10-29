export function pdfPageCount(file: File): Promise<number>;
export function renderPdfPage(file: File, page: number, maxSide?: number): Promise<{dataUrl: string, w: number, h: number}>;
