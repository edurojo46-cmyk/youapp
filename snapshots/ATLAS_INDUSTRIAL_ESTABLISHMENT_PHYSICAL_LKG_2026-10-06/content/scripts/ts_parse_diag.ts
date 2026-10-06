import * as fs from 'fs';
import ts from 'typescript';

const content = fs.readFileSync('src/pages/admin/atlas/AdminPersons.tsx', 'utf8');
const sf = ts.createSourceFile('AdminPersons.tsx', content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

sf.statements.forEach((stmt, idx) => {
  const { line: startLine } = sf.getLineAndCharacterOfPosition(stmt.getStart());
  const { line: endLine } = sf.getLineAndCharacterOfPosition(stmt.getEnd());
  console.log(`Statement ${idx}: kind=${ts.SyntaxKind[stmt.kind]} lines ${startLine + 1} to ${endLine + 1}`);
});
