require("dotenv").config();
const express = require("express");
const cors = require("cors");
const Anthropic = require("@anthropic-ai/sdk");
const mysql = require("mysql2/promise");
const router = require("express").Router();
const app = express();
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

app.use(cors({ origin: "https://charlotte-dulac.fr" }));
app.use(express.json());

// Connexion BDD
const db = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

// Générer un dialogue IA
router.post("/dialog", async (req, res) => {
  const { prompt, stats } = req.body;
  try {
    const message = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `${prompt}\n\nStats du joueur — Courage: ${stats.courage}/10, Sagesse: ${stats.sagesse}/10. Adapte légèrement ton ton en fonction de ces stats.`,
        },
      ],
    });
    res.json({ text: message.content[0].text });
  } catch (e) {
    console.error(e);
    res.status(500).json({ text: "— Les mots me manquent..." });
  }
});

router.delete("/save/:playerName", async (req, res) => {
  try {
    await db.query("DELETE FROM saves WHERE player_name = ?", [
      req.params.playerName,
    ]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false });
  }
});

// Sauvegarder la progression
router.post("/save", async (req, res) => {
  console.log("Données reçues:", req.body);
  const { playerName, sceneId, courage, sagesse, historyEntry } = req.body;
  try {
    const [existing] = await db.query(
      "SELECT id, history FROM saves WHERE player_name = ?",
      [playerName],
    );

    if (existing.length > 0) {
      const history = JSON.parse(existing[0].history || "[]");
      // Ajoute l'entrée seulement si la scène n'est pas déjà la dernière
      if (!history.length || history[history.length - 1].sceneId !== sceneId) {
        history.push(historyEntry);
      }
      await db.query(
        "UPDATE saves SET scene_id = ?, courage = ?, sagesse = ?, history = ? WHERE player_name = ?",
        [sceneId, courage, sagesse, JSON.stringify(history), playerName],
      );
    } else {
      await db.query(
        "INSERT INTO saves (player_name, scene_id, courage, sagesse, history) VALUES (?, ?, ?, ?, ?)",
        [playerName, sceneId, courage, sagesse, JSON.stringify([historyEntry])],
      );
    }
    res.json({ success: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false });
  }
});

// Charger une sauvegarde
router.get("/save/:playerName", async (req, res) => {
  try {
    const [rows] = await db.query("SELECT * FROM saves WHERE player_name = ?", [
      req.params.playerName,
    ]);
    if (rows.length > 0) {
      res.json({ save: rows[0] });
    } else {
      res.json({ save: null });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ save: null });
  }
});

app.use("/", router);

app.listen(process.env.PORT, () => {
  console.log(`Serveur lancé sur http://localhost:${process.env.PORT}`);
});
