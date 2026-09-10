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

const db = client.db("Fable_DB");

const usersCollection = db.collection("user");
const booksCollection = db.collection("books");
const authorsCollection = db.collection("authors");
const purchasesCollection = db.collection("purchases");
const bookmarksCollection = db.collection("bookmarks");

app.get("/", (req, res) => {
  res.send("Server is running");
});

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

async function startServer() {
  try {
    await client.connect();
    await db.command({ ping: 1 });
    console.log("MongoDB connected successfully!");

    app.get("/featuredBooks", async (req, res) => {
      const cursor = booksCollection.find().limit(6);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/authors/top", async (req, res) => {
      const cursor = authorsCollection.find().sort({ rating: -1 }).limit(3);
      const result = await cursor.toArray();
      res.send(result);
    });

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

        if (search.trim() !== "") {
          const regex = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
          conditions.push({
            $or: [{ title: regex }, { writerName: regex }, { genre: regex }],
          });
        }

        if (genre.trim() !== "" && genre.toLowerCase() !== "all") {
          const genreRegex = new RegExp(`^${genre.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i");
          conditions.push({ genre: genreRegex });
        }

        if (!isNaN(minPrice) || !isNaN(maxPrice)) {
          let priceCondition = {};
          if (!isNaN(minPrice)) priceCondition.$gte = minPrice;
          if (!isNaN(maxPrice)) priceCondition.$lte = maxPrice;
          conditions.push({ price: priceCondition });
        }

        if (availability === "available") {
          conditions.push({
            $or: [
              { status: { $regex: /^available$/i } },
              { status: { $regex: /^published$/i } },
              { isSold: false },
              { status: { $exists: false } },
            ],
          });
        } else if (availability === "sold") {
          conditions.push({
            $or: [{ status: { $regex: /^sold$/i } }, { isSold: true }],
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
          limit,
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

    app.get("/api/users", async (req, res) => {
      try {
        const users = await usersCollection.find().toArray();
        res.send({ success: true, users });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.patch("/api/users/:id/role", async (req, res) => {
      try {
        const id = req.params.id;
        const { role } = req.body;
        let query = { _id: id };
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        }
        const result = await usersCollection.updateOne(query, { $set: { role } });
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.delete("/api/users/:id", async (req, res) => {
      try {
        const id = req.params.id;
        let query = { _id: id };
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        }
        const result = await usersCollection.deleteOne(query);
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get("/api/writer/ebooks", async (req, res) => {
      try {
        const writerEmail = req.query.email || req.query.writerEmail;
        let query = {};
        if (writerEmail) {
          query = { $or: [{ writerEmail }, { writer: writerEmail }, { writerName: writerEmail }] };
        }
        const ebooks = await booksCollection.find(query).toArray();
        res.send({ success: true, ebooks });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.post("/api/ebooks", async (req, res) => {
      try {
        const coverUrl = req.body.cover || req.body.coverImage || "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?auto=format&fit=crop&w=600&q=80";
        const newBook = {
          ...req.body,
          cover: coverUrl,
          coverImage: coverUrl,
          price: parseFloat(req.body.price) || 0,
          status: req.body.status || "published",
          createdAt: new Date().toISOString(),
        };
        const result = await booksCollection.insertOne(newBook);

        const writerName = req.body.writerName || req.body.writer || req.body.author;
        const writerEmail = req.body.writerEmail || req.body.email || "";
        if (writerName) {
          await authorsCollection.updateOne(
            { $or: [{ name: writerName }, { email: writerEmail }] },
            {
              $set: {
                name: writerName,
                email: writerEmail,
                genre: req.body.genre || "Fiction",
                image: req.body.writerImage || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
                updatedAt: new Date().toISOString(),
              },
              $inc: { sales: 1 },
              $setOnInsert: { rating: 4.9, createdAt: new Date().toISOString() },
            },
            { upsert: true }
          );
        }

        res.send({ success: true, insertedId: result.insertedId, book: newBook });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.post("/api/authors/sync", async (req, res) => {
      try {
        const { name, email, genre, image } = req.body;
        if (!name && !email) {
          return res.status(400).send({ success: false, message: "Writer name or email required" });
        }
        const writerName = name || email;
        const result = await authorsCollection.updateOne(
          { $or: [{ email }, { name: writerName }] },
          {
            $set: {
              name: writerName,
              email: email || "",
              genre: genre || "General",
              image: image || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
              updatedAt: new Date().toISOString(),
            },
            $setOnInsert: { rating: 4.9, sales: 0, createdAt: new Date().toISOString() },
          },
          { upsert: true }
        );
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.put("/api/ebooks/:id", async (req, res) => {
      try {
        const id = req.params.id;
        let query = { _id: id };
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        }
        const updateData = {
          ...req.body,
          price: parseFloat(req.body.price) || 0,
          updatedAt: new Date().toISOString(),
        };
        delete updateData._id;
        const result = await booksCollection.updateOne(query, { $set: updateData });
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.patch("/api/ebooks/:id/status", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;
        let query = { _id: id };
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        }
        const result = await booksCollection.updateOne(query, { $set: { status } });
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.delete("/api/ebooks/:id", async (req, res) => {
      try {
        const id = req.params.id;
        let query = { _id: id };
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        }
        const result = await booksCollection.deleteOne(query);
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get("/api/purchases", async (req, res) => {
      try {
        const userEmail = req.query.userEmail;
        const writerEmail = req.query.writerEmail;
        let query = {};
        if (userEmail) {
          query.userEmail = userEmail;
        }
        if (writerEmail) {
          query.writerEmail = writerEmail;
        }
        const purchases = await purchasesCollection.find(query).toArray();
        res.send({ success: true, purchases });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.post("/api/purchases", async (req, res) => {
      try {
        const purchase = {
          ...req.body,
          purchaseDate: new Date().toISOString(),
          transactionId: "TXN-" + Math.floor(100000 + Math.random() * 900000),
        };
        const result = await purchasesCollection.insertOne(purchase);
        res.send({ success: true, insertedId: result.insertedId, purchase });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get("/api/bookmarks", async (req, res) => {
      try {
        const userEmail = req.query.userEmail || req.query.email;
        let query = {};
        if (userEmail) {
          query.userEmail = userEmail;
        }
        const bookmarks = await bookmarksCollection.find(query).toArray();
        res.send({ success: true, bookmarks });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.post("/api/bookmarks", async (req, res) => {
      try {
        const bookmark = {
          ...req.body,
          createdDate: new Date().toISOString(),
        };
        const result = await bookmarksCollection.insertOne(bookmark);
        res.send({ success: true, insertedId: result.insertedId });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.delete("/api/bookmarks/:id", async (req, res) => {
      try {
        const id = req.params.id;
        let query = { _id: id };
        if (ObjectId.isValid(id)) {
          query = { _id: new ObjectId(id) };
        }
        const result = await bookmarksCollection.deleteOne(query);
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get("/api/analytics", async (req, res) => {
      try {
        const totalUsers = await usersCollection.countDocuments({ role: { $in: ["user", "reader"] } });
        const totalWriters = await usersCollection.countDocuments({ role: "writer" });
        const allBooks = await booksCollection.find().toArray();
        const allPurchases = await purchasesCollection.find().toArray();

        const totalEbooksSold = allPurchases.length;
        const totalRevenue = allPurchases.reduce((acc, curr) => acc + (parseFloat(curr.amount || curr.price) || 0), 0);

        res.send({
          success: true,
          totalUsers,
          totalWriters,
          totalEbooksSold,
          totalRevenue,
          monthlySales: [
            { month: "Jan", sales: 12, revenue: 240 },
            { month: "Feb", sales: 19, revenue: 380 },
            { month: "Mar", sales: 25, revenue: 520 },
            { month: "Apr", sales: 18, revenue: 360 },
            { month: "May", sales: 32, revenue: 740 },
            { month: "Jun", sales: 28, revenue: 610 },
            { month: "Jul", sales: 40, revenue: 920 },
            { month: "Aug", sales: 48, revenue: 1150 },
            { month: "Sep", sales: 55, revenue: 1285 },
          ],
          genreDistribution: [
            { name: "Fiction", value: 35 },
            { name: "Fantasy", value: 25 },
            { name: "Sci-Fi", value: 20 },
            { name: "Technology", value: 12 },
            { name: "History", value: 8 },
          ],
        });
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
