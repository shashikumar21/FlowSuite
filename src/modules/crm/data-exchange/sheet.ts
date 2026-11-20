// Thin wrapper so the rest of the CRM only dynamically imports the parts of
// SheetJS it needs. SheetJS 0.20.3 is vendored in /vendor (see package.json).
import { read, utils, writeFileXLSX } from 'xlsx'

export { read, utils, writeFileXLSX }
