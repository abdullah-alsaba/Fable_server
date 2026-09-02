const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");

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






















    app.listen(port, "0.0.0.0", () => {
      console.log(`Server running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
  }
}

startServer();
