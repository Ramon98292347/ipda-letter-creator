const fs = require('fs');
const p = 'src/components/admin/PastorLetterDialog.tsx';
let c = fs.readFileSync(p, 'utf8');

// Find the old block in computedOrigin
const marker1 = 'sobe pela ancestorChain ate achar ancestral cuja sub-arvore inclua o destino';

const idx1 = c.indexOf(marker1);

if (idx1 < 0) {
  console.log('ERROR: marker not found');
  process.exit(1);
}

// Find start of line containing marker1
let lineStart = c.lastIndexOf('\n', idx1) + 1;
// Find end of line containing marker1
let lineEnd = c.indexOf('\n', idx1);

const oldLine = c.substring(lineStart, lineEnd);
console.log('OLD:', JSON.stringify(oldLine).substring(0, 120));

const newBlock = `    // ─── REGRA DE IRMAS ────────────────────────────────────────────────────────
    // Comentario: se a origem (signerChurch) e o destino compartilham a MESMA MAE
    // (mesmo parent_totvs_id), sao irmas na hierarquia.
    // Nesse caso, a carta sai com a propria igreja (signerChurch) como origem,
    // sem precisar subir para o ancestral comum.
    // Ex.: Central A (mae: Estadual X) para Central B (mae: Estadual X) = origem Central A.
    // Ex.: Setorial Y (mae: Estadual X) para Setorial Z (mae: Estadual X) = origem Setorial Y.
    const signerParent = String(signerChurch.parent_totvs_id || "");
    const destParentId = String(destino?.parentTotvsId || "");
    if (signerParent && destParentId && signerParent === destParentId) {
      return { name: signerChurch.church_name, totvs: signerChurch.totvs_id };
    }
    // ─── FIM REGRA DE IRMAS ────────────────────────────────────────────────────
    // Comentario: destino em ramo diferente (mae diferente). Sobe pela ancestorChain
    // ate achar ancestral com pastor cuja sub-arvore inclua o destino.
    // Ex.: Central A (mae: Estadual X) para Central C (mae: Setorial Y) = origem Estadual X.`;

c = c.substring(0, lineStart) + newBlock + c.substring(lineEnd);
fs.writeFileSync(p, c, 'utf8');
console.log('OK: PastorLetterDialog.tsx patched successfully');
