import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini AI SDK
  let ai: GoogleGenAI | null = null;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey && geminiKey !== "MY_GEMINI_API_KEY") {
    try {
      ai = new GoogleGenAI({ apiKey: geminiKey });
      console.log("Gemini AI SDK initialized successfully.");
    } catch (err) {
      console.error("Failed to initialize Gemini AI SDK:", err);
    }
  } else {
    console.warn("GEMINI_API_KEY not configured or has placeholder value.");
  }

  // API: AI Assistant Route
  app.post("/api/ai-assist", async (req, res) => {
    try {
      if (!ai) {
        return res.status(503).json({ 
          error: "Gemini AI is not configured. Please set your GEMINI_API_KEY in the Secrets panel." 
        });
      }

      const { message, history } = req.body;
      if (!message) {
        return res.status(400).json({ error: "Message is required." });
      }

      const systemInstruction = "You are a helpful, friendly AI Chat Assistant inside a real-time messaging application. Answer concisely and engage in helpful, informative conversation. Speak as a companion.";

      // Map chat history to Gemini API format
      const contents = (history || []).map((h: any) => ({
        role: h.role === "user" ? "user" : "model",
        parts: [{ text: h.text }]
      }));

      // Append new message
      contents.push({
        role: "user",
        parts: [{ text: message }]
      });

      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.7,
        }
      });

      const replyText = response.text || "I didn't receive a response. Please try again.";
      return res.json({ text: replyText });
    } catch (error: any) {
      console.error("Error in AI Assist route:", error);
      return res.status(500).json({ error: error.message || "Internal server error" });
    }
  });

  // Serve static files / Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
