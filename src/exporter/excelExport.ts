/**
 * Excel export module using ExcelJS.
 * Supports single-sheet (default), multi-sheet (batch/city mode),
 * and multi-keyword batch (keyword → cities) exports.
 */

import ExcelJS from 'exceljs';
import path from 'path';
import logger from '../utils/logger';
import type { Business } from '../types';

/** Consistent column definition with Remarks column for marketing/calling */
const COLUMNS: Partial<ExcelJS.Column>[] = [
  { header: '#',         key: 'sno',       width: 6  },
  { header: 'Name',      key: 'name',      width: 35 },
  { header: 'Phone',     key: 'phone',     width: 22 },
  { header: 'Email',     key: 'email',     width: 35 },
  { header: 'Website',   key: 'website',   width: 45 },
  { header: 'Address',   key: 'address',   width: 50 },
  { header: 'Facebook',  key: 'facebook',  width: 30 },
  { header: 'Instagram', key: 'instagram', width: 30 },
  { header: 'Twitter/X', key: 'twitter',   width: 30 },
  { header: 'LinkedIn',  key: 'linkedin',  width: 30 },
  { header: 'Remarks',   key: 'remarks',   width: 40 },
];

/** Color palette for alternating tab colors in batch mode */
const TAB_COLORS: string[] = ['4472C4', '548235', 'BF8F00', 'C00000', '7030A0', '00B0F0'];

/**
 * Style a worksheet with headers, rows, borders, and frozen header.
 * Optimized: builds all rows in a single pass, applies styles in bulk.
 */
function populateWorksheet(worksheet: ExcelJS.Worksheet, data: Business[], keyword?: string, city?: string): void {
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

  // Add metadata row if keyword/city context is provided
  if (keyword || city) {
    const metaRow = worksheet.addRow({
      sno: '',
      name: `Keyword: ${keyword || 'N/A'}`,
      phone: `City: ${city || 'N/A'}`,
      email: `Scraped: ${new Date().toLocaleDateString()}`,
      website: `Total: ${data.length} leads`,
      address: '',
      remarks: '',
    });
    metaRow.font = { italic: true, color: { argb: '666666' }, size: 10 };
    metaRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'E8F0FE' },
    };
    metaRow.height = 20;
  }

  // Add data rows — single pass, O(n)
  data.forEach((item: Business, index: number) => {
    const row = worksheet.addRow({
      sno: index + 1,
      name: item.name || 'N/A',
      website: item.website || '',
      phone: item.phone || '',
      email: item.email || '',
      address: item.address || '',
      facebook: item.facebook || '',
      instagram: item.instagram || '',
      twitter: item.twitter || '',
      linkedin: item.linkedin || '',
      remarks: '',  // Empty remarks column for user notes
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

    // Style the Remarks column with a yellow background to make it stand out
    const remarksCell = row.getCell('remarks');
    remarksCell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFFDE7' },
    };
    remarksCell.border = {
      top: { style: 'thin', color: { argb: 'FFD54F' } },
      left: { style: 'thin', color: { argb: 'FFD54F' } },
      bottom: { style: 'thin', color: { argb: 'FFD54F' } },
      right: { style: 'thin', color: { argb: 'FFD54F' } },
    };
  });

  // Borders — single pass over all rows
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      if (!cell.border || !cell.border.top) {
        cell.border = {
          top: { style: 'thin', color: { argb: 'D9E2F3' } },
          left: { style: 'thin', color: { argb: 'D9E2F3' } },
          bottom: { style: 'thin', color: { argb: 'D9E2F3' } },
          right: { style: 'thin', color: { argb: 'D9E2F3' } },
        };
      }
    });
  });

  // Auto-fit column widths (single pass)
  worksheet.columns.forEach((col) => {
    let maxLen = (col.header as string)?.length || 10;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const val = cell.value ? cell.value.toString() : '';
      if (val.length > maxLen) maxLen = val.length;
    });
    col.width = Math.min(maxLen + 4, 60);
  });

  // Auto-filter on all columns for easy sorting/filtering
  const lastCol = COLUMNS.length;
  const lastRow = worksheet.rowCount;
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: lastRow, column: lastCol },
  };

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

    populateWorksheet(worksheet, data, undefined, city);
    logger.dim(`  Sheet "${sheetName}": ${data.length} entries`);
    sheetIndex++;
  }

  const resolvedPath = path.resolve(outputPath);
  await workbook.xlsx.writeFile(resolvedPath);
  logger.success(`Excel file saved: ${resolvedPath}`);
  return resolvedPath;
}

/**
 * Export multi-keyword × multi-city results.
 *
 * Structure: One .xlsx file per keyword, each file has one sheet per city.
 * This keeps files manageable and sheets organized for marketing teams.
 *
 * Returns: array of file paths created.
 *
 * Time complexity:  O(K * C * N)  where K=keywords, C=cities, N=avg leads per query
 * Space complexity: O(C * N)      only one keyword's data in memory at a time
 */
export async function exportMultiKeywordBatchToExcel(
  keywordCityDataMap: Map<string, Map<string, Business[]>>,
  outputPath: string,
): Promise<string[]> {
  const outputDir = path.dirname(path.resolve(outputPath));
  const baseName = path.basename(outputPath, '.xlsx');
  const createdFiles: string[] = [];

  for (const [keyword, cityDataMap] of keywordCityDataMap) {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Naseem Ansari (Gitnaseem745)';
    workbook.created = new Date();

    // Add summary sheet first
    const summarySheet = workbook.addWorksheet('Summary', {
      properties: { tabColor: { argb: 'FF6F00' } },
    });
    summarySheet.columns = [
      { header: '#', key: 'sno', width: 6 },
      { header: 'City', key: 'city', width: 25 },
      { header: 'Leads Found', key: 'count', width: 15 },
      { header: 'Keyword', key: 'keyword', width: 40 },
      { header: 'Status', key: 'status', width: 15 },
    ];
    const summaryHeaderRow = summarySheet.getRow(1);
    summaryHeaderRow.font = { bold: true, color: { argb: 'FFFFFF' }, size: 12 };
    summaryHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF6F00' } };
    summaryHeaderRow.alignment = { vertical: 'middle', horizontal: 'center' };
    summaryHeaderRow.height = 28;

    let sheetIndex = 0;
    let totalLeads = 0;
    let cityIndex = 0;

    for (const [city, data] of cityDataMap) {
      cityIndex++;
      totalLeads += data.length;

      // Add summary row
      summarySheet.addRow({
        sno: cityIndex,
        city: city.charAt(0).toUpperCase() + city.slice(1),
        count: data.length,
        keyword: keyword,
        status: data.length > 0 ? '✔ Done' : '⚠ Empty',
      });

      // Add city sheet with data
      const sheetName = sanitizeSheetName(city);
      const tabColor = TAB_COLORS[sheetIndex % TAB_COLORS.length];

      const worksheet = workbook.addWorksheet(sheetName, {
        properties: { tabColor: { argb: tabColor } },
      });

      populateWorksheet(worksheet, data, keyword, city);
      sheetIndex++;
    }

    // Add totals row to summary
    const totalsRow = summarySheet.addRow({
      sno: '',
      city: 'TOTAL',
      count: totalLeads,
      keyword: `${cityDataMap.size} cities`,
      status: '',
    });
    totalsRow.font = { bold: true, size: 12 };
    totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'E8F0FE' } };

    summarySheet.views = [{ state: 'frozen', ySplit: 1 }];

    // File name: base_keywordSlug.xlsx
    const keywordSlug = keyword
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .replace(/\s+/g, '_')
      .substring(0, 40)
      .toLowerCase();
    const fileName = `${baseName}_${keywordSlug}.xlsx`;
    const filePath = path.join(outputDir, fileName);

    await workbook.xlsx.writeFile(filePath);
    logger.dim(`  File "${fileName}": ${totalLeads} leads across ${cityDataMap.size} cities`);
    createdFiles.push(filePath);
  }

  return createdFiles;
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
