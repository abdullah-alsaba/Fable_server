const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const dns = require("dns");
const { MongoClient, ServerApiVersion } = require("mongodb");
dns.setServers(["8.8.8.8", "1.1.1.1"]);
dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

const port = process.env.PORT || 3000;
const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    await client.connect();

    await client.db("admin").command({ ping: 1 });

    console.log("Pinged your deployment. Successfully connected to MongoDB!");

    const db = client.db("yourDatabaseName");

    // Your API routes/database operations will go here
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run();

app.get("/", (req, res) => {
  res.send("Server is running");
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
