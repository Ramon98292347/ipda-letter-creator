const fs = require('fs');
const path = 'src/pages/UsuarioDashboard.tsx';
let c = fs.readFileSync(path, 'utf8');

const oldComment = `    // Comentario: destino fora da sub-arvore da mae \u2014 sobe pela ancestorChain\r\n    // ate achar o primeiro ancestral com pastor cuja sub-arvore inclua o destino`;

const newBlock = `    // \u2500\u2500\u2500 REGRA DE IRMAS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Comentario: se a origem (signerChurch) e o destino compartilham a MESMA MAE
    // (mesmo parent_totvs_id), sao irmas na hierarquia.
    // Nesse caso, a carta sai com a propria igreja (signerChurch) como origem,
    // sem precisar subir para o ancestral comum.
    // Ex.: Central A (mae: Estadual X) para Central B (mae: Estadual X) = origem Central A.
    // Ex.: Setorial Y (mae: Estadual X) para Setorial Z (mae: Estadual X) = origem Setorial Y.
    const destChurchData = rawScopeChurches.find((c) => String(c.totvs_id || "") === destId);
    const signerParent = String(signerChurch.parent_totvs_id || "");
    const destParent = String(destChurchData?.parent_totvs_id || "");
    if (signerParent && destParent && signerParent === destParent) {
      return {
        name: signerChurch.church_name || session?.church_name || "",
        totvs: String(signerChurch.totvs_id || "") || String(session?.totvs_id || ""),
      };
    }
    // \u2500\u2500\u2500 FIM REGRA DE IRMAS \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500
    // Comentario: destino em ramo diferente (mae diferente). Sobe pela ancestorChain
    // ate achar o primeiro ancestral com pastor cuja sub-arvore inclua o destino.
    // Ex.: Central A (mae: Estadual X) para Central C (mae: Setorial Y) = origem Estadual X.`;

if (c.includes(oldComment)) {
  c = c.replace(oldComment, newBlock);
  fs.writeFileSync(path, c, 'utf8');
  console.log('OK: UsuarioDashboard.tsx patched successfully');
} else {
  console.log('ERROR: target comment not found');
  // Try to find similar
  const lines = c.split(/\r?\n/);
  for (let i = 540; i < 560; i++) {
    console.log(`Line ${i+1}: ${JSON.stringify(lines[i])}`);
  }
}
