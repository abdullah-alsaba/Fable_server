const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const port = Number(process.env.PORT) || 8989;
const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is missing from .env");
  process.exit(1);
}

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

// Fable database
const db = client.db("Fable_DB");

// Collections
const usersCollection = db.collection("users");
const booksCollection = db.collection("books");
const authorsCollection = db.collection("authors");

// Test route
app.get("/", (req, res) => {
  res.send("Server is running");
});

// Test MongoDB
app.get("/test-db", async (req, res) => {
  try {
    const result = await usersCollection.find().toArray();

    res.send({
      success: true,
      users: result,
    });
  } catch (error) {
    res.status(500).send({
      success: false,
      message: error.message,
    });
  }
});

// Start server
async function startServer() {
  try {
    await client.connect();

    await db.command({ ping: 1 });

    console.log("MongoDB connected successfully!");

    app.get('/featuredBooks', async (req, res) => {
      const cursor = booksCollection.find().limit(6)
      const result = await cursor.toArray()
     
      res.send(result) 
    })

    app.get('/authors/top', async (req, res) => {
      const cursor = authorsCollection.find().sort({ rating: -1 }).limit(3)
      const result = await cursor.toArray()
      
      res.send(result)
    })


    app.get("/browse-ebooks", async (req, res) => {
      try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 8;
        const search = req.query.search || req.query.writer || "";
        const genre = req.query.genre || "";
        const minPrice = parseFloat(req.query.minPrice);
        const maxPrice = parseFloat(req.query.maxPrice);
        const availability = req.query.availability || "all";
        const sortBy = req.query.sortBy || "newest";

        let query = {};
        let conditions = [];

        // Search filter (title or writerName or genre)
        if (search.trim() !== "") {
          const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "i");
          conditions.push({
            $or: [
              { title: regex },
              { writerName: regex },
              { genre: regex }
            ]
          });
        }

        // Genre filter
        if (genre.trim() !== "" && genre.toLowerCase() !== "all") {
          const genreRegex = new RegExp(`^${genre.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, "i");
          conditions.push({ genre: genreRegex });
        }

        // Price range filter
        if (!isNaN(minPrice) || !isNaN(maxPrice)) {
          let priceCondition = {};
          if (!isNaN(minPrice)) priceCondition.$gte = minPrice;
          if (!isNaN(maxPrice)) priceCondition.$lte = maxPrice;
          conditions.push({ price: priceCondition });
        }

        // Availability filter
        if (availability === "available") {
          conditions.push({
            $or: [
              { status: { $regex: /^available$/i } },
              { isSold: false },
              { status: { $exists: false } }
            ]
          });
        } else if (availability === "sold") {
          conditions.push({
            $or: [
              { status: { $regex: /^sold$/i } },
              { isSold: true }
            ]
          });
        }

        if (conditions.length > 0) {
          query = conditions.length === 1 ? conditions[0] : { $and: conditions };
        }

        let sortOption = {};
        if (sortBy === "price-low") sortOption = { price: 1 };
        else if (sortBy === "price-high") sortOption = { price: -1 };
        else if (sortBy === "title-az") sortOption = { title: 1 };
        else sortOption = { _id: -1 };

        const totalBooks = await booksCollection.countDocuments(query);
        const totalPages = Math.ceil(totalBooks / limit) || 1;
        const skip = (page - 1) * limit;

        const ebooks = await booksCollection
          .find(query)
          .sort(sortOption)
          .skip(skip)
          .limit(limit)
          .toArray();

        // If no query params supplied at all, send array for legacy compatibility
        if (
          !req.query.page &&
          !req.query.limit &&
          !req.query.search &&
          !req.query.sortBy &&
          !req.query.writer &&
          !req.query.genre &&
          !req.query.minPrice &&
          !req.query.maxPrice &&
          !req.query.availability
        ) {
          const allEbooks = await booksCollection.find().toArray();
          return res.send(allEbooks);
        }

        res.send({
          success: true,
          ebooks,
          totalBooks,
          totalPages,
          currentPage: page,
          limit
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get("/browse-ebooks/:id", async (req, res) => {
      try {
        const id = req.params.id;
        let query = { $or: [{ _id: id }, { id: id }] };
        if (ObjectId.isValid(id)) {
          query.$or.unshift({ _id: new ObjectId(id) });
        }
        const book = await booksCollection.findOne(query);
        if (!book) {
          return res.status(404).send({ success: false, message: "Ebook not found" });
        }
        res.send(book);
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });






















    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
  }
}

startServer();
