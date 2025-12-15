//imports
import express from "express";
import path from "path";
import axios from "axios";
import mongoose from "mongoose";

// setup the server
const app = express();
const router = express.Router();
const PORT = 5000;
const MONGO_CONNECTION_STRING = process.env.MONGO_CONNECTION_STRING;
const baseUrl = 'https://api.mangadex.org';

const searchHistorySchema = new mongoose.Schema({
    searchQuery: String,
    timestamp: Date
});
const searchHistoryModel = mongoose.model('SearchHistory', searchHistorySchema);

app.use(express.static(path.join(import.meta.dirname, "public"))); // public-facing folder
app.set("view engine", "ejs");
app.set("views", path.resolve(import.meta.dirname, "templates"));

// ROUTER CONFIG
router.get("/index", (req, res) => {
    res.redirect("/");
});

router.get("/", (req, res) => {
    res.render("index");
});

router.get("/results", async (req, res) => {
    const query = req.query.title;

    try {
        // save search history
        await mongoose.connect(MONGO_CONNECTION_STRING);
        let s = new searchHistoryModel({
            searchQuery: query,
            timestamp: new Date()
        });
        await s.save();
        mongoose.disconnect();

        // get from mangadex
        const response = await axios.get(`${baseUrl}/manga`, {
            params: {
                title: query,
                limit: 1,
                includes: ["cover_art", 'author']
            }
        });
        if (!response.data.data || response.data.data.length === 0) {
            res.render(
                "results", {
                query,
                manga_title: "No results found",
                manga_photo: "",
                manga_rating: "N/A",
                manga_description: "",
                manga_author: "N/A"
            }
            )
        }
        const manga = response.data.data[0];
        const mangaId = manga.id;

        const resp = await axios.get(`${baseUrl}/statistics/manga/${mangaId}`);
        const { rating, follows } = resp.data.statistics[mangaId];
        const manga_rating = rating.bayesian.toFixed(2) || "N/A";
        
        const manga_title = manga.attributes.title.en || manga.attributes.title["ja-ro"] || manga.attributes.title.ja || "Title not available";
        const manga_description = manga.attributes.description.en || "Description not available";
        const coverRel = manga.relationships.find(rel => rel.type === "cover_art");
        const coverFile = coverRel?.attributes?.fileName;
        const authorRel = manga.relationships.find(rel => rel.type === "author");
        const manga_author = authorRel.attributes.name || "Author not available";
        const manga_photo = `https://uploads.mangadex.org/covers/${mangaId}/${coverFile}`;
            res.render("results", {
            query,
            manga_title,
            manga_photo,
            manga_rating,
            manga_description,
            manga_author
        });
    } catch (err) {
        console.error(err);
    }
});

router.get("/history", async (req, res) => {
    let success = true;
    let history;
    let errorMsg;
    try {
        await mongoose.connect(MONGO_CONNECTION_STRING);
        history = await searchHistoryModel.find({}).sort({timestamp: 'descending'});
        mongoose.disconnect();
    } catch (err) {
        success = false;
        errorMsg = err.toString();
    }

    const variables = {
        historyTable: success ?
            (history.length ?
                history.reduce((accum, cur) => {
                    return accum + `\n\t\t<tr>\n\t\t\t<td>${cur.searchQuery}</td>\n\t\t\t<td>${cur.timestamp}</td>\n\t\t</tr>`;
                }, "\n<table>\n\t<thead>\n\t\t<tr>\n\t\t\t<th>Search Query</th>\n\t\t\t<th>Date Searched</th>\n\t\t</tr>\n\t</thead>\n\t<tbody>") + "\n\t</tbody>\n</table>"
                : "<div style=\"color:gray\">No history found</div>"
            )
            : `Error accessing database: ${errorMsg}`
    };
    res.render("history", variables)
});

app.use(router);

// start the server
app.listen(PORT);
console.log(`Server started on port ${PORT}`);