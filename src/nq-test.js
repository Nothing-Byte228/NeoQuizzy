const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');
const crypto = require('crypto');
// Импортируем только компрессор/декомпрессор для работы с буферами
const LZMA = require('lzma');
const { XMLParser, XMLBuilder } = require('fast-xml-parser');

class NQTest {
  constructor(meta = {}) {
    this.meta = {
      title: meta.title || "Безымяный тест",
      author: meta.author || "Неизвестный автор",
      createdAt: meta.createdAt || new Date().toISOString(),
      ...meta
    };
    this.manifest = {
      version: "1.0.0",
      type: "nqt"
    };
  }

  /**
   * Собрать, сжать в LZMA и зашифровать архив .nqt
   */
  async build(outputPath, testsArray = [], password = null) {
    try {
      const zip = new AdmZip();

      // 1. Собираем структуру в памяти через adm-zip
      zip.addFile("manifest.json", Buffer.from(JSON.stringify(this.manifest, null, 2), "utf8"));
      zip.addFile("meta.json", Buffer.from(JSON.stringify(this.meta, null, 2), "utf8"));

      testsArray.forEach((testData, index) => {
        zip.addFile(`tests/${index}.json`, Buffer.from(JSON.stringify(testData, null, 2), "utf8"));
      });

      const zipBuffer = zip.toBuffer();

      // 2. Сжимаем получившийся ZIP-буфер с помощью LZMA (уровень сжатия 9 — максимальный)
      const compressedBuffer = await new Promise((resolve, reject) => {
        LZMA.compress(zipBuffer, 9, (result, error) => {
          if (error) reject(error);
          else resolve(Buffer.from(result));
        });
      });

      let finalBuffer = compressedBuffer;

      // 3. Если передан пароль — шифруем сжатый LZMA-буфер алгоритмом AES-256-GCM
      if (password) {
        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync(password, 'salt-for-neoquizzy-pack', 32);
        const iv = crypto.randomBytes(12);

        const cipher = crypto.createCipheriv(algorithm, key, iv);
        
        const encryptedBuffer = Buffer.concat([cipher.update(finalBuffer), cipher.final()]);
        const authTag = cipher.getAuthTag();

        // Склеиваем: IV + AuthTag + Зашифрованные сжатые данные
        finalBuffer = Buffer.concat([iv, authTag, encryptedBuffer]);
      }

      // 4. Записываем на диск
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      fs.writeFileSync(outputPath, finalBuffer);
      console.log(`[NQTest] Файл собран, сжат в LZMA и сохранен: ${outputPath}`);
      return true;
    } catch (error) {
      console.error('[NQTest] Ошибка при сборке и сжатии архива:', error);
      return false;
    }
  }

  /**
   * Распаковать, дешифровать и прочитать архив .nqt
   */
  static async load(filePath, password = null) {
    try {
      let fileBuffer = fs.readFileSync(filePath);

      // Проверяем зашифрован ли файл (по сигнатуре lzma-потока или ZIP "PK")
      // Сжатый LZMA-файл обычно начинается с байта 0x5D. Если байты другие — файл либо зашифрован, либо обычный ZIP.
      const isEncrypted = fileBuffer[0] !== 0x5D && (fileBuffer[0] !== 0x50 || fileBuffer[1] !== 0x4B);

      if (isEncrypted) {
        if (!password) throw new Error('Файл зашифрован, введите пароль.');

        const algorithm = 'aes-256-gcm';
        const key = crypto.scryptSync(password, 'salt-for-neoquizzy-pack', 32);

        const iv = fileBuffer.subarray(0, 12);
        const authTag = fileBuffer.subarray(12, 28);
        const encryptedData = fileBuffer.subarray(28);

        const decipher = crypto.createDecipheriv(algorithm, key, iv);
        decipher.setAuthTag(authTag);

        // Получаем чистый сжатый LZMA-буфер после дешифровки
        fileBuffer = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      }

      // Декомпрессия LZMA обратно в буфер ZIP-архива
      const decompressedBuffer = await new Promise((resolve, reject) => {
        LZMA.decompress(fileBuffer, (result, error) => {
          if (error) reject(error);
          else resolve(Buffer.from(result));
        });
      });

      // Читаем структуру ZIP из восстановленного буфера
      const zip = new AdmZip(decompressedBuffer);
      
      const manifest = JSON.parse(zip.readAsText("manifest.json"));
      const meta = JSON.parse(zip.readAsText("meta.json"));
      
      const tests = [];
      const zipEntries = zip.getEntries();
      
      zipEntries.forEach((entry) => {
        if (entry.entryName.startsWith('tests/') && entry.entryName.endsWith('.json')) {
          tests.push(JSON.parse(zip.readAsText(entry)));
        }
      });

      return { manifest, meta, tests };
    } catch (error) {
      console.error('[NQTest] Ошибка при чтении/декомпрессии архива:', error.message);
      return null;
    }
  }
}

module.exports = {
  NQTest
}

async function createTest(password = null) {
  const test = new NQTest();

  let questions = []

  for (let i = 0; i <= 300; i++) {
    questions.push({
      text: `Вопрос номер ${i+1}`,
      answers: [
        { label: 'Ответ 1', isCorrect: false },
        { label: 'Ответ 2', isCorrect: false },
        { label: 'Ответ 3', isCorrect: true },
        { label: 'Ответ 4', isCorrect: false }
      ]
    })
  }

  await test.build(path.join('.', 'test.nqt'), questions, password);
}

async function readTest(password = null) {
  return await NQTest.load(path.join('.', 'test.nqt'), password)
}
