/**
 * Excel export module using ExcelJS.
 * Supports single-sheet (default) and multi-sheet (batch/city mode) exports.
 */

import ExcelJS from 'exceljs';
import path from 'path';
import logger from '../utils/logger';
import type { Business } from '../types';

/** Consistent column definition */
const COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: 'Name', key: 'name', width: 35 },
  { header: 'Website', key: 'website', width: 45 },
  { header: 'Phone', key: 'phone', width: 22 },
  { header: 'Email', key: 'email', width: 35 },
  { header: 'Address', key: 'address', width: 50 },
  { header: 'Facebook', key: 'facebook', width: 30 },
  { header: 'Instagram', key: 'instagram', width: 30 },
  { header: 'Twitter/X', key: 'twitter', width: 30 },
  { header: 'LinkedIn', key: 'linkedin', width: 30 },
];

/** Color palette for alternating tab colors in batch mode */
const TAB_COLORS: string[] = ['4472C4', '548235', 'BF8F00', 'C00000', '7030A0', '00B0F0'];

/**
 * Style a worksheet with headers, rows, borders, and frozen header.
 */
function populateWorksheet(worksheet: ExcelJS.Worksheet, data: Business[]): void {
  // Define columns
  worksheet.columns = COLUMNS.map((c) => ({ ...c }));

  // Style header row
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 12 };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: '4472C4' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' };
  headerRow.height = 28;

  // Add data rows
  data.forEach((item: Business, index: number) => {
    const row = worksheet.addRow({
      name: item.name || 'N/A',
      website: item.website || '',
      phone: item.phone || '',
      email: item.email || '',
      address: item.address || '',
    });

    // Alternate row colors
    if (index % 2 === 0) {
      row.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'F2F7FC' },
      };
    }

    row.alignment = { vertical: 'middle' };
    row.height = 22;

    // Clickable website hyperlink
    if (item.website) {
      const websiteCell = row.getCell('website');
      websiteCell.value = { text: item.website, hyperlink: item.website } as ExcelJS.CellHyperlinkValue;
      websiteCell.font = { color: { argb: '0563C1' }, underline: true };
    }

    // Clickable email hyperlink
    if (item.email) {
      const emailCell = row.getCell('email');
      emailCell.value = { text: item.email, hyperlink: `mailto:${item.email}` } as ExcelJS.CellHyperlinkValue;
      emailCell.font = { color: { argb: '0563C1' }, underline: true };
    }
  });

  // Borders
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'D9E2F3' } },
        left: { style: 'thin', color: { argb: 'D9E2F3' } },
        bottom: { style: 'thin', color: { argb: 'D9E2F3' } },
        right: { style: 'thin', color: { argb: 'D9E2F3' } },
      };
    });
  });

  // Auto-fit column widths
  worksheet.columns.forEach((col) => {
    let maxLen = (col.header as string)?.length || 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const val = cell.value ? cell.value.toString() : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    col.width = Math.min(maxLen + 4, 60);
  });

  // Freeze header row
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
}

/**
 * Export business data to an Excel (.xlsx) file — single sheet mode.
 */
export async function exportToExcel(data: Business[], outputPath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Naseem Ansari (Gitnaseem745)';
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet('Results', {
    properties: { tabColor: { argb: '4472C4' } },
  });

  populateWorksheet(worksheet, data);

  const resolvedPath = path.resolve(outputPath);
  await workbook.xlsx.writeFile(resolvedPath);
  logger.success(`Excel file saved: ${resolvedPath}`);
  return resolvedPath;
}

/**
 * Export batch results to an Excel file — one sheet per city.
 */
export async function exportBatchToExcel(cityDataMap: Map<string, Business[]>, outputPath: string): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Naseem Ansari (Gitnaseem745)';
  workbook.created = new Date();

  let sheetIndex = 0;
  for (const [city, data] of cityDataMap) {
    // Excel sheet name max 31 chars, no special chars
    const sheetName = sanitizeSheetName(city);
    const tabColor = TAB_COLORS[sheetIndex % TAB_COLORS.length];

    const worksheet = workbook.addWorksheet(sheetName, {
      properties: { tabColor: { argb: tabColor } },
    });

    populateWorksheet(worksheet, data);
    logger.dim(`  Sheet "${sheetName}": ${data.length} entries`);
    sheetIndex++;
  }

  const resolvedPath = path.resolve(outputPath);
  await workbook.xlsx.writeFile(resolvedPath);
  logger.success(`Excel file saved: ${resolvedPath}`);
  return resolvedPath;
}

/**
 * Sanitize a string for use as an Excel sheet name.
 * Max 31 characters, no [ ] * ? / \
 */
function sanitizeSheetName(name: string): string {
  let sanitized = name
    .replace(/[[\]*?/\\]/g, '')
    .replace(/:/g, '-')
    .trim();
  // Capitalize first letter of each word
  sanitized = sanitized
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
  return sanitized.substring(0, 31) || 'Sheet';
}
