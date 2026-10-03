# Lightweight Real-Time Chat

A modern, mobile-responsive 1-on-1 real-time chat application built with Node.js, Express, and Socket.io. Features a glassmorphism UI and dark mode aesthetic.

## Local Testing

1. **Install Node.js:** Ensure you have Node.js installed on your computer.
2. **Install Dependencies:** Open your terminal in this directory and run:
   ```bash
   npm install
   ```
3. **Start the Server:**
   ```bash
   npm start
   ```
4. **Test the Chat:** Open your web browser and navigate to `http://localhost:3000`. Open the same URL in a second tab or a different browser to test the real-time messaging.

## Deployment on Render (Free Tier)

Render makes it incredibly easy to deploy Node.js applications directly from GitHub.

1. **Push to GitHub:**
   - Create a new repository on GitHub.
   - Commit and push all these files to your new repository.
   
2. **Deploy to Render:**
   - Go to [Render.com](https://render.com/) and sign in (or sign up).
   - Click the **New +** button and select **Web Service**.
   - Connect your GitHub account and select the repository you just created.
   - Fill in the deployment details:
     - **Name:** Choose a name for your app (e.g., `my-live-chat-app`)
     - **Region:** Choose whichever is closest to you.
     - **Branch:** `main` (or `master`)
     - **Runtime:** `Node`
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Instance Type:** Select the **Free** tier.
   - Click **Create Web Service**.

3. **Done!**
   - Render will start building your app. Once the build is complete, you will see a green "Live" status.
   - Render will provide you with an onrender.com URL (e.g., `https://my-live-chat-app.onrender.com`).
   - Share this URL with your friend and start chatting!

**Note:** On Render's free tier, the web service will spin down after 15 minutes of inactivity. When you visit it again, it might take ~50 seconds to spin back up.
