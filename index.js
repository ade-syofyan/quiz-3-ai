const express = require("express");
const { GoogleGenAI } = require("@google/genai");
const dotenv = require("dotenv");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const mammoth = require("mammoth");
const pdf = require("pdf-parse");

dotenv.config(); // Load .env file
const app = express();
app.use(express.json());

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const upload = multer({ dest: "uploads/" });

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

const modelName = "gemini-2.5-flash";

app.post("/generate-text", async (req, res) => {
  const { prompt } = req.body;
  try {
    const result = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
    });
    res.json({ output: result.text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/generate-from-image", upload.single("image"), async (req, res) => {
  try {
    const prompt = req.body.prompt || "Describe this image";

    const imageBuffer = fs.readFileSync(req.file.path);
    const base64Image = imageBuffer.toString("base64");

    const imagePart = {
      inlineData: {
        mimeType: req.file.mimetype,
        data: base64Image,
      },
    };

    const result = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [imagePart, { text: prompt }],
        },
      ],
    });

    fs.unlinkSync(req.file.path);

    res.json({ output: result.text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const extractText = async (filePath, mimeType) => {
  if (mimeType === "application/pdf") {
    const buffer = fs.readFileSync(filePath);
    const data = await pdf(buffer);
    return data.text;
  }

  if (
    mimeType ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  ) {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }

  if (mimeType === "text/plain") {
    return fs.readFileSync(filePath, "utf8");
  }

  throw new Error("Unsupported file type: " + mimeType);
};

app.post(
  "/generate-from-document",
  upload.single("document"),
  async (req, res) => {
    const filePath = req.file.path;
    const mimeType = req.file.mimetype;
    const prompt = req.body.prompt || "Analyze this document";

    try {
      const text = await extractText(filePath, mimeType);

      const result = await ai.models.generateContent({
        model: modelName,
        contents: [{ role: "user", parts: [{ text: `${prompt}\n\n${text}` }] }],
      });

      res.json({
        output:
          result.candidates?.[0]?.content?.parts?.[0]?.text || "No response",
      });
    } catch (error) {
      console.error("Document error:", error);
      res.status(500).json({ error: error.message });
    } finally {
      fs.unlinkSync(filePath);
    }
  }
);

app.post("/generate-from-audio", upload.single("audio"), async (req, res) => {
  const filePath = req.file.path;
  const mimeType = req.file.mimetype;
  const prompt = req.body.prompt || "Transcribe this audio";
  try {
    const audioBuffer = fs.readFileSync(filePath);
    const base64Audio = audioBuffer.toString("base64");

    const audioPart = {
      inlineData: {
        mimeType: mimeType,
        data: base64Audio,
      },
    };

    const result = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          role: "user",
          parts: [audioPart, { text: prompt }],
        },
      ],
    });

    res.json({ output: result.text });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    fs.unlinkSync(filePath);
  }
});

// async function main() {
//   const response = await ai.models.generateContent({
//     model: "gemini-2.5-flash",
//     contents: "Explain how AI works in a few words",
//   });
//   console.log(response.text);
// }

// await main();
