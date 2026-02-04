import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import prisma from "./prisma.js";

// Configure Google OAuth Strategy
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      callbackURL:
        process.env.GOOGLE_CALLBACK_URL ||
        "http://localhost:3001/api/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails?.[0]?.value || "";

        // Check if email is in the allowed list
        const allowedEmail = await prisma.allowedEmail.findUnique({
          where: { email },
        });

        if (!allowedEmail) {
          // Return error with special flag for unauthorized access
          return done(null, false, { message: "unauthorized" });
        }

        // Find or create user based on Google profile
        let user = await prisma.user.findUnique({
          where: { googleId: profile.id },
        });

        if (!user) {
          // Determine if user should be admin
          const isAdmin = email === "joethedave@gmail.com";

          user = await prisma.user.create({
            data: {
              googleId: profile.id,
              email,
              name: profile.displayName,
              picture: profile.photos?.[0]?.value,
              isAdmin,
            },
          });

          // Create default "main" group for new user
          await prisma.bookmarkGroup.create({
            data: {
              name: "main",
              userId: user.id,
            },
          });
        }

        return done(null, user);
      } catch (error) {
        return done(error as Error, undefined);
      }
    },
  ),
);

// Serialize user for session
passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

// Deserialize user from session
passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id },
    });
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

export default passport;
