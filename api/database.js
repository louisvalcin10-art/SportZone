
const sqlite3 = require("sqlite3").verbose();
const path = require("node:path");

const cheminBase = path.join(__dirname, "sportzone.db");

const db = new sqlite3.Database(cheminBase, (err) => {
    if (err) {
        console.error("Erreur de connexion à la base de données :", err.message);
    } else {
        console.log("Base de données SportZone connectée !");
    }
});

module.exports = db;
