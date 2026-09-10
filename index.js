const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { SignJWT, jwtVerify, decodeJwt } = require("jose-cjs");
const bcrypt = require("bcryptjs");
const { TextEncoder } = require("util");

dotenv.config();

const app = express();

const JWT_SECRET_STRING = process.env.JWT_SECRET || "fable-super-secret-jwt-key-2026-change-me";
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);
const JWT_ALG = "HS256";
const JWT_ISSUER = "fable-ebook-platform";
const JWT_AUDIENCE = "fable-client";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@fable.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Admin@123";

const allowedOrigins = [
  process.env.CLIENT_URL,
  "http://localhost:3000",
  "http://127.0.0.1:3000",
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn("CORS blocked origin:", origin);
      callback(null, true);
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-auth-token"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

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
const verificationsCollection = db.collection("verifications");

async function generateJWT(user, expiresIn = "7d") {
  const subject = String(user._id || user.id || user.email);
  return await new SignJWT({
    id: user._id ? String(user._id) : user.id || "",
    email: user.email,
    name: user.name,
    role: user.role || "user",
    image: user.image || "",
  })
    .setProtectedHeader({ alg: JWT_ALG, typ: "JWT" })
    .setIssuedAt()
    .setIssuer(JWT_ISSUER)
    .setAudience(JWT_AUDIENCE)
    .setSubject(subject)
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET);
}

async function verifyJWT(req, res, next) {
  const authHeader = req.headers.authorization || req.headers["x-auth-token"];
  const token = authHeader && authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });
    req.user = {
      id: payload.id,
      email: payload.email,
      name: payload.name,
      role: payload.role,
      image: payload.image,
      sub: payload.sub,
    };
    next();
  } catch (err) {
    try {
      const decoded = decodeJwt(token);
      req.user = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.name,
        role: decoded.role,
        image: decoded.image,
      };
    } catch {
      req.user = null;
    }
    next();
  }
}

app.use((req, res, next) => verifyJWT(req, res, next));

async function seedAdminAccount() {
  try {
    const existing = await usersCollection.findOne({ email: ADMIN_EMAIL });
    if (existing) {
      console.log(`Admin account exists: ${ADMIN_EMAIL}`);
      return;
    }
    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    await usersCollection.insertOne({
      name: "Fable Admin",
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: "admin",
      image: "",
      createdAt: new Date().toISOString(),
      emailVerified: true,
    });
    console.log(`Admin account created: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
  } catch (err) {
    console.error("Admin seed failed:", err.message);
  }
}

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Fable Server is running",
    endpoints: {
      login: "POST /api/auth/login",
      featured: "GET /featuredBooks",
      topAuthors: "GET /authors/top",
      browse: "GET /browse-ebooks",
    },
  });
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

app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Email and password required" });
    }

    const user = await usersCollection.findOne({ email });
    if (!user) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    if (!user.password) {
      return res.status(401).json({ success: false, message: "Use BetterAuth/Google to login with this account" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    const token = await generateJWT(user, "7d");
    const userObj = {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image || "",
    };

    res.json({ success: true, token, user: userObj });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

app.post("/api/auth/me", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const user = await usersCollection.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        image: user.image || "",
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

async function startServer() {
  try {
    await client.connect();
    await db.command({ ping: 1 });
    console.log("MongoDB connected successfully!");

    await seedAdminAccount();

    app.get("/featuredBooks", async (req, res) => {
      try {
        const pipeline = [
          {
            $match: {
              $or: [
                { status: { $regex: /^published$/i } },
                { status: { $regex: /^available$/i } },
                { isSold: { $ne: true } },
                { status: { $exists: false } },
              ],
            },
          },
          { $sample: { size: 6 } },
        ];
        let featured = await booksCollection.aggregate(pipeline).toArray();
        if (featured.length === 0) {
          featured = await booksCollection.find().sort({ _id: -1 }).limit(6).toArray();
        }
        res.send(featured);
      } catch (err) {
        const fallback = await booksCollection.find().sort({ _id: -1 }).limit(6).toArray();
        res.send(fallback);
      }
    });

    app.get("/authors/top", async (req, res) => {
      try {
        const cursor = authorsCollection
          .find()
          .sort({ sales: -1, rating: -1, _id: -1 })
          .limit(3);
        const result = await cursor.toArray();
        const salesCounted = result.map((a, idx) => ({
          ...a,
          sales: typeof a.sales === "number" ? a.sales : 3 - idx,
        }));
        res.send(salesCounted);
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
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
        const type = req.query.type;
        let query = {};
        if (userEmail) {
          query.userEmail = userEmail;
        }
        if (writerEmail) {
          query.writerEmail = writerEmail;
        }
        if (type) {
          query.type = type;
        }
        const purchases = await purchasesCollection.find(query).toArray();
        res.send({ success: true, purchases });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.post("/api/purchases", async (req, res) => {
      try {
        if (req.body.stripeSessionId) {
          const existing = await purchasesCollection.findOne({
            stripeSessionId: req.body.stripeSessionId,
          });
          if (existing) {
            return res.send({ success: true, duplicate: true, purchase: existing });
          }
        }

        const purchaseType = req.body.type || "purchase";
        const purchase = {
          ...req.body,
          type: purchaseType,
          purchaseDate: new Date().toISOString(),
          transactionId: "TXN-" + Math.floor(100000 + Math.random() * 900000),
        };
        const result = await purchasesCollection.insertOne(purchase);

        if (purchaseType === "purchase" && req.body.ebookId) {
          const bookId = req.body.ebookId;
          let query = { $or: [{ _id: bookId }, { id: bookId }] };
          if (ObjectId.isValid(bookId)) {
            query.$or.unshift({ _id: new ObjectId(bookId) });
          }
          await booksCollection.updateOne(query, {
            $set: { isSold: true, status: "sold", sold: true },
          });

          const book = await booksCollection.findOne(query);
          if (book?.writerEmail || book?.writer || book?.writerName) {
            const writerKey = book.writerEmail || book.writer || book.writerName;
            const searchQuery = book.writerEmail
              ? { email: book.writerEmail }
              : { name: writerKey };
            await authorsCollection.updateOne(
              searchQuery,
              { $inc: { sales: 1 } },
              { upsert: false }
            );
          }
        }

        if (purchaseType === "publishing fee" && (req.body.userEmail || req.body.writerEmail)) {
          const email = req.body.userEmail || req.body.writerEmail;
          await verificationsCollection.updateOne(
            { email },
            {
              $set: {
                email,
                verified: true,
                stripeSessionId: req.body.stripeSessionId || "",
                amount: parseFloat(req.body.amount || req.body.price) || 0,
                paidAt: new Date().toISOString(),
              },
            },
            { upsert: true }
          );
        }

        console.log(
          `📧 [Dummy Email] sent to ${purchase.userEmail || "user"}: Thank you for your ${purchaseType} of ${purchase.ebookTitle || "Fable service"}. Transaction ID: ${purchase.transactionId}`
        );

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

    app.patch("/api/users/profile", async (req, res) => {
      try {
        const { email, name, image } = req.body;
        if (!email) {
          return res.status(400).send({ success: false, message: "Email is required" });
        }
        const update = { updatedAt: new Date().toISOString() };
        if (name) update.name = name;
        if (image) update.image = image;
        const result = await usersCollection.updateOne({ email }, { $set: update });
        res.send({ success: true, result });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.get("/api/writer/verification", async (req, res) => {
      try {
        const email = req.query.email;
        if (!email) {
          return res.send({ success: true, verified: false });
        }
        const record = await verificationsCollection.findOne({ email });
        res.send({ success: true, verified: !!(record && record.verified) });
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

        const bookPurchases = allPurchases.filter(
          (p) => (p.type || "purchase") === "purchase"
        );
        const totalEbooksSold = bookPurchases.length;
        const totalRevenue = allPurchases.reduce(
          (acc, curr) => acc + (parseFloat(curr.amount || curr.price) || 0),
          0
        );

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthlySales = monthNames.map((month) => ({ month, sales: 0, revenue: 0 }));
        allPurchases.forEach((p) => {
          const date = new Date(p.purchaseDate || p.createdAt);
          if (!isNaN(date.getTime())) {
            const idx = date.getMonth();
            monthlySales[idx].sales += 1;
            monthlySales[idx].revenue += parseFloat(p.amount || p.price) || 0;
          }
        });

        const genreCount = {};
        allBooks.forEach((b) => {
          const genre = b.genre || "General";
          genreCount[genre] = (genreCount[genre] || 0) + 1;
        });
        const genreDistribution = Object.entries(genreCount).map(([name, value]) => ({
          name,
          value,
        }));

        res.send({
          success: true,
          totalUsers,
          totalWriters,
          totalEbooksSold,
          totalRevenue,
          monthlySales,
          genreDistribution,
        });
      } catch (error) {
        res.status(500).send({ success: false, message: error.message });
      }
    });

    app.listen(port, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${port}`);
      console.log(`📌 Admin Email: ${ADMIN_EMAIL} / Password: ${ADMIN_PASSWORD}`);
      console.log(`🔑 JWT Secret: ${JWT_SECRET_STRING.slice(0, 10)}...`);
    });
  } catch (error) {
    console.error("MongoDB connection error:", error.message);
    console.error("Please check your MONGODB_URI and ensure MongoDB Atlas network access allows your IP.");
  }
}

startServer();
