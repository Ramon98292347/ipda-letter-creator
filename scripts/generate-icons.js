import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, '../public');
const inputFile = path.join(publicDir, 'app-icon.png');

async function generateIcons() {
  try {
    // 192x192
    await sharp(inputFile)
      .resize(192, 192, { fit: 'cover', withoutEnlargement: true })
      .png()
      .toFile(path.join(publicDir, 'app-icon-192.png'));
    console.log('✓ app-icon-192.png criado');

    // 512x512
    await sharp(inputFile)
      .resize(512, 512, { fit: 'cover', withoutEnlargement: true })
      .png()
      .toFile(path.join(publicDir, 'app-icon-512.png'));
    console.log('✓ app-icon-512.png criado');

    // 512x512 maskable (com padding de 10%)
    const paddingSize = Math.round(512 * 1.1); // 562x562
    await sharp(inputFile)
      .resize(512, 512, { fit: 'cover', withoutEnlargement: true })
      .extend({
        top: Math.round((paddingSize - 512) / 2),
        bottom: Math.round((paddingSize - 512) / 2),
        left: Math.round((paddingSize - 512) / 2),
        right: Math.round((paddingSize - 512) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png()
      .toFile(path.join(publicDir, 'app-icon-maskable-512.png'));
    console.log('✓ app-icon-maskable-512.png criado (562x562 com padding transparente)');

    console.log('\n✅ Todos os ícones foram gerados com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao gerar ícones:', err);
    process.exit(1);
  }
}

generateIcons();
