# Environment Configuration

## Required Environment Variables

Create a `.env` file in the root of your project with the following variables:

```env
# Database
DATABASE_URL="postgresql://username:password@localhost:5432/home_page"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"
GOOGLE_CALLBACK_URL="http://localhost:3001/api/auth/google/callback"

# Session
SESSION_SECRET="your-random-secret-key-change-in-production"

# Environment
NODE_ENV="development"
```

## Setting Up Google OAuth

To enable Google Sign-In, you need to set up OAuth 2.0 credentials:

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API (if not already enabled)

### 2. Create OAuth 2.0 Credentials

1. In the Google Cloud Console, go to **APIs & Services** > **Credentials**
2. Click **Create Credentials** > **OAuth client ID**
3. If prompted, configure the OAuth consent screen:
   - Choose **External** user type
   - Fill in the required information (App name, User support email, Developer contact)
   - Add your email to test users
   - Save and continue through the scopes and test users sections

4. Create OAuth client ID:
   - Application type: **Web application**
   - Name: `Home Page App` (or your preferred name)
   - Authorized JavaScript origins:
     - `http://localhost:3001`
     - `http://localhost:5173` (for development)
   - Authorized redirect URIs:
     - `http://localhost:3001/api/auth/google/callback`
   - For production, add your production URLs as well

5. Click **Create**
6. Copy the **Client ID** and **Client Secret**
7. Add them to your `.env` file

### 3. Production Setup

For production deployment, update the `.env` file with:

```env
GOOGLE_CALLBACK_URL="https://your-production-domain.com/api/auth/google/callback"
NODE_ENV="production"
FRONTEND_URL="https://your-production-domain.com"
```

And add the production URLs to your Google OAuth credentials:

- Authorized JavaScript origins: `https://your-production-domain.com`
- Authorized redirect URIs: `https://your-production-domain.com/api/auth/google/callback`

## Important Security Notes

1. **Never commit `.env` files** - They are already in `.gitignore`
2. **Change the SESSION_SECRET** - Use a long, random string in production
3. **Use HTTPS in production** - The session cookie is marked as secure in production
4. **Keep your Google Client Secret private** - Never expose it in client-side code

## Database Setup

The project uses PostgreSQL. Ensure you have a PostgreSQL database running and update the `DATABASE_URL` accordingly.

To run migrations:

```bash
npm run db:migrate
```

To open Prisma Studio (database GUI):

```bash
npm run db:studio
```
