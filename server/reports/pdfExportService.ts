import fs from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { CompanyProfileSettings } from '../phase03Types.js';
import { formatDateTimeISTServer, formatINRServer } from './reportDataEngine.js';
import { PdfExportOptions, ReportColumnDef, ReportDataset } from './reportTypes.js';

const FONT_LATIN_REGULAR = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
const FONT_LATIN_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';
const FONT_BENGALI_REGULAR = '/usr/share/fonts/truetype/noto/NotoSansBengali-Regular.ttf';
const FONT_BENGALI_BOLD = '/usr/share/fonts/truetype/noto/NotoSansBengali-Bold.ttf';

function mmToPt(mm: number): number {
  return (mm * 72) / 25.4;
}

function resolveLocalAssetBuffer(assetUrl?: string): Buffer | null {
  if (!assetUrl || !assetUrl.trim()) return null;
  const trimmed = assetUrl.trim();
  if (trimmed.startsWith('data:image/')) {
    const commaIdx = trimmed.indexOf(',');
    if (commaIdx !== -1) {
      try {
        return Buffer.from(trimmed.slice(commaIdx + 1), 'base64');
      } catch {
        return null;
      }
    }
  }
  if (trimmed.startsWith('/assets/')) {
    const candidate = path.resolve(process.cwd(), 'public', trimmed.replace(/^\/+/, ''));
    if (fs.existsSync(candidate)) {
      try {
        return fs.readFileSync(candidate);
      } catch {
        return null;
      }
    }
  }
  return null;
}

interface TextRun {
  text: string;
  isBengali: boolean;
}

function splitUnicodeRuns(input: string): TextRun[] {
  const str = String(input ?? '');
  if (!str) return [{ text: '', isBengali: false }];
  const regex = /([\u0980-\u09FF]+)|([^\u0980-\u09FF]+)/g;
  const runs: TextRun[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(str)) !== null) {
    if (m[1]) runs.push({ text: m[1], isBengali: true });
    else if (m[2]) runs.push({ text: m[2], isBengali: false });
  }
  return runs.length > 0 ? runs : [{ text: str, isBengali: false }];
}

function formatCellValue(col: ReportColumnDef, rawVal: unknown): string {
  if (rawVal === null || rawVal === undefined || rawVal === '') return '—';
  if (col.type === 'currency') {
    const n = Number(rawVal);
    return Number.isFinite(n) ? formatINRServer(n) : String(rawVal);
  }
  if (col.type === 'number') {
    const n = Number(rawVal);
    return Number.isFinite(n) ? new Intl.NumberFormat('en-IN').format(n) : String(rawVal);
  }
  return String(rawVal);
}

export async function generatePdfBuffer(
  datasets: ReportDataset[],
  company: CompanyProfileSettings,
  options: PdfExportOptions = {}
): Promise<Buffer> {
  if (!datasets || datasets.length === 0) {
    throw new Error('At least one report dataset is required to generate PDF.');
  }

  const hasLatin = fs.existsSync(FONT_LATIN_REGULAR) && fs.existsSync(FONT_LATIN_BOLD);
  const hasBengali = fs.existsSync(FONT_BENGALI_REGULAR) && fs.existsSync(FONT_BENGALI_BOLD);

  let size: [number, number] | 'A4' | 'A5' = options.pageSize === 'A5' ? 'A5' : 'A4';
  if (options.pageSize === 'CUSTOM') {
    const wMm = Math.min(Math.max(Number(options.customWidthMm) || 210, 100), 600);
    const hMm = Math.min(Math.max(Number(options.customHeightMm) || 297, 120), 800);
    size = [mmToPt(wMm), mmToPt(hMm)];
  }
  const layout = options.orientation === 'landscape' ? 'landscape' : 'portrait';

  const docOptions: PDFKit.PDFDocumentOptions = {
    size,
    layout,
    margin: 34,
    bufferPages: true,
    info: {
      Title:
        datasets.length === 1
          ? datasets[0].title
          : `${company.companyName} - Combined Business Reports (${datasets.length})`,
      Author: company.companyName,
      Subject: `MUN COMPUTER BUSINESS MANAGER — Phase 07 Report`,
      Creator: 'MUN COMPUTER BUSINESS MANAGER',
    },
  };

  if (options.password && options.password.trim().length > 0) {
    const pwd = options.password.trim();
    docOptions.userPassword = pwd;
    docOptions.ownerPassword = `${pwd}#MUN_ADMIN`;
    docOptions.permissions = {
      printing: 'highResolution',
      modifying: false,
      copying: false,
      annotating: false,
      fillingForms: false,
      contentAccessibility: true,
      documentAssembly: false,
    };
  }

  const doc = new PDFDocument(docOptions);

  if (hasLatin) {
    doc.registerFont('LatinRegular', FONT_LATIN_REGULAR);
    doc.registerFont('LatinBold', FONT_LATIN_BOLD);
  }
  if (hasBengali) {
    doc.registerFont('BengaliRegular', FONT_BENGALI_REGULAR);
    doc.registerFont('BengaliBold', FONT_BENGALI_BOLD);
  }

  const getFont = (bold: boolean, isBengali: boolean): string => {
    if (isBengali && hasBengali) return bold ? 'BengaliBold' : 'BengaliRegular';
    if (hasLatin) return bold ? 'LatinBold' : 'LatinRegular';
    return bold ? 'Helvetica-Bold' : 'Helvetica';
  };

  const drawText = (
    text: string,
    x: number,
    y: number,
    opts: {
      width?: number;
      align?: 'left' | 'center' | 'right';
      bold?: boolean;
      size?: number;
      color?: string;
      ellipsis?: boolean;
    } = {}
  ) => {
    const bold = Boolean(opts.bold);
    const fontSize = opts.size ?? 8.5;
    const color = opts.color ?? '#0f172a';
    const runs = splitUnicodeRuns(text);

    doc.fillColor(color).fontSize(fontSize);

    if (runs.length === 1) {
      doc.font(getFont(bold, runs[0].isBengali));
      doc.text(runs[0].text, x, y, {
        width: opts.width,
        align: opts.align ?? 'left',
        lineBreak: true,
        ellipsis: opts.ellipsis,
      });
      return;
    }

    runs.forEach((run, idx) => {
      const isLast = idx === runs.length - 1;
      doc.font(getFont(bold, run.isBengali));
      if (idx === 0) {
        doc.text(run.text, x, y, {
          width: opts.width,
          align: opts.align ?? 'left',
          continued: !isLast,
        });
      } else {
        doc.text(run.text, { continued: !isLast });
      }
    });
  };

  const chunks: Buffer[] = [];
  const bufferPromise = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));
  });

  const logoBuf = options.includeLogo !== false ? resolveLocalAssetBuffer(company.logoUrl) : null;
  const sigBuf = options.includeSignature ? resolveLocalAssetBuffer(company.signatureUrl) : null;
  const stampBuf = options.includeStamp ? resolveLocalAssetBuffer(company.stampUrl) : null;

  const isBn = options.language === 'bn';

  const drawWatermark = () => {
    if (!options.includeWatermark) return;
    const wmText = options.watermarkText?.trim() || company.companyName || 'CONFIDENTIAL';
    doc.save();
    doc.opacity(0.06);
    doc.font(getFont(true, false)).fontSize(42).fillColor('#0f172a');
    doc.rotate(-32, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.text(wmText, 40, doc.page.height / 2 - 20, {
      width: doc.page.width - 80,
      align: 'center',
    });
    doc.restore();
    doc.opacity(1);
  };

  const drawPageHeader = (ds: ReportDataset) => {
    drawWatermark();
    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    let y = 26;

    if (logoBuf) {
      try {
        doc.image(logoBuf, left, y, { fit: [38, 38] });
      } catch {
        // Ignore invalid image bytes
      }
    }

    const textStartX = logoBuf ? left + 48 : left;
    const textWidth = contentWidth - (logoBuf ? 48 : 0);

    drawText(company.companyName || 'MUN COMPUTER', textStartX, y, {
      width: textWidth,
      bold: true,
      size: 13,
      color: '#09090b',
    });

    const addressParts = [
      company.addressLine,
      company.postOffice ? `P.O: ${company.postOffice}` : '',
      company.policeStation ? `P.S: ${company.policeStation}` : '',
      company.district,
      company.stateName,
      company.pinCode ? `PIN: ${company.pinCode}` : '',
    ].filter(Boolean);

    drawText(addressParts.join(', '), textStartX, y + 16, {
      width: textWidth,
      size: 7.5,
      color: '#475569',
    });

    const contactParts = [
      company.mobile ? `Mob: ${company.mobile}` : '',
      company.email ? `Email: ${company.email}` : '',
      company.gstNumber ? `GSTIN: ${company.gstNumber}` : '',
      company.panNumber ? `PAN: ${company.panNumber}` : '',
    ].filter(Boolean);

    drawText(contactParts.join('  |  '), textStartX, y + 26, {
      width: textWidth,
      size: 7.5,
      color: '#475569',
    });

    y += 44;
    doc
      .moveTo(left, y)
      .lineTo(left + contentWidth, y)
      .lineWidth(1.2)
      .strokeColor('#0f172a')
      .stroke();

    y += 8;
    const reportTitle = isBn && ds.titleBn ? `${ds.titleBn} (${ds.title})` : ds.title;
    drawText(reportTitle, left, y, {
      width: contentWidth,
      bold: true,
      size: 11,
      color: '#0f172a',
    });

    y += 15;
    drawText(
      `FY: ${ds.financialYear}  |  Period: ${ds.dateRangeLabel}  |  Generated: ${ds.generatedAt}  |  By: ${ds.generatedBy}`,
      left,
      y,
      { width: contentWidth, size: 7.5, color: '#475569' }
    );

    if (ds.subtitle) {
      y += 11;
      drawText(ds.subtitle, left, y, { width: contentWidth, size: 7.5, color: '#64748b' });
    }

    doc.y = y + 16;
  };

  datasets.forEach((ds, dsIdx) => {
    if (dsIdx > 0) doc.addPage();
    drawPageHeader(ds);

    const left = doc.page.margins.left;
    const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const bottomLimit = doc.page.height - 64;

    // Summary KPI strip
    if (ds.summaryCards && ds.summaryCards.length > 0) {
      const cards = ds.summaryCards.slice(0, 4);
      const cardGap = 6;
      const cardW = (contentWidth - cardGap * (cards.length - 1)) / cards.length;
      const cardY = doc.y;
      cards.forEach((card, idx) => {
        const cx = left + idx * (cardW + cardGap);
        doc
          .rect(cx, cardY, cardW, 34)
          .fillAndStroke('#f8fafc', '#cbd5e1');
        drawText(card.label, cx + 6, cardY + 5, { width: cardW - 12, size: 6.8, color: '#475569' });
        drawText(card.value, cx + 6, cardY + 15, {
          width: cardW - 12,
          bold: true,
          size: 8.8,
          color: '#0f172a',
        });
      });
      doc.y = cardY + 42;
    }

    // Table column widths (cap visible columns gracefully on narrow pages while keeping essential data)
    const cols = ds.columns;
    const weights = cols.map((c) => {
      if (c.type === 'currency') return 1.25;
      if (c.type === 'date') return 1.05;
      if (c.type === 'number') return 0.85;
      if (c.key.toLowerCase().includes('name') || c.key.toLowerCase().includes('title')) return 1.5;
      return 1.1;
    });
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
    const colWidths = weights.map((w) => (w / totalWeight) * contentWidth);

    const drawTableHeader = (yPos: number): number => {
      const headerH = 22;
      doc.rect(left, yPos, contentWidth, headerH).fill('#0f172a');
      let cx = left;
      cols.forEach((col, i) => {
        const w = colWidths[i];
        const headerLabel = isBn && col.labelBn ? col.labelBn : col.label;
        drawText(headerLabel, cx + 3, yPos + 6, {
          width: Math.max(w - 6, 12),
          align: col.align ?? 'left',
          bold: true,
          size: cols.length > 8 ? 6.5 : 7.3,
          color: '#ffffff',
        });
        cx += w;
      });
      return yPos + headerH;
    };

    let cursorY = drawTableHeader(doc.y);

    if (ds.rows.length === 0) {
      doc.rect(left, cursorY, contentWidth, 24).fillAndStroke('#ffffff', '#e2e8f0');
      drawText('No records match the selected criteria.', left + 8, cursorY + 7, {
        width: contentWidth - 16,
        size: 8,
        color: '#64748b',
      });
      cursorY += 26;
    } else {
      ds.rows.forEach((row, rIdx) => {
        const rowH = 19;
        if (cursorY + rowH > bottomLimit) {
          doc.addPage();
          drawPageHeader(ds);
          cursorY = drawTableHeader(doc.y);
        }
        const isSubtotal =
          typeof row[cols[0]?.key] === 'string' &&
          String(row[cols[0].key]).startsWith('Subtotal');
        const bg = isSubtotal ? '#e2e8f0' : rIdx % 2 === 1 ? '#f8fafc' : '#ffffff';
        doc.rect(left, cursorY, contentWidth, rowH).fill(bg);
        doc
          .moveTo(left, cursorY + rowH)
          .lineTo(left + contentWidth, cursorY + rowH)
          .lineWidth(0.4)
          .strokeColor('#cbd5e1')
          .stroke();

        let cx = left;
        cols.forEach((col, i) => {
          const w = colWidths[i];
          const text = formatCellValue(col, row[col.key]);
          drawText(text, cx + 3, cursorY + 5, {
            width: Math.max(w - 6, 12),
            align: col.align ?? 'left',
            bold: isSubtotal,
            size: cols.length > 8 ? 6.4 : 7.2,
            color: '#0f172a',
            ellipsis: true,
          });
          cx += w;
        });
        cursorY += rowH;
      });
    }

    // Grand totals row if any numeric totals
    const hasNumericTotals = cols.some((c) => ds.totals[c.key] !== undefined);
    if (hasNumericTotals) {
      if (cursorY + 22 > bottomLimit) {
        doc.addPage();
        drawPageHeader(ds);
        cursorY = drawTableHeader(doc.y);
      }
      doc.rect(left, cursorY, contentWidth, 20).fill('#e2e8f0');
      let cx = left;
      cols.forEach((col, i) => {
        const w = colWidths[i];
        let label = '';
        if (i === 0) label = `TOTAL (${ds.rows.length} rows)`;
        else if (ds.totals[col.key] !== undefined) {
          label = formatCellValue(col, ds.totals[col.key]);
        }
        drawText(label, cx + 3, cursorY + 6, {
          width: Math.max(w - 6, 12),
          align: col.align ?? 'left',
          bold: true,
          size: cols.length > 8 ? 6.5 : 7.3,
          color: '#0f172a',
        });
        cx += w;
      });
      cursorY += 24;
    }

    // Notes block
    if (ds.notes && ds.notes.length > 0) {
      if (cursorY + 28 > bottomLimit) {
        doc.addPage();
        drawPageHeader(ds);
        cursorY = doc.y;
      }
      ds.notes.forEach((note) => {
        drawText(`Note: ${note}`, left, cursorY, { width: contentWidth, size: 7, color: '#475569' });
        cursorY += 11;
      });
    }

    // Optional Signature & Stamp block on last page of dataset
    if ((sigBuf || stampBuf) && cursorY + 55 <= doc.page.height - 40) {
      const signY = Math.max(cursorY + 10, doc.page.height - 96);
      if (stampBuf) {
        try {
          doc.image(stampBuf, left + contentWidth - 170, signY, { fit: [48, 42] });
        } catch {
          // ignore
        }
      }
      if (sigBuf) {
        try {
          doc.image(sigBuf, left + contentWidth - 105, signY, { fit: [85, 34] });
        } catch {
          // ignore
        }
      }
      drawText('Authorised Signatory', left + contentWidth - 115, signY + 36, {
        width: 115,
        align: 'center',
        bold: true,
        size: 7.2,
        color: '#0f172a',
      });
    }
  });

  // Page X of Y numbering across every buffered page
  const pageRange = doc.bufferedPageRange();
  const totalPages = pageRange.count;
  const generatedStamp = formatDateTimeISTServer(new Date());

  for (let i = 0; i < totalPages; i++) {
    doc.switchToPage(pageRange.start + i);
    const left = doc.page.margins.left;
    const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const footerY = doc.page.height - 28;

    doc
      .moveTo(left, footerY - 4)
      .lineTo(left + width, footerY - 4)
      .lineWidth(0.5)
      .strokeColor('#cbd5e1')
      .stroke();

    drawText(
      `${company.companyName || 'MUN COMPUTER'}  ·  Official Business Report  ·  ${generatedStamp}`,
      left,
      footerY,
      { width: width * 0.72, size: 7, color: '#64748b' }
    );
    drawText(`Page ${i + 1} of ${totalPages}`, left + width * 0.72, footerY, {
      width: width * 0.28,
      align: 'right',
      bold: true,
      size: 7.2,
      color: '#0f172a',
    });
  }

  doc.end();
  return bufferPromise;
}
