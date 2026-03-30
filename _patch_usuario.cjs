const fs = require('fs');
const p = 'src/pages/UsuarioDashboard.tsx';
let c = fs.readFileSync(p, 'utf8');

// Find exact old block
const marker1 = 'destino fora da sub-arvore da mae';
const marker2 = 'ate achar o primeiro ancestral com pastor cuja sub-arvore inclua o destino';

const idx1 = c.indexOf(marker1);
const idx2 = c.indexOf(marker2);

if (idx1 < 0 || idx2 < 0) {
  console.log('ERROR: markers not found', idx1, idx2);
  process.exit(1);
}

// Find start of line containing marker1
let lineStart = c.lastIndexOf('\n', idx1) + 1;
// Find end of line containing marker2
let lineEnd = c.indexOf('\n', idx2);
if (lineEnd < 0) lineEnd = c.length;

const oldBlock = c.substring(lineStart, lineEnd);
console.log('OLD BLOCK:', JSON.stringify(oldBlock).substring(0, 200));

const newBlock = `    // ─── REGRA DE IRMAS ────────────────────────────────────────────────────────\r
    // Comentario: se a origem (signerChurch) e o destino compartilham a MESMA MAE\r
    // (mesmo parent_totvs_id), sao irmas na hierarquia.\r
    // Nesse caso, a carta sai com a propria igreja (signerChurch) como origem,\r
    // sem precisar subir para o ancestral comum.\r
    // Ex.: Central A (mae: Estadual X) para Central B (mae: Estadual X) = origem Central A.\r
    // Ex.: Setorial Y (mae: Estadual X) para Setorial Z (mae: Estadual X) = origem Setorial Y.\r
    const destChurchData = rawScopeChurches.find((c) => String(c.totvs_id || "") === destId);\r
    const signerParent = String(signerChurch.parent_totvs_id || "");\r
    const destParent = String(destChurchData?.parent_totvs_id || "");\r
    if (signerParent && destParent && signerParent === destParent) {\r
      return {\r
        name: signerChurch.church_name || session?.church_name || "",\r
        totvs: String(signerChurch.totvs_id || "") || String(session?.totvs_id || ""),\r
      };\r
    }\r
    // ─── FIM REGRA DE IRMAS ────────────────────────────────────────────────────\r
    // Comentario: destino em ramo diferente (mae diferente). Sobe pela ancestorChain\r
    // ate achar o primeiro ancestral com pastor cuja sub-arvore inclua o destino.\r
    // Ex.: Central A (mae: Estadual X) para Central C (mae: Setorial Y) = origem Estadual X.`;

c = c.substring(0, lineStart) + newBlock + c.substring(lineEnd);
fs.writeFileSync(p, c, 'utf8');
console.log('OK: UsuarioDashboard.tsx patched successfully');
