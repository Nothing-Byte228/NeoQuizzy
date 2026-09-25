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
      type: "nqt",
      compression: "lzma" // Пометка в манифесте для истории
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

class EQXml {
  /**
   * Конвертирует строку easyQuizzy XML в массив вопросов для формата NQT
   * @param {string} xmlString - Содержимое .xml файла от easyQuizzy
   */
  static toNqt(xmlString) {
    try {
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "@_"
      });
      
      const jsonObj = parser.parse(xmlString);
      const fileRoot = jsonObj.easyQuizzyFile || {};
      
      // Извлекаем метаданные из GlobalSettings
      const settings = fileRoot.GlobalSettings || {};
      const meta = {
        title: settings.Name || "Импортированный тест",
        author: settings.Author || "Неизвестный автор",
        description: settings.Description?.PlainText || "",
        createdAt: settings.DateOfCreation || new Date().toISOString()
      };

      const tests = [];
      
      // Пробиваемся сквозь вложенность оригинального XML к вопросам
      const subjectNode = fileRoot.Subjects?.Subject || {};
      const rawQuestions = subjectNode.Questions?.QuestionBlock || [];
      const questionsArray = Array.isArray(rawQuestions) ? rawQuestions : [rawQuestions];

      questionsArray.forEach((q, index) => {
        const rawAnswers = q.Answers?.Answer || [];
        const answersArray = Array.isArray(rawAnswers) ? rawAnswers : [rawAnswers];

        const options = [];
        let correctIndex = 0;

        answersArray.forEach((ans, ansIndex) => {
          const text = ans.Content?.PlainText || "";
          options.push(String(text).trim());

          // В оригинале признак правильности лежит в атрибуте IsCorrect
          if (ans["@_IsCorrect"] === "Yes") {
            correctIndex = ansIndex;
          }
        });

        tests.push({
          id: index,
          text: String(q.Content?.PlainText || "").trim(),
          options: options,
          correct: correctIndex,
          points: 1
        });
      });

      return { meta, tests };
    } catch (error) {
      console.error('[EQXml] Ошибка при конвертации XML -> NQT:', error);
      return null;
    }
  }

  /**
   * Конвертирует массив вопросов NQT обратно в оригинальный формат easyQuizzy XML
   */
  static fromNqt(meta, testsArray = []) {
    try {
      const builder = new XMLBuilder({
        format: true,
        ignoreAttributes: false,
        attributeNamePrefix: "@_",
        // Включаем встроенную поддержку самозакрывающихся тегов для пустых узлов
        suppressEmptyNode: true 
      });

      const safeMeta = meta || {};
      const currentTime = new Date().toISOString().replace(/\.\d+Z\$/, '+00:00');

      // Формируем структуру XML, заменяя пустые строки на null, 
      // чтобы suppressEmptyNode превратил их в самозакрывающиеся теги <Tag/>
      const xmlStructure = {
        easyQuizzyFile: {
          SubjectTypes: {
            "@_count": "2",
            SubjectType: [
              { "@_id": "0", "@_name": "Examination", "@_description": "" },
              { "@_id": "1", "@_name": "Practice", "@_description": "" }
            ]
          },
          QuestionTypes: {
            "@_count": "6",
            QuestionType: [
              { "@_id": "0", "@_name": "MultipleChoice", "@_description": "Select a single answer from a list", "#text": "Multiple Choice" },
              { "@_id": "1", "@_name": "MultipleResponse", "@_description": "Select one or more answers from a list", "#text": "Multiple Response" },
              { "@_id": "2", "@_name": "ShortAnswer", "@_description": "User must enter an answer from the keyboard", "#text": "Short Answer" },
              { "@_id": "3", "@_name": "PolarQuestion", "@_description": "Select a single answer from two available", "#text": "Polar Question" },
              { "@_id": "4", "@_name": "Sequence", "@_description": "Sort the answer list into the appropriate order", "#text": "Sequence" },
              { "@_id": "5", "@_name": "Matching", "@_description": "Join an item from each list with a similar meaning", "#text": "Matching" }
            ]
          },
          GlobalSettings: {
            Name: safeMeta.title || "Новый тест",
            Description: {
              PlainText: safeMeta.description || "",
              Empty: safeMeta.description ? "No" : "Yes",
              RichViewFormatBASE64: "LTggMSAzIDENCjAgMSAwIDggMCAwDQoxADIAMwApIA=="
            },
            Author: safeMeta.author || "Nothing-Byte228",
            DateOfCreation: safeMeta.createdAt || currentTime,
            DateLastChange: currentTime,
            GeneratorBuild: "442",
            UILangISOName: "rus",
            // ИСПРАВЛЕНО: Передаем null, чтобы fast-xml-parser сделал теги самозакрывающимися
            PasswordHash: null,
            PasswordHint: null,
            TextStyleBASE64: "57314E306557786C6331304E436B6C545A57784462327876636A30314D7A59344E7A41354D54454E436B6C545A5778555A58683051323973623349394E544D324F4463774F544578445170510D0A59584A6863304E766457353050544D4E436C4268636D465464486C735A5535686257557750554673615764755447566D6441304B5547467959564E306557786C546D46745A544539515778700D0A5A3235445A5735305A58494E436C4268636D464262476C6E626D316C626E51785054494E436C4268636D465464486C735A553568625755795055467361576475556D6C6E6148514E436C42680D0A636D464262476C6E626D316C626E51795054454E436B5A76626E527A51323931626E51394E41304B526D397564464E306557786C546D46745A544139546D3979625746734948526C6548514E0D0A436B5A76626E524F5957316C4D4431545A5764765A5342565351304B526D3975644570316258417750553576445170476232353055326C365A5441394D74code..."
          },
          Subjects: {
            "@_count": "1",
            Subject: {
              "@_id": "0",
              SubjectSettings: {
                Name: null, // Также делаем самозакрывающимся, если он пуст в оригинале
                Description: { PlainText: null, Empty: "Yes" },
                Author: null,
                DateOfCreation: safeMeta.createdAt || currentTime,
                DateLastChange: currentTime,
                SubjectTypeName: "Examination",
                QuestionsToAsk: null,
                RandomizeQuestions: "Yes",
                RandomizeAnswers: "Yes",
                GradeSystem: { "@_name": "Total Score" },
                TimeIsLimited: "No",
                TimeLimit: "00:45:00",
                SecondsToHoldResultsOnScreen: null,
                FontName: "Arial",
                FontSize: "12",
                EnableQAReport: "Yes",
                QAReportShowRightAnsweredQuestions: "Yes",
                QAReportShowWrongAnsweredQuestions: "Yes",
                QAReportShowQuestionsWithoutAnswers: "No",
                QAReportShowUserAnswers: "Yes",
                QAReportShowRightAnswers: "No"
              },
              Questions: {
                "@_count": String(testsArray.length),
                QuestionBlock: testsArray.map((q, idx) => ({
                  "@_id": String(idx),
                  QuestionTypeName: "MultipleChoice",
                  Content: {
                    PlainText: q.text || "",
                    Empty: q.text ? "No" : "Yes",
                    RichViewFormatBASE64: "LTggMSAzIDENCjAgMSAwIDggMCAwDQoxADIAMwApIA=="
                  },
                  Answers: {
                    "@_count": String(q.options.length),
                    Answer: q.options.map((opt, optIdx) => ({
                      "@_IsCorrect": optIdx === q.correct ? "Yes" : "No",
                      "@_Weight": "0",
                      "@_id": String(optIdx),
                      Content: {
                        PlainText: opt,
                        Empty: opt ? "No" : "Yes",
                        RichViewFormatBASE64: "LTggMSAzIDENCjAgMSAwIDggMCAwDQoxACkg"
                      }
                    }))
                  }
                }))
              }
            }
          }
        }
      };

      const rawXml = builder.build(xmlStructure);
      return `<?xml version="1.0" encoding="UTF-8"?>\n${rawXml}`.trim();
    } catch (error) {
      console.error('[EQXml] Ошибка при генерации XML:', error);
      return '';
    }
  }
}

module.exports = {
  NQTest,
  EQXml
}

async function test() {
  const a = await NQTest.load(path.join('src', 'trigonometry_ENCRYPTED_LZMA.nqt'), 'password')
  return EQXml.fromNqt(a.meta, a.tests)
}