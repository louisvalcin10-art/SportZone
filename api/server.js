const express = require("express");
const cors = require("cors");
const { randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");

const scryptAsync = promisify(scrypt);
const db = require("./database");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 300;

// Hacher un mot de passe
async function hacherMotDePasse(motdepasse) {
    const sel = randomBytes(16).toString("hex");
    const resultat = await scryptAsync(motdepasse, sel, 64);

    return sel + ":" + resultat.toString("hex");
}

// Vérifier un mot de passe
async function verifierMotDePasse(motdepasse, motDePasseEnregistre) {
    try {
        const [sel, hash] = motDePasseEnregistre.split(":");

        if (!sel || !hash) {
            return false;
        }

        const hashEnregistre = Buffer.from(hash, "hex");
        const resultat = await scryptAsync(motdepasse, sel, 64);

        return (
            hashEnregistre.length === resultat.length &&
            timingSafeEqual(hashEnregistre, resultat)
        );
    } catch (erreur) {
        return false;
    }
}

// Accueil de l'API
app.get("/", (req, res) => {
    res.send("API SportZone fonctionne !");
});

// Inscription
app.post("/inscription", async (req, res) => {
    const nom = typeof req.body.nom === "string"
        ? req.body.nom.trim()
        : "";

    const email = typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const motdepasse = typeof req.body.motdepasse === "string"
        ? req.body.motdepasse
        : "";

    if (!nom || !email || motdepasse.length < 8) {
        return res.status(400).json({
            erreur: "Remplis tous les champs. Le mot de passe doit avoir au moins 8 caractères."
        });
    }

    try {
        const motDePasseHache = await hacherMotDePasse(motdepasse);

        db.run(
            `INSERT INTO utilisateurs (nom, email, mot_de_passe)
             VALUES (?, ?, ?)`,
            [nom, email, motDePasseHache],
            function (err) {
                if (err) {
                    if (err.code === "SQLITE_CONSTRAINT") {
                        return res.status(409).json({
                            erreur: "Cette adresse email est déjà utilisée."
                        });
                    }

                    return res.status(500).json({
                        erreur: "Erreur lors de l'inscription."
                    });
                }

                res.status(201).json({
                    message: "Inscription réussie !"
                });
            }
        );
    } catch (erreur) {
        res.status(500).json({
            erreur: "Erreur lors de la création du compte."
        });
    }
});

// Connexion
app.post("/connexion", (req, res) => {
    const email = typeof req.body.email === "string"
        ? req.body.email.trim().toLowerCase()
        : "";

    const motdepasse = typeof req.body.motdepasse === "string"
        ? req.body.motdepasse
        : "";

    if (!email || !motdepasse) {
        return res.status(400).json({
            erreur: "Email et mot de passe obligatoires."
        });
    }

    db.get(
        "SELECT * FROM utilisateurs WHERE email = ?",
        [email],
        async (err, utilisateur) => {
            if (err) {
                return res.status(500).json({
                    erreur: "Erreur lors de la connexion."
                });
            }

            if (!utilisateur) {
                return res.status(401).json({
                    erreur: "Email ou mot de passe incorrect."
                });
            }

            const valide = await verifierMotDePasse(
                motdepasse,
                utilisateur.mot_de_passe
            );

            if (valide) {
                res.json({
                    message: "Connexion réussie !"
                });
            } else {
                res.status(401).json({
                    erreur: "Email ou mot de passe incorrect."
                });
            }
        }
    );
});

// Récupérer les sports
app.get("/sports", (req, res) => {
    db.all("SELECT * FROM sports", [], (err, rows) => {
        if (err) {
            return res.status(500).json({
                erreur: err.message
            });
        }

        res.json(rows);
    });
});

// Préparer la base de données
db.run(`
    CREATE TABLE IF NOT EXISTS sports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nom TEXT NOT NULL UNIQUE
    )
`, (err) => {
    if (err) {
        console.error("Erreur table sports :", err.message);
        process.exit(1);
    }

    console.log("Table sports créée !");

    db.run(`
        INSERT OR IGNORE INTO sports (nom) VALUES
        ('Football'),
        ('Basketball'),
        ('Tennis')
    `, (err) => {
        if (err) {
            console.error("Erreur ajout sports :", err.message);
            process.exit(1);
        }

        console.log("Sports ajoutés !");

        db.run(`
            CREATE TABLE IF NOT EXISTS utilisateurs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                nom TEXT NOT NULL DEFAULT '',
                email TEXT NOT NULL UNIQUE,
                mot_de_passe TEXT NOT NULL
            )
        `, (err) => {
            if (err) {
                console.error("Erreur table utilisateurs :", err.message);
                process.exit(1);
            }

            // Ajouter nom si l'ancienne table ne possède pas cette colonne
            db.all("PRAGMA table_info(utilisateurs)", [], (err, colonnes) => {
                if (err) {
                    console.error("Erreur vérification table :", err.message);
                    process.exit(1);
                }

                const nomExiste = colonnes.some(
                    colonne => colonne.name === "nom"
                );

                const demarrerAPI = () => {
                    console.log("Table utilisateurs prête !");

                    app.listen(PORT, () => {
                        console.log(
                            `API démarrée sur http://localhost:${PORT}`
                        );
                    });
                };

                if (nomExiste) {
                    demarrerAPI();
                } else {
                    db.run(
                        "ALTER TABLE utilisateurs ADD COLUMN nom TEXT NOT NULL DEFAULT ''",
                        (err) => {
                            if (err) {
                                console.error("Erreur ajout colonne nom :", err.message);
                                process.exit(1);
                            }

                            demarrerAPI();
                        }
                    );
                }
            });
        });
    });
});