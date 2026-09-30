import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import cookieParser from "cookie-parser";
import multer from "multer";
import { Prisma } from "@prisma/client";
import { fileURLToPath } from "url";
import path from "path";

// Load .env file only in development (production uses Fly.io secrets)
if (process.env.NODE_ENV !== "production") {
  const dotenv = await import("dotenv");
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  dotenv.default.config({
    path: path.join(__dirname, "../../.env"),
    override: true,
  });
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import prisma from "./lib/prisma.js";
import passport from "./lib/auth.js";
import { isAuthenticated } from "./lib/middleware.js";
import { storeImage, touchImage, startImageSweep } from "./lib/images.js";
import { fetchFavicon, normalizeSiteUrl } from "./lib/favicon.js";
import { listSets, loadSet, renderIcons, searchIcons } from "./lib/icons.js";

// Type definition for authenticated user
interface AuthenticatedUser {
  id: string;
  email: string;
  name: string | null;
  picture: string | null;
  isAdmin: boolean;
  settings?: unknown;
}

type SearchEngine = "brave" | "duckduckgo" | "google" | "bing" | "yahoo";
type ThemeMode = "light" | "dark";
type BackgroundTheme =
  | "purple"
  | "blue"
  | "green"
  | "red"
  | "orange"
  | "yellow"
  | "black"
  | "gray";

interface UserSettings {
  searchEngine: SearchEngine;
  theme: ThemeMode;
  background: BackgroundTheme;
  lastGroupId?: string;
}

const DEFAULT_USER_SETTINGS: UserSettings = {
  searchEngine: "google",
  theme: "light",
  background: "purple",
};

const SEARCH_ENGINES = new Set<SearchEngine>([
  "brave",
  "duckduckgo",
  "google",
  "bing",
  "yahoo",
]);
const THEMES = new Set<ThemeMode>(["light", "dark"]);
const BACKGROUNDS = new Set<BackgroundTheme>([
  "purple",
  "blue",
  "green",
  "red",
  "orange",
  "yellow",
  "black",
  "gray",
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const sanitizeSettingsPatch = (value: unknown): Partial<UserSettings> => {
  if (!isPlainObject(value)) {
    return {};
  }

  const patch: Partial<UserSettings> = {};

  if (
    typeof value.searchEngine === "string" &&
    SEARCH_ENGINES.has(value.searchEngine as SearchEngine)
  ) {
    patch.searchEngine = value.searchEngine as SearchEngine;
  }

  if (typeof value.theme === "string" && THEMES.has(value.theme as ThemeMode)) {
    patch.theme = value.theme as ThemeMode;
  }

  if (
    typeof value.background === "string" &&
    BACKGROUNDS.has(value.background as BackgroundTheme)
  ) {
    patch.background = value.background as BackgroundTheme;
  }

  if (
    typeof value.lastGroupId === "string" &&
    /^[0-9a-f-]{36}$/i.test(value.lastGroupId)
  ) {
    patch.lastGroupId = value.lastGroupId;
  }

  return patch;
};

const pruneDefaultSettings = (
  settings: UserSettings,
): Partial<UserSettings> | null => {
  const entries = Object.entries(settings).filter(([key, value]) => {
    return DEFAULT_USER_SETTINGS[key as keyof UserSettings] !== value;
  });

  return entries.length > 0
    ? (Object.fromEntries(entries) as Partial<UserSettings>)
    : null;
};

const isMissingSettingsColumnError = (error: unknown) => {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2022" &&
    String(error.meta?.column || "").includes("User.settings")
  );
};

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
  passport.authenticate(
    "google",
    (
      err: Error | null,
      user: Express.User | false,
      info?: { message: string },
    ) => {
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
    },
  )(req, res, next);
});

app.get("/api/auth/me", (req, res) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Not authenticated" });
  }

  const authUser = req.user as AuthenticatedUser;

  prisma.user
    .findUnique({
      where: { id: authUser.id },
      select: { settings: true },
    })
    .then((result) => {
      res.json({
        ...authUser,
        settings: result?.settings ?? null,
      });
    })
    .catch((error) => {
      if (isMissingSettingsColumnError(error)) {
        return res.json(authUser);
      }
      console.error("Failed to fetch auth user settings:", error);
      res.status(500).json({ error: "Failed to fetch user" });
    });
});

app.post("/api/auth/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      return res.status(500).json({ error: "Logout failed" });
    }
    res.json({ message: "Logged out successfully" });
  });
});

app.patch("/api/user/settings", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as AuthenticatedUser;
    const settingsPatch = sanitizeSettingsPatch(req.body?.settings);

    if (Object.keys(settingsPatch).length === 0) {
      return res.status(400).json({ error: "No valid settings provided" });
    }

    const existingUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: { settings: true },
    });

    const existingSettings = sanitizeSettingsPatch(existingUser?.settings);
    const mergedSettings: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      ...existingSettings,
      ...settingsPatch,
    };

    const settingsToStore = pruneDefaultSettings(mergedSettings);

    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: {
        settings: settingsToStore ?? Prisma.DbNull,
      },
      select: {
        settings: true,
      },
    });

    res.json({ settings: updatedUser.settings });
  } catch (error) {
    if (isMissingSettingsColumnError(error)) {
      return res
        .status(503)
        .json({ error: "Settings are temporarily unavailable. Please retry." });
    }
    console.error("Error updating user settings:", error);
    res.status(500).json({ error: "Failed to update settings" });
  }
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

class BadImageError extends Error {}

/**
 * The image a create/update request asks for: an uploaded file (stored, de-duplicated by
 * content), an existing library image by id, or undefined when the request doesn't set one.
 */
async function resolveRequestedImage(
  req: express.Request,
  user: AuthenticatedUser,
  label: string,
): Promise<string | undefined> {
  if (req.file) {
    return storeImage(
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      user,
      label,
    );
  }
  const { imageId } = req.body;
  if (typeof imageId === "string" && imageId) {
    const image = await prisma.image.findUnique({ where: { id: imageId } });
    if (!image) {
      throw new BadImageError("Selected image no longer exists");
    }
    await touchImage(image.url);
    return image.url;
  }
  return undefined;
}

// Shared image library — every tracked image, across all users.
app.get("/api/images", isAuthenticated, async (req, res) => {
  try {
    const images = await prisma.image.findMany({
      select: { id: true, url: true, label: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });
    res.json(images);
  } catch (error) {
    console.error("Error fetching images:", error);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});

// Fetch a site's favicon and proxy the bytes back (the client rasterises it to PNG).
app.get("/api/favicon", isAuthenticated, async (req, res) => {
  const siteUrl =
    typeof req.query.url === "string" ? normalizeSiteUrl(req.query.url) : null;
  if (!siteUrl) {
    return res.status(400).json({ error: "A valid http(s) URL is required" });
  }
  try {
    const icon = await fetchFavicon(siteUrl);
    if (!icon) {
      return res.status(404).json({ error: "No icon found for that site" });
    }
    res.setHeader("Content-Type", icon.contentType);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(icon.buffer);
  } catch (error) {
    console.error("Error fetching favicon:", error);
    res.status(502).json({ error: "Could not fetch an icon for that site" });
  }
});

// Icon picker (self-hosted icon sets)
app.get("/api/icons/sets", isAuthenticated, (req, res) => {
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.json(listSets());
});

app.get("/api/icons/sets/:prefix", isAuthenticated, (req, res) => {
  const set = loadSet(req.params.prefix);
  if (!set) {
    return res.status(404).json({ error: "Unknown icon set" });
  }
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.json({ prefix: set.prefix, palette: set.palette, sections: set.sections });
});

app.get("/api/icons/search", isAuthenticated, (req, res) => {
  const query = typeof req.query.q === "string" ? req.query.q.slice(0, 100) : "";
  res.json(searchIcons(query));
});

app.get("/api/icons/svg", isAuthenticated, (req, res) => {
  const ids =
    typeof req.query.icons === "string"
      ? req.query.icons.split(",").filter(Boolean).slice(0, 200)
      : [];
  res.setHeader("Cache-Control", "private, max-age=86400");
  res.json(renderIcons(ids));
});

// Bookmark routes
app.get("/api/bookmarks", isAuthenticated, async (req, res) => {
  try {
    const user = req.user as { id: string; email: string };
    const { groupId } = req.query;

    const where: { userId: string; deleted: boolean; groupId?: string } = {
      userId: user.id,
      deleted: false,
    };
    if (groupId && typeof groupId === "string") {
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

      const image = (await resolveRequestedImage(req, user, name)) ?? "";

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
      if (error instanceof BadImageError) {
        return res.status(400).json({ error: error.message });
      }
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

      const updateData: { url: string; name: string; image?: string } = {
        url,
        name,
      };

      const image = await resolveRequestedImage(req, user, name);
      if (image !== undefined) {
        updateData.image = image;
      }

      const bookmark = await prisma.bookmark.update({
        where: { id },
        data: updateData,
      });

      // The old image is freed by the orphan sweep once no live bookmark uses it.
      if (image !== undefined && image !== existingBookmark.image) {
        await touchImage(existingBookmark.image);
      }

      res.json(bookmark);
    } catch (error) {
      if (error instanceof BadImageError) {
        return res.status(400).json({ error: error.message });
      }
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

    // Soft delete: mark as deleted. Touching the image restarts its grace period, so an
    // Undo within that window still finds the S3 object.
    await prisma.bookmark.update({
      where: { id },
      data: { deleted: true },
    });
    await touchImage(bookmark.image);

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
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("[Server Error]", err);

    // In production, send generic error message
    if (process.env.NODE_ENV === "production") {
      res.status(500).json({
        error: "An unexpected error occurred. Please try again later.",
      });
    } else {
      // In development, send detailed error
      res.status(500).json({
        error: err.message,
        stack: err.stack,
      });
    }
  },
);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  startImageSweep();
});
