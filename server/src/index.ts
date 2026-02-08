import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import multer from "multer";
import { fileURLToPath } from "url";
import path from "path";

// Load .env file only in development (production uses Fly.io secrets)
if (process.env.NODE_ENV !== "production") {
  const dotenv = await import("dotenv");
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.default.config({ path: path.join(__dirname, "../../.env"), override: true });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import prisma from "./lib/prisma.js";
import passport from "./lib/auth.js";
import { isAuthenticated } from "./lib/middleware.js";
import { uploadToS3 } from "./lib/s3.js";

// Type definition for authenticated user
interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
}

const PgSession = connectPgSimple(session);

// Create session store with error handling
const sessionStore = new PgSession({
  conString: process.env.DATABASE_URL,
  createTableIfMissing: true,
});

sessionStore.on("error", (err: Error) => {
  console.error("[Session Store] Error:", err);
});

console.log(
  "[Session Store] Initialized with DATABASE_URL:",
  process.env.DATABASE_URL ? "SET" : "NOT SET",
);

const app = express();
const PORT = process.env.PORT || 3001;

// Trust Fly.io proxy
app.set("trust proxy", 1);

// Configure multer for file uploads (memory storage for S3)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, GIF, and WebP are allowed.",
        ),
      );
    }
  },
});

app.use(
  cors({
    origin:
      process.env.NODE_ENV === "production"
        ? process.env.FRONTEND_URL
        : `http://localhost:${process.env.VITE_PORT || 3000}`,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());
app.use(
  session({
    store: sessionStore,
    name: "sessionId", // Explicit cookie name
    secret:
      process.env.SESSION_SECRET || "your-secret-key-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: process.env.NODE_ENV === "production",
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      sameSite: "lax",
      path: "/",
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// Serve static files from the React app build directory
const clientBuildPath = path.join(__dirname, "../../dist/client");
app.use(express.static(clientBuildPath));

// Auth routes
app.get(
  "/api/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

app.get("/api/auth/google/callback", (req, res, next) => {
  passport.authenticate("google", (err: Error | null, user: Express.User | false, info?: { message: string }) => {
    if (err) {
      return next(err);
    }

    const clientPort = process.env.VITE_PORT || 3000;

    // Check if user was denied due to unauthorized email
    if (!user && info?.message === "unauthorized") {
      const redirectUrl =
        process.env.NODE_ENV === "production"
          ? "/access-denied"
          : `http://localhost:${clientPort}/access-denied`;
      return res.redirect(redirectUrl);
    }

    if (!user) {
      const redirectUrl =
        process.env.NODE_ENV === "production"
          ? "/"
          : `http://localhost:${clientPort}`;
      return res.redirect(redirectUrl);
    }

    req.logIn(user, (err: Error | null) => {
      if (err) {
        return next(err);
      }

      // Explicitly save the session before redirecting
      req.session.save((err?: Error) => {
        if (err) {
          return next(err);
        }

        const redirectUrl =
          process.env.NODE_ENV === "production"
            ? "/"
            : `http://localhost:${clientPort}`;
        res.redirect(redirectUrl);
      });
    });
  })(req, res, next);
});

app.get("/api/auth/me", (req, res) => {
  if (req.isAuthenticated()) {
    res.json(req.user);
  } else {
    res.status(401).json({ error: "Not authenticated" });
  }
});

app.post("/api/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ message: "Logged out successfully" });
  });
});

// Group routes
app.get("/api/groups", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const groups = await prisma.bookmarkGroup.findMany({
      where: { userId: user.id, deleted: false },
      orderBy: { createdAt: "asc" },
    });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch groups" });
  }
});

app.post("/api/groups", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ error: "Group name is required" });
    }

    const group = await prisma.bookmarkGroup.create({
      data: {
        name,
        userId: user.id,
      },
    });
    res.status(201).json(group);
  } catch (error) {
    console.error("Error creating group:", error);
    res.status(500).json({ error: "Failed to create group" });
  }
});

app.put("/api/groups/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { id } = req.params;
    const { name } = req.body;

    // Check if group belongs to user
    const existingGroup = await prisma.bookmarkGroup.findFirst({
      where: { id, userId: user.id },
    });

    if (!existingGroup) {
      return res.status(404).json({ error: "Group not found" });
    }

    const group = await prisma.bookmarkGroup.update({
      where: { id },
      data: { name },
    });

    res.json(group);
  } catch (error) {
    console.error("Error updating group:", error);
    res.status(500).json({ error: "Failed to update group" });
  }
});

app.delete("/api/groups/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { id } = req.params;
    const { selectedGroupId } = req.query;

    // Prevent deleting the currently selected group
    if (id === selectedGroupId) {
      return res
        .status(400)
        .json({ error: "Cannot delete the currently selected group" });
    }

    // Check if group belongs to user
    const group = await prisma.bookmarkGroup.findFirst({
      where: { id, userId: user.id },
    });

    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }

    // Soft delete group
    await prisma.bookmarkGroup.update({
      where: { id },
      data: { deleted: true },
    });

    res.json({ message: "Group deleted successfully" });
  } catch (error) {
    console.error("Error deleting group:", error);
    res.status(500).json({ error: "Failed to delete group" });
  }
});

app.post("/api/groups/:id/restore", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { id } = req.params;

    // Check if group belongs to user and is deleted
    const group = await prisma.bookmarkGroup.findFirst({
      where: { id, userId: user.id, deleted: true },
    });

    if (!group) {
      return res.status(404).json({ error: "Deleted group not found" });
    }

    // Restore group
    const restored = await prisma.bookmarkGroup.update({
      where: { id },
      data: { deleted: false },
    });

    res.json(restored);
  } catch (error) {
    console.error("Error restoring group:", error);
    res.status(500).json({ error: "Failed to restore group" });
  }
});

// Allowed emails routes (Admin only)
app.get("/api/allowed-emails", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;

    if (!user.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const allowedEmails = await prisma.allowedEmail.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json(allowedEmails);
  } catch (error) {
    console.error("Error fetching allowed emails:", error);
    res.status(500).json({ error: "Failed to fetch allowed emails" });
  }
});

app.post("/api/allowed-emails", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { email } = req.body;

    if (!user.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const allowedEmail = await prisma.allowedEmail.create({
      data: { email },
    });
    res.status(201).json(allowedEmail);
  } catch (error) {
    console.error("Error adding allowed email:", error);
    res.status(500).json({ error: "Failed to add allowed email" });
  }
});

app.delete("/api/allowed-emails/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { id } = req.params;

    if (!user.isAdmin) {
      return res.status(403).json({ error: "Admin access required" });
    }

    await prisma.allowedEmail.delete({
      where: { id },
    });
    res.json({ message: "Email removed from allowed list" });
  } catch (error) {
    console.error("Error deleting allowed email:", error);
    res.status(500).json({ error: "Failed to delete allowed email" });
  }
});

// Bookmark routes
app.get("/api/bookmarks", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: string; email: string };
    const { groupId } = req.query;

    const where: { userId: string; deleted: boolean; groupId?: string } = { 
      userId: user.id, 
      deleted: false 
    };
    if (groupId && typeof groupId === 'string') {
      where.groupId = groupId;
    }

    const bookmarks = await prisma.bookmark.findMany({
      where,
      orderBy: { orderId: "asc" },
    });
    res.json(bookmarks);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch bookmarks" });
  }
});

app.post(
  "/api/bookmarks",
  isAuthenticated,
  upload.single("image"),
  async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const { url, name, groupId } = req.body;

      if (!url || !name || !groupId) {
        return res
          .status(400)
          .json({ error: "URL, name, and groupId are required" });
      }

      // Upload image to S3 if provided
      let image = "";
      if (req.file) {
        const result = await uploadToS3(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname,
          user.email,
        );
        image = result.url;
      }

      // Get the highest orderId for this group and add 1
      const maxOrder = await prisma.bookmark.findFirst({
        where: { groupId },
        orderBy: { orderId: "desc" },
        select: { orderId: true },
      });

      const bookmark = await prisma.bookmark.create({
        data: {
          url,
          name,
          image,
          userId: user.id,
          groupId,
          orderId: (maxOrder?.orderId ?? -1) + 1,
        },
      });
      res.status(201).json(bookmark);
    } catch (error) {
      console.error("Error creating bookmark:", error);
      res.status(500).json({ error: "Failed to create bookmark" });
    }
  },
);

app.put(
  "/api/bookmarks/:id",
  isAuthenticated,
  upload.single("image"),
  async (req, res) => {
    try {
      const user = req.user as AuthenticatedUser;
      const { id } = req.params;
      const { url, name } = req.body;

      // Check if bookmark belongs to user
      const existingBookmark = await prisma.bookmark.findFirst({
        where: { id, userId: user.id },
      });

      if (!existingBookmark) {
        return res.status(404).json({ error: "Bookmark not found" });
      }

      const updateData: { url: string; name: string; image?: string } = { url, name };

      if (req.file) {
        // Upload new image to S3
        const result = await uploadToS3(
          req.file.buffer,
          req.file.mimetype,
          req.file.originalname,
          user.email,
        );
        updateData.image = result.url;

        // Note: Old S3 images could be deleted here with deleteFromS3()
        // but we'll keep them for simplicity (soft delete preserves them anyway)
      }

      const bookmark = await prisma.bookmark.update({
        where: { id },
        data: updateData,
      });

      res.json(bookmark);
    } catch (error) {
      console.error("Error updating bookmark:", error);
      res.status(500).json({ error: "Failed to update bookmark" });
    }
  },
);

app.delete("/api/bookmarks/:id", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { id } = req.params;

    // Check if bookmark belongs to user
    const bookmark = await prisma.bookmark.findFirst({
      where: { id, userId: user.id },
    });

    if (!bookmark) {
      return res.status(404).json({ error: "Bookmark not found" });
    }

    // Soft delete: mark as deleted
    await prisma.bookmark.update({
      where: { id },
      data: { deleted: true },
    });

    res.json({ message: "Bookmark deleted successfully" });
  } catch (error) {
    console.error("Error deleting bookmark:", error);
    res.status(500).json({ error: "Failed to delete bookmark" });
  }
});

// Undo delete (restore bookmark)
app.post("/api/bookmarks/:id/restore", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { id } = req.params;

    // Check if bookmark belongs to user and is deleted
    const bookmark = await prisma.bookmark.findFirst({
      where: { id, userId: user.id, deleted: true },
    });

    if (!bookmark) {
      return res.status(404).json({ error: "Deleted bookmark not found" });
    }

    // Restore: mark as not deleted
    const restored = await prisma.bookmark.update({
      where: { id },
      data: { deleted: false },
    });

    res.json(restored);
  } catch (error) {
    console.error("Error restoring bookmark:", error);
    res.status(500).json({ error: "Failed to restore bookmark" });
  }
});

// Move bookmark to different group
app.patch("/api/bookmarks/:id/move", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { id } = req.params;
    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({ error: "groupId is required" });
    }

    // Check if bookmark belongs to user
    const bookmark = await prisma.bookmark.findFirst({
      where: { id, userId: user.id },
    });

    if (!bookmark) {
      return res.status(404).json({ error: "Bookmark not found" });
    }

    // Check if target group belongs to user
    const targetGroup = await prisma.bookmarkGroup.findFirst({
      where: { id: groupId, userId: user.id, deleted: false },
    });

    if (!targetGroup) {
      return res.status(404).json({ error: "Target group not found" });
    }

    // Get the highest orderId in target group
    const maxOrder = await prisma.bookmark.findFirst({
      where: { groupId, deleted: false },
      orderBy: { orderId: "desc" },
      select: { orderId: true },
    });

    // Move bookmark to new group with highest orderId
    const updated = await prisma.bookmark.update({
      where: { id },
      data: {
        groupId,
        orderId: (maxOrder?.orderId ?? -1) + 1,
      },
    });

    res.json(updated);
  } catch (error) {
    console.error("Error moving bookmark:", error);
    res.status(500).json({ error: "Failed to move bookmark" });
  }
});

// Reorder bookmarks
app.post("/api/bookmarks/reorder", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const { bookmarkIds } = req.body; // Array of bookmark IDs in new order

    if (!Array.isArray(bookmarkIds)) {
      return res.status(400).json({ error: "bookmarkIds must be an array" });
    }

    // Update orderId for each bookmark
    await Promise.all(
      bookmarkIds.map((id, index) =>
        prisma.bookmark.updateMany({
          where: { id, userId: user.id },
          data: { orderId: index },
        }),
      ),
    );

    res.json({ message: "Bookmarks reordered successfully" });
  } catch (error) {
    console.error("Error reordering bookmarks:", error);
    res.status(500).json({ error: "Failed to reorder bookmarks" });
  }
});

app.get("/api/health", async (req, res) => {
  try {
    // Test database connection
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      database: "connected",
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      timestamp: new Date().toISOString(),
      database: "disconnected",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Example API endpoint using Prisma
app.get("/api/users", async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

app.post("/api/users", async (req, res) => {
  try {
    const { email, name } = req.body;
    const user = await prisma.user.create({
      data: { email, name },
    });
    res.status(201).json(user);
  } catch (error) {
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Catch all handler: send back React's index.html file for any non-API routes
app.get("*", (req, res) => {
  res.sendFile(path.join(clientBuildPath, "index.html"));
});

// Error handling middleware - must be after all routes
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[Server Error]', err);
  
  // In production, send generic error message
  if (process.env.NODE_ENV === "production") {
    res.status(500).json({ 
      error: "An unexpected error occurred. Please try again later." 
    });
  } else {
    // In development, send detailed error
    res.status(500).json({ 
      error: err.message,
      stack: err.stack 
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
