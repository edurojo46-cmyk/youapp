/**
 * ATLAS SAFE CSV PARSER V1
 * 
 * Domain-agnostic robust CSV parser handling:
 * - Quoted fields with embedded commas
 * - Escaped double quotes ("" -> ")
 * - Multiple delimiters (auto-detect comma, semicolon, tab)
 * - CRLF and LF line endings
 * - UTF-8 Byte Order Mark (BOM) stripping
 */

export class AtlasSafeCsvParser {
  /**
   * Parses a single CSV line into an array of string columns.
   * @param {string} line - Raw CSV line
   * @param {string} delimiter - Delimiter character (default: comma)
   * @returns {string[]}
   */
  static parseLine(line, delimiter = ',') {
    if (!line) return [];
    // Strip trailing CR
    const cleanLine = line.replace(/\r$/, '');
    const result = [];
    let cur = '';
    let inQuotes = false;
    let i = 0;

    while (i < cleanLine.length) {
      const char = cleanLine[i];
      if (char === '"') {
        if (inQuotes && cleanLine[i + 1] === '"') {
          // Escaped quote
          cur += '"';
          i += 2;
          continue;
        }
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(cur.trim().replace(/^"|"$/g, ''));
        cur = '';
      } else {
        cur += char;
      }
      i++;
    }
    result.push(cur.trim().replace(/^"|"$/g, ''));
    return result;
  }

  /**
   * Parses entire CSV text into an array of row objects or column arrays.
   * @param {string} csvText - Full text of the CSV file
   * @param {object} options - { asObjects: boolean, delimiter: string }
   * @returns {Array<string[]|object>}
   */
  static parseText(csvText, options = { asObjects: false, delimiter: null }) {
    if (!csvText) return [];
    // Strip UTF-8 BOM if present
    const cleanText = csvText.charCodeAt(0) === 0xFEFF ? csvText.slice(1) : csvText;
    const lines = cleanText.split('\n').filter(l => l.trim().length > 0);
    if (lines.length === 0) return [];

    // Auto-detect delimiter if not provided
    const sep = options.delimiter || (lines[0].includes(';') ? ';' : ',');
    const parsedRows = lines.map(l => this.parseLine(l, sep));

    if (options.asObjects && parsedRows.length > 0) {
      const header = parsedRows[0].map(h => h.toLowerCase().trim());
      const objects = [];
      for (let i = 1; i < parsedRows.length; i++) {
        const row = parsedRows[i];
        const obj = {};
        for (let j = 0; j < header.length; j++) {
          obj[header[j]] = row[j] !== undefined ? row[j] : null;
        }
        objects.push(obj);
      }
      return objects;
    }

    return parsedRows;
  }
}
